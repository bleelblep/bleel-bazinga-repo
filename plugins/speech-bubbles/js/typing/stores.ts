/**
 * Who is typing in the open channel, read from Discord's stores.
 *
 * The filtering is Discord's own `useTypingUserIds` (no current user, no unknown, blocked or
 * ignored users), as Palm's Better Typing Indicators (GPL-3.0, community repo) documents it in
 * `getTypingUserIds`; the store calls below are the plain store API, written for this plugin.
 *
 * `Stores` is read only inside functions (docs/coding-rules.md rule 1).
 */

import { Stores } from '@valenced/discord/flux'
import { useEffect, useReducer } from 'react'

interface BasicUser {
	id: string
	getAvatarURL(guildId?: string | null, size?: number): unknown
}

export interface BasicChannel {
	id: string
	type?: number
	guild_id?: string | null
}

interface ChangeStore {
	addChangeListener?(fn: () => void): void
	removeChangeListener?(fn: () => void): void
}

const store = <T>(name: string) =>
	(Stores as unknown as Record<string, (T & ChangeStore) | undefined>)[name]

const typingStore = () =>
	store<{ getTypingUsers(channelId: string): Record<string, number> }>(
		'TypingStore',
	)
const userStore = () =>
	store<{
		getUser(id: string): BasicUser | undefined
		getCurrentUser(): BasicUser | undefined
	}>('UserStore')
const relationshipStore = () =>
	store<{ isBlockedOrIgnored(id: string): boolean }>('RelationshipStore')
const selectedChannelStore = () =>
	store<{ getChannelId(): string | null | undefined }>('SelectedChannelStore')
const channelStore = () =>
	store<{ getChannel(id: string): BasicChannel | undefined }>('ChannelStore')

/** Group DMs (type 3) and server channels show who is typing; one-to-one DMs don't. */
export const GROUP_DM = 3

export function selectedChannel(): BasicChannel | undefined {
	const id = selectedChannelStore()?.getChannelId()
	return id ? channelStore()?.getChannel(id) : undefined
}

export function typingUserIds(channelId: string): string[] {
	const users = userStore()
	const relationships = relationshipStore()
	const me = users?.getCurrentUser()?.id
	const ids: string[] = []
	for (const id in typingStore()?.getTypingUsers(channelId) ?? {}) {
		if (id === me) continue
		if (!users?.getUser(id)) continue
		if (relationships?.isBlockedOrIgnored(id)) continue
		ids.push(id)
	}
	return ids
}

export function avatarSource(
	id: string,
	guildId: string | null | undefined,
): { uri: string } | number | undefined {
	const avatar = userStore()?.getUser(id)?.getAvatarURL(guildId, 32)
	if (typeof avatar === 'string') return { uri: avatar }
	return typeof avatar === 'number' ? avatar : undefined
}

/** Your own profile picture, for the settings preview ("Show my profile picture"). */
export function selfAvatarSource(): { uri: string } | number | undefined {
	const avatar = userStore()?.getCurrentUser()?.getAvatarURL(null, 64)
	if (typeof avatar === 'string') return { uri: avatar }
	return typeof avatar === 'number' ? avatar : undefined
}

/** Calls [fn] with the open channel whenever it changes (and now); returns the unsubscribe. */
export function onSelectedChannel(
	fn: (channel: BasicChannel) => void,
): () => void {
	let last: string | undefined
	const check = () => {
		const channel = selectedChannel()
		if (!channel || channel.id === last) return
		last = channel.id
		fn(channel)
	}
	const stores = [selectedChannelStore(), channelStore()].filter(
		(s): s is NonNullable<typeof s> => !!s?.addChangeListener,
	)
	for (const s of stores) s.addChangeListener?.(check)
	check()
	return () => {
		for (const s of stores) s.removeChangeListener?.(check)
	}
}

/** Re-renders whenever the typing, channel or user stores change. */
export function useTypingStores(): void {
	const [, bump] = useReducer((n: number) => n + 1, 0)
	useEffect(() => {
		const stores = [
			typingStore(),
			selectedChannelStore(),
			channelStore(),
			relationshipStore(),
		].filter((s): s is NonNullable<typeof s> => !!s?.addChangeListener)
		const fn = () => bump()
		for (const s of stores) s.addChangeListener?.(fn)
		return () => {
			for (const s of stores) s.removeChangeListener?.(fn)
		}
	}, [])
}
