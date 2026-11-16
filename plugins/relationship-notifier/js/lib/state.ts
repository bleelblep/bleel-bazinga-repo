import { DEFAULTS } from '../defaults'
import type { RelationshipNotifierStorage } from '../types'

/**
 * Sub-pages are rendered by Discord's settings navigator as plain routes and never receive the
 * plugin `api` object, so `start()` keeps the storage handle here for them.
 */
let storage: ValencedJsonStorageApi<RelationshipNotifierStorage> | undefined

export function setStorage(
	handle: ValencedJsonStorageApi<RelationshipNotifierStorage> | undefined,
) {
	storage = handle
}

export function getStorage() {
	return storage
}

export function settings(): RelationshipNotifierStorage {
	return { ...DEFAULTS, ...(storage?.cache ?? {}) }
}
