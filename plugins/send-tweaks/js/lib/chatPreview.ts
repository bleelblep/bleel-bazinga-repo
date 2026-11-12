/**
 * "Preview in the chat": the preview as an "Only you can see this" message at the bottom of the
 * chat instead of a dialog.
 *
 * The message only exists in this phone's copy of the chat (shared/commands.ts showClientMessage:
 * Discord's own receive path, EPHEMERAL flag, a made-up id). Nothing is sent and no request is made
 * to show it, change it or take it away. It goes away when you send, when a new preview replaces
 * it, or with Discord's own "Dismiss message".
 *
 * Sending stays your own tap on Discord's send button (patches/sendButton.tsx): with Tap send to
 * preview on, the first tap previews and a second tap with the same text sends. The picks a
 * {random} template made for the preview are kept for that send, as the dialog's Send does.
 */

import { clientMessageId, createCommands } from '../../../../shared/commands'
import { Stores } from '@valenced/discord/flux'
import type { Choice } from './random'
import { settings } from './state'

let commands: ReturnType<typeof createCommands> | undefined
/** Made on first use, not at load (coding rule 1). */
const client = () => (commands ??= createCommands('Send Tweaks'))

interface Shown {
	channelId: string
	id: string
	draft: string
	choices: Choice[]
}

let shown: Shown | undefined

function currentChannel(): string | undefined {
	try {
		return (Stores as any).SelectedChannelStore?.getChannelId?.() ?? undefined
	} catch {
		return undefined
	}
}

/** Whether previews go in the chat. Off falls back to the dialog. */
export function inChatEnabled(): boolean {
	return !!settings().previewInChat
}

/**
 * Shows [content] as the chat's preview, replacing an earlier one. False when it couldn't (no
 * channel, or Discord's receive path wasn't found), so the caller can use the dialog instead.
 */
export function showInChat(
	draft: string,
	content: string,
	warnings: string[],
	choices: Choice[],
): boolean {
	const channelId = currentChannel()
	if (!channelId) return false
	clearInChat()
	// Only Tap send to preview gets a hint: a second tap sending isn't something you'd guess.
	const hint = settings().tapToPreview ? ['-# Tap send again to send it'] : []
	const body = [content, ...warnings.map(w => `-# ⚠️ ${w}`), ...hint].join('\n')
	const id = clientMessageId()
	if (!client().showClientMessage({ channelId, id, content: body, author: 'Preview' }))
		return false
	shown = { channelId, id, draft, choices }
	return true
}

/**
 * The preview's {random} picks when the chat's preview is of exactly [draft] in the chat you're
 * in, so the send can match it. Undefined otherwise.
 */
export function previewFor(draft: string | undefined): Choice[] | undefined {
	if (!shown || draft === undefined) return undefined
	if (shown.draft !== draft || shown.channelId !== currentChannel()) return undefined
	return shown.choices
}

/** Takes the chat's preview away (only ever local). [channelId] limits it to that chat. */
export function clearInChat(channelId?: string) {
	const s = shown
	if (!s || (channelId && s.channelId !== channelId)) return
	shown = undefined
	client().deleteClientMessage(s.channelId, s.id)
}
