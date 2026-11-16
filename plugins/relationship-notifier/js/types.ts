export type EventKind =
	| 'friend'
	| 'incoming'
	| 'outgoing'
	| 'name'
	| 'newfriend'
	| 'avatar'
	| 'guild'
	| 'groupdm'

/** One friend, request, server or group DM as it was last seen. */
export interface Known {
	id: string
	/** Display name for people, the name for servers and groups. */
	name: string
	/** People only. */
	username?: string
	/** Avatar or icon hash. */
	icon?: string
	/** Servers only: the vanity code (discord.gg/<code>), if it has one. */
	vanity?: string
	/** Servers only: an invite code Discord had already seen for it this session. Never requested. */
	invite?: string
	/** Servers only: the owner's id, and their name if Discord had them loaded. */
	ownerId?: string
	ownerName?: string
}

/**
 * Everything the plugin knew about one account the last time it looked. Lists, not objects keyed
 * by id: `jsonStorage.set` replaces arrays whole, and an object would only ever grow (coding rule 6).
 */
export interface Snapshot {
	friends: Known[]
	incoming: Known[]
	outgoing: Known[]
	guilds: Known[]
	groups: Known[]
}

export interface RelationshipEvent {
	/** `${kind}:${targetId}:${timestamp}`, unique per occurrence. */
	id: string
	kind: EventKind
	targetId: string
	/** The name at the time. For a name change, the new one. */
	name: string
	/** Name changes only: the name before. */
	oldName?: string
	/** Name changes only: which name changed. */
	field?: 'name' | 'username'
	/** Avatar or icon hash, kept because it can't be looked up once the relation is gone. */
	iconHash?: string
	/** Avatar changes only: the hash before (undefined means Discord's default avatar). */
	oldIconHash?: string
	/** Avatar changes only: copies saved on this phone, relative to Discord's documents folder. */
	oldFile?: string
	newFile?: string
	/** New friends only: whose request it was, when known. */
	accepted?: 'you' | 'them'
	at: number
	/** You did it on this phone (removed, declined, cancelled, left, blocked). */
	byYou?: boolean
	/** Friends only: you blocked them. */
	blocked?: boolean
	/** Found when Discord connected, so it happened while the app was closed. */
	away?: boolean
	/** Servers only: the vanity code (discord.gg/<code>), if it has one. */
	vanity?: string
	/** Servers only: an invite code Discord had already seen for it this session. Never requested. */
	invite?: string
	/** Servers only: the owner's id, and their name if Discord had them loaded. */
	ownerId?: string
	ownerName?: string
}

export interface RelationshipNotifierStorage {
	/** Newest first, capped at `maxEntries`. */
	log: RelationshipEvent[]
	maxEntries: number
	toastOnEvent: boolean
	includeMine: boolean
	watchFriends: boolean
	watchRequests: boolean
	watchNames: boolean
	watchNewFriends: boolean
	watchAvatars: boolean
	watchGuilds: boolean
	watchGroupDms: boolean
	/** Per logged-in account id. */
	accounts: Record<string, Snapshot>
}
