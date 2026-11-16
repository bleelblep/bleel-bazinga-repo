import type { RelationshipNotifierStorage } from './types'

/**
 * Also the fallback for every read: `load: true` starts the storage read without awaiting it, so
 * `jsonStorage.cache` is undefined for a moment after start (coding rule 7).
 */
export const DEFAULTS: RelationshipNotifierStorage = {
	log: [],
	maxEntries: 200,
	toastOnEvent: true,
	includeMine: true,
	watchFriends: true,
	watchRequests: true,
	watchNames: true,
	watchNewFriends: true,
	watchAvatars: true,
	watchGuilds: true,
	watchGroupDms: true,
	accounts: {},
}
