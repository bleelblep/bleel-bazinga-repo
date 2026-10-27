// Flux stores are looked up by name directly through the Stores proxy, not a module finder
// filter -- there is no `withStoreName` under modules.finders.filters. Read per call, never at
// module scope: the Stores proxy resolves via one-shot `lookupModule`, and at preInit that
// caches a permanent miss on a key shared app-wide. See docs/coding-rules.md rule 1.
import { Stores } from '@valenced/discord/flux'

const store = () => (Stores as any).UserGuildSettingsStore

/** Exposed so callers can subscribe to mute/notification-level changes and re-render. */
export function settingsStore() {
	return store()
}

// Discord's per-guild message_notifications level: 0 = all messages, 1 = only @mentions,
// 2 = nothing, 3 = inherit the account default. Not exposed as a typed enum anywhere
// reachable from here, so the numbers are inlined.
const ONLY_MENTIONS = 1
const NO_MESSAGES = 2

export interface GuildNotificationState {
	/** Guild-wide mute, independent of the message_notifications level. */
	muted: boolean
	/** message_notifications === ONLY_MENTIONS. */
	onlyMentions: boolean
	/** message_notifications === NO_MESSAGES: nothing should show, mentions included. */
	suppressed: boolean
}

const DEFAULT_STATE: GuildNotificationState = { muted: false, onlyMentions: false, suppressed: false }

/**
 * Best-effort: the store is queried through several possible accessors since only the
 * general shape (mute + a numeric notification level) is assumed to carry over from
 * classic Revenge, not confirmed against Valenced. Any lookup that throws or comes back
 * undefined falls through to "notifications are unrestricted" rather than hiding badges the
 * user didn't ask to hide.
 */
export function guildNotificationState(guildId: string): GuildNotificationState {
	const UserGuildSettingsStore = store()
	if (!UserGuildSettingsStore) return DEFAULT_STATE

	let muted = false
	try {
		muted = !!UserGuildSettingsStore.isMuted?.(guildId)
	} catch {
		/* ignore */
	}

	let level: number | undefined
	try {
		if (typeof UserGuildSettingsStore.getMessageNotifications === "function") {
			level = UserGuildSettingsStore.getMessageNotifications(guildId)
		} else {
			const settings =
				UserGuildSettingsStore.getUserGuildSettings?.(guildId) ??
				UserGuildSettingsStore.getSettingsForGuild?.(guildId) ??
				UserGuildSettingsStore.getGuildSettings?.(guildId)
			level = settings?.message_notifications ?? settings?.messageNotifications
		}
	} catch {
		/* ignore */
	}

	return {
		muted,
		onlyMentions: level === ONLY_MENTIONS,
		suppressed: level === NO_MESSAGES,
	}
}
