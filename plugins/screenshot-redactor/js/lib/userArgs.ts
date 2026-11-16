/**
 * Working out *which person* a resolver call is about, from its arguments.
 *
 * Discord's shared resolvers take their subject in three different shapes, and every one of them
 * has cost this plugin a release:
 *
 * - a **user object** — `getName(user)`, `getUserAvatarURL(user, …)`
 * - a **bare id string** — `RelationshipStore.getNickname(userId)`, which is what let the DM
 *   header survive six attempts (`patches/dmHeader.ts` documents that one in full)
 * - an **options object carrying `userId`** — `getGuildMemberAvatarURLSimple({ guildId, avatar,
 *   userId, canAnimate, size })`
 *
 * Locating the subject by shape rather than by position is deliberate: the same helper is called
 * as `f(user)`, `f(guildId, user)` and `f(guildId, channelId, user)` depending on the call site.
 *
 * Pure logic, no `valenced.*`, so module scope is safe here (coding rule 1 is about reading the
 * lazy API proxies early, not about having module state at all).
 */

/** A Discord snowflake: 17–19 digits, nothing else. */
export const SNOWFLAKE = /^\d{17,19}$/

export function isSnowflake(value: unknown): value is string {
	return typeof value === 'string' && SNOWFLAKE.test(value)
}

/**
 * The argument that looks like a user record.
 *
 * Requires a name-ish field alongside `.id` so that a channel, guild or message — all of which
 * also carry an `.id` — can't be mistaken for the subject and handed an alias number.
 */
export function findUserObject(args: any[]): any {
	if (!Array.isArray(args)) return undefined
	for (const arg of args) {
		if (arg && typeof arg === 'object' && typeof arg.id === 'string') {
			if ('username' in arg || 'globalName' in arg || 'global_name' in arg)
				return arg
		}
	}
	return undefined
}

/**
 * The `userId` off an options object, for resolvers that take a descriptor rather than a record.
 *
 * Deliberately keyed on the literal `userId` property: `id` on an options object could be
 * anything, and a guild id read as a user id would quietly corrupt the placeholder numbering.
 */
export function findUserIdField(args: any[]): string | undefined {
	if (!Array.isArray(args)) return undefined
	for (const arg of args) {
		if (arg && typeof arg === 'object' && isSnowflake(arg.userId))
			return arg.userId
	}
	return undefined
}
