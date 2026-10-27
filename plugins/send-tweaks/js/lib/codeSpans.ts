/**
 * Leaving code alone.
 *
 * A link inside a code block is almost always there to be read exactly as written — a config
 * value, a curl command, a bug report quoting the URL that broke. Cleaning it or running a text
 * replacement over it would change what the person meant to show. So both transforms run only
 * over the prose between code spans.
 *
 * Fenced blocks (```) are matched first, then double-backtick inline code (``has a ` inside``),
 * then single-backtick inline code -- which Discord lets run across a line break, so the pattern
 * does too. Matching in that order keeps a backtick inside a longer span from opening a shorter one.
 */

import { splitUrl } from './urlBounds'

const CODE = /```[\s\S]*?```|``[\s\S]+?``|`[^`]+`/g

/**
 * Discord's own markup inside prose: mentions, channel and role links, custom emoji, timestamps,
 * and links. Your find-and-replace rules skip these -- a rule for "lol" must not rewrite a URL that
 * contains it, and one that touches digits must not break a mention. Link cleaning still sees links;
 * this list is only for rules.
 */
const DISCORD_TOKEN =
	/<a?:\w+:\d+>|<@!?\d+>|<@&\d+>|<#\d+>|<t:-?\d+(?::[tTdDfFR])?>|<id:\w+>|https?:\/\/[^\s<>"'`]+/gi

function mapOutside(
	pattern: RegExp,
	text: string,
	transform: (prose: string) => string,
): string {
	let out = ''
	let last = 0

	pattern.lastIndex = 0
	for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
		const span = /^https?:\/\//i.test(match[0])
			? splitUrl(match[0], text.slice(0, match.index)).url
			: match[0]
		out += transform(text.slice(last, match.index))
		out += span
		last = match.index + span.length
		pattern.lastIndex = last
	}

	return out + transform(text.slice(last))
}

/**
 * Applies `transform` to every stretch of text that is not code, and stitches the result back
 * together with the code untouched.
 */
export function mapOutsideCode(
	text: string,
	transform: (prose: string) => string,
): string {
	return mapOutside(CODE, text, transform)
}

/** Code spans, then Discord tokens and links: everything a rule must leave exactly as written. */
const PROTECTED = new RegExp(`${CODE.source}|${DISCORD_TOKEN.source}`, 'gi')

/** A fresh copy of the code/token/link pattern, for callers that mask spans their own way. */
export function protectedPattern(): RegExp {
	return new RegExp(PROTECTED.source, 'gi')
}

/** Applies `transform` only between code spans, Discord tokens and links. */
export function mapOutsideProtected(
	text: string,
	transform: (prose: string) => string,
): string {
	return mapOutside(PROTECTED, text, transform)
}

// Placeholders come from Unicode's private use area, which no keyboard produces: an opening
// mark, one character standing for the span's index, a closing mark.
const OPEN = ''
const CLOSE = ''
const FIRST_INDEX = 0xe100
const MAX_SPANS = 0xf8ff - FIRST_INDEX
const PLACEHOLDER = /([-])/g
const PRIVATE_MARKS = /[]/

/**
 * Applies `transform` to the whole message at once, with every code span, Discord token and link
 * swapped for a placeholder, then swaps them back. Unlike running piece by piece between them,
 * `^` and `$` still mean the start and end of the message, and a rule can match across a mention.
 *
 * Returns undefined when that is not safe -- the message already contains the placeholder marks,
 * or the transform damaged, dropped or duplicated a placeholder -- so the caller can fall back to
 * `mapOutsideProtected`.
 */
export function transformAroundProtected(
	text: string,
	transform: (masked: string) => string,
): string | undefined {
	if (PRIVATE_MARKS.test(text)) return undefined

	const spans: string[] = []
	PROTECTED.lastIndex = 0
	let masked = ''
	let last = 0
	for (let match = PROTECTED.exec(text); match; match = PROTECTED.exec(text)) {
		const span = /^https?:\/\//i.test(match[0])
			? splitUrl(match[0], text.slice(0, match.index)).url
			: match[0]
		spans.push(span)
		masked +=
			text.slice(last, match.index) +
			`${OPEN}${String.fromCharCode(FIRST_INDEX + spans.length - 1)}${CLOSE}`
		last = match.index + span.length
		PROTECTED.lastIndex = last
	}
	masked += text.slice(last)
	if (spans.length > MAX_SPANS) return undefined

	const result = transform(masked)
	const seen = new Set<number>()
	let intact = true
	PLACEHOLDER.lastIndex = 0
	const restored = result.replace(PLACEHOLDER, (whole, index: string) => {
		const at = index.charCodeAt(0) - FIRST_INDEX
		if (at >= spans.length || seen.has(at)) {
			intact = false
			return whole
		}
		seen.add(at)
		return spans[at]
	})

	if (!intact || seen.size !== spans.length || PRIVATE_MARKS.test(restored))
		return undefined
	return restored
}
