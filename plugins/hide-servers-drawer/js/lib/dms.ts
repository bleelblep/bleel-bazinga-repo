// Flux stores are looked up by name directly through the Stores proxy, not a module finder
// filter -- there is no `withStoreName` under modules.finders.filters.
// Read per call, never at module scope: the Stores proxy resolves via one-shot `lookupModule`,
// and at preInit that caches a permanent miss on a key shared app-wide.
// See docs/coding-rules.md rule 1.
import { Stores } from '@valenced/discord/flux'

const channelStore = (): any => (Stores as any).ChannelStore
const userStore = (): any => (Stores as any).UserStore
const readStateStore = (): any => (Stores as any).ReadStateStore

export interface RecentDm {
	channelId: string
	/** 1 = one-on-one DM, 3 = group DM (Discord's channel type enum). */
	type: number
	recipientAvatar?: { id: string; avatar: string | null; username: string }
}

function recipientAvatarOf(recipients: unknown): RecentDm["recipientAvatar"] {
	const recipientId = Array.isArray(recipients) ? recipients[0] : undefined
	if (!recipientId) return undefined

	try {
		const user = userStore()?.getUser?.(recipientId)
		if (user) return { id: String(user.id), avatar: user.avatar ?? null, username: user.username ?? "" }
	} catch {
		/* ignore */
	}
	return undefined
}

/** ChannelStore.getSortedPrivateChannels() is assumed to return DM/group-DM channels
 *  ordered most-recent-first, same as classic Revenge and stock Discord's Home button. */
export function mostRecentDm(): RecentDm | undefined {
	try {
		const sorted = channelStore()?.getSortedPrivateChannels?.() ?? []
		const first = sorted[0]
		if (!first?.id) return undefined

		return { channelId: String(first.id), type: Number(first.type), recipientAvatar: recipientAvatarOf(first.recipients) }
	} catch {
		return undefined
	}
}

export interface MemberAvatar {
	id: string
	url?: string
	username: string
}

export interface UnreadDm {
	channelId: string
	type: number
	name: string
	/** Resolved CDN image URL, if one is available (1-on-1 recipient, or a group with its own icon set). */
	avatarUrl?: string
	/** Group DMs without a custom icon: up to 4 members, rendered as a small collage instead
	 *  of one avatar. */
	memberAvatars?: MemberAvatar[]
	hasUnread: boolean
	mentionCount: number
}

function memberAvatarUrl(userId: string, avatarHash: string | null | undefined): string | undefined {
	if (!avatarHash) return undefined
	const ext = avatarHash.startsWith("a_") ? "gif" : "png"
	return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${ext}?size=64`
}

function dmImageUrl(channel: any): string | undefined {
	if (Number(channel.type) === 1) {
		const avatar = recipientAvatarOf(channel.recipients)
		return memberAvatarUrl(avatar?.id ?? "", avatar?.avatar)
	}

	// Group DM: Discord's own icon if the group has one set. If not, dmMemberAvatars below
	// supplies the collage instead.
	if (channel.icon) {
		const ext = String(channel.icon).startsWith("a_") ? "gif" : "png"
		return `https://cdn.discordapp.com/channel-icons/${channel.id}/${channel.icon}.${ext}?size=64`
	}

	return undefined
}

function dmMemberAvatars(channel: any): MemberAvatar[] | undefined {
	if (Number(channel.type) !== 3 || channel.icon) return undefined

	const ids: string[] = Array.isArray(channel.recipients) ? channel.recipients.slice(0, 4) : []
	if (!ids.length) return undefined

	return ids.map((id: string) => {
		try {
			const user = userStore()?.getUser?.(id)
			return { id, url: memberAvatarUrl(id, user?.avatar), username: user?.username ?? "" }
		} catch {
			return { id, username: "" }
		}
	})
}

function dmName(channel: any): string {
	if (channel.name) return String(channel.name)

	if (Number(channel.type) === 1) {
		const avatar = recipientAvatarOf(channel.recipients)
		if (avatar?.username) return avatar.username
	}

	// Group DM with no set name: fall back to recipient usernames, same as stock does.
	try {
		const names = (Array.isArray(channel.recipients) ? channel.recipients : [])
			.map((id: string) => userStore()?.getUser?.(id)?.username)
			.filter(Boolean)
		if (names.length) return names.join(", ")
	} catch {
		/* ignore */
	}

	return "Group DM"
}

/**
 * Every DM/group-DM with unread messages, in the same order the sorted-channel list has
 * them. This is what feeds the extra rows between the Home button and the server
 * separator -- stock Discord surfaces unread conversations there the same way.
 */
export function unreadDmChannels(): UnreadDm[] {
	try {
		const sorted: any[] = channelStore()?.getSortedPrivateChannels?.() ?? []
		const out: UnreadDm[] = []

		for (const channel of sorted) {
			if (!channel?.id) continue

			const channelId = String(channel.id)
			const state = dmUnreadState(channelId)
			if (!state.hasUnread && state.mentionCount === 0) continue

			out.push({
				channelId,
				type: Number(channel.type),
				name: dmName(channel),
				avatarUrl: dmImageUrl(channel),
				memberAvatars: dmMemberAvatars(channel),
				hasUnread: state.hasUnread,
				mentionCount: state.mentionCount,
			})
		}

		return out
	} catch {
		return []
	}
}

/** ReadStateStore is assumed to cover private channels with the same
 *  hasUnread/getMentionCount shape as classic Revenge. */
export function dmUnreadState(channelId: string): { hasUnread: boolean; mentionCount: number } {
	let hasUnread = false
	let mentionCount = 0
	try {
		hasUnread = !!readStateStore()?.hasUnread?.(channelId)
	} catch {
		/* ignore */
	}
	try {
		mentionCount = Number(readStateStore()?.getMentionCount?.(channelId)) || 0
	} catch {
		/* ignore */
	}
	return { hasUnread, mentionCount }
}

export function subscribeDmChanges(fn: () => void): () => void {
	const stores = [channelStore(), readStateStore()].filter(s => s?.addChangeListener)
	stores.forEach(s => s.addChangeListener(fn))
	return () => stores.forEach(s => s.removeChangeListener?.(fn))
}
