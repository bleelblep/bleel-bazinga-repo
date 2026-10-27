import type { SendTweaksStorage } from '../types'
/**
 * Replace as you type: your text and link rules run on the word you just finished, in the message
 * box, instead of only when you send.
 *
 * ## Only the word you just finished
 *
 * The rules run when you type a space or a new line, and only a match that ends inside the word (or
 * link) just before it is replaced. Earlier text is never touched again, so a rule cannot fire on
 * its own output word after word, and a rule spanning words ("by the way" -> "btw") still works
 * because it ends on the last one.
 *
 * ## What waits for send
 *
 * Send still runs every rule over the whole message, so anything skipped here is not lost:
 *
 * - a rule whose replacement has a placeholder, snippet or random pick (`{name}`, `{random:...}`):
 *   filled in now, it would be stale by the time you send, and a random pick would be decided early;
 * - a regex rule anchored with `^` or `$`: the end of the message is not the end of the word;
 * - a word whose rules would change it again if run twice ("lol" -> "lol 😂"). Send runs the rules
 *   once more, so replacing it here would double it. Only results that stay put are written live.
 *
 * Code spans, mentions, custom emoji and timestamps are left alone, as on send.
 *
 * ## How it writes to the box
 *
 * Discord's chat input calls `chatInputRef.current.handleTextChanged(text)` on every text change
 * (348.5 bundle, `handleSelectionOrTextChange`), and its emoji suggestion bar writes back with
 * `chatInputRef.current.replaceRange({ location, length, text, editId })`, reading the caret and
 * `editId` from `chatInputStateRef`. This does the same. Natively, `replaceRange` is dropped when
 * `editId` no longer matches the box (`ChatInputRootView.replaceRange`), so a replacement computed
 * on text you have since changed never lands in the wrong place.
 */

import { reportError } from '../../../../shared/report'
import { protectedPattern } from './codeSpans'
import { replacementFor, ruleScopeMatches, wagonAllowsRule } from './greetings'
import { debug, settings, TAG } from './state'
import { compileRule, keepCase, unescapeReplacement } from './textReplace'
import { splitUrl } from './urlBounds'
import type { Rule } from './textReplace'

const DEBUG: boolean = false

export interface LiveEdit {
	location: number
	length: number
	text: string
}

/** How far back a rule can see from the word just finished, for rules spanning words. */
const WINDOW = 200

/** Placeholders, snippets, random picks, rainbow: anything filled in at send time. */
const TEMPLATE = /\{[^{}\s]*\}/

/** `^` or `$` outside a character class or escape. */
function hasAnchor(source: string): boolean {
	const stripped = source.replace(/\\./g, '').replace(/\[[^\]]*\]/g, '')
	return /[\^$]/.test(stripped)
}

interface LiveRule {
	pattern: RegExp
	regex: boolean
	replacement: string
	/** Plain text, "Match case" off: the replacement follows the typed case. */
	keepCase: boolean
}

function liveRules(rules: Rule[]): LiveRule[] {
	const out: LiveRule[] = []
	for (const rule of rules) {
		if (!rule.enabled || !rule.live || !ruleScopeMatches(rule.scope)) continue
		const replace = replacementFor(rule)
		if (!wagonAllowsRule(replace)) continue
		if (TEMPLATE.test(replace)) continue
		if (rule.regex && hasAnchor(rule.find)) continue
		const compiled = compileRule(rule)
		if (!compiled.pattern) continue
		out.push({
			pattern: compiled.pattern,
			regex: rule.regex,
			replacement: rule.regex ? unescapeReplacement(replace) : replace,
			keepCase: !rule.regex && !rule.caseSensitive,
		})
	}
	return out
}

/** `String.replace`'s `$` codes for one match: `$$`, `$&`, `` $` ``, `$'`, `$1`-`$99`, `$<name>`. */
export function expandReplacement(
	template: string,
	match: RegExpExecArray,
	input: string,
): string {
	return template.replace(
		/\$(\$|&|`|'|\d{1,2}|<([^>]*)>)/g,
		(code, kind: string, name?: string) => {
			if (kind === '$') return '$'
			if (kind === '&') return match[0]
			if (kind === '`') return input.slice(0, match.index)
			if (kind === "'") return input.slice(match.index + match[0].length)
			if (name !== undefined)
				return match.groups ? (match.groups[name] ?? '') : code
			// `$12` means group 12 only when there are that many; otherwise group 1 followed by "2".
			const two = Number(kind)
			if (kind.length === 2 && two < match.length) return match[two] ?? ''
			const one = Number(kind[0])
			if (one > 0 && one < match.length)
				return (match[one] ?? '') + kind.slice(1)
			return code
		},
	)
}

/**
 * Runs `rules` in order over `text`, replacing only matches that end inside the last `tail`
 * characters. A replacement becomes part of the tail, so a later rule can build on it.
 */
function applyAtTail(
	text: string,
	tail: number,
	rules: LiveRule[],
): { text: string; tail: number } {
	let out = text
	for (const rule of rules) {
		const { pattern } = rule
		const tailStart = out.length - tail
		let result = ''
		let last = 0
		let firstStart = -1
		pattern.lastIndex = 0
		for (let match = pattern.exec(out); match; match = pattern.exec(out)) {
			if (match[0] === '') {
				pattern.lastIndex++ // step past it; an empty match never replaces anything live
				continue
			}
			const end = match.index + match[0].length
			if (end <= tailStart) continue
			if (firstStart < 0) firstStart = match.index
			result += out.slice(last, match.index)
			result += rule.regex
				? expandReplacement(rule.replacement, match, out)
				: rule.keepCase
					? keepCase(match[0], rule.replacement)
					: rule.replacement
			last = end
		}
		pattern.lastIndex = 0
		if (firstStart < 0) continue
		out = result + out.slice(last)
		tail = out.length - Math.min(firstStart, tailStart)
	}
	return { text: out, tail }
}

/** The replacement for the word or link just finished at `cursor`, or undefined to leave it. */
export function liveEdit(
	text: string,
	cursor: number,
	options: { textRules?: Rule[]; linkRules?: Rule[] },
): LiveEdit | undefined {
	if (cursor < 1 || cursor > text.length) return undefined
	const isWhitespace = /\s/.test(text[cursor - 1])
	if (isWhitespace) {
		// Only straight after typing a space or new line, and only once per word.
		if (cursor < 2 || /\s/.test(text[cursor - 2])) return undefined
	}

	const allTextRules = liveRules(options.textRules ?? [])
	const allLinkRules = liveRules(options.linkRules ?? [])
	// Plain text rules wait for whitespace; regex rules can trigger immediately as typed.
	const textRules = isWhitespace
		? allTextRules
		: allTextRules.filter(r => r.regex)
	const linkRules = isWhitespace
		? allLinkRules
		: allLinkRules.filter(r => r.regex)
	if (!textRules.length && !linkRules.length) return undefined

	const end = isWhitespace ? cursor - 1 : cursor
	const before = text.slice(0, end)
	const tokenStart = Math.max(before.search(/\S+$/), 0)
	const token = before.slice(tokenStart)

	// Inside a code span that has not been closed yet.
	const pattern = protectedPattern()
	let lastProtectedEnd = 0
	let overlapsToken = false
	pattern.lastIndex = 0
	for (let match = pattern.exec(before); match; match = pattern.exec(before)) {
		const matchEnd = match.index + match[0].length
		if (matchEnd > tokenStart) overlapsToken = true
		else lastProtectedEnd = matchEnd
	}
	if (
		before
			.slice(lastProtectedEnd)
			.replace(/```[\s\S]*?```|`[^`]*`/g, '')
			.includes('`')
	)
		return undefined

	let windowStart: number
	let replaced: string
	const linkAt = token.search(/https?:\/\//i)
	if (linkAt >= 0) {
		if (!linkRules.length) return undefined
		const urlStart = tokenStart + linkAt
		const { url } = splitUrl(text.slice(urlStart, end), text.slice(0, urlStart))
		const once = applyAtTail(url, url.length, linkRules).text
		if (once === url) return undefined
		// Run twice: send runs the rules again, so only a result that stays put is written now.
		if (applyAtTail(once, once.length, linkRules).text !== once)
			return undefined
		windowStart = urlStart
		replaced = once + text.slice(urlStart + url.length, cursor)
	} else {
		if (overlapsToken) return undefined
		if (!textRules.length) return undefined
		windowStart = Math.max(end - WINDOW, lastProtectedEnd)
		const window = text.slice(windowStart, cursor)
		const first = applyAtTail(window, cursor - tokenStart, textRules)
		if (first.text === window) return undefined
		if (applyAtTail(first.text, first.tail, textRules).text !== first.text)
			return undefined
		replaced = first.text
	}

	// The smallest edit, so nothing outside the change (a mention pill, say) is rewritten.
	const original = text.slice(windowStart, cursor)
	let prefix = 0
	while (
		prefix < original.length &&
		prefix < replaced.length &&
		original[prefix] === replaced[prefix]
	)
		prefix++
	let suffix = 0
	while (
		suffix < original.length - prefix &&
		suffix < replaced.length - prefix &&
		original[original.length - 1 - suffix] ===
			replaced[replaced.length - 1 - suffix]
	)
		suffix++
	return {
		location: windowStart + prefix,
		length: original.length - prefix - suffix,
		text: replaced.slice(prefix, replaced.length - suffix),
	}
}

/** Whether any enabled rule is set to apply while typing. */
export function hasLiveRule(
	s: Pick<SendTweaksStorage, 'rules' | 'linkRules' | 'linkRewrite'>,
): boolean {
	const rules = [
		...(s.rules ?? []),
		...(s.linkRewrite ? (s.linkRules ?? []) : []),
	]
	return rules.some(rule => rule.enabled && rule.live)
}

// ---- The chat input ----------------------------------------------------------------------------

type Handle = Record<string | symbol, any>
type Ref = { current?: Handle | null }

const WRAPPED = Symbol('sendTweaksLive')
const wrapped = new Set<Handle>()
/** The text each handle last reported, so deleting never triggers a replacement. */
const lastText = new WeakMap<Handle, string>()
/** What we last wrote, so the change it causes is not taken for typing. */
const lastWritten = new WeakMap<Handle, string>()
let stateRefs = new WeakMap<Ref, Ref | undefined>()
let warned = false

function run(handle: Handle, stateRef: Ref | undefined, text: string) {
	const previous = lastText.get(handle)
	lastText.set(handle, text)
	if (lastWritten.get(handle) === text) {
		lastWritten.delete(handle)
		return
	}
	const s = settings()
	// Only rules switched to "Apply directly while typing" run here; with none, there is nothing to do.
	if (!hasLiveRule(s)) return
	if (previous !== undefined && text.length < previous.length) return

	const state = stateRef?.current
	let cursor: number
	if (state && typeof state.selectionStart === 'number') {
		if (state.selectionStart !== state.selectionEnd) return
		cursor = state.selectionStart
	} else {
		// No caret to read: act only when typing at the very end.
		cursor = text.length
	}

	const edit = liveEdit(text, cursor, {
		textRules: s.rules,
		linkRules: s.linkRewrite ? s.linkRules : undefined,
	})
	if (!edit) return

	const next =
		text.slice(0, edit.location) +
		edit.text +
		text.slice(edit.location + edit.length)
	if (typeof handle.replaceRange === 'function') {
		lastWritten.set(handle, next)
		handle.replaceRange({ ...edit, editId: state?.editId ?? undefined })
	} else if (typeof handle.insertText === 'function') {
		lastWritten.set(handle, next)
		handle.insertText(
			edit.text,
			edit.location,
			false,
			undefined,
			edit.location + edit.length,
		)
	} else return
	debug(`live: replaced ${edit.length} character(s) at ${edit.location}`)
}

function wrapHandle(handle: Handle, ref: Ref) {
	if (handle[WRAPPED]) return
	const original = handle.handleTextChanged
	if (typeof original !== 'function') {
		if (!warned) {
			if (DEBUG)
				console.warn(
					`${TAG} Replace as you type: the chat input has no handleTextChanged`,
				)
		}
		warned = true
		return
	}
	const wrapper = Object.assign(
		function (this: unknown, ...args: unknown[]) {
			const result = Reflect.apply(original, this, args)
			const text = args[0]
			if (typeof text === 'string') {
				// After Discord has finished with the change, never inside it.
				setTimeout(() => {
					try {
						run(handle, stateRefs.get(ref), text)
					} catch (error) {
						reportError(`${TAG} Replace as you type failed:`, error)
					}
				}, 0)
			}
			return result
		},
		{ original },
	)
	handle.handleTextChanged = wrapper
	handle[WRAPPED] = true
	wrapped.add(handle)
}

/**
 * Called on every chat input render with its refs. The handle is attached after the render (and
 * may be replaced on a later one), so it is checked now and again once the render has committed.
 */
export function attachLive(ref: Ref | undefined, stateRef: Ref | undefined) {
	if (!ref) return
	stateRefs.set(ref, stateRef)
	const check = () => {
		const handle = ref.current
		if (handle && typeof handle === 'object') wrapHandle(handle, ref)
	}
	check()
	setTimeout(check, 0)
}

export function detachLive() {
	for (const handle of wrapped) {
		const current = handle.handleTextChanged
		if (current?.original) handle.handleTextChanged = current.original
		delete handle[WRAPPED]
	}
	wrapped.clear()
	stateRefs = new WeakMap()
}
