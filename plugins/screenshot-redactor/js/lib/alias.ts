import type { RedactionStyle } from '../types'

// Pure logic: no `valenced.*` anywhere in this file, so module scope is safe here (rule 1 is
// about reading the lazy API proxies early, not about having module state at all).

/**
 * Placeholder identities are assigned in order of first appearance and remembered for as long
 * as redaction stays on, so the same person reads as the same "User 3" everywhere in the
 * screenshot — in the message list, in a reply preview, and in a quote further up the thread.
 *
 * Keyed by user id. Never persisted: a mapping that survived a restart would slowly become a
 * pseudonymisation table sitting on disk, which is exactly the thing this plugin exists to
 * avoid producing.
 */
const aliases = new Map<string, number>()
let nextIndex = 1

/** Discord's own default avatars — six of them, and they encode nothing about the user. */
const DEFAULT_AVATAR_COUNT = 6

export function resetAliases() {
	aliases.clear()
	nextIndex = 1
}

/** @returns the 1-based placeholder number for this user, assigning one if it's new. */
export function aliasIndexFor(userId: string): number {
	if (!userId) return 0

	const existing = aliases.get(userId)
	if (existing !== undefined) return existing

	const index = nextIndex++
	aliases.set(userId, index)
	return index
}

export function aliasCount(): number {
	return aliases.size
}

/** The visible replacement for a user's name. */
export function redactedName(userId: string, style: RedactionStyle): string {
	const index = aliasIndexFor(userId)

	switch (style) {
		case 'block':
			// Fixed width regardless of index: varying it would leak how many distinct people
			// are in the conversation, and roughly how long the real names were.
			return '████████'
		case 'initial':
			return `U${index}`
		default:
			return `User ${index}`
	}
}

/**
 * Whether `text` is a placeholder this session has shown for `userId`, in any style. Reads the
 * alias map without assigning a number, so asking never changes the numbering. Used to stop a
 * placeholder being saved back to Discord as a real nickname (patches/dmHeader.ts).
 */
export function isPlaceholderFor(userId: string, text: unknown): boolean {
	if (typeof text !== 'string' || !userId) return false
	const trimmed = text.trim()
	if (trimmed === '████████') return true
	const index = aliases.get(userId)
	return (
		index !== undefined &&
		(trimmed === `User ${index}` || trimmed === `U${index}`)
	)
}

/**
 * A default-avatar URL chosen from the placeholder number rather than from the user id.
 *
 * Deriving it from the id (which is what Discord itself does) would make the avatar a stable
 * fingerprint of the account across otherwise-unrelated screenshots — a six-way narrowing of
 * who it could be, for free. Keying it to the visible number instead means "User 3" always
 * looks like "User 3" within one screenshot and carries nothing out of it.
 */
export function redactedAvatarUrl(userId: string): string {
	const index = aliasIndexFor(userId)
	const slot = index > 0 ? (index - 1) % DEFAULT_AVATAR_COUNT : 0
	return `https://cdn.discordapp.com/embed/avatars/${slot}.png`
}
