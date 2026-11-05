/** The settings handle, shared by every tweak patch. */

import { DEFAULTS, type UITweaksStorage } from '../defaults'

let storage: ValencedJsonStorageApi<UITweaksStorage> | undefined
const listeners = new Set<() => void>()

export function setStorage(handle: ValencedJsonStorageApi<UITweaksStorage> | undefined) {
	storage = handle
}

/** Read at any time; falls back to the defaults while storage loads. */
export function settings(): UITweaksStorage {
	return { ...DEFAULTS, ...((storage as any)?.cache ?? {}) }
}

/** The saved settings, re-rendering on change. Call like a hook. */
export function useSettings(): UITweaksStorage {
	return { ...DEFAULTS, ...(storage?.use() ?? {}) }
}

export function update(patch: Partial<UITweaksStorage>) {
	storage?.set(patch)
	notify()
}

/** Runs every onUpdate listener; also called once the storage has loaded. */
export function notify() {
	for (const listener of listeners) listener()
}

/** Runs [fn] after every update() from this plugin. */
export function onUpdate(fn: () => void): () => void {
	listeners.add(fn)
	return () => listeners.delete(fn)
}

let pluginApi: { requireReload?: () => void } | undefined

/** The plugin handle, for Valenced's stock Reload Required prompt. */
export function setPlugin(plugin: { requireReload?: () => void } | undefined) {
	pluginApi = plugin
}

/** Valenced's own "reload required" prompt, for settings that only take effect after a restart. */
export function requireReload() {
	try {
		pluginApi?.requireReload?.()
	} catch {
		/* the next restart applies it anyway */
	}
}
