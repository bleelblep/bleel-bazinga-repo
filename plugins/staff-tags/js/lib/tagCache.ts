import { Dispatcher } from '@valenced/discord/common/flux'
import type { ResolvedTag } from './getTag'

/**
 * Remembers each person's tag per guild and channel, so a run of messages from one author asks
 * Discord for their permissions once instead of once per row.
 *
 * GuildMemberStore changes on almost every incoming message, so clearing on its change listener
 * would empty this constantly. Instead an entry is reused only while the member's `roles` and
 * `colorString` are the same references it was built from (a role change, or a member who wasn't
 * loaded yet, gives new ones), and everything is cleared on the events that change roles, owners
 * or channel overwrites, on settings changes and when a better permission helper arrives.
 */

const MAX = 5000

interface Entry {
	tag: ResolvedTag | undefined
	roles: unknown
	color: unknown
}

const cache = new Map<string, Entry>()

const EVENTS = [
	'GUILD_ROLE_CREATE',
	'GUILD_ROLE_UPDATE',
	'GUILD_ROLE_DELETE',
	'GUILD_UPDATE',
	'GUILD_CREATE',
	'GUILD_DELETE',
	'CHANNEL_UPDATES',
	'CHANNEL_DELETE',
	'CONNECTION_OPEN',
]

let active = false

export function clearTagCache() {
	cache.clear()
}

export function startTagCache() {
	const dispatcher = Dispatcher as any
	if (typeof dispatcher?.subscribe !== 'function') return
	for (const event of EVENTS) dispatcher.subscribe(event, clearTagCache)
	active = true
}

export function stopTagCache() {
	if (active) {
		const dispatcher = Dispatcher as any
		for (const event of EVENTS) dispatcher.unsubscribe?.(event, clearTagCache)
	}
	active = false
	cache.clear()
}

/**
 * [compute] runs on a miss, or every time while the cache can't be trusted ([canCache] false, or
 * no dispatcher to tell it when to clear).
 */
export function cachedTag(
	key: string,
	canCache: boolean,
	member: { roles?: unknown; colorString?: unknown } | undefined,
	compute: () => ResolvedTag | undefined,
): ResolvedTag | undefined {
	if (!canCache || !active) return compute()
	const roles = member?.roles
	const color = member?.colorString
	const hit = cache.get(key)
	if (hit && hit.roles === roles && hit.color === color) return hit.tag
	const tag = compute()
	if (cache.size >= MAX) cache.clear()
	cache.set(key, { tag, roles, color })
	return tag
}
