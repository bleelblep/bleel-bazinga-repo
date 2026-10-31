/**
 * Settings, lists and per-user overrides, in the plugin's jsonStorage.
 *
 * Reads come from one in-memory mirror, never `jsonStorage.cache`: `get()` is async and the
 * settings pages render before it answers. The mirror is fed by `subscribe`.
 *
 * Saving: until the file has loaded, a write is a merge (so it can't wipe what's on disk); once
 * loaded, the whole mirror replaces the file. That keeps removals removed without tombstones
 * piling up (coding rule 6: `set()` can't delete a key), and is what makes the lists stick across
 * restarts.
 */

import { JsonStorageUpdateMode } from '@valenced/json-storage'
import * as React from 'react'
import type { JsonStorage } from '@valenced/json-storage'

/** Whose badges show; see lib/filter.ts. */
export type FilterMode = 'everyone' | 'only' | 'except'

/** A list entry: the name they had when added (Discord may not have them cached later) and when. */
export interface ListEntry {
	name: string
	at: number
}

export interface PronounsStorage {
	/** The tag next to author names in chat. */
	showInChat: boolean
	/** Discord's own pronouns before PronounDB. Off asks PronounDB first. Moot when pronounDbEnabled is off. */
	discordFirst: boolean
	/** Ask pronoundb.org when a profile has no pronouns. Off: Discord's own pronouns only, nothing is fetched. */
	pronounDbEnabled: boolean
	/** Only show real pronouns (see lib/validate.ts); anything else in the field is dropped. */
	validOnly: boolean
	/** With validOnly: count "any" / "all" as pronouns. */
	allowAnyAll: boolean
	/** With validOnly: extra words to accept, as typed. */
	extraPronouns: string
	/** One colour for everyone (badgeColor) vs. a colour per person (perPersonColors). */
	colorMode: ColorMode
	/** Badge background as #RRGGBB; '' keeps Discord's tag colour. Used when colorMode is 'global'. */
	badgeColor: string
	/** Per-person badge background as #RRGGBB, keyed by user id; null clears back to the default. Used when colorMode is 'perPerson'. */
	perPersonColors: Record<string, string | null>
	/** Use the author's role colour when they have one (falls back to badgeColor / perPersonColors). */
	useRoleColor: boolean
	/** Pronouns you set yourself, per user id. Never filtered. */
	overrides: Record<string, string | null>
	/** Everyone, only [showList], or everyone except [hideList]. */
	filterMode: FilterMode
	showList: Record<string, ListEntry | string | null>
	hideList: Record<string, ListEntry | string | null>
	/**
	 * The defaults generation this file was last brought up to; see `migrate`. Not in DEFAULTS on
	 * purpose: a file that lacks it is one written before the migration existed, and a storage
	 * read that filled in defaults could otherwise never tell the two apart.
	 */
	settingsVersion?: number
}

/** Whether the badge colour is one setting for everyone or set per person. */
export type ColorMode = 'global' | 'perPerson'

export const DEFAULTS: PronounsStorage = {
	showInChat: true,
	discordFirst: true,
	pronounDbEnabled: true,
	validOnly: true,
	allowAnyAll: true,
	extraPronouns: '',
	colorMode: 'global',
	badgeColor: '',
	perPersonColors: {},
	useRoleColor: false,
	overrides: {},
	filterMode: 'everyone',
	showList: {},
	hideList: {},
}

/**
 * Bumped when a default changes in a way existing files should pick up. 2 (0.5.0): "Only real
 * pronouns" became the default.
 */
const SETTINGS_VERSION = 2

type Handle = JsonStorage<PronounsStorage>
type Stored = Partial<PronounsStorage>
const MAPS = ['overrides', 'showList', 'hideList', 'perPersonColors'] as const

let storage: Handle | undefined
let unsubscribe: (() => void) | undefined
let loaded = false
let migrated = false
let mirror: PronounsStorage = { ...DEFAULTS }
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

/** A copy of [map] without null tombstones (older versions deleted entries by writing null). */
function withoutTombstones<V>(
	map: Record<string, V | null>,
): Record<string, V> {
	const clean: Record<string, V> = {}
	for (const [id, value] of Object.entries(map))
		if (value != null) clean[id] = value
	return clean
}

/** Merges a stored value or patch over [base], dropping null tombstones from older versions. */
function merge(
	base: PronounsStorage,
	value: Stored | undefined,
): PronounsStorage {
	const next: PronounsStorage = { ...base, ...(value ?? {}) }
	for (const key of MAPS) {
		const patch = value?.[key]
		const map =
			patch && typeof patch === 'object'
				? { ...base[key], ...patch }
				: base[key]
		Object.assign(next, { [key]: withoutTombstones(map) })
	}
	return next
}

/**
 * Brings a file written under older defaults up to date, once per bound handle. Every save
 * writes the whole settings object, so a user who never touched "Only real pronouns" still has
 * `validOnly: false` on disk from before 0.5.0, and the new default alone would change nothing
 * for them (a present key beats the default, rule 6). The file can't tell "turned off on purpose"
 * from "never touched", so everyone gets the new default once; the changelog says where to turn
 * it off.
 */
function migrate(raw: Stored | undefined) {
	if (migrated || !raw) return
	migrated = true
	if ((raw.settingsVersion ?? 1) >= SETTINGS_VERSION) return
	update({ validOnly: true, settingsVersion: SETTINGS_VERSION })
}

/** Binds [handle] as the storage, reading the file. Safe to call again with the same handle. */
export function setStorage(handle: Handle | undefined) {
	if (handle && handle === storage) return
	unsubscribe?.()
	unsubscribe = undefined
	storage = handle
	loaded = false
	migrated = false
	mirror = { ...DEFAULTS }
	if (!handle) return
	const cache = handle.cache as Stored | undefined
	if (cache) {
		mirror = merge(DEFAULTS, cache)
		loaded = true
		migrate(cache)
	}
	unsubscribe = handle.subscribe((update, mode) => {
		const patch = update as Stored
		const merging = mode === JsonStorageUpdateMode.Merge
		mirror = merge(merging ? mirror : DEFAULTS, patch)
		loaded = true
		notify()
		// Replaced or loaded from disk: the whole file, which is what the migration inspects.
		if (!merging) migrate(patch)
	})
	void handle
		.get()
		.then(value => {
			if (value) mirror = merge(DEFAULTS, value)
			loaded = true
			notify()
			migrate(value)
		})
		.catch(() => {
			/* keep the mirror; the next save retries */
		})
}

/** Read at any time; the defaults until storage loads. */
export function settings(): PronounsStorage {
	return mirror
}

/** The settings, re-rendering on change. Call like a hook. */
export function useSettings(): PronounsStorage {
	const [, bump] = React.useReducer((n: number) => n + 1, 0)
	React.useEffect(() => onUpdate(bump), [])
	return mirror
}

export function update(patch: Stored) {
	mirror = merge(mirror, patch)
	// A map in [patch] replaces the old one outright (merge() unions them).
	for (const key of MAPS) {
		const map = patch[key]
		if (map) mirror = { ...mirror, [key]: withoutTombstones(map) }
	}
	notify()
	try {
		const write = loaded ? storage?.set(mirror, true) : storage?.set(patch)
		void Promise.resolve(write).catch(() => {
			/* storage refused; the mirror still has it for this session */
		})
	} catch {
		/* as above */
	}
}

/** Runs [fn] after every change, from this plugin or the file. */
export function onUpdate(fn: () => void): () => void {
	listeners.add(fn)
	return () => listeners.delete(fn)
}
