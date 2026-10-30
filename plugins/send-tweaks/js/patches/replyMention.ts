/**
 * Replies that do not ping by default.
 *
 * ## Where the default lives
 *
 * Starting a reply -- the long-press option or the swipe gesture -- calls `createPendingReply` or
 * `createShallowPendingReply` with an object carrying `shouldMention`. That value is what the @
 * toggle above the chat box shows, and what the eventual send uses for `allowed_mentions`. Setting
 * it to `false` here means the reply *starts* with the toggle off; tapping it back on still works
 * exactly as before, for the one reply where you do want the ping.
 *
 * That is deliberately softer than stripping the mention at send time, which would silently
 * override the toggle when you had turned it on.
 *
 * ## Sharing these methods with Ghost Log Native Beta
 *
 * Ghost Log Native Beta has an `instead` hook on both methods, to refuse replies to deleted
 * messages. These are `before` hooks, which run ahead of any `instead` chain whatever order the
 * plugins started in. (Until 2026-10-24 the patcher could recurse when a second `instead` met a
 * method that already had a `before`; revenge-bundle-next fa6cb81 fixed it, and every Valenced
 * release carries the fix. See `patches/outgoing.ts`.)
 */

import { before } from '@valenced/patcher'
import { reportError } from '../../../../shared/report'
import { whenModule } from '../lib/finder'
import { shouldSilence } from '../lib/replyPeople'
import { debug, settings, TAG } from '../lib/state'

const DEBUG: boolean = false

/** The object a reply starts from. Only `shouldMention` is changed. */
interface PendingReply {
	shouldMention?: boolean
	message?: { author?: { id?: unknown } }
	channel?: unknown
}

/** `PendingReplyActionCreators`: the two ways Discord starts a reply. */
interface ReplyActions {
	createPendingReply(reply: PendingReply, ...rest: unknown[]): unknown
	createShallowPendingReply(reply: PendingReply, ...rest: unknown[]): unknown
}

const METHODS = ['createPendingReply', 'createShallowPendingReply'] as const

/** Counts for the Debug page. Kept only in debug builds. */
const status = { installed: false, silenced: 0 }

export function replyStatus() {
	return { ...status }
}

/** Only an object that is plainly a pending reply is touched. */
function isPendingReply(value: unknown): value is PendingReply {
	return (
		typeof value === 'object' &&
		value !== null &&
		// It either already carries `shouldMention`, or it has the message and channel a reply is
		// built from. The swipe path may omit the key entirely, and requiring it would leave swiped
		// replies pinging.
		('shouldMention' in value || ('message' in value && 'channel' in value))
	)
}

export default function patchReplyMention(): () => void {
	const patches: Array<() => void> = []

	patches.push(
		whenModule<ReplyActions>(['createPendingReply'], (host, id) => {
			for (const method of METHODS) {
				if (typeof host[method] !== 'function') continue

				patches.push(
					before(host, method, args => {
						try {
							const [reply] = args
							if (
								settings().noReplyMention &&
								isPendingReply(reply) &&
								reply.shouldMention !== false &&
								shouldSilence(reply.message?.author?.id != null ? String(reply.message.author.id) : undefined)
							) {
								reply.shouldMention = false
								if (DEBUG) status.silenced++
								debug(`${method}: reply started with mention off`)
							}
						} catch (error) {
							reportError(`${TAG} ${method} hook failed:`, error)
						}
						return args
					}),
				)
			}

			status.installed = true
			if (DEBUG)
				console.log(`${TAG} reply mention default hooked on module ${id}`)
		}),
	)

	return () => {
		status.installed = false
		for (const unpatch of patches.reverse()) {
			try {
				unpatch()
			} catch {
				/* already gone */
			}
		}
	}
}
