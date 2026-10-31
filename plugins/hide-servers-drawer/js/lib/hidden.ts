import type { HideServersDrawerStorage } from "../index"

// A module-level Set is the source of truth, mirrored into jsonStorage for persistence.
// hidden.ts is used from patches and menu handlers that run outside of React (no `.use()`
// re-render to piggyback on), so state needs to be readable synchronously at any time --
// jsonStorage.cache covers that, but a plain Set keeps every read/write in this file free of
// repeated object-shape juggling.
let js: ValencedJsonStorageApi<HideServersDrawerStorage> | undefined
const ids = new Set<string>()
let mergedFromDisk = false

/** Must be called once from the plugin's start() before anything else in this module. */
export function init(jsonStorage: ValencedJsonStorageApi<HideServersDrawerStorage>) {
	js = jsonStorage
	mergedFromDisk = false
	ids.clear()
}

/**
 * The real, previously-undiagnosed cause of "later hides get lost on reopen" (a folder-hide or
 * an unhide would reproduce it identically): `load()` used to gate its one-shot disk merge on a
 * boolean that flipped true on its *first call*, not on the storage actually being ready.
 * `jsonStorage`'s `load: true` starts its read without awaiting it (docs/coding-rules.md rule
 * 6), so on every relaunch there was a real window where the Settings page's very first
 * `isHidden()` call -- which happens as soon as it mounts -- ran before that read resolved.
 * `js.cache.hidden` was still `undefined` at that exact moment, the old flag latched "loaded"
 * anyway, and this file never looked at disk again for the rest of the session. `ids` started
 * empty every relaunch after the first hide, so the *next* `persist()` -- rebuilt in full from
 * `ids` every time, by design -- overwrote the disk file with only that session's new edit,
 * discarding everything hidden in a previous session.
 *
 * `js.loaded` is the API's own real readiness flag (distinct from this file's own `.cache`
 * peeking), and it's cheap to recheck on every call until it flips -- unlike the old code, this
 * keeps retrying instead of giving up after one look.
 */
function load() {
	if (mergedFromDisk || !js?.loaded) return
	mergedFromDisk = true

	try {
		const saved = js.cache?.hidden
		// === true, not just key presence: persist() can now write an explicit `false` as a
		// tombstone for a just-unhidden id (see persist()'s own comment). Adding every key
		// regardless of value would un-delete every unhide this file has ever made.
		if (saved && typeof saved === "object") {
			for (const [id, value] of Object.entries(saved)) if (value === true) ids.add(id)
		}
	} catch {
		/* no persisted storage yet */
	}
}

/**
 * `jsonStorage.set()` performs a recursive merge (its `value` parameter is typed
 * `DeepPartial<T>`, confirmed in `types/next/lib/json-storage.d.ts`), not a replace. A merge can
 * only ever *add or overwrite* a key -- it structurally cannot express "this key is gone,"
 * because a key that's merely absent from the patch is indistinguishable from a key nobody
 * touched. This was the actual cause of "unhiding a server doesn't stick": the old code rebuilt
 * `out` fresh from `ids` on every call and simply omitted a just-unhidden id, so the merge left
 * its stale `true` entry sitting in storage untouched forever, and `load()` dutifully brought it
 * back on every relaunch. Hiding worked, because adding a new key is exactly what a merge is
 * good at -- only removal was broken, and only removal ever will be, with this API.
 *
 * The fix is to never rely on omission: `removed` lets a caller explicitly overwrite a key to
 * `false` instead of dropping it, which a merge propagates correctly because it's a write, not
 * an absence. `false` entries accumulate in storage as harmless tombstones rather than growing
 * unboundedly -- acceptable at the scale of "servers a person has ever hidden and un-hidden".
 */
function persist(removed?: Iterable<string>) {
	try {
		// Assign a whole new object rather than mutating in place.
		const out: Record<string, boolean> = {}
		for (const id of ids) out[id] = true
		if (removed) for (const id of removed) if (!(id in out)) out[id] = false
		js?.set({ hidden: out })
	} catch {
		/* session-only, still works until restart */
	}
}

export function isHidden(guildId: string): boolean {
	load()
	return ids.has(guildId)
}

// Folder ids are numbers where guild ids are strings (see patches/sortedGuilds.ts), and share
// the same storage blob as a "folder:<id>" key rather than a second Set.
function folderKey(folderId: string | number): string {
	return `folder:${folderId}`
}

export function isFolderHidden(folderId: string | number): boolean {
	load()
	return ids.has(folderKey(folderId))
}

export function setFolderHidden(folderId: string | number, hidden: boolean) {
	load()
	const key = folderKey(folderId)
	if (hidden) {
		ids.add(key)
		persist()
	} else {
		ids.delete(key)
		persist([key])
	}
	notifyBar()
}

export function hiddenFolderIds(): string[] {
	load()
	return [...ids].filter(id => id.startsWith("folder:")).map(id => id.slice("folder:".length))
}

/**
 * Whether to swap the stock bar for the legacy custom bar while anything is hidden.
 *
 * OFF by default since 1.5: the SortedGuildStore filter hides servers in the untouched
 * stock bar (1.4 confirmed the bar reads getFastListGuildFolders/getFlattenedGuildFolderList,
 * which are patched), so the custom bar is only a fallback for a future Discord build that
 * breaks that filtering. Before 1.5 this defaulted to true -- filtering alone used to have
 * no visible effect on the bar, so swapping was the only thing that hid anything.
 */
export function instant(): boolean {
	load()
	try {
		return js?.cache?.instant ?? false
	} catch {
		return false
	}
}

export function setInstant(value: boolean) {
	try {
		js?.set({ instant: value })
	} catch {
		/* session default stays */
	}
}

export function hiddenIds(): string[] {
	load()
	return [...ids].filter(id => !id.startsWith("folder:") && !id.startsWith(CHANNEL_PREFIX))
}

// Channels share the blob the same way folders do, as "channel:<id>" keys, so unhiding one gets
// the same tombstone treatment as a server (see persist()).
const CHANNEL_PREFIX = "channel:"
const channelKey = (channelId: string) => `${CHANNEL_PREFIX}${channelId}`
const channelListeners = new Set<() => void>()

export function isChannelHidden(channelId: string): boolean {
	load()
	return ids.has(channelKey(channelId))
}

export function hiddenChannelIds(): string[] {
	load()
	return [...ids].filter(id => id.startsWith(CHANNEL_PREFIX)).map(id => id.slice(CHANNEL_PREFIX.length))
}

export function setChannelHidden(channelId: string, hidden: boolean) {
	load()
	const key = channelKey(channelId)
	if (hidden) {
		ids.add(key)
		persist()
	} else {
		ids.delete(key)
		persist([key])
	}
	for (const listener of channelListeners) listener()
}

/** Called after any channel is hidden or shown again (patches/channelList.ts refreshes the list). */
export function onChannelsChange(listener: () => void): () => void {
	channelListeners.add(listener)
	return () => {
		channelListeners.delete(listener)
	}
}

export function setHidden(guildId: string, hidden: boolean) {
	load()
	if (hidden) {
		ids.add(guildId)
		persist()
	} else {
		ids.delete(guildId)
		persist([guildId])
	}
	notifyBar()
}

/** Shows every hidden server and folder again. Hidden channels stay hidden (they have their own list). */
export function clearHidden() {
	load()
	const removed = [...ids].filter(id => !id.startsWith(CHANNEL_PREFIX))
	for (const id of removed) ids.delete(id)
	persist(removed)
	notifyBar()
}

/** True when no server or folder is hidden, so the server bar patches can skip work entirely. */
export function isEmpty(): boolean {
	load()
	for (const id of ids) if (!id.startsWith(CHANNEL_PREFIX)) return false
	return true
}

// Edit mode: the server bar shows every server, hidden ones marked, and a tap hides or shows one.
// Session-only on purpose -- reopening Discord always starts with the normal bar.
let editing = false
const barListeners = new Set<() => void>()

function notifyBar() {
	for (const listener of barListeners) listener()
}

export function isEditing(): boolean {
	return editing
}

export function setEditing(value: boolean) {
	if (editing === value) return
	editing = value
	notifyBar()
}

/** Called when edit mode turns on or off, or any server or folder is hidden or shown again. */
export function onBarChange(listener: () => void): () => void {
	barListeners.add(listener)
	return () => {
		barListeners.delete(listener)
	}
}
