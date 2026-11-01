import type { HideServersDrawerStorage } from "../index"

// Small, separate from hidden.ts on purpose -- this is a display preference, not part of
// what's hidden, and doesn't need the module-level Set/load()/persist() machinery: a single
// boolean flag is safe to read directly off jsonStorage.cache either way.

let js: ValencedJsonStorageApi<HideServersDrawerStorage> | undefined

/** Must be called once from the plugin's start(), same as hidden.ts's init(). */
export function initPrefs(jsonStorage: ValencedJsonStorageApi<HideServersDrawerStorage>) {
	js = jsonStorage
}

export function staticIcons(): boolean {
	try {
		return !!js?.cache?.staticIcons
	} catch {
		return false
	}
}

export function setStaticIcons(value: boolean) {
	try {
		js?.set({ staticIcons: value })
	} catch {
		/* session-only, still works until restart */
	}
}

/** Defaults to false: stock shows a static Home icon, not the latest DM's avatar. */
export function dmAvatarHome(): boolean {
	try {
		return !!js?.cache?.dmAvatarHome
	} catch {
		return false
	}
}

export function setDmAvatarHome(value: boolean) {
	try {
		js?.set({ dmAvatarHome: value })
	} catch {
		/* session-only, still works until restart */
	}
}
