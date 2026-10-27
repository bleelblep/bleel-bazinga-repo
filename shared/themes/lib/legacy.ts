/**
 * Old themes on new Discord, without rewriting them.
 *
 * Most Vendetta and classic Revenge themes were written against colour names Discord has since
 * dropped or stopped using. Checked against Discord 348.5: Catppuccin Frappé Mauve sets 46
 * semantic colours and 29 of them no longer exist (`BACKGROUND_PRIMARY`, `TEXT_NORMAL`,
 * `HEADER_PRIMARY`, `BACKGROUND_MODIFIER_*`, …), so most of it silently does nothing.
 *
 * Two layers:
 *
 * 1. **Names.** Each old name fills the current names that took over its job, e.g.
 *    `BACKGROUND_FLOATING` -> sheets, alerts, modals, the emoji picker. A few current names are
 *    here too because 348 stopped drawing with them (`CHANNELTEXTAREA_BACKGROUND` -> the chat
 *    input 348 actually draws). A name the theme sets itself always wins, and within the table
 *    the first match wins, so more specific old names are listed before general ones.
 * 2. **Brand colour.** Old themes recolour `BRAND_*`; 348 draws buttons, switches, the send button
 *    and selections from `BLURPLE_*`. If a theme sets the first and not the second, it carries
 *    over. `BRAND_360` becomes brand *text* on 348, so it is only used for text when it is light
 *    enough to read on a dark surface.
 * 3. **Grey ramp.** Old themes recolour Discord's old greys (`PRIMARY_*`, `PLUM_*`); 348 draws most
 *    surfaces and text with `NEUTRAL_*`. The mapping between them is Themeify's
 *    (`rawAliases.ts`, GPL-3.0, see NOTICE.md). On top of it, a step is only filled when the
 *    theme's colour stays on the same side of light/dark as Discord's own colour for that step:
 *    Purple Galaxy sets `PRIMARY_100` near-black, and `NEUTRAL_1` is white button text on 348.
 *
 * The targets were chosen from what each 348 colour is drawn with on the Dark theme (read from the
 * 348.5 bundle's generated token definitions): surfaces on the same neutral step as the old name's
 * surface, and so on. It is a best fit, not a guarantee; a theme that sets current names is always
 * more exact.
 */

import { aliasRawColors } from './rawAliases'

/** Old (or no longer drawn) name -> current names it fills, most specific first. */
/**
 * `tint`: Discord draws the target see-through (a faint wash). An opaque colour from the theme keeps
 * Discord's opacity instead of becoming a solid block.
 * `text`: the target is text or an icon on the chat background. Only filled if the theme's colour
 * reads on the theme's chat colour (3:1); themes set some of these for desktop, on a coloured box.
 */
export interface LegacyOptions {
	tint?: boolean
	text?: boolean
}

export const LEGACY_SEMANTIC: Array<[string, string[], LegacyOptions?]> = [
	// Chat surface: specific names before the general background ones.
	['CHAT_BACKGROUND', ['CHANNEL_BACKGROUND_DEFAULT', 'STANDALONE_CHANNEL_CONTENT_BACKGROUND']],
	['BACKGROUND_PRIMARY', ['CHANNEL_BACKGROUND_DEFAULT', 'STANDALONE_CHANNEL_CONTENT_BACKGROUND', 'BACKGROUND_BASE_LOWER', 'PANEL_BG']],
	['BG_BASE_PRIMARY', ['CHANNEL_BACKGROUND_DEFAULT', 'STANDALONE_CHANNEL_CONTENT_BACKGROUND', 'BACKGROUND_BASE_LOWER', 'PANEL_BG']],
	['BACKGROUND_MOBILE_PRIMARY', ['CHANNEL_BACKGROUND_DEFAULT', 'STANDALONE_CHANNEL_CONTENT_BACKGROUND', 'BACKGROUND_BASE_LOWER', 'PANEL_BG']],

	// Bars and the channel list.
	['BACKGROUND_SECONDARY', ['BACKGROUND_BASE_LOW', 'TAB_BAR_BACKGROUND', 'MOBILE_FLOATINGBAR_BACKGROUND', 'MOBILE_FLOATINGBAR_BACKGROUND_SCRIM', 'MOBILE_COMMAND_BAR_BACKGROUND', 'ANDROID_NAVIGATION_BAR_BACKGROUND', 'MOBILE_SEARCHBAR_GRADIENT_BACKGROUND', 'MOBILE_TYPING_INDICATOR_BACKGROUND_DEFAULT', 'VOICE_CHANNEL_USER_LIMIT_BACKGROUND']],
	['BG_BASE_SECONDARY', ['BACKGROUND_BASE_LOW', 'TAB_BAR_BACKGROUND', 'MOBILE_FLOATINGBAR_BACKGROUND', 'MOBILE_COMMAND_BAR_BACKGROUND', 'ANDROID_NAVIGATION_BAR_BACKGROUND']],
	['BACKGROUND_MOBILE_SECONDARY', ['BACKGROUND_BASE_LOW', 'TAB_BAR_BACKGROUND', 'MOBILE_FLOATINGBAR_BACKGROUND', 'MOBILE_COMMAND_BAR_BACKGROUND', 'ANDROID_NAVIGATION_BAR_BACKGROUND']],

	// The darkest surface.
	['BACKGROUND_TERTIARY', ['BACKGROUND_BASE_LOWEST', 'USER_PROFILE_GRADIENT_BACKGROUND', 'GUILD_PROFILE_BANNER_BACKGROUND_DEFAULT', 'MOBILE_VOICE_PANEL_BACKGROUND', 'MOBILE_KEYBOARD_GAP_BACKGROUND']],
	['BG_BASE_TERTIARY', ['BACKGROUND_BASE_LOWEST', 'USER_PROFILE_GRADIENT_BACKGROUND', 'GUILD_PROFILE_BANNER_BACKGROUND_DEFAULT']],

	// Floating surfaces: sheets, alerts, pickers, cards.
	['BACKGROUND_FLOATING', ['BACKGROUND_SURFACE_HIGH', 'MOBILE_ACTIONSHEET_BACKGROUND', 'MOBILE_ACTIONSHEET_GRADIENT_BACKGROUND_DEFAULT', 'MOBILE_ALERT_BACKGROUND_DEFAULT', 'MODAL_BACKGROUND', 'MODAL_FOOTER_BACKGROUND', 'MOBILE_EXPRESSION_PICKER_BACKGROUND_DEFAULT', 'MOBILE_COACHMARK_BACKGROUND_DEFAULT', 'MOBILE_FLOATING_ACCESSORY_BACKGROUND', 'MOBILE_COMMAND_CATEGORIES_BACKGROUND', 'MOBILE_KEYBOARD_PANEL_BACKGROUND', 'CARD_BACKGROUND_DEFAULT', 'CHAT_BANNER_BG', 'MOBILE_EMBED_BACKGROUND_DEFAULT', 'MOBILE_THREAD_EMBED_BACKGROUND', 'BLUR_FALLBACK', 'LEGACY_BLUR_FALLBACK_DEFAULT']],
	['BG_SURFACE_OVERLAY', ['BACKGROUND_SURFACE_HIGH', 'MOBILE_ACTIONSHEET_BACKGROUND', 'MOBILE_ALERT_BACKGROUND_DEFAULT', 'MODAL_BACKGROUND']],
	['BG_SURFACE_OVERLAY_TMP', ['BACKGROUND_SURFACE_HIGH', 'MOBILE_ACTIONSHEET_BACKGROUND', 'MOBILE_ALERT_BACKGROUND_DEFAULT', 'MODAL_BACKGROUND']],
	['BACKGROUND_NESTED_FLOATING', ['BACKGROUND_SURFACE_HIGHEST', 'MOBILE_TOAST_BACKGROUND_DEFAULT', 'MOBILE_FLOATINGBAR_BACKGROUND_HIGHER', 'MOBILE_FLOATINGBAR_BACKGROUND_NAMEPLATE', 'CUSTOM_STATUS_BUBBLE_BG', 'BLUR_FALLBACK_PRESSED']],
	['CARD_PRIMARY_BG', ['CARD_BACKGROUND_DEFAULT']],
	['CARD_GRADIENT_BG', ['CARD_MUTED_BG']],
	['CARD_GRADIENT_PRESSED_BG', ['CARD_MUTED_PRESSED_BG']],
	// After BACKGROUND_FLOATING, so a theme that sets both keeps its floating colour on cards.
	['REDESIGN_ACTIVITY_CARD_BACKGROUND', ['CARD_BACKGROUND_DEFAULT']],
	['ACTIVITY_CARD_BACKGROUND', ['CARD_BACKGROUND_DEFAULT']],
	['DEPRECATED_CARD_BG', ['CARD_SECONDARY_BACKGROUND_DEFAULT', 'CARD_SECONDARY_BG'], { tint: true }],
	// The see-through buttons on profile banners (more, edit).
	['USER_PROFILE_HEADER_OVERFLOW_BACKGROUND', ['CONTROL_OVERLAY_SECONDARY_BACKGROUND_DEFAULT', 'CONTROL_OVERLAY_SECONDARY_BACKGROUND_ACTIVE'], { tint: true }],
	['DISPLAY_BANNER_OVERFLOW_BACKGROUND', ['CONTROL_OVERLAY_SECONDARY_BACKGROUND_DEFAULT', 'CONTROL_OVERLAY_SECONDARY_BACKGROUND_ACTIVE'], { tint: true }],
	['BG_BACKDROP', ['BACKGROUND_SCRIM', 'CONTEXT_MENU_BACKDROP_BACKGROUND']],

	// States.
	['BACKGROUND_MESSAGE_HOVER', ['MESSAGE_BACKGROUND_HOVER']],
	['BACKGROUND_MODIFIER_HOVER', ['INTERACTIVE_BACKGROUND_HOVER', 'MESSAGE_BACKGROUND_HOVER']],
	['BACKGROUND_MODIFIER_ACTIVE', ['INTERACTIVE_BACKGROUND_ACTIVE', 'TABLEROW_BACKGROUND_PRESSED']],
	['BACKGROUND_MODIFIER_SELECTED', ['INTERACTIVE_BACKGROUND_SELECTED', 'MOBILE_CHANNEL_ITEM_BACKGROUND_SELECTED']],
	['BACKGROUND_MODIFIER_ACCENT', ['BORDER_SUBTLE', 'BORDER_MUTED', 'APP_FRAME_BORDER', 'CHAT_BORDER', 'CARD_BORDER_DEFAULT', 'MOBILE_HEADER_BORDER']],
	['BG_MOD_FAINT', ['BACKGROUND_MOD_MUTED']],
	['BG_MOD_SUBTLE', ['BACKGROUND_MOD_SUBTLE']],
	['BG_MOD_STRONG', ['BACKGROUND_MOD_STRONG']],
	['BACKGROUND_MENTIONED', ['MESSAGE_MENTIONED_BACKGROUND_DEFAULT']],
	['BACKGROUND_MENTIONED_HOVER', ['MESSAGE_MENTIONED_BACKGROUND_HOVER']],
	['BORDER_FAINT', ['BORDER_MUTED']],
	['BACKGROUND_MESSAGE_HIGHLIGHT', ['MESSAGE_HIGHLIGHT_BACKGROUND_DEFAULT'], { tint: true }],
	['BACKGROUND_MESSAGE_HIGHLIGHT_HOVER', ['MESSAGE_HIGHLIGHT_BACKGROUND_HOVER'], { tint: true }],
	['BACKGROUND_MESSAGE_AUTOMOD', ['MESSAGE_AUTOMOD_BACKGROUND_DEFAULT'], { tint: true }],
	['BACKGROUND_MESSAGE_AUTOMOD_HOVER', ['MESSAGE_AUTOMOD_BACKGROUND_HOVER'], { tint: true }],
	['FOCUS_PRIMARY', ['BORDER_FOCUS']],

	// Chat input: 348 draws it from MOBILE_CHATINPUT_*.
	['INPUT_BACKGROUND', ['INPUT_BACKGROUND_DEFAULT', 'MOBILE_CHATINPUT_BACKGROUND_DEFAULT', 'MOBILE_CHATINPUT_BACKGROUND_ACTIVE']],
	['CHANNELTEXTAREA_BACKGROUND', ['MOBILE_CHATINPUT_BACKGROUND_DEFAULT', 'MOBILE_CHATINPUT_BACKGROUND_ACTIVE']],
	['REDESIGN_CHAT_INPUT_BACKGROUND', ['MOBILE_CHATINPUT_BACKGROUND_DEFAULT', 'MOBILE_CHATINPUT_BACKGROUND_ACTIVE']],
	['CHAT_INPUT_CONTAINER_BACKGROUND', ['MOBILE_CHATINPUT_BACKGROUND_DEFAULT', 'MOBILE_CHATINPUT_BACKGROUND_ACTIVE']],
	['CHANNEL_TEXT_AREA_PLACEHOLDER', ['INPUT_PLACEHOLDER_TEXT_DEFAULT']],
	['INPUT_PLACEHOLDER_TEXT', ['INPUT_PLACEHOLDER_TEXT_DEFAULT']],
	['DEPRECATED_TEXT_INPUT_BG', ['INPUT_BACKGROUND_DEFAULT'], { tint: true }],
	['DEPRECATED_TEXT_INPUT_BORDER', ['INPUT_BORDER_DEFAULT'], { tint: true }],
	['KEYBOARD', ['MOBILE_KEYBOARD_PANEL_BACKGROUND', 'MOBILE_KEYBOARD_GAP_BACKGROUND']],
	['ANDROID_RIPPLE', ['MOBILE_ANDROID_BUTTON_BACKGROUND_RIPPLE']],

	// Text.
	['HEADER_PRIMARY', ['TEXT_STRONG', 'MOBILE_TEXT_HEADING_PRIMARY', 'USER_PROFILE_ABOUT_ME_HEADING_TEXT']],
	['HEADER_SECONDARY', ['TEXT_SUBTLE']],
	['TEXT_SECONDARY', ['TEXT_SUBTLE']],
	['TEXT_NORMAL', ['TEXT_DEFAULT', 'INPUT_TEXT_DEFAULT']],
	['TEXT_PRIMARY', ['TEXT_DEFAULT', 'INPUT_TEXT_DEFAULT']],
	['TEXT_POSITIVE', ['TEXT_FEEDBACK_POSITIVE']],
	['TEXT_WARNING', ['TEXT_FEEDBACK_WARNING']],
	['TEXT_DANGER', ['TEXT_FEEDBACK_CRITICAL']],

	// Info boxes: tinted background, and the coloured icon, border and text. The old `INFO_*_TEXT` was
	// the white text inside a filled box, which 348 no longer draws, so it has no target.
	['INFO_DANGER_BACKGROUND', ['BACKGROUND_FEEDBACK_CRITICAL'], { tint: true }],
	['INFO_DANGER_FOREGROUND', ['ICON_FEEDBACK_CRITICAL', 'BORDER_FEEDBACK_CRITICAL', 'TEXT_FEEDBACK_CRITICAL'], { text: true }],
	['INFO_HELP_BACKGROUND', ['BACKGROUND_FEEDBACK_INFO'], { tint: true }],
	['INFO_HELP_FOREGROUND', ['ICON_FEEDBACK_INFO', 'BORDER_FEEDBACK_INFO', 'TEXT_FEEDBACK_INFO'], { text: true }],
	['INFO_POSITIVE_BACKGROUND', ['BACKGROUND_FEEDBACK_POSITIVE'], { tint: true }],
	['INFO_POSITIVE_FOREGROUND', ['ICON_FEEDBACK_POSITIVE', 'BORDER_FEEDBACK_POSITIVE', 'TEXT_FEEDBACK_POSITIVE'], { text: true }],
	['INFO_WARNING_BACKGROUND', ['BACKGROUND_FEEDBACK_WARNING'], { tint: true }],
	['INFO_WARNING_FOREGROUND', ['ICON_FEEDBACK_WARNING', 'BORDER_FEEDBACK_WARNING', 'TEXT_FEEDBACK_WARNING'], { text: true }],

	// Icons and interactive text.
	['INTERACTIVE_NORMAL', ['INTERACTIVE_TEXT_DEFAULT', 'INTERACTIVE_ICON_DEFAULT', 'MOBILE_HEADER_ICON_DEFAULT', 'TAB_LABEL_TEXT_DEFAULT', 'CHAT_INPUT_ICON_DEFAULT_TINT', 'CHAT_INPUT_ACTION_BUTTON_ICON_DEFAULT_TINT', 'CONTROL_ICON_ONLY_ICON_DEFAULT']],
	['INTERACTIVE_HOVER', ['INTERACTIVE_TEXT_HOVER', 'INTERACTIVE_ICON_HOVER']],
	['INTERACTIVE_ACTIVE', ['INTERACTIVE_TEXT_ACTIVE', 'INTERACTIVE_ICON_ACTIVE', 'TAB_LABEL_TEXT_FOCUSED', 'CHAT_INPUT_ACTION_ICON_ACTIVE_TINT', 'CONTROL_ICON_ONLY_ICON_ACTIVE']],

	// Buttons.
	['REDESIGN_BUTTON_PRIMARY_BACKGROUND', ['CONTROL_PRIMARY_BACKGROUND_DEFAULT']],
	['REDESIGN_BUTTON_PRIMARY_PRESSED_BACKGROUND', ['CONTROL_PRIMARY_BACKGROUND_ACTIVE']],
	['REDESIGN_BUTTON_PRIMARY_TEXT', ['CONTROL_PRIMARY_TEXT_DEFAULT']],
	['REDESIGN_BUTTON_SECONDARY_BACKGROUND', ['CONTROL_SECONDARY_BACKGROUND_DEFAULT']],
	['REDESIGN_BUTTON_SECONDARY_ALT_BACKGROUND', ['CONTROL_SECONDARY_BACKGROUND_DEFAULT']],
	['REDESIGN_BUTTON_SECONDARY_PRESSED_BACKGROUND', ['CONTROL_SECONDARY_BACKGROUND_ACTIVE']],
	['REDESIGN_BUTTON_SECONDARY_ALT_PRESSED_BACKGROUND', ['CONTROL_SECONDARY_BACKGROUND_ACTIVE']],
	['REDESIGN_BUTTON_SECONDARY_BORDER', ['CONTROL_SECONDARY_BORDER_DEFAULT']],
	['REDESIGN_BUTTON_SECONDARY_TEXT', ['CONTROL_SECONDARY_TEXT_DEFAULT']],
	['REDESIGN_BUTTON_DANGER_BACKGROUND', ['CONTROL_CRITICAL_PRIMARY_BACKGROUND_DEFAULT']],

	// Pre-redesign buttons, after the redesign names so a theme that sets both keeps the newer ones.
	['BUTTON_SECONDARY_BACKGROUND', ['CONTROL_SECONDARY_BACKGROUND_DEFAULT']],
	['BUTTON_SECONDARY_BACKGROUND_ACTIVE', ['CONTROL_SECONDARY_BACKGROUND_ACTIVE']],
	['BUTTON_DANGER_BACKGROUND', ['CONTROL_CRITICAL_PRIMARY_BACKGROUND_DEFAULT']],
	['BUTTON_DANGER_BACKGROUND_ACTIVE', ['CONTROL_CRITICAL_PRIMARY_BACKGROUND_ACTIVE']],
	['STATUS_DANGER_BACKGROUND', ['CONTROL_CRITICAL_PRIMARY_BACKGROUND_DEFAULT']],
	['BUTTON_POSITIVE_BACKGROUND', ['CONTROL_CONNECTED_BACKGROUND_DEFAULT']],
	['BUTTON_POSITIVE_BACKGROUND_ACTIVE', ['CONTROL_CONNECTED_BACKGROUND_ACTIVE']],
]

/**
 * Old names themes set that Discord's mobile app never drew with (desktop parts), or whose job is
 * gone. Nothing to translate them to, so they aren't reported as missing. Found with
 * docs/debugging/legacy-map.md (2026-10-09).
 */
const NOT_ON_MOBILE = new Set([
	'SCROLLBAR_THIN_THUMB', 'SCROLLBAR_THIN_TRACK', 'SCROLLBAR_AUTO_THUMB', 'SCROLLBAR_AUTO_TRACK',
	'SCROLLBAR_AUTO_SCROLLBAR_COLOR_THUMB', 'SCROLLBAR_AUTO_SCROLLBAR_COLOR_TRACK',
	'ELEVATION_HIGH', 'ELEVATION_LOW', 'ELEVATION_MEDIUM', 'ELEVATION_STROKE', 'GUILD_HEADER_TEXT_SHADOW',
	'LOGO_PRIMARY', 'HOME_BACKGROUND', 'TEXTBOX_MARKDOWN_SYNTAX', 'BUG_REPORTER_MODAL_SUBMITTING_BACKGROUND',
	'DEPRECATED_QUICKSWITCHER_INPUT_BACKGROUND', 'DEPRECATED_QUICKSWITCHER_INPUT_PLACEHOLDER',
	'DEPRECATED_STORE_BG', 'DEPRECATED_TEXT_INPUT_PREFIX', 'DEPRECATED_TEXT_INPUT_BORDER_HOVER',
	'DEPRECATED_TEXT_INPUT_BORDER_DISABLED', 'DEPRECATED_CARD_EDITABLE_BG',
	'INFO_DANGER_TEXT', 'INFO_HELP_TEXT', 'INFO_POSITIVE_TEXT', 'INFO_WARNING_TEXT',
	// Current TEXT_LINK covers links; the low-saturation variant was a desktop accessibility option.
	'TEXT_LINK_LOW_SATURATION',
	// Text on the red button: left to palette.ts, which picks a colour that reads on the theme's red.
	'STATUS_DANGER_TEXT',
])

/** Relative luminance, 0 (black) to 1 (white). */
function luminance(hex: string): number {
	const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex)
	if (!m) return 0
	const [r, g, b] = [m[1], m[2], m[3]].map(c => {
		const v = parseInt(c, 16) / 255
		return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
	})
	return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio of two colours, 1 to 21. */
function contrast(a: string, b: string): number {
	const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m)
	return (x + 0.05) / (y + 0.05)
}

export interface LegacyResult {
	/** How many current colours were filled from old names. */
	filled: number
	/** Grey-ramp steps filled, and ones skipped because they would flip light and dark. */
	greys: number
	skippedGreys: string[]
	/** Old names the theme set that nothing on 348 draws with and the table can't place. */
	unplaced: string[]
	/** Old names the theme set for parts only desktop Discord had; nothing to place them on. */
	desktopOnly: string[]
	/** Text/icon colours not used because they wouldn't read on the theme's chat colour. */
	unreadable: number
}

/**
 * Fills current names from the old ones a theme sets, in place. `own` is the set of names the
 * theme sets itself, which are never overwritten; `known` is every semantic name on this Discord;
 * `original` reads Discord's own raw colour for a name.
 */
export function translateLegacy(
	semantic: Record<string, { value: string; opacity: number }>,
	raw: Record<string, string>,
	known: Set<string>,
	original: (name: string) => string | undefined,
	discordOpacity: (name: string) => number | undefined = () => undefined,
): LegacyResult {
	const own = new Set(Object.keys(semantic))
	let filled = 0
	let unreadable = 0

	for (const [legacy, targets, options] of LEGACY_SEMANTIC) {
		const source = semantic[legacy]
		if (!source) continue
		if (options?.text) {
			// Filled in order, so the chat colour from BACKGROUND_PRIMARY & co. is already here.
			const chat = semantic.CHANNEL_BACKGROUND_DEFAULT?.value
			if (chat && contrast(source.value, chat) < 3) {
				unreadable++
				continue
			}
		}
		for (const target of targets) {
			if (own.has(target) || semantic[target] || (known.size && !known.has(target))) continue
			let entry = { ...source }
			if (options?.tint && entry.opacity >= 1 && !/^#[0-9a-f]{8}$/i.test(entry.value)) {
				const theirs = discordOpacity(target)
				if (theirs !== undefined && theirs < 1) entry = { value: entry.value, opacity: theirs }
			}
			semantic[target] = entry
			filled++
		}
	}

	const brand = raw.BRAND_500
	if (brand && !raw.BLURPLE_50) {
		raw.BLURPLE_50 = brand
		raw.BLURPLE_65 = raw.BRAND_560 ?? brand
		// BRAND_360 is brand text on 348; some themes set it dark for their old use.
		const light = [raw.BRAND_360, brand].find(c => c && luminance(c) > 0.3)
		if (light) raw.BLURPLE_36 = raw.BLURPLE_19 = raw.BLURPLE_14 = light
		filled++
	}

	let greys = 0
	const skippedGreys: string[] = []
	for (const [name, value] of Object.entries(aliasRawColors(raw))) {
		const theirs = original(name)
		// No original to compare with means Discord doesn't have this step; the engine skips it.
		if (!theirs) continue
		const before = luminance(theirs)
		const after = luminance(value)
		if ((before > 0.5 && after < 0.25) || (before < 0.1 && after > 0.5)) {
			skippedGreys.push(name)
			continue
		}
		raw[name] = value
		greys++
	}

	const mapped = new Set(LEGACY_SEMANTIC.map(([name]) => name))
	const gone = Object.keys(semantic).filter(
		name => own.has(name) && known.size > 0 && !known.has(name) && !mapped.has(name),
	)
	// Phones have no hover, so a hover colour never had anything to draw on mobile.
	const desktop = (name: string) => NOT_ON_MOBILE.has(name) || name.endsWith('_HOVER')
	const unplaced = gone.filter(name => !desktop(name))
	const desktopOnly = gone.filter(desktop)
	return { filled, greys, skippedGreys, unplaced, desktopOnly, unreadable }
}
