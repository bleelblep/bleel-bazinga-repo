/**
 * Reading and rewriting what a message actually says.
 *
 * A message's prose lives in `text` content nodes — the same tree `redactContentNodes` walks for
 * mentions, but the plain children rather than the ones carrying a `userId`. This file has the
 * two halves that need: gathering the text so something can judge it, and blanking out runs of it
 * afterwards.
 *
 * ## Substrings, not offsets
 *
 * Redactions are expressed as literal strings to blank out, not as character offsets. The text of
 * one message is spread across however many nodes Discord's parser produced — a link splits a
 * sentence into three — so an offset computed over the joined string does not survive the trip
 * back. Matching substrings per node is immune to that, and has a useful side effect: an email
 * repeated twice in a message is blanked both times.
 *
 * ## Idempotent, like everything else on this path
 *
 * These functions run over rows that may already have been redacted, because `rowManager` and
 * `chatManager` both hook the same data. The block character is never itself a match for anything
 * `findSensitive` returns, so a second pass over redacted text is a no-op.
 */

const MAX_DEPTH = 12

/** What a redacted run is replaced with. Distinct enough to read as deliberate in a screenshot. */
const BLOCK = '█'

/**
 * Same length as what it replaced, within reason, so a message does not visibly reflow and give
 * away how long the removed thing was. Capped because a blanked paragraph of blocks is worse to
 * look at than a short marker.
 */
function blockFor(value: string): string {
	const length = Math.min(Math.max(value.trim().length, 3), 12)
	return BLOCK.repeat(length)
}

/** Every plain-text string in a content-node tree, joined as the message reads. */
export function collectText(nodes: any, depth = 0): string {
	if (!Array.isArray(nodes) || depth > MAX_DEPTH) return ''

	const parts: string[] = []
	for (const node of nodes) {
		if (!node || typeof node !== 'object') continue
		if (typeof node.content === 'string') parts.push(node.content)
		else if (Array.isArray(node.content))
			parts.push(collectText(node.content, depth + 1))
	}
	return parts.join('')
}

/**
 * Blanks every occurrence of each value, in place. Returns how many nodes were rewritten.
 *
 * Mention nodes are skipped: those carry a `userId` and belong to `redactContentNodes`, which
 * replaces the whole name rather than blanking part of it. Blanking inside one would produce
 * "@Use█ 3".
 */
export function blankValues(nodes: any, values: string[], depth = 0): number {
	if (!Array.isArray(nodes) || depth > MAX_DEPTH || !values.length) return 0

	let changed = 0

	for (const node of nodes) {
		if (!node || typeof node !== 'object') continue

		// A node with a userId is a mention, and is somebody else's job.
		if (typeof node.userId === 'string' && node.userId) continue

		if (typeof node.content === 'string') {
			let text = node.content
			for (const value of values) {
				if (!value || !text.includes(value)) continue
				text = text.split(value).join(blockFor(value))
			}
			if (text !== node.content) {
				node.content = text
				changed++
			}
		} else if (Array.isArray(node.content)) {
			changed += blankValues(node.content, values, depth + 1)
		}
	}

	return changed
}
