import { DEFAULTS } from './native'
import type { SpeechBubblesStorage } from './native'

type Storage = ValencedJsonStorageApi<SpeechBubblesStorage>

let storage: Storage | undefined

/** Set in start(); cleared on stop. */
export function setStorage(value: Storage | undefined) {
	storage = value
}

/** Sub-pages are plain navigator routes with no plugin `api` prop, so they read through this. */
export function getStorage(): Storage | undefined {
	return storage
}

/** The settings with the defaults merged in, as a hook: re-renders on every write. */
export function useSettings(): SpeechBubblesStorage {
	return { ...DEFAULTS, ...(storage?.use() ?? {}) }
}

export function setSettings(patch: Partial<SpeechBubblesStorage>) {
	storage?.set(patch)
}
