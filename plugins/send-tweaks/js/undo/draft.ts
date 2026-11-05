/**
 * Putting a message back after Undo.
 *
 * The chat input clears itself in its own submit handler, before `sendMessage` is called, so by
 * the time a message is held its text is already gone from the screen. Undo has to put it back.
 *
 * The text: copied from Second Thoughts (`Second Thoughts' lib/draft.ts`). Three routes,
 * tried in order: Discord's `saveDraft`, a raw `DRAFT_CHANGE` dispatch, and the clipboard. The
 * last always works, so the words are never lost. Anything already typed in the box is kept
 * after the undone text (`mergeDraft` in held.ts).
 *
 * The reply: the send carried a `messageReference`, and Discord dropped the pending reply when it
 * sent. `createPendingReply` with the channel and the replied-to message puts the "Replying to"
 * strip back, with the @ toggle as it was. Best effort: if the message isn't in the store any
 * more, the text still comes back and the reply is simply gone.
 *
 * `valenced.*` is only read inside functions (docs/coding-rules.md rule 1).
 */

import { Dispatcher } from '@valenced/discord/common/flux'
import { Stores } from '@valenced/discord/flux'
import * as finders from '@valenced/modules/finders'
import * as filters from '@valenced/modules/finders/filters'
import * as ReactNative from 'react-native'
import { reportError } from '../../../../shared/report'
import { showToast } from '../../../../shared/toast'
import { writeComposer } from './box'
import { mergeDraft, uploadItem } from './held'
import { TAG, TOAST } from './state'

export type RestoreRoute = 'composer' | 'saveDraft' | 'clipboard' | 'none'

/** Discord's DraftType.ChannelMessage. */
const CHANNEL_MESSAGE = 0

/** The route that answered last, for the settings page's status row. */
let lastRoute: RestoreRoute | undefined

export function lastRestoreRoute(): RestoreRoute | undefined {
	return lastRoute
}

/** A module's export, on the namespace or on `default` (coding rule 3). Resolved once. */
function hostOf(key: string, ...more: string[]): any {
	try {
		const { lookupModule } = finders
		const { withProps } = filters
		const [mod] = lookupModule(withProps(key, ...more)) as [
			any,
			number | undefined,
		]
		const host = typeof mod?.[key] === 'function' ? mod : mod?.default
		return typeof host?.[key] === 'function' ? host : undefined
	} catch {
		return undefined
	}
}

let draftHost: any
let draftResolved = false
function draftModule(): any {
	if (!draftResolved) {
		draftResolved = true
		draftHost = hostOf('saveDraft', 'clearDraft')
	}
	return draftHost
}

let replyHost: any
let replyResolved = false
function replyModule(): any {
	if (!replyResolved) {
		replyResolved = true
		replyHost = hostOf('createPendingReply')
	}
	return replyHost
}

/** What's typed in the box for this chat right now, if Discord will say. */
function currentDraft(channelId: string): string | undefined {
	try {
		const draft = (Stores as any).DraftStore?.getDraft?.(
			channelId,
			CHANNEL_MESSAGE,
		)
		return typeof draft === 'string' ? draft : undefined
	} catch {
		return undefined
	}
}

function viaSaveDraft(channelId: string, content: string): boolean {
	const mod = draftModule()
	if (!mod) return false
	try {
		mod.saveDraft(channelId, CHANNEL_MESSAGE, content)
		return true
	} catch {
		return false
	}
}

function viaDispatch(channelId: string, content: string): boolean {
	try {
		const dispatcher = Dispatcher as any
		if (typeof dispatcher?.dispatch !== 'function') return false
		dispatcher.dispatch({
			type: 'DRAFT_CHANGE',
			channelId,
			draftType: CHANNEL_MESSAGE,
			draft: content,
		})
		return true
	} catch {
		return false
	}
}

export function viaClipboard(content: string): boolean {
	try {
		const Clipboard = (ReactNative as any)?.Clipboard
		if (typeof Clipboard?.setString !== 'function') return false
		Clipboard.setString(content)
		return true
	} catch {
		return false
	}
}

/**
 * Puts [content] back in [channelId]'s box, ahead of anything typed since. [quiet] skips the
 * clipboard and failure toasts, for a caller that shows its own (lib/holds.ts `cancelAll`).
 */
export function restoreDraft(
	channelId: string,
	content: string,
	quiet = false,
): RestoreRoute {
	const text = mergeDraft(content, currentDraft(channelId))
	if (!text) {
		lastRoute = 'none'
		return lastRoute
	}
	// The box on screen first (lib/composer.ts), and the draft store as well, so both agree and
	// another chat's text is there when that chat opens.
	const onScreen = writeComposer(channelId, text)
	const stored = viaSaveDraft(channelId, text) || viaDispatch(channelId, text)
	if (onScreen) lastRoute = 'composer'
	else if (stored) lastRoute = 'saveDraft'
	else if (viaClipboard(text)) {
		if (!quiet) showToast('Copied your message to the clipboard', TOAST)
		lastRoute = 'clipboard'
	} else {
		reportError(`${TAG} could not restore the draft by any route`)
		if (!quiet) showToast('Could not recover your message', TOAST)
		lastRoute = 'none'
	}
	return lastRoute
}

/** Makes the box a reply to [messageId] again. True when the strip is back. */
export function restoreReply(
	channelId: string,
	messageId: string,
	mention: boolean,
): boolean {
	try {
		const host = replyModule()
		if (!host) return false
		const channel = (Stores as any).ChannelStore?.getChannel?.(channelId)
		const message = (Stores as any).MessageStore?.getMessage?.(
			channelId,
			messageId,
		)
		if (!channel || !message) return false
		host.createPendingReply({
			channel,
			message,
			shouldMention: mention,
			showMentionToggle: true,
		})
		return true
	} catch (error) {
		reportError(`${TAG} could not restore the reply:`, error)
		return false
	}
}

/**
 * Puts the photos and files back in the tray above the box. The send carried Discord's upload
 * objects; their picker items go back through `UPLOAD_ATTACHMENT_ADD_FILES`, the event the
 * photo picker and file picker end in (`stores/UploadAttachmentStore.tsx` makes a fresh upload
 * for each; Music Links' probe uses the same event). Returns how many went back.
 */
export function restoreAttachments(channelId: string, uploads: any[]): number {
	const files = uploads
		.map(uploadItem)
		.filter((item): item is Record<string, unknown> => !!item)
	if (!files.length) return 0
	try {
		const dispatcher = Dispatcher as any
		if (typeof dispatcher?.dispatch !== 'function') return 0
		dispatcher.dispatch({
			type: 'UPLOAD_ATTACHMENT_ADD_FILES',
			channelId,
			draftType: CHANNEL_MESSAGE,
			files,
		})
		return files.length
	} catch (error) {
		reportError(`${TAG} could not restore the attachments:`, error)
		return 0
	}
}
