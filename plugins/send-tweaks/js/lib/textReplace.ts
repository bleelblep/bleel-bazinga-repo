/**
 * Your own find-and-replace rules, applied as you send.
 *
 * Rules run in order, each over the output of the one before, so a rule can build on another.
 * They run outside code spans (see `codeSpans.ts`) for the same reason link cleaning does: text
 * inside a code block is meant to be shown exactly.
 *
 * ## A broken rule never costs you a message
 *
 * A regex rule is compiled when it runs, and one that will not compile is skipped rather than
 * thrown. `compileRule` reports why, so the rules page can show the error next to the rule it
 * belongs to instead of the send path discovering it.
 */

import {
	expandDynamicPlaceholders,
	expandPlaceholders,
	greetingsUnlocked,
	replacementFor,
	ruleScopeMatches,
	wagonAllowsRule,
} from './greetings'
import { expandRandom } from './random'
import { settings } from './state'
import { expandSnippets } from './templateSyntax'
import type { RuleScope } from './templateSyntax'

export interface Rule {
	scope?: RuleScope
	/** Stable id, so the settings list can key and edit rules without relying on position. */
	id: string
	/** Optional label, e.g. from an imported Text Replace rule ("Twitter to fxtwitter"). */
	name?: string
	find: string
	replace: string
	/** Treat `find` as a regular expression rather than literal text. */
	regex: boolean
	caseSensitive: boolean
	/** Only match whole words: "cat" matches "cat" but not "concatenate". Literal rules only. */
	wholeWord: boolean
	enabled: boolean
	/** Replace directly in chat input while typing (disabled by default, waits for send). */
	live?: boolean
	/**
	 * Regex flags beyond `g` and `i`, kept from an imported rule: `m`, `s` or `u`. `g` is always on
	 * and `i` follows `caseSensitive`, so neither is stored here.
	 */
	extraFlags?: string
}

export function newRule(overrides: Partial<Rule> = {}): Rule {
	return {
		id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
		find: '',
		replace: '',
		regex: false,
		caseSensitive: false,
		wholeWord: true,
		enabled: true,
		live: false,
		...overrides,
	}
}

/** Only flags that change what matches; `y` (sticky) would stop a global replace after one miss. */
export function sanitizeFlags(flags: string | undefined): string {
	return [...new Set((flags ?? '').replace(/[^msu]/g, ''))].join('')
}

/** A repeat at `at` (`+`, `*`, `{n,}`, `{n,m}`, each optionally lazy), or undefined. */
function repeatAt(source: string, at: number): string | undefined {
	return /^(?:[+*]|\{\d+,\d*\})\??/.exec(source.slice(at))?.[0]
}

/**
 * Whether a pattern has a group containing a repeat that is itself repeated: `(a+)+`, `(\w*)*`,
 * `((x+))+`, `(?:a|b+){2,}`. Scanned rather than matched with one regex so nesting, escapes and
 * character classes are followed properly. Deliberately a little over-eager -- bounded repeats count
 * too: refusing a safe rule costs a rewrite, while allowing a catastrophic one costs a frozen app.
 */
export function hasNestedRepeat(source: string): boolean {
	// One entry per open group: whether anything inside it repeats.
	const groups: boolean[] = []
	const markParent = () => {
		if (groups.length) groups[groups.length - 1] = true
	}
	let inClass = false

	for (let i = 0; i < source.length; i++) {
		const char = source[i]
		if (char === '\\') {
			i++ // the escaped character is a plain atom
			continue
		}
		if (inClass) {
			if (char === ']') inClass = false
			continue
		}
		if (char === '[') {
			inClass = true
			continue
		}
		if (char === '(') {
			groups.push(false)
			continue
		}
		if (char === ')') {
			const repeatsInside = groups.pop() ?? false
			const repeat = repeatAt(source, i + 1)
			if (repeat && repeatsInside) return true
			if (repeat || repeatsInside) markParent()
			if (repeat) i += repeat.length
			continue
		}
		const repeat = repeatAt(source, i)
		if (repeat) {
			markParent()
			i += repeat.length - 1
		}
	}
	return false
}

const escapeRegex = (text: string) =>
	text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export type Compiled =
	| { pattern: RegExp; error?: undefined }
	| { pattern?: undefined; error: string }

export function compileRule(rule: Rule): Compiled {
	if (!rule.find) return { error: 'Nothing to find' }

	const flags = `g${rule.caseSensitive ? '' : 'i'}${rule.regex ? sanitizeFlags(rule.extraFlags) : ''}`
	try {
		if (rule.regex) {
			// Rules run synchronously on the send path, and this engine has no regex time limit:
			// a repeat inside a repeat -- `(a+)+`, `(\w*)*`, `(x+){2,}` -- can backtrack for
			// minutes on an ordinary message and freeze the app mid-send. Refuse those up front,
			// where the rules page can say why, rather than discovering it while sending.
			if (hasNestedRepeat(rule.find)) {
				return {
					error:
						'A repeat inside a repeat, like (a+)+, can freeze sending. Rewrite it without the outer repeat.',
				}
			}
			return { pattern: new RegExp(rule.find, flags) }
		}

		const literal = escapeRegex(rule.find)
		// `\b` only means something next to a word character; a rule for "->" or ":)" with
		// whole-word on would otherwise never match anything.
		const edge = (char: string) => (/\w/.test(char) ? '\\b' : '')
		const body = rule.wholeWord
			? `${edge(rule.find[0])}${literal}${edge(rule.find[rule.find.length - 1])}`
			: literal
		return { pattern: new RegExp(body, flags) }
	} catch (error) {
		return { error: error instanceof Error ? error.message : String(error) }
	}
}

/** Markdown, mentions, emoji, links: text that breaks if its case changes. */
const CASE_FRAGILE = /[<>:/@#{}`*_~|[\]()$]|https?:/i

/**
 * With "Match case" off, a plain-text rule's replacement follows how the match was typed:
 * "Omw" gives "On my way" and "OMW" gives "ON MY WAY". Typed in lower case, the replacement is
 * used exactly as written, so "iirc" -> "IIRC" still works. Replacements with markdown, links,
 * mentions or emoji are never touched.
 */
export function keepCase(typed: string, replacement: string): string {
	if (!replacement || CASE_FRAGILE.test(replacement)) return replacement
	// Letters are whatever has an upper and a lower case; no `\p{L}`, which isn't proven on Hermes.
	const isLetter = (char: string) => char.toLowerCase() !== char.toUpperCase()
	const letters = [...typed].filter(isLetter)
	if (!letters.length) return replacement
	const upper = letters.filter(char => char === char.toUpperCase()).length
	if (upper === 0) return replacement
	if (upper === letters.length && letters.length > 1)
		return replacement.toUpperCase()
	if (letters[0] !== letters[0].toUpperCase()) return replacement
	const chars = [...replacement]
	const at = chars.findIndex(isLetter)
	if (at < 0) return replacement
	chars[at] = chars[at].toUpperCase()
	return chars.join('')
}

/**
 * Guards against a regex that matches empty text in more than one place, like `x*` or `\b`, which
 * would insert its replacement between letters all through the message. An empty match in one
 * place is fine and is how `^` and `$` rules add text to the start or end of a message.
 */
function safeReplace(
	text: string,
	pattern: RegExp,
	replacement: string | ((match: string) => string),
): string {
	// A plain exec loop rather than `matchAll`, which not every Hermes build has.
	let emptyMatches = 0
	pattern.lastIndex = 0
	for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
		if (match[0] !== '') continue
		if (++emptyMatches > 1) return text
		pattern.lastIndex++ // step past an empty match, or exec finds it forever
	}
	pattern.lastIndex = 0
	return typeof replacement === 'function'
		? text.replace(pattern, match => replacement(match))
		: text.replace(pattern, replacement)
}

/**
 * A regex rule's find already understands `\n` and `\t`, but `String.replace` sends them in the
 * replacement as a backslash and a letter. Turn them into the real characters so the two sides
 * agree; `\\` stays a way to write a literal backslash.
 */
// biome-ignore-start lint/suspicious/noControlCharactersInRegex: the ESC byte is what this function matches
export function formatAnsiBlock(content: string): string {
	return content
		.replace(/\\u001b|\\x1b/gi, '\u001b')
		.replace(/\u001b\[0;0m/g, '\u001b[0m')
		.replace(/\[0;0m/g, '\u001b[0m')
		.replace(/\u001b\[2;([0-9;]+m)/g, '\u001b[0;$1')
		.replace(/(^|[^\u001b])\[2;([0-9;]+m)/g, '$1\u001b[0;$2')
		.replace(/(^|[^\u001b])\[([014];[34][0-7]m)/g, '$1\u001b[$2')
		.replace(/(^|[^\u001b])\[([34][0-7]m)/g, '$1\u001b[0;$2')
		.replace(/(^|[^\u001b])\[0m/g, '$1\u001b[0m')
}
// biome-ignore-end lint/suspicious/noControlCharactersInRegex: the ESC byte is what this function matches

export function unescapeReplacement(text: string): string {
	return formatAnsiBlock(
		text.replace(/\\([nt\\])/g, (_, char: string) =>
			char === 'n' ? '\n' : char === 't' ? '\t' : '\\',
		),
	)
}

export function applyRules(
	text: string,
	rules: Rule[],
): { text: string; applied: number } {
	let out = text
	let applied = 0

	for (const rule of rules) {
		if (!rule.enabled) continue
		if (!ruleScopeMatches(rule.scope)) continue
		// This server's own replacement, if the rule has one (Welcome Wagon).
		const replace = replacementFor(rule)
		if (!wagonAllowsRule(replace)) continue
		const compiled = compileRule(rule)
		if (!compiled.pattern) continue
		if (!compiled.pattern.test(out)) continue
		compiled.pattern.lastIndex = 0

		let rawReplace = replace
		if (rawReplace === '{rainbow}' || rawReplace === '{gradient}') {
			rawReplace = /\([^?][^)]*\)/.test(rule.find)
				? '{rainbow:$1}'
				: '{rainbow:$&}'
		}

		// A plain-text rule's replacement is plain text too: without escaping, `$&`, `$1` or `$$`
		// in it would be read as substitution codes, and a replacement of "$$" would send "$".
		// Greeting placeholders go in last, with their values' `$` already doubled (greetings.ts).
		const template = greetingsUnlocked()
			? expandRandom(
					expandSnippets(rawReplace, settings().snippets ?? []),
					rule.id,
				)
			: rawReplace
		const replacement = expandPlaceholders(
			rule.regex
				? unescapeReplacement(template)
				: template.replace(/\$/g, '$$$$'),
		)
		// Plain-text rules that ignore case follow the typed case. The replacement is in `$$` form
		// here, so it's turned back into the literal text first.
		const literal =
			!rule.regex && !rule.caseSensitive
				? replacement.replace(/\$\$/g, '$')
				: undefined
		const next = safeReplace(
			out,
			compiled.pattern,
			literal !== undefined ? match => keepCase(match, literal) : replacement,
		)
		const final = expandDynamicPlaceholders(next)
		if (final !== out) {
			applied++
			out = final
		}
	}

	return { text: out, applied }
}
