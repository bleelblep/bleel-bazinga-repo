/**
 * How a redacted name is rendered.
 *
 * - `pseudonym` — "User 1", "User 2", numbered in order of first appearance. The conversation
 *   still reads as a conversation, which is the point: a screenshot of a support thread or an
 *   argument is only useful if you can still tell who said what.
 * - `block`   — "████". Unambiguously redacted, but everyone looks identical.
 * - `initial` — "U1" / "A", compact enough not to reflow a narrow message header.
 */
export type RedactionStyle = 'pseudonym' | 'block' | 'initial'

export interface ScreenshotRedactorStorage {
	/** Master toggle. Off by default — this plugin does nothing until deliberately armed. */
	enabled: boolean
	style: RedactionStyle
	/** Swap avatars for Discord's own default avatars, which carry no identity. */
	redactAvatars: boolean
	/**
	 * Also clear the server-tag badge and role tags beside usernames.
	 *
	 * Off by default, and that is not timidity: clearing this family is exactly what visibly
	 * broke the client in 0.16.0. The cause is now understood — the old code cleared to `""`,
	 * which for a badge URL is a real image URI Discord tries to load, where the wire format
	 * uses `null` for absent — and the clearing has been fixed. But that was a confident
	 * diagnosis last time too, so it ships as something to turn on rather than something to
	 * discover the hard way.
	 */
	redactBadges: boolean
	/**
	 * Redact your own messages too. On by default: a screenshot that hides everyone else still
	 * shows who took it, which for a screenshot shared elsewhere is the name that matters most.
	 */
	redactSelf: boolean
	/** Restart placeholder numbering from 1 each time redaction is switched on. */
	resetNumberingOnEnable: boolean
	/**
	 * Add a redaction toggle to the message long-press sheet. The default quick toggle: hidden
	 * until asked for, so it can never appear in the screenshot.
	 */
	showSheetToggle: boolean
	/**
	 * Redact names wherever the client resolves them — the DM channel header, inline
	 * @mentions, the member list — not just message rows.
	 */
	redactResolvedNames: boolean
	/**
	 * Blank out details people typed into the message itself -- emails, phone numbers, street
	 * addresses, card numbers, invite links, API keys.
	 *
	 * Everything else in this plugin redacts *identity fields*: who wrote it, their avatar, a
	 * mention. None of that touches what was written, so a screenshot with every name replaced
	 * still showed the phone number somebody pasted three messages up. Pattern matching only --
	 * no key, no network, no AI.
	 */
	redactBodyDetails: boolean
	/**
	 * Verbose logging to the console — the generated row's field names, and per-call detail
	 * from the channel-title hooks. Reaches `adb logcat -s ReactNativeJS`. Shapes and key names
	 * only; never a name, id or URL.
	 */
	verboseLogging: boolean
}
