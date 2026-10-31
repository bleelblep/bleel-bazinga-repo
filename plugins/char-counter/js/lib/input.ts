/**
 * The chat input the square sits on: its channel, its text, the handle that changes the text on
 * screen, and the reply being composed. Remembered from the ChatInput render patch
 * (`lib/badge.tsx`) on every render, the way Undo Send and Send Tweaks do it:
 *
 * - `chatInputRef` is the ref Discord passes to the input's accessories. Its `replaceRange({
 *   location, length, text, editId })` is what the emoji suggestion bar uses; natively it is dropped
 *   when `editId` no longer matches the box, so `chatInputStateRef.current.editId` goes with it.
 *   `insertText` is the older way, `getText` says what is in the box. Discord's `saveDraft` and a
 *   `DRAFT_CHANGE` dispatch update the draft store but not the box on screen (Undo Send, 351.x,
 *   seen on device 2026-10-27), so the handle is the only way to empty or refill the box.
 *
 * Nothing here sends anything. Missing pieces degrade, never guess: without a handle the text comes
 * from the draft store and the box cannot be written, which the split sheet checks before offering.
 */

import { Stores } from '@valenced/discord/flux'
import type { DiscordModules } from '@valenced/discord/types'

/** Discord's DraftType.ChannelMessage. */
export const CHANNEL_MESSAGE = 0

type Handle = Record<string, any>
type Ref = { current?: Handle | null }

let composer: { channelId: string | undefined; ref: Ref | undefined; stateRef: Ref | undefined } | undefined

/** Finds a ref Discord passes to the input's children, by prop name (Send Tweaks' `findRef`). */
export function findRef(node: any, prop: string, depth = 0): Ref | undefined {
	if (!node || typeof node !== 'object' || depth > 30) return undefined
	if (Array.isArray(node)) {
		for (const child of node) {
			const ref = findRef(child, prop, depth + 1)
			if (ref) return ref
		}
		return undefined
	}
	const ref = node.props?.[prop]
	if (ref && typeof ref === 'object' && 'current' in ref) return ref
	return findRef(node.props?.children, prop, depth + 1)
}

/** Called on every chat input render with its props and the tree it returned. */
export function rememberChatInput(props: unknown, tree: unknown) {
	const p = props && typeof props === 'object' ? (props as { channel?: { id?: string }; channelId?: string }) : undefined
	const channelId = p?.channel?.id ?? p?.channelId
	composer = {
		channelId: typeof channelId === 'string' ? channelId : undefined,
		ref: findRef(tree, 'chatInputRef'),
		stateRef: findRef(tree, 'chatInputStateRef'),
	}
}

/**
 * The same, from Discord's send path: `chatInputHandleSendText({ text, params })` carries
 * `params.channel` and `params.chatInputRef`, the handle the input itself clears the box with.
 */
export function rememberChatInputRef(channelId: string | undefined, ref: unknown) {
	if (!ref || typeof ref !== 'object' || !('current' in ref)) return
	composer = { channelId, ref: ref as Ref, stateRef: composer?.channelId === channelId ? composer?.stateRef : undefined }
}

export function forgetChatInput() {
	composer = undefined
}

type SelectedChannelStore = DiscordModules.Flux.Store<{ getChannelId(): string | undefined }>
type DraftStore = DiscordModules.Flux.Store<{ getDraft(channelId: string, type: number): string | undefined }>
type ChannelStore = DiscordModules.Flux.Store<{
	getChannel(id: string):
		| {
				id: string
				name?: string
				guild_id?: string
				type?: number
				rateLimitPerUser?: number
				recipients?: string[]
				rawRecipients?: Array<{ username?: string; global_name?: string }>
		  }
		| undefined
}>
type GuildStore = DiscordModules.Flux.Store<{ getGuild(id: string): { name?: string } | undefined }>
type UserStore = DiscordModules.Flux.Store<{
	getCurrentUser(): { id?: string } | undefined
	getUser(id: string): { username?: string; globalName?: string } | undefined
}>
type PendingReplyStore = DiscordModules.Flux.Store<{
	getPendingReply(channelId: string): PendingReply | undefined
}>

/** What Discord's reply strip holds: the message replied to and whether the @ toggle is on. */
export interface PendingReply {
	message?: { id?: string; channel_id?: string; author?: { id?: string; username?: string; globalName?: string; global_name?: string } }
	channel?: { id?: string; guild_id?: string }
	shouldMention?: boolean
}

/** The channel the message box belongs to: its props first, then Discord's selected channel. */
export function currentChannelId(): string | undefined {
	if (composer?.channelId) return composer.channelId
	try {
		const id = (Stores.SelectedChannelStore as SelectedChannelStore).getChannelId()
		return typeof id === 'string' ? id : undefined
	} catch {
		return undefined
	}
}

function handleFor(channelId: string): Handle | undefined {
	const handle = composer?.ref?.current
	if (!handle || typeof handle !== 'object') return undefined
	if (composer?.channelId && composer.channelId !== channelId) return undefined
	return handle
}

/** Whether the box on screen can be written: the split is only offered when it can. */
export function canWriteBox(channelId: string): boolean {
	const h = handleFor(channelId)
	return !!h && (typeof h.clearText === 'function' || typeof h.replaceRange === 'function' || typeof h.insertText === 'function' || typeof h.setText === 'function')
}

/** The text in the box: the input's own if it says, else the channel's draft. */
export function currentText(channelId: string): string | undefined {
	const h = handleFor(channelId)
	try {
		const own = h?.getText?.()
		if (typeof own === 'string') return own
	} catch {
		/* fall through to the draft */
	}
	try {
		const draft = (Stores.DraftStore as DraftStore).getDraft(channelId, CHANNEL_MESSAGE)
		return typeof draft === 'string' ? draft : undefined
	} catch {
		return undefined
	}
}

/**
 * Replaces everything in the box with [text] (Undo Send's `writeComposer`). True when a write went
 * through; a stale edit id can still make the box drop it, which the caller cannot see, so the
 * draft store is written as well by the caller.
 */
export function replaceText(channelId: string, text: string): boolean {
	const handle = handleFor(channelId)
	if (!handle) return false
	let current = ''
	try {
		const now = handle.getText?.()
		if (typeof now === 'string') current = now
	} catch {
		/* unknown length: replace from 0 with length 0, which inserts at the start */
	}
	const editId = composer?.stateRef?.current?.editId ?? undefined
	try {
		// Emptying: what Discord's own send does (`chatInputRef.current.clearText()`, 352.2).
		if (text === '' && typeof handle.clearText === 'function') {
			handle.clearText()
			return true
		}
		if (typeof handle.replaceRange === 'function') {
			handle.replaceRange({ location: 0, length: current.length, text, editId })
			return true
		}
		if (typeof handle.insertText === 'function') {
			handle.insertText(text, 0, false, undefined, current.length)
			return true
		}
		if (typeof handle.setText === 'function') {
			handle.setText(text)
			return true
		}
	} catch {
		return false
	}
	return false
}

export function currentUserId(): string | undefined {
	try {
		const id = (Stores.UserStore as UserStore).getCurrentUser()?.id
		return typeof id === 'string' ? id : undefined
	} catch {
		return undefined
	}
}

/** The reply being composed in [channelId], if any. */
export function pendingReply(channelId: string): PendingReply | undefined {
	try {
		const reply = (Stores.PendingReplyStore as PendingReplyStore)?.getPendingReply?.(channelId)
		return reply?.message?.id ? reply : undefined
	} catch {
		return undefined
	}
}

/** The display name of a reply's author, for the sheet. */
export function replyAuthorName(reply: PendingReply): string {
	const author = reply.message?.author
	const user = author?.id ? (Stores.UserStore as UserStore).getUser(author.id) : undefined
	return user?.globalName ?? author?.globalName ?? author?.global_name ?? user?.username ?? author?.username ?? 'them'
}

/** "#general in Some Server", "the group Friends", or "the DM with name": where the parts go. */
export function describeChannel(channelId: string): string {
	try {
		const channel = (Stores.ChannelStore as ChannelStore).getChannel(channelId)
		if (!channel) return 'this channel'
		if (channel.guild_id) {
			const guild = (Stores.GuildStore as GuildStore).getGuild(channel.guild_id)
			return guild?.name ? `#${channel.name ?? 'channel'} in ${guild.name}` : `#${channel.name ?? 'channel'}`
		}
		// 1 = DM, 3 = group DM.
		if (channel.type === 3) return channel.name ? `the group ${channel.name}` : 'this group'
		const other = channel.recipients?.[0]
		const user = other ? (Stores.UserStore as UserStore).getUser(other) : undefined
		const name = user?.globalName ?? user?.username ?? channel.rawRecipients?.[0]?.global_name ?? channel.rawRecipients?.[0]?.username
		return name ? `the DM with ${name}` : 'this DM'
	} catch {
		return 'this channel'
	}
}

/** The channel's guild id, for a reply's message reference. */
export function guildIdOf(channelId: string): string | undefined {
	try {
		const id = (Stores.ChannelStore as ChannelStore).getChannel(channelId)?.guild_id
		return typeof id === 'string' ? id : undefined
	} catch {
		return undefined
	}
}

/** The channel's slowmode in seconds, or 0. */
export function slowmodeSeconds(channelId: string): number {
	try {
		const seconds = (Stores.ChannelStore as ChannelStore).getChannel(channelId)?.rateLimitPerUser
		return typeof seconds === 'number' && seconds > 0 ? seconds : 0
	} catch {
		return 0
	}
}
