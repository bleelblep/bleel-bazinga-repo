/**
 * The strip under the message box, behind Android's navigation bar.
 *
 * Discord draws edge to edge (the system bar itself is transparent, `SafeAreaInsetsModule`), and
 * `useChannelSafeAreaBottomStyles` (`modules/main_tabs_v2/native/channel/`) fills the bottom inset
 * of a channel with `MOBILE_KEYBOARD_GAP_BACKGROUND`. In all four of Discord's themes that is the
 * same colour as the chat (`CHANNEL_BACKGROUND_DEFAULT`), so the strip never shows. Themes set it
 * through the old `BACKGROUND_TERTIARY` (see `lib/legacy.ts`), usually lighter than their chat,
 * and the strip turns into a lighter bar (seen 2026-09-29, 348.5).
 *
 * With Compatibility > Match the navigation bar on, the gap takes the chat's colour: the theme's
 * when it sets one, else Discord's own, which again matches Discord's gap.
 *
 * The strip continues whatever is directly above it:
 *
 * - Appearance > Fade behind the message box on: the fade ends in a solid block of
 *   `BACKGROUND_BASE_LOWER` behind the message box (`ChatInputScrimGradient`), so the strip takes
 *   that colour and the fade runs to the bottom of the screen. Discord's own themes have the gap
 *   and `BACKGROUND_BASE_LOWER` on the same grey, so a theme that doesn't set it keeps Discord's.
 * - fade off, with a chat background image showing: no flat colour matches the image, so the gap
 *   is fully transparent (`seeThrough`) and `patches/background.tsx` extends the image behind it.
 *   Discord reads a semantic entry's `opacity` as given (0 is not treated as unset, 348.5
 *   `resolveSemanticColor`). The token is only used by that one hook, so nothing else goes clear.
 * - fade off, no image: the chat's colour.
 */
export function matchNavBar(
	semantic: Record<string, { value: string; opacity: number }>,
	{ fade, seeThrough }: { fade: boolean; seeThrough: boolean },
) {
	const chat = semantic.CHANNEL_BACKGROUND_DEFAULT
	const above = fade ? semantic.BACKGROUND_BASE_LOWER : chat
	if (!fade && seeThrough) semantic.MOBILE_KEYBOARD_GAP_BACKGROUND = { value: chat?.value ?? '#000000', opacity: 0 }
	else if (above) semantic.MOBILE_KEYBOARD_GAP_BACKGROUND = { ...above }
	else delete semantic.MOBILE_KEYBOARD_GAP_BACKGROUND
}

/** The options `matchNavBar` takes, from the settings and the theme being applied. */
export function navBarOptions(
	s: { chatInputFade?: boolean; showBackground?: boolean },
	background: { url?: string } | undefined,
): { fade: boolean; seeThrough: boolean } {
	return { fade: s.chatInputFade !== false, seeThrough: !!background?.url && !!s.showBackground }
}
