/**
 * Whose zone is what: yours first, then the shared list, then Equicord's list (each when it's on).
 * Synchronous; an answer that arrives later redraws the rows (patches/chat.ts).
 */

import { equicordZone } from './equicord'
import { sharedZone, want } from './shared'
import { settings } from './state'

export type Source = 'you' | 'shared' | 'equicord'

export interface Found {
	zone: string
	/** The place you picked, when you set it. */
	place?: string
	source: Source
}

export function zoneFor(id: string): Found | undefined {
	const s = settings()
	const entry = s.people[id]
	if (entry?.zone) return { zone: entry.zone, place: entry.place, source: 'you' }
	const shared = s.sharedLookup ? sharedZone(id) : null
	if (shared) return { zone: shared, source: 'shared' }
	const equicord = s.equicordLookup ? equicordZone(id) : null
	if (equicord) return { zone: equicord, source: 'equicord' }
	if (shared === undefined) want(id)
	return undefined
}
