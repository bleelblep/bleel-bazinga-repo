/**
 * The name rules, shared by the message header and the reply preview. Pure functions, so they run
 * under `bun test` with no mocks (tests/format.test.ts).
 *
 * The rules are Cynosphere's, from the original Vendetta plugin (see NOTICE.md).
 */

/**
 * A zero-width space, prepended to the rewritten name in "only show usernames" mode. It stops
 * Discord's own header logic from recognising the string as the nickname it just rendered and
 * undoing the substitution.
 */
export const ZWSP = '​'

/** The parts of a Discord user record the rules read. */
export interface TagUser {
	username: string
	/** `'0'` on the current account system; a four-digit tag on legacy accounts and bots. */
	discriminator: string
	bot?: boolean
}

/**
 * Webhooks and system messages keep the legacy all-zero discriminator. They have no real tag to
 * show, so they are skipped entirely.
 */
export function isTagless(user: TagUser | undefined): user is undefined {
	return !user || (user.bot === true && user.discriminator === '0000')
}

/**
 * The name to show for [user] when Discord would have shown [shown] (the nickname when there is
 * one, else the display name).
 *
 * - "Only show usernames": the username alone, behind the zero-width space.
 * - Current accounts: the @handle in brackets, only when it differs from what is shown already.
 * - Legacy accounts and bots: `name#1234` in brackets when a different name is shown, else the
 *   `#1234` tag appended.
 */
export function formatName(
	shown: string,
	user: TagUser,
	onlyUsername: boolean,
): string {
	if (onlyUsername) return ZWSP + user.username

	if (user.discriminator === '0') {
		if (shown.toLowerCase() === user.username) return shown
		return `${shown} (@${user.username})`
	}

	if (shown !== user.username)
		return `${shown} (${user.username}#${user.discriminator})`
	return `${shown}#${user.discriminator}`
}

/**
 * The reply preview ("replying to X") stores the shown name sometimes prefixed with "@", so the
 * prefix is stripped before applying the rules and put back afterwards.
 */
export function formatReplyName(
	raw: string,
	user: TagUser,
	onlyUsername: boolean,
): string {
	const hadAt = raw.startsWith('@')
	const shown = hadAt ? raw.slice(1) : raw
	const name = formatName(shown, user, onlyUsername)
	return hadAt ? `@${name}` : name
}
