/**
 * Silent messages: Discord's own `@silent` prefix, added for you.
 *
 * Typing `@silent ` at the start of a message makes Discord strip it and send the message with the
 * SUPPRESS_NOTIFICATIONS flag: it arrives as normal, but nobody gets a push or desktop notification.
 * The parsing lives inside `sendMessage` itself (the mobile bundle carries the same
 * `^(@silent(?![^\s]))` pattern as the web client, and Vencord's SilentMessageToggle relies on the
 * same thing from a pre-send hook), so prefixing the content in our wrapper -- which runs before the
 * real `sendMessage` -- is exactly what typing it yourself does. No flag bits are set by hand.
 *
 * Only new messages: a message's flags are fixed once it is sent, and Discord never parses the
 * prefix on an edit, so an edit prefixed this way would send the literal text.
 */

const PREFIX = /^@silent(?!\S)/

export function isSilent(text: string): boolean {
	return PREFIX.test(text)
}

/** The content with `@silent ` in front, unless it is empty or already silent. */
export function makeSilent(text: string): string {
	if (!text || isSilent(text)) return text
	return `@silent ${text}`
}
