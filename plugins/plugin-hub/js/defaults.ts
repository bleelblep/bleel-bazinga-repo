import type { HubStorage } from './types'

/**
 * Also the fallback for every read: `load: true` starts the storage read without awaiting it,
 * so `jsonStorage.cache` is genuinely undefined for a short window after start.
 */
export const DEFAULTS: HubStorage = {
	entries: [],
}
