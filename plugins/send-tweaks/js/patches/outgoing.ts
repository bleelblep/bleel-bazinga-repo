/**
 * Rewriting a message's text on its way out -- both new messages and edits.
 *
 * ## `before` hooks, through the patcher
 *
 * `sendMessage` and `editMessage` are `instead`-hooked by other plugins (Fake Nitro, Zipline,
 * message-tweaks, and our own Second Thoughts). A `before` runs ahead of that whole chain, whatever
 * order the plugins started in, so Second Thoughts always judges the cleaned text.
 *
 * Versions 0.1.6 to 1.0.11 replaced the methods with plain functions instead, because the patcher
 * of the time could recurse forever when a second `instead` met a method that already had a
 * `before` ("Maximum call stack size exceeded" on saving an edit, for anyone with Fake Nitro).
 * revenge-bundle-next fa6cb81 (2026-10-24) fixed that, and every Valenced release carries the fix,
 * so these are ordinary patcher hooks again.
 *
 * ## Only the text is touched
 *
 * The message object's `content` is replaced and nothing else. Attachments, stickers, reply
 * references and allowed mentions pass through exactly as Discord built them. A hook that returns
 * without changing anything leaves the send identical to one without this plugin installed.
 *
 * The rewrite changes the message object in place and never throws out of the hook, so a failure
 * sends the message exactly as typed.
 *
 * ## Silent messages are new messages only
 *
 * With Silent messages on, a new message gets Discord's own `@silent ` prefix after every other change
 * (`lib/silent.ts`), so your rules never see it and it is always the very first thing in the text.
 * Edits are left alone: flags cannot change after sending, and an edit would keep the literal text.
 *
 * ## Edits are cleaned when the edit box opens, not only when it is saved
 *
 * Discord skips `editMessage` entirely when the edited text is identical to the original, so a
 * hook there alone never ran on "open edit, save" -- the obvious way to clean an old message's
 * link. Cleaning the draft carried by `MESSAGE_START_EDIT` fixes that: the edit box opens with
 * the cleaned text, which now differs from the original, so saving goes through. You also see
 * the result before saving, and can cancel. The `editMessage` hook stays for text typed or
 * pasted into the box afterwards.
 *
 * A Flux patch rather than a hook on `startEditMessage`: that export and
 * `startEditMessageRecord` both end in this one event, and the latter may call the former
 * without going through the export. Returning nothing from a Flux patch blocks the event, so
 * every path returns a payload.
 */

import { onFluxEventDispatched } from '@valenced/discord/flux'
import { before } from '@valenced/patcher'
import { reportError } from '../../../../shared/report'
import { whenModule } from '../lib/finder'
import { withSendContext } from '../lib/greetings'
import { takeNextSend } from '../lib/nextSend'
import { withSendRandom } from '../lib/random'
import { makeSilent } from '../lib/silent'
import { debug, settings, TAG } from '../lib/state'
import { transform } from '../lib/transform'
import type { OneOff } from '../lib/nextSend'

const DEBUG: boolean = false

/** The part of Discord's outgoing message object this plugin reads and writes. */
export interface OutgoingMessage {
	content?: string
}

interface MessageReference {
	message_id?: string
	messageId?: string
}

/** `MessageActionCreators`: the methods this plugin hooks, described by the arguments it reads. */
export interface MessageActions {
	sendMessage(
		channelId: string,
		message: OutgoingMessage,
		...rest: unknown[]
	): unknown
	editMessage(
		channelId: string,
		messageId: string,
		message: OutgoingMessage,
		...rest: unknown[]
	): unknown
	startEditMessage(...args: unknown[]): unknown
}

/** The `MESSAGE_START_EDIT` payload: the draft the edit box opens with. */
interface StartEditPayload {
	channelId?: string
	channel_id?: string
	content?: string
}

/** Counts for the Debug page. Kept only in debug builds. */
const status = {
	installed: false,
	moduleId: -1,
	sends: 0,
	edits: 0,
	/** Edit boxes opened with already-cleaned text. */
	drafts: 0,
	cleaned: 0,
	replaced: 0,
	/** Links changed by a link rule. */
	rewritten: 0,
	/** New messages sent with @silent added. */
	silenced: 0,
	/** Messages sent unchanged from the send button's long-press sheet. */
	untouched: 0,
}

export function outgoingStatus() {
	return { ...status }
}

function rewrite(
	message: OutgoingMessage | undefined,
	kind: 'send' | 'edit' | 'draft',
) {
	if (!message || typeof message.content !== 'string' || !message.content)
		return

	const result = transform(message.content)
	if (result.text === message.content) return

	message.content = result.text
	if (DEBUG) {
		status.cleaned += result.cleaned
		status.replaced += result.replaced
		status.rewritten += result.rewritten
		if (kind === 'send') status.sends++
		else if (kind === 'edit') status.edits++
		else status.drafts++
	}
	debug(
		`${kind}: ${result.cleaned} tracking param(s) removed, ${result.rewritten} link(s) rewritten, ${result.replaced} rule(s) applied`,
	)
}

/** Last, after `rewrite`: see "Silent messages are new messages only" above. */
function silence(message: OutgoingMessage | undefined, once?: OneOff) {
	const wanted =
		once === 'silent'
			? true
			: once === 'loud'
				? false
				: settings().silentMessages
	if (!wanted) return
	if (!message || typeof message.content !== 'string') return
	const silent = makeSilent(message.content)
	if (silent === message.content) return
	message.content = silent
	if (DEBUG) status.silenced++
	debug('send: @silent added')
}

function hasMessageReference(
	arg: unknown,
): arg is { messageReference: MessageReference | null } {
	return typeof arg === 'object' && arg !== null && 'messageReference' in arg
}

export default function patchOutgoing(): () => void {
	const patches: Array<() => void> = []

	patches.push(
		onFluxEventDispatched<StartEditPayload>('MESSAGE_START_EDIT', payload => {
			try {
				if (!settings().applyToEdits) return payload
				// A copy, so nothing else holding the original payload sees it change.
				const draft = { ...payload }
				withSendContext(
					{ channelId: payload.channelId ?? payload.channel_id },
					() => rewrite(draft, 'draft'),
				)
				return draft
			} catch (error) {
				reportError(`${TAG} edit draft rewrite failed:`, error)
				return payload
			}
		}),
		whenModule<MessageActions>(
			['sendMessage', 'editMessage', 'startEditMessage'],
			(host, id) => {
				patches.push(
					// sendMessage(channelId, message, ...)
					before(host, 'sendMessage', args => {
						try {
							// Taken first and always, so a one-off from the long-press sheet is used up by
							// this send and never carried to the next one.
							const once = takeNextSend()
							if (once === 'raw') {
								if (DEBUG) status.untouched++
								debug('send: sent unchanged, as asked from the send button')
								return args
							}
							const [channelId, message] = args
							// The channel and reply target, for greeting placeholders (lib/greetings.ts).
							const reference = args.find(hasMessageReference)?.messageReference
							withSendContext(
								{
									channelId,
									replyToId: reference?.message_id ?? reference?.messageId,
								},
								() =>
									withSendRandom(message?.content ?? '', () =>
										rewrite(message, 'send'),
									),
							)
							silence(message, once)
						} catch (error) {
							// Never stand between the user and the send: the call goes ahead as typed.
							reportError(`${TAG} sendMessage rewrite failed:`, error)
						}
						return args
					}),
					// editMessage(channelId, messageId, { content })
					before(host, 'editMessage', args => {
						try {
							if (settings().applyToEdits)
								withSendContext({ channelId: args[0] }, () =>
									rewrite(args[2], 'edit'),
								)
						} catch (error) {
							reportError(`${TAG} editMessage rewrite failed:`, error)
						}
						return args
					}),
				)

				status.installed = true
				status.moduleId = id
				// Log the outcome, not the attempt -- coding rule 3.
				if (DEBUG)
					console.log(`${TAG} rewriting outgoing messages on module ${id}`)
			},
		),
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
