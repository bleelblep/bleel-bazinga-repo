/**
 * The user-facing wording about stale placeholders, in one place.
 *
 * Two surfaces can flip the toggle — the settings switch and the message long-press row — and
 * they once had their own hand-written copy. That is exactly how a caveat ends up stated on one
 * path and quietly missing from the other.
 *
 * Plain strings, no `valenced.*`, so module scope is safe.
 */

/**
 * ## Why switching off does not always restore everything at once
 *
 * The patches stay installed and gate per call, so the *rewriting* stops the instant the toggle
 * flips. What can survive is everything the client already computed while redaction was armed:
 *
 * - **Rows already drawn.** They live in Kotlin once they cross `DCDChatManager.updateRows`, and
 *   JS only pushes rows that changed — see "The chat bridge" in the README. Reopening the channel
 *   is what makes JS send a complete list.
 * - **Memoized resolvers.** The DM header computes its name inside
 *   `useStateFromStores([...], selector, [userId])`, and avatar sources go through Discord's own
 *   `memoizedImageSource`. `lib/nudge.ts` pokes the stores the header subscribes to, which
 *   handles the common case but is not a guarantee for every surface.
 * - **Cached images.** The placeholder avatar is a real URL that React Native has loaded and
 *   cached like any other.
 * - **Friend nicknames.** While armed, a real friend nickname reads as "User 3" (see
 *   `patches/dmHeader.ts`). Anything that read that and held onto it keeps holding it.
 *
 * None of that is redaction still running — it is a picture of redaction, held in caches this
 * plugin does not own and cannot invalidate from JS. A full app reload clears all of them at
 * once, which is worth saying plainly rather than leaving someone to wonder whether the toggle
 * worked.
 */
export const RELOAD_NOTICE =
	"Reload Discord to clear every leftover placeholder — some are cached outside this plugin's reach."

/** The settings row that says the same thing where it can be read without flipping anything. */
export const RELOAD_NOTICE_LONG =
	'Turning redaction off stops it immediately, but placeholders already drawn can linger: chat rows live in native code until the channel is reopened, and names, avatars and images are cached elsewhere in the app. Reload Discord to be certain none are left.'

/**
 * What a toggle should say.
 *
 * Takes `refreshChat()`'s return directly — a description of what it repainted, or `undefined` if
 * it repainted nothing — rather than a boolean, so there is no second place deciding what counts
 * as success.
 */
export function toggleToast(
	enabled: boolean,
	repaintOutcome: string | undefined,
	warning?: string,
): string {
	const repainted = repaintOutcome !== undefined

	if (enabled) {
		// Never "on" alone when a hook is missing (lib/coverage.ts): that would call an unsafe
		// screenshot safe.
		if (warning) return `Redaction on, but only partly. ${warning}`
		return repainted
			? 'Redaction on.'
			: 'Redaction on — reopen the channel if names are still showing.'
	}

	// The off edge is the one that needed the extra sentence: "some names are still placeholders"
	// reads as a bug, and it is a cache.
	return repainted
		? `Redaction off. ${RELOAD_NOTICE}`
		: `Redaction off — reopen the channel to restore names. ${RELOAD_NOTICE}`
}
