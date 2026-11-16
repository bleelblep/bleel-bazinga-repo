/**
 * Reads friends, friend requests, servers and group DMs out of Discord's stores. Read only: no
 * store is changed and nothing is requested. Traced on the 352.2 bundle (coding rule 5):
 *
 * - `RelationshipStore.getMutableRelationships()` is the store's own map of user id to type
 *   (`FRIEND` 1, `BLOCKED` 2, `PENDING_INCOMING` 3, `PENDING_OUTGOING` 4). Its handlers use
 *   `.get`/`.has`/`.delete`, so it is a `Map`; a plain object is handled too, and so is a value
 *   that is `{ type }` rather than a number.
 * - `GuildStore.getGuilds()` is id to guild. A server that is down for Discord drops out of it but
 *   is listed by `GuildAvailabilityStore.isUnavailable(id)`, so those are kept from the last
 *   snapshot instead of counting as left.
 * - `ChannelStore.getMutablePrivateChannels()` is id to DM or group DM; groups are type 3.
 */

import { Stores } from '@valenced/discord/flux'
import { UNKNOWN_USER } from './diff'
import type { Known, Snapshot } from '../types'
import type { Current } from './diff'

const PENDING_INCOMING = 3
const PENDING_OUTGOING = 4
const GROUP_DM = 3

function stores(): any {
	return Stores as any
}

function entries(value: any): Array<[string, any]> {
	if (!value) return []
	if (typeof value.entries === 'function' && typeof value.get === 'function')
		return [...value.entries()].map(([k, v]: [any, any]) => [String(k), v])
	if (typeof value === 'object') return Object.entries(value)
	return []
}

function typeOf(value: any): number | undefined {
	if (typeof value === 'number') return value
	if (typeof value?.type === 'number') return value.type
	return undefined
}

function person(id: string, previous: Map<string, Known>): Known {
	const user = stores().UserStore?.getUser?.(id)
	// Not loaded: keep what we had, so a missing record never reads as a name change.
	if (!user) return previous.get(id) ?? { id, name: UNKNOWN_USER }
	const username = typeof user.username === 'string' ? user.username : undefined
	const display = user.globalName ?? user.global_name
	const item: Known = {
		id,
		name: (typeof display === 'string' && display) || username || UNKNOWN_USER,
	}
	if (username) item.username = username
	if (typeof user.avatar === 'string') item.icon = user.avatar
	return item
}

function groupName(channel: any, previous?: Known): string {
	if (typeof channel?.name === 'string' && channel.name) return channel.name
	// Unnamed groups are shown by their members.
	const ids: string[] =
		channel?.recipients ?? channel?.rawRecipients?.map((r: any) => r?.id) ?? []
	const names = ids
		.map(id => {
			const user = stores().UserStore?.getUser?.(id)
			return user?.globalName ?? user?.global_name ?? user?.username
		})
		.filter((name): name is string => typeof name === 'string' && !!name)
		.slice(0, 4)
	return names.join(', ') || previous?.name || 'Unnamed group'
}

/**
 * What Discord has now. `previous` fills in anything Discord hasn't loaded, so only a real change
 * shows up as one.
 */
export function readCurrent(previous: Snapshot | undefined): Current {
	const was = {
		friends: new Map((previous?.friends ?? []).map(k => [k.id, k])),
		incoming: new Map((previous?.incoming ?? []).map(k => [k.id, k])),
		outgoing: new Map((previous?.outgoing ?? []).map(k => [k.id, k])),
		guilds: new Map((previous?.guilds ?? []).map(k => [k.id, k])),
		groups: new Map((previous?.groups ?? []).map(k => [k.id, k])),
	}
	const everyone = new Map([...was.outgoing, ...was.incoming, ...was.friends])

	const current: Current = {
		friends: [],
		incoming: [],
		outgoing: [],
		guilds: [],
		groups: [],
		types: {},
	}

	const relationships = stores().RelationshipStore?.getMutableRelationships?.()
	for (const [id, value] of entries(relationships)) {
		const type = typeOf(value)
		if (type === undefined) continue
		current.types[id] = type
		if (type === 1) current.friends.push(person(id, everyone))
		else if (type === PENDING_INCOMING)
			current.incoming.push(person(id, everyone))
		else if (type === PENDING_OUTGOING)
			current.outgoing.push(person(id, everyone))
	}

	const availability = stores().GuildAvailabilityStore
	const guilds = stores().GuildStore?.getGuilds?.()
	const seen = new Set<string>()
	for (const [id, guild] of entries(guilds)) {
		seen.add(id)
		const item: Known = {
			id,
			name:
				(typeof guild?.name === 'string' && guild.name) ||
				was.guilds.get(id)?.name ||
				'Unknown server',
		}
		const icon = guild?.icon ?? was.guilds.get(id)?.icon
		if (typeof icon === 'string') item.icon = icon
		Object.assign(item, serverInfo(id, guild, was.guilds.get(id)))
		current.guilds.push(item)
	}
	for (const [id, old] of was.guilds) {
		if (!seen.has(id) && availability?.isUnavailable?.(id) === true)
			current.guilds.push(old)
	}

	const channels = stores().ChannelStore?.getMutablePrivateChannels?.()
	for (const [id, channel] of entries(channels)) {
		if (channel?.type !== GROUP_DM) continue
		const item: Known = { id, name: groupName(channel, was.groups.get(id)) }
		if (typeof channel.icon === 'string') item.icon = channel.icon
		current.groups.push(item)
	}

	return current
}

/** Whether the stores this reads are there at all; if not, nothing can be compared. */
const CODE = /^[A-Za-z0-9-]{2,64}$/

/** A code, or undefined. Invite keys can carry `?event=<id>` after the code. */
function code(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined
	const plain = value.split('?')[0]
	return CODE.test(plain) ? plain : undefined
}

/**
 * An invite to [guildId] that Discord's InviteStore already holds (links seen in chat, the one you
 * joined with). Read only: nothing is requested and no invite is ever created. Traced on 352.2:
 * InviteStore has getInvite, getInvites and getInviteKeyForGuildId.
 */
function knownInvite(guildId: string): string | undefined {
	const store = stores().InviteStore
	try {
		const key = code(store?.getInviteKeyForGuildId?.(guildId))
		if (key) return key
		for (const [key, invite] of entries(store?.getInvites?.())) {
			if (String(invite?.guild?.id ?? invite?.guild_id ?? '') === guildId)
				return code(invite?.code ?? key)
		}
	} catch {
		/* store shape changed: no invite */
	}
	return undefined
}

/** ID, vanity or a known invite, and the owner; what isn't loaded now is kept from last time. */
function serverInfo(id: string, guild: any, previous: Known | undefined): Partial<Known> {
	const info: Partial<Known> = {}
	const vanity = code(guild?.vanityURLCode) ?? previous?.vanity
	if (vanity) info.vanity = vanity
	const invite = knownInvite(id) ?? previous?.invite
	if (invite) info.invite = invite
	const ownerId = guild?.ownerId != null ? String(guild.ownerId) : previous?.ownerId
	if (ownerId) {
		info.ownerId = ownerId
		const owner = stores().UserStore?.getUser?.(ownerId)
		const name = owner?.globalName ?? owner?.global_name ?? owner?.username
		const ownerName =
			typeof name === 'string' && name ? name : ownerId === previous?.ownerId ? previous?.ownerName : undefined
		if (ownerName) info.ownerName = ownerName
	}
	return info
}

export function storesReady(): boolean {
	const s = stores()
	return (
		typeof s.RelationshipStore?.getMutableRelationships === 'function' &&
		typeof s.GuildStore?.getGuilds === 'function' &&
		typeof s.ChannelStore?.getMutablePrivateChannels === 'function'
	)
}

export function currentUserId(): string | undefined {
	const id = stores().UserStore?.getCurrentUser?.()?.id
	return id == null ? undefined : String(id)
}
