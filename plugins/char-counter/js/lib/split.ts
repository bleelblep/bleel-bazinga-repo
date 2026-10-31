/**
 * Cutting one long message into several that each fit Discord's limit. Pure text in, text out; the
 * sending is in `lib/sender.ts`, and `tests/split.test.ts` pins the behaviour.
 *
 * Each cut lands on the latest good boundary in the part's budget, and no earlier than half-way
 * through it so parts stay a sensible size: a blank line first, then a line break, then the end of
 * a sentence, then any space. With no boundary at all (one enormous word) the cut is a hard one,
 * never through a surrogate pair.
 *
 * A code block spanning a cut is closed with ``` at the end of the part and reopened, with its
 * language, at the start of the next, so every part renders as code on its own. The budget shrinks
 * by the closing fence's size for those cuts, and only line breaks are trimmed around them so the
 * code's own indentation survives.
 */

const FENCE = '```'

/** Boundaries, best first. Each match's end is where the next part starts. */
const BOUNDARIES: RegExp[] = [
	/\n[ \t]*\n/g,
	/\n/g,
	/[.!?…]["')\]]*[ \t]+/g,
	/\s+/g,
]

export function splitMessage(text: string, max: number): string[] {
	if (!(max > 0) || text.length <= max) return [text]
	const parts: string[] = []
	let rest = text
	// Every pass removes at least one character, so this only guards against a future mistake.
	let passes = 0
	while (rest.length > max && passes++ < 10_000) {
		let cut = findCut(rest, max)
		if (openFence(rest.slice(0, cut)) !== undefined) {
			// Room for "\n```" at the end of this part.
			cut = findCut(rest, max - FENCE.length - 1)
			const language = openFence(rest.slice(0, cut))
			if (language !== undefined) {
				parts.push(`${rest.slice(0, cut).replace(/\n+$/, '')}\n${FENCE}`)
				rest = `${FENCE}${language}\n${rest.slice(cut).replace(/^\n+/, '')}`
				continue
			}
		}
		parts.push(rest.slice(0, cut).replace(/\s+$/, ''))
		rest = rest.slice(cut).replace(/^\s+/, '')
	}
	if (rest) parts.push(rest)
	return parts.filter(part => part.length > 0)
}

/** How many parts a message of `length` characters needs, roughly: the badge's "N messages". */
export function estimateParts(length: number, max: number): number {
	return max > 0 ? Math.max(1, Math.ceil(length / max)) : 1
}

/** Where to end the next part of `text`, at most `budget` characters in. */
function findCut(text: string, budget: number): number {
	if (budget < 1) return 1
	const window = text.slice(0, budget + 1)
	const floor = Math.floor(budget / 2)
	for (const boundary of BOUNDARIES) {
		let best = -1
		for (const match of window.matchAll(boundary)) {
			const end = (match.index ?? 0) + match[0].length
			if (end <= budget && end >= floor) best = end
		}
		if (best > 0) return best
	}
	// A hard cut, kept off the middle of an emoji or other astral character.
	const code = text.charCodeAt(budget - 1)
	return code >= 0xd800 && code <= 0xdbff && budget > 1 ? budget - 1 : budget
}

/**
 * The language of the code block still open at the end of `chunk` ("" for a bare ```), or
 * undefined when every fence in it is closed.
 */
function openFence(chunk: string): string | undefined {
	let open: string | undefined
	for (const match of chunk.matchAll(/```([^\s`]*)/g))
		open = open === undefined ? match[1] : undefined
	return open
}
