/**
 * Settings and the timezones you set, in the plugin's jsonStorage.
 *
 * The same mirror as Pronouns' state.ts (read its header): reads come from an in-memory copy fed by
 * `subscribe`, never `jsonStorage.cache` (per handle, misses the settings page's writes); until the
 * file has loaded a write is a merge, after that the whole mirror replaces the file, so removals
 * stay removed.
 */

import * as React from 'react'

/** A timezone you set: the zone, the name they had then (Discord may not have them cached later), when. */
export interface PersonZone {
	zone: string
	/** The place picked for them ("Mombasa, Kenya"), shown instead of the zone's city. */
	place?: string
	name: string
	at: number
}

export interface TimezonesStorage {
	/** Their local time after the timestamp on their messages. */
	showInChat: boolean
	/** Ask the shared timezone list (timezonedb.catvibers.me) about people you haven't set. */
	sharedLookup: boolean
	/** Also read Equicord's list (timezone.creations.works). Off by default: it's one big download. */
	equicordLookup: boolean
	/** Search towns and cities online (Open-Meteo) in the picker, beyond the offline zone list. */
	placeSearch: boolean
	/** 24-hour times. */
	hour24: boolean
	/** Add their weekday when it isn't the same day for them ("3:02 AM Tue"). */
	showDay: boolean
	/** The row in the message long-press menu. The profile's ⋯ menu always has one. */
	messageMenu: boolean
	/** Timezones you set, per user id; null clears (older writes may still carry one). */
	people: Record<string, PersonZone | null>
}

export const DEFAULTS: TimezonesStorage = {
	showInChat: true,
	sharedLookup: true,
	equicordLookup: false,
	placeSearch: true,
	hour24: false,
	showDay: true,
	messageMenu: true,
	people: {},
}

type Handle = ValencedJsonStorageApi<TimezonesStorage>

let storage: Handle | undefined
let unsubscribe: (() => void) | undefined
let loaded = false
let mirror: TimezonesStorage = { ...DEFAULTS }
const listeners = new Set<() => void>()

function notify() {
	for (const listener of listeners) {
		try {
			listener()
		} catch {
			/* one broken listener must not stop the rest */
		}
	}
}

function cleanPeople(map: any): Record<string, PersonZone> {
	const out: Record<string, PersonZone> = {}
	if (!map || typeof map !== 'object') return out
	for (const id of Object.keys(map)) {
		const entry = map[id]
		if (entry && typeof entry.zone === 'string') out[id] = entry
	}
	return out
}

/** Merges a stored value or patch over [base]; `people` maps union, null entries drop. */
function merge(base: TimezonesStorage, value: any): TimezonesStorage {
	const next: any = { ...base, ...(value ?? {}) }
	const people = value?.people && typeof value.people === 'object' ? { ...base.people, ...value.people } : base.people
	next.people = cleanPeople(people)
	return next
}

/** Binds [handle] as the storage, reading the file. Safe to call again with the same handle. */
export function setStorage(handle: Handle | undefined) {
	if (handle && handle === storage) return
	unsubscribe?.()
	unsubscribe = undefined
	storage = handle
	loaded = false
	mirror = { ...DEFAULTS }
	if (!handle) return
	const cache = (handle as any).cache
	if (cache) {
		mirror = merge(DEFAULTS, cache)
		loaded = true
	}
	unsubscribe = (handle as any).subscribe?.((update: any, mode: number) => {
		// 0 = a merge patch; anything else = replaced or loaded from disk.
		mirror = merge(mode === 0 ? mirror : DEFAULTS, update)
		loaded = true
		notify()
	})
	void Promise.resolve((handle as any).get?.())
		.then((value: any) => {
			if (value) mirror = merge(DEFAULTS, value)
			loaded = true
			notify()
		})
		.catch(() => {
			/* keep the mirror; the next save retries */
		})
}

/** For the settings page: binds its own handle only when start() didn't bind one. */
export function bindSettingsStorage(handle: Handle | undefined) {
	if (!storage && handle) setStorage(handle)
}

export function settings(): TimezonesStorage {
	return mirror
}

/** The settings, re-rendering on change. Call like a hook. */
export function useSettings(): TimezonesStorage {
	const [, bump] = React.useReducer((n: number) => n + 1, 0)
	React.useEffect(() => onUpdate(bump), [])
	return mirror
}

export function update(patch: Partial<TimezonesStorage>) {
	mirror = { ...merge(mirror, patch), ...(patch.people ? { people: cleanPeople(patch.people) } : {}) }
	notify()
	try {
		const write = loaded ? (storage as any)?.set?.(mirror, true) : storage?.set(patch as any)
		void Promise.resolve(write).catch(() => {
			/* storage refused; the mirror still has it for this session */
		})
	} catch {
		/* as above */
	}
}

/** Sets or (zone undefined) clears the timezone you set for [id]. */
export function setPersonZone(id: string, name: string, zone: string | undefined, place?: string) {
	const people: Record<string, PersonZone | null> = { ...settings().people }
	if (zone) people[id] = { zone, name, at: Date.now(), ...(place ? { place } : {}) }
	else delete people[id]
	update({ people })
}

/** Runs [fn] after every change, from this plugin or the file. */
export function onUpdate(fn: () => void): () => void {
	listeners.add(fn)
	return () => listeners.delete(fn)
}
