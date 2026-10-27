import { reportError } from '../../../../shared/report'

/**
 * A one-off instruction for the very next message, set from the send button's long-press sheet.
 *
 * The sheet does not send anything itself: it records what the next send should do, then presses
 * Discord's own send button, so the message goes out through the normal path (draft, reply, pending
 * attachments and all) and the send hook in `patches/outgoing.ts` picks the instruction up.
 *
 * It expires after a few seconds. If that press never reaches `sendMessage` (a slash command, or a
 * path this plugin does not hook), the instruction must not wait around and land on some later,
 * unrelated message.
 */

export type OneOff =
	/** Send silently, whatever the Silent messages setting says. */
	| 'silent'
	/** Send with notifications, whatever the Silent messages setting says. */
	| 'loud'
	/** Send exactly as typed: no link cleaning, no rules, no @silent. */
	| 'raw'

const LIFETIME_MS = 5000

let pending: { kind: OneOff; until: number } | undefined

export function setNextSend(kind: OneOff) {
	pending = { kind, until: Date.now() + LIFETIME_MS }
}

/**
 * Records [kind] for the next message, then presses the send button's own `onPress` ([send]).
 * Returns false when there was nothing to press.
 */
export function sendOnce(
	kind: OneOff,
	send: (() => void) | undefined,
): boolean {
	if (typeof send !== 'function') return false
	setNextSend(kind)
	try {
		send()
		return true
	} catch (error) {
		pending = undefined
		reportError('[SendTweaks] one-off send failed:', error)
		return false
	}
}

/** Returns the instruction once, then forgets it. */
export function takeNextSend(): OneOff | undefined {
	const current = pending
	pending = undefined
	return current && Date.now() < current.until ? current.kind : undefined
}
