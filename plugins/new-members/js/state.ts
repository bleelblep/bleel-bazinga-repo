export type BadgeStyle = 'emoji' | 'icon' | 'recolor'

/** For someone whose role already has an icon: swap it for the badge, or keep it and add 🌱 after the name. */
export type RoleIconMode = 'replace' | 'keep'

export interface NewMembersStorage {
	/** 🌱, Discord's NewUserIcon as shipped, or that icon in [color]. */
	style: BadgeStyle
	/** `#rrggbb`, for the recoloured icon. */
	color: string
	roleIcon: RoleIconMode
}

export const DEFAULT_COLOR = '#23A55A'

export const DEFAULTS: NewMembersStorage = {
	style: 'recolor',
	color: DEFAULT_COLOR,
	roleIcon: 'replace',
}

let storage: ValencedJsonStorageApi<NewMembersStorage> | undefined
let current: NewMembersStorage = DEFAULTS

/**
 * Kept from subscribe, not read off `cache`: the settings page can write through another handle on
 * the same file, whose writes this handle's cache never sees (same as Character Counter). `get()`
 * is async, so the row patch can't call it.
 */
export function setStorage(handle: ValencedJsonStorageApi<NewMembersStorage>): () => void {
	storage = handle
	current = { ...DEFAULTS, ...(handle.cache ?? {}) }
	const take = (patch: Partial<NewMembersStorage> | undefined) => {
		if (patch) current = { ...current, ...patch }
	}
	const unsubscribe = handle.subscribe(patch => take(patch as Partial<NewMembersStorage>))
	handle.get().then(take, () => {})
	return () => {
		unsubscribe()
		storage = undefined
	}
}

/** Outside components: the current settings. */
export function settings(): NewMembersStorage {
	return current
}

/** Inside components: re-renders when a setting changes. */
export function useSettings(): NewMembersStorage {
	return { ...DEFAULTS, ...(storage?.use() ?? {}) }
}

export function update(patch: Partial<NewMembersStorage>) {
	storage?.set(patch)
}
