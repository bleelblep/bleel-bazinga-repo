/**
 * Whose badges show: everyone, only the people on the show list, or everyone but the hide list.
 *
 * Both lists are kept whichever mode is on, so switching modes never loses one. An entry is the
 * name the person had when added (settings shows it; Discord may not have them cached then) and
 * when. Entries saved by 0.2.x are a bare name string; both shapes are read.
 */

import { settings, update } from './state'
import type { FilterMode, ListEntry } from './state'

export type ListKey = 'showList' | 'hideList'

function entryOf(
	value: ListEntry | string | null | undefined,
): ListEntry | undefined {
	if (typeof value === 'string') return { name: value, at: 0 }
	if (value && typeof value === 'object' && typeof value.name === 'string')
		return value
	return undefined
}

function onList(key: ListKey, userId: string): boolean {
	return !!entryOf(settings()[key]?.[userId])
}

/** Whether this author gets a badge under the current mode. */
export function shownFor(userId: string): boolean {
	const s = settings()
	if (s.filterMode === 'only') return onList('showList', userId)
	if (s.filterMode === 'except') return !onList('hideList', userId)
	return true
}

/** The list the current mode edits, or undefined for "everyone". */
export function activeList(
	mode: FilterMode = settings().filterMode,
): ListKey | undefined {
	return mode === 'only'
		? 'showList'
		: mode === 'except'
			? 'hideList'
			: undefined
}

export function isOnActiveList(userId: string): boolean {
	const key = activeList()
	return !!key && onList(key, userId)
}

export function addToList(key: ListKey, userId: string, name: string) {
	update({ [key]: { ...settings()[key], [userId]: { name, at: Date.now() } } })
}

export function removeFromList(key: ListKey, userId: string) {
	const next = { ...settings()[key] }
	delete next[userId]
	update({ [key]: next })
}

export function clearList(key: ListKey) {
	update({ [key]: {} })
}

/** Adds or removes [userId] on the list the current mode edits. */
export function setOnActiveList(userId: string, name: string, on: boolean) {
	const key = activeList()
	if (!key) return
	if (on) addToList(key, userId, name)
	else removeFromList(key, userId)
}

/** The live entries of a list, newest first. */
export function entries(
	key: ListKey,
): Array<{ id: string; name: string; at: number }> {
	return Object.entries(settings()[key] ?? {})
		.map(([id, value]) => {
			const entry = entryOf(value)
			return entry ? { id, name: entry.name, at: entry.at } : undefined
		})
		.filter(
			(entry): entry is { id: string; name: string; at: number } => !!entry,
		)
		.sort((a, b) => b.at - a.at)
}
