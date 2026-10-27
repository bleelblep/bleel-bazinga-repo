/**
 * Whose zone is what: yours first, then the shared list (when that's on). Synchronous; a shared
 * answer that arrives later redraws the rows (patches/chat.ts).
 */

import { sharedZone, want } from './shared'
import { settings } from './state'

export type Source = 'you' | 'shared'

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
	if (!s.sharedLookup) return undefined
	const shared = sharedZone(id)
	if (shared) return { zone: shared, source: 'shared' }
	if (shared === undefined) want(id)
	return undefined
}
