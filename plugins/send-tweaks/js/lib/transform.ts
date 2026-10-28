/**
 * Everything that happens to a message's text on the way out, in one place.
 *
 * Shared by the send hook, the edit hook and the settings page's "try a message" box, so the
 * preview can never disagree with what actually gets sent.
 *
 * Links are cleaned first (outside code), then your link rules run inside each link -- the place for
 * rewrites like twitter.com to fxtwitter.com. Your text rules then run over the whole message with code,
 * links, mentions, custom emoji and timestamps held aside, so a rule for a common word can never
 * break a link or a mention that happens to contain it, and `^` / `$` still mean the start and end.
 *
 * Polish wording runs just before your text rules, with the same things held aside, so a rule you
 * wrote always has the last word.
 */

import { cleanText, mapUrls } from './cleanUrls'
import {
	mapOutsideCode,
	mapOutsideProtected,
	transformAroundProtected,
} from './codeSpans'
import { expandDynamicPlaceholders } from './greetings'
import { parseSkipList, polish } from './polish'
import { settings } from './state'
import { applyRules, formatAnsiBlock } from './textReplace'

export interface TransformResult {
	text: string
	/** Tracking parameters removed. */
	cleaned: number
	/** Text rules that changed something. */
	replaced: number
	/** Links a link rule changed. */
	rewritten: number
	/** Polish wording changed something. */
	polished: boolean
	/** Rules applied via live replace (Replace as you type). */
	liveReplaced?: number
	/** Rules applied via send replace (Replace as you send). */
	sendReplaced?: number
}

export function transform(text: string): TransformResult {
	const s = settings()
	let cleaned = 0
	let replaced = 0
	let rewritten = 0
	let liveReplaced = 0
	let sendReplaced = 0
	let polished = false
	let out = text

	if (s.cleanUrls) {
		out = mapOutsideCode(out, prose => {
			const result = cleanText(prose)
			cleaned += result.removed
			return result.text
		})
	}

	const linkRules = s.linkRules ?? []
	if (s.linkRewrite && linkRules.length) {
		// Inside links only, never inside code -- the opposite of text rules, which skip links.
		out = mapOutsideCode(out, prose =>
			mapUrls(prose, url => {
				const result = applyRules(url, linkRules)
				if (result.text !== url) rewritten++
				return result.text
			}),
		)
	}

	// Rules set to apply while typing also run on send, for anything typing missed.
	const liveRules = (s.rules ?? []).filter(r => r.enabled && r.live)
	if (liveRules.length) {
		const whole = transformAroundProtected(out, masked => {
			const result = applyRules(masked, liveRules)
			liveReplaced = result.applied
			return result.text
		})
		if (whole !== undefined) {
			out = whole
		} else {
			out = mapOutsideProtected(out, words => {
				const result = applyRules(words, liveRules)
				liveReplaced += result.applied
				return result.text
			})
		}
	}

	// Send replace rules: if Replace text as you send is on, remaining enabled rules apply. The
	// live ones already ran just above; running them again doubled any that aren't idempotent
	// ("lol" -> "lol 😂" sent "lol 😂 😂").
	const sendRules = (s.rules ?? []).filter(r => !r.live)
	if (s.textReplace && sendRules.length) {
		const beforeSend = out
		let applied = 0
		const whole = transformAroundProtected(out, masked => {
			const result = applyRules(masked, sendRules)
			applied = result.applied
			return result.text
		})
		if (whole !== undefined) {
			out = whole
			if (out !== beforeSend) sendReplaced = applied
		} else {
			out = mapOutsideProtected(out, words => {
				const result = applyRules(words, sendRules)
				sendReplaced += result.applied
				return result.text
			})
		}
	}

	replaced = liveReplaced + sendReplaced

	// Polish last, so replaced text gets its capitals and full stop too. Before the rules, a
	// capital it added ("omw" -> "Omw") was thrown away by the replacement.
	if (s.polishWording) {
		const polishOptions = {
			apostrophes: s.polishApostrophes !== false,
			capitals: s.polishCapitals !== false,
			fullStop: !!s.polishFullStop,
			skip: parseSkipList(s.polishSkip),
		}
		const before = out
		// Whole message at once, so the start of the message and the end are really those.
		out =
			transformAroundProtected(out, masked => polish(masked, polishOptions)) ??
			mapOutsideProtected(out, words =>
				polish(words, { ...polishOptions, capitals: false, fullStop: false }),
			)
		polished = out !== before
	}

	out = mapOutsideCode(out, prose => {
		const text = prose.replace(/\{timestamp(?::([tTdDfFR]))?\}/g, (_, flag) => {
			const unix = Math.floor(Date.now() / 1000)
			return `<t:${unix}:${flag || 'F'}>`
		})
		return expandDynamicPlaceholders(text)
	})

	if (out.includes('```ansi') || out.includes('```ANSI')) {
		out = out.replace(
			/```ansi([\s\S]*?)```/gi,
			(_, code) => `\`\`\`ansi${formatAnsiBlock(code)}\`\`\``,
		)
	}

	return {
		text: out,
		cleaned,
		replaced,
		rewritten,
		polished,
		liveReplaced,
		sendReplaced,
	}
}
