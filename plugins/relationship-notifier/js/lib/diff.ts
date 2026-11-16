/**
 * Compares what the plugin saw last time with what Discord has now, and says what was lost.
 *
 * Pure logic, no `valenced.*`, so it is safe at module scope (coding rule 1) and runs under
 * `bun test` (diff.test.ts).
 */

import type { EventKind, Known, RelationshipEvent, Snapshot } from '../types'

/** What Discord has now, plus the relationship type of every user it still knows. */
export interface Current extends Snapshot {
	/** User id to relationship type, for users still in RelationshipStore. */
	types: Record<string, number>
}

/** Things you did on this phone, by `user:<id>`, `guild:<id>`, `channel:<id>` or `incoming:*`. */
export type Marks = (key: string) => boolean

export const FRIEND = 1
export const BLOCKED = 2
export const UNKNOWN_USER = 'Unknown user'

/**
 * On a connect, a list that suddenly lost more than this share of its entries (and more than
 * `MIN_BULK` of them) is far more likely to be a part-loaded store than real losses, so that check
 * records nothing for it. Live changes are never limited: there the store is already complete.
 */
const BULK_SHARE = 0.25
const MIN_BULK = 5

function byId(list: Known[]): Map<string, Known> {
	return new Map(list.map(item => [item.id, item]))
}

function removed(before: Known[], now: Known[]): Known[] {
	const still = new Set(now.map(item => item.id))
	return before.filter(item => !still.has(item.id))
}

function bulk(count: number, size: number): boolean {
	return count > MIN_BULK && count > size * BULK_SHARE
}

export interface DiffResult {
	events: RelationshipEvent[]
	/**
	 * On a connect check, a list looked part-loaded and its losses were left out. The caller should
	 * look again later rather than save this state, or the missing entries would come back as "new".
	 */
	partial: boolean
}

export function diff(
	before: Snapshot,
	now: Current,
	mine: Marks,
	at: number,
	away: boolean,
): DiffResult {
	const out: RelationshipEvent[] = []
	let partial = false
	const push = (
		kind: EventKind,
		item: Known,
		extra: Partial<RelationshipEvent> = {},
	) => {
		out.push({
			id: `${kind}:${item.id}:${at}`,
			kind,
			targetId: item.id,
			name: item.name,
			iconHash: item.icon,
			...(kind === 'guild'
				? {
						vanity: item.vanity,
						invite: item.invite,
						ownerId: item.ownerId,
						ownerName: item.ownerName,
					}
				: {}),
			at,
			...(away ? { away: true } : {}),
			...extra,
		})
	}

	// Each list is checked on its own, so one part-loaded list can't hide real losses in another.
	const lists: Array<
		[EventKind, Known[], (item: Known) => Partial<RelationshipEvent> | null]
	> = [
		[
			'friend',
			removed(before.friends, now.friends),
			item => {
				const type = now.types[item.id]
				const blocked = type === BLOCKED
				const byYou = mine(`user:${item.id}`)
				return { ...(byYou ? { byYou } : {}), ...(blocked ? { blocked } : {}) }
			},
		],
		[
			'incoming',
			removed(before.incoming, now.incoming),
			item => {
				// Accepted: not a loss.
				if (now.types[item.id] === FRIEND) return null
				const byYou = mine(`user:${item.id}`) || mine('incoming:*')
				return byYou ? { byYou } : {}
			},
		],
		[
			'outgoing',
			removed(before.outgoing, now.outgoing),
			item => {
				if (now.types[item.id] === FRIEND) return null
				return mine(`user:${item.id}`) ? { byYou: true } : {}
			},
		],
		[
			'guild',
			removed(before.guilds, now.guilds),
			item => (mine(`guild:${item.id}`) ? { byYou: true } : {}),
		],
		[
			'groupdm',
			removed(before.groups, now.groups),
			item => (mine(`channel:${item.id}`) ? { byYou: true } : {}),
		],
	]

	const sizes: Record<string, number> = {
		friend: before.friends.length,
		incoming: before.incoming.length,
		outgoing: before.outgoing.length,
		guild: before.guilds.length,
		groupdm: before.groups.length,
	}

	for (const [kind, gone, describe] of lists) {
		const events = gone
			.map(item => [item, describe(item)] as const)
			.filter(
				(pair): pair is readonly [Known, Partial<RelationshipEvent>] =>
					pair[1] !== null,
			)
		if (away) {
			const unexplained = events.filter(([, extra]) => !extra.byYou).length
			if (bulk(unexplained, sizes[kind])) {
				partial = true
				continue
			}
		}
		for (const [item, extra] of events) push(kind, item, extra)
	}

	// New friends. A sudden crowd of them means the last list was the part-loaded one, so they are
	// taken in quietly.
	const wasIncoming = new Set(before.incoming.map(item => item.id))
	const wasOutgoing = new Set(before.outgoing.map(item => item.id))
	const added = removed(now.friends, before.friends)
	if (!bulk(added.length, before.friends.length)) {
		for (const friend of added) {
			const accepted = wasIncoming.has(friend.id)
				? 'you'
				: wasOutgoing.has(friend.id)
					? 'them'
					: undefined
			push('newfriend', friend, {
				...(accepted ? { accepted } : {}),
				...(accepted === 'you' ? { byYou: true } : {}),
			})
		}
	}

	// Name changes, for people who are still friends. A user Discord hasn't loaded is carried over
	// unchanged by the snapshot reader, so it never looks like a change.
	const was = byId(before.friends)
	for (const friend of now.friends) {
		const old = was.get(friend.id)
		if (!old) continue
		// A placeholder from a time Discord hadn't loaded them isn't a real old name.
		if (old.name === UNKNOWN_USER || friend.name === UNKNOWN_USER) continue
		if (old.icon !== friend.icon) {
			push('avatar', friend, { oldIconHash: old.icon })
		}
		if (old.name && friend.name && old.name !== friend.name) {
			push('name', friend, { oldName: old.name, field: 'name' })
		} else if (
			old.username &&
			friend.username &&
			old.username !== friend.username
		) {
			push(
				'name',
				{ ...friend, name: friend.username },
				{ oldName: old.username, field: 'username' },
			)
		}
	}

	return { events: out, partial }
}

/** Whether two snapshots differ, so storage is only written when something changed. */
export function sameSnapshot(a: Snapshot | undefined, b: Snapshot): boolean {
	if (!a) return false
	return JSON.stringify(strip(a)) === JSON.stringify(strip(b))
}

/** Only the stored fields, in a fixed order, so a `Current` compares equal to its `Snapshot`. */
export function strip(s: Snapshot): Snapshot {
	return {
		friends: s.friends,
		incoming: s.incoming,
		outgoing: s.outgoing,
		guilds: s.guilds,
		groups: s.groups,
	}
}
