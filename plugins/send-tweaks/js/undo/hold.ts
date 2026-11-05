/**
 * Undo send: holding the send.
 *
 * ## Where it sits
 *
 * Every way of sending -- the button, the return key, a slash command, the share sheet, the
 * voice message button, the preview's Send -- ends at `sendMessage`, and the optimistic row is
 * made inside it. Holding the call here means nothing is drawn in the chat until the wait is
 * over, so an undone message was never there at all.
 *
 * It's an `instead` hook through the patcher, on the same method `patches/outgoing.ts` hooks
 * with a `before`. A `before` runs ahead of every `instead`, so the rewrite (link cleaning, rules,
 * @silent, a one-off from the send button) happens once, at send time, and the hold keeps the
 * rewritten call: the replay is exactly what would have gone out without the wait.
 *
 * ## What Undo gives back
 *
 * The text as you typed it, not as it was rewritten, so you edit your own words and the rules
 * run again when you resend. `outgoing.ts` calls `rememberTyped` before it changes anything; the
 * message object is the key, so nothing outlives the send.
 *
 * ## Not held
 *
 * With the switch off, every send goes straight on and this hook only passes the call through.
 * Also straight through: an empty call, a send with a file while "Hold photos and files too" is
 * off, a send when `MAX_HELD` (`undo/holds.ts`) are already waiting, and a send when the
 * logged-in user id can't be read, since a held send must be tied to its account. None of these
 * are dropped; they go exactly as without the plugin.
 *
 * While a message waits, the caller gets a promise that settles with the real outcome
 * (`undo/holds.ts`, "What the caller gets back").
 */

import { instead } from '@valenced/patcher'
import { reportError } from '../../../../shared/report'
import { whenModule } from '../lib/finder'
import type { MessageActions } from '../patches/outgoing'
import { currentUserId } from './account'
import { summarise, worthHolding } from './held'
import { hasRoom, hold, holdStatus } from './holds'
import { delayMs, holdFiles, TAG, undoOn } from './state'

const DEBUG: boolean = false

/** For the Debug page. An uninstalled hook means nothing can be held. */
export const holdHookStatus = { installed: false, moduleId: -1 }

/** The text as typed, by message object, written by `patches/outgoing.ts` before it rewrites. */
const typed = new WeakMap<object, string>()

export function rememberTyped(message: unknown) {
	try {
		if (
			message &&
			typeof message === 'object' &&
			typeof (message as { content?: unknown }).content === 'string' &&
			!typed.has(message)
		)
			typed.set(message, (message as { content: string }).content)
	} catch {
		/* frozen or odd: Undo then gives back the sent text */
	}
}

export default function patchHold(): () => void {
	const patches: Array<() => void> = []

	patches.push(
		whenModule<MessageActions>(
			['sendMessage', 'editMessage', 'startEditMessage'],
			(host, id) => {
				patches.push(
					instead(host, 'sendMessage', function (this: unknown, args: any[], original: (...args: any[]) => unknown) {
						try {
							if (undoOn()) {
								const summary = summarise(args)
								const userId = currentUserId()
								if (
									summary &&
									userId &&
									worthHolding(summary, holdFiles())
								) {
									if (!hasRoom()) holdStatus.passedCap++
									else {
										const message = args[1]
										const own =
											message && typeof message === 'object'
												? typed.get(message)
												: undefined
										if (own !== undefined) summary.content = own
										return hold(
											{ self: this, args, original },
											summary,
											delayMs(),
											userId,
										).done
									}
								}
							}
						} catch (error) {
							// Holding must never cost a message: anything wrong here and it just goes.
							reportError(
								`${TAG} hold failed; sending anyway: ${(error as Error)?.name ?? 'error'}`,
							)
						}
						return Reflect.apply(original, this, args)
					}),
				)
				holdHookStatus.installed = true
				holdHookStatus.moduleId = id
				// Log the outcome, not the attempt -- coding rule 3.
				if (DEBUG) console.log(`${TAG} holding sendMessage on module ${id}`)
			},
		),
	)

	return () => {
		holdHookStatus.installed = false
		holdHookStatus.moduleId = -1
		for (const unpatch of patches.reverse()) {
			try {
				unpatch()
			} catch {
				/* already gone */
			}
		}
	}
}
