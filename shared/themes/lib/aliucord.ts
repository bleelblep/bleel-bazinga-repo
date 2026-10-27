/**
 * Aliucord themes (the Themer plugin by Vendicated, `Vendicated/AliucordPlugins` `Themer/`),
 * converted into a Bunny spec-3 theme (one set of colours, dark or light) so the rest of this plugin needs nothing new.
 *
 * Aliucord ran on Discord's old Java app, so its themes recolour that app's Android colour
 * resources (`primary_dark_600`, `brand_new_500`) and icons (`ic_channel_text`). Those names are
 * gone, and the colour ramps they were on moved, so they can't be matched to today's colours by
 * number. Each name goes to the colour that does the same *job* today instead, using what Aliucord's
 * own docs say each name painted (`Aliucord/documentation` `theme-dev/README.md`). Most targets are
 * Vendetta's old names, which `lib/legacy.ts` already spreads over what Discord 348+ draws; a few
 * are current names set directly.
 *
 * Research and the theme corpus this table came from: docs/debugging/themes-aliucord-and-themesplus.md.
 *
 * Pure: no React Native, so the tests can convert the whole corpus in Node.
 */

import type { BunnyThemeManifest, FontManifest, ThemeOrigin } from '../types'

/** What a converted theme carries, beyond the manifest. */
export interface AliucordConversion {
	manifest: BunnyThemeManifest
	/** How many of the theme's colours (full and simple; icon colours aside) found a place. */
	placed: number
	total: number
}

interface Target {
	semantic?: string[]
	raw?: string[]
}

/**
 * Full colour names, most used first (a 197-theme corpus: the first 40 cover 81% of every colour
 * set). Where two names would set the same target, the one listed first wins, so the more specific
 * name goes first. Names with no current job are left out and listed on the theme page.
 */
const COLORS: Array<[string, Target]> = [
	// Text
	['primary_dark_200', { semantic: ['TEXT_NORMAL'] }],
	['primary_dark_400', { semantic: ['TEXT_MUTED', 'CHANNEL_TEXT_AREA_PLACEHOLDER'] }],
	['primary_dark_330', { semantic: ['TEXT_MUTED'] }],
	['primary_dark_360', { semantic: ['CHANNELS_DEFAULT'] }],
	['primary_dark_300', { semantic: ['INTERACTIVE_NORMAL'] }],
	['white_500', { semantic: ['HEADER_PRIMARY', 'INTERACTIVE_ACTIVE'] }],
	['uikit_settings_item_text_color_dark', { semantic: ['HEADER_SECONDARY'] }],
	['link', { semantic: ['TEXT_LINK'] }],
	['link_500', { semantic: ['TEXT_LINK'] }],
	// Surfaces
	['primary_dark_600', { semantic: ['BACKGROUND_PRIMARY', 'BACKGROUND_MOBILE_PRIMARY'] }],
	['primary_dark_630', { semantic: ['BACKGROUND_SECONDARY', 'BACKGROUND_MOBILE_SECONDARY', 'MOBILE_TYPING_INDICATOR_BACKGROUND_DEFAULT'] }],
	['primary_dark_660', { semantic: ['CHANNELTEXTAREA_BACKGROUND'] }],
	['primary_dark_700', { semantic: ['BACKGROUND_TERTIARY'] }],
	['primary_dark_800', { semantic: ['BACKGROUND_FLOATING'] }],
	['primary_700', { semantic: ['EMBED_BACKGROUND'] }],
	['primary_630', { semantic: ['BACKGROUND_CODE'] }],
	['primary_300', { semantic: ['SPOILER_HIDDEN_BACKGROUND'] }],
	['white_800', { semantic: ['MOBILE_TOAST_BACKGROUND_DEFAULT'] }],
	// Themer's own simple background also paints this one.
	['dark_grey_2', { semantic: ['BACKGROUND_PRIMARY', 'BACKGROUND_MOBILE_PRIMARY'] }],
	// Mentions
	['brand_500_alpha_20', { semantic: ['MENTION_BACKGROUND'] }],
	['brand_new_260', { semantic: ['MENTION_FOREGROUND'] }],
	// Accent: Discord's brand ramp, which legacy.ts carries over to today's blurple.
	['brand_new_360', { raw: ['BRAND_360'] }],
	['brand_new_500', { raw: ['BRAND_500'] }],
	['brand_new_560', { raw: ['BRAND_560'] }],
	['brand_new', { raw: ['BRAND_500'] }],
	['brand_500', { raw: ['BRAND_500'] }],
	['brand_360', { raw: ['BRAND_360'] }],
	['brand', { raw: ['BRAND_500'] }],
	['uikit_btn_bg_color_selector_brand', { raw: ['BRAND_500'] }],
	// Status colours
	['uikit_btn_bg_color_selector_red', { raw: ['RED_400'] }],
	['uikit_btn_bg_color_selector_green', { raw: ['GREEN_360'] }],
	['status_green', { raw: ['GREEN_360'] }],
	['status_green_500', { raw: ['GREEN_360'] }],
	['status_yellow_500', { raw: ['YELLOW_300'] }],
	['status_red', { raw: ['RED_400'] }],
]

/** Every other `brand_new_<n>` / `brand_<n>` goes to `BRAND_<n>`, Discord's same step. */
const BRAND_STEP = /^brand_(?:new_)?(\d{3})$/

/**
 * Themer's "simple" colours: one value painting a group of old names (`Constants.kt`). They come
 * after the full names, so a theme's own full name wins, as it does in Themer.
 */
const SIMPLE: Record<string, Target> = {
	background: { semantic: ['BACKGROUND_PRIMARY', 'BACKGROUND_MOBILE_PRIMARY', 'BACKGROUND_FLOATING'] },
	background_secondary: {
		semantic: [
			'BACKGROUND_SECONDARY',
			'BACKGROUND_MOBILE_SECONDARY',
			'BACKGROUND_TERTIARY',
			'CHANNELTEXTAREA_BACKGROUND',
			'BACKGROUND_MODIFIER_SELECTED',
		],
	},
	accent: { semantic: ['TEXT_LINK'], raw: ['BRAND_360', 'BRAND_500', 'BRAND_560'] },
	mention_highlight: { semantic: ['BACKGROUND_MENTIONED'] },
	input_background: { semantic: ['CHANNELTEXTAREA_BACKGROUND'] },
	active_channel: { semantic: ['BACKGROUND_MODIFIER_SELECTED'] },
}

/** Simple colours with no place here, and why, for the theme page. */
const SIMPLE_DROPPED: Record<string, string> = {
	statusbar: 'status bar colour',
	blocked_bg: 'blocked message background',
}

/** Icons whose colour has a current twin. Every other icon colour is dropped. */
const TINTS: Record<string, Target> = {
	ic_channel_text: { semantic: ['CHANNEL_ICON'] },
	drawable_overlay_channels_selected_dark: { semantic: ['BACKGROUND_MODIFIER_SELECTED'] },
}

/** Old font names (Discord's Java app) onto gg sans weights (`lib/fonts.ts`). */
const FONT_FAMILIES: Record<string, string[]> = {
	whitney_medium: ['ggsans-Normal'],
	ginto_regular: ['ggsans-Normal'],
	whitney_semibold: ['ggsans-Medium', 'ggsans-Semibold'],
	ginto_medium: ['ggsans-Medium', 'ggsans-Semibold'],
	whitney_bold: ['ggsans-Bold', 'ggsans-ExtraBold'],
	ginto_bold: ['ggsans-Bold', 'ggsans-ExtraBold'],
}
const ALL_WEIGHTS = ['ggsans-Normal', 'ggsans-Medium', 'ggsans-Semibold', 'ggsans-Bold', 'ggsans-ExtraBold']

const hex2 = (n: number) => n.toString(16).padStart(2, '0')

/**
 * An Aliucord colour (a signed 32-bit ARGB int, sometimes written as a string) as `#rrggbb` or
 * `#rrggbbaa`. Undefined for anything else.
 */
export function argbToHex(value: unknown): string | undefined {
	const n = typeof value === 'number' ? value : typeof value === 'string' && /^-?\d+$/.test(value.trim()) ? Number(value) : NaN
	if (!Number.isInteger(n) || n < -0x80000000 || n > 0xffffffff) return undefined
	const u = n >>> 0
	const alpha = u >>> 24
	const rgb = `#${hex2((u >>> 16) & 0xff)}${hex2((u >>> 8) & 0xff)}${hex2(u & 0xff)}`
	return alpha === 0xff ? rgb : `${rgb}${hex2(alpha)}`
}

/** Whether a background colour is a light one (relative luminance over 0.5). Undefined = dark. */
function isLight(hex: string | undefined): boolean {
	const m = hex && /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex)
	if (!m) return false
	const [r, g, b] = [m[1], m[2], m[3]].map(part => {
		const c = parseInt(part, 16) / 255
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
	})
	return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5
}

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

/** An Aliucord theme in Themer's current format: a `manifest` object and a colour section. */
function isCurrentFormat(json: Record<string, unknown>): boolean {
	if (!isObject(json.manifest) || typeof json.name === 'string') return false
	return ['colors', 'simple_colors', 'drawable_tints', 'drawableTints'].some(key => isObject(json[key]))
}

/** Keys of Themer's first, flat format (`Legacy.kt`), e.g. `simple_bg_color`, `color_brand_new`. */
const LEGACY_KEY = /^(simple_(accent|bg|bg_secondary)_color|mention_highlight|(active_channel|statusbar|input_background)_color|color_.+|drawablecolor_.+|background_url)$/

/** Themer's first format: flat keys, no `manifest`, and none of a Vendetta theme's sections. */
function isLegacyFormat(json: Record<string, unknown>): boolean {
	if ('manifest' in json || 'semanticColors' in json || 'rawColors' in json || 'main' in json) return false
	return Object.keys(json).some(key => LEGACY_KEY.test(key))
}

/** An Aliucord theme, in either of Themer's formats. */
export function isAliucordTheme(json: unknown): boolean {
	return isObject(json) && (isCurrentFormat(json) || isLegacyFormat(json))
}

/** Themer's first format rewritten into its current one, as Themer itself does (`Legacy.kt`). */
function fromLegacyFormat(json: Record<string, unknown>): Record<string, any> {
	const manifest: Record<string, unknown> = {}
	const background: Record<string, unknown> = {}
	const fonts: Record<string, unknown> = {}
	const simple: Record<string, unknown> = {}
	const colors: Record<string, unknown> = {}
	const tints: Record<string, unknown> = {}
	const simpleKeys: Record<string, string> = {
		simple_accent_color: 'accent',
		simple_bg_color: 'background',
		simple_bg_secondary_color: 'background_secondary',
		mention_highlight: 'mention_highlight',
		active_channel_color: 'active_channel',
		statusbar_color: 'statusbar',
		input_background_color: 'input_background',
	}
	for (const [key, value] of Object.entries(json)) {
		if (['author', 'version', 'name', 'license', 'updater'].includes(key)) manifest[key] = value
		else if (key === 'background_url') background.url = value
		else if (key === 'background_transparency') background.overlay_alpha = value
		else if (key === 'font') fonts['*'] = value
		else if (simpleKeys[key]) simple[simpleKeys[key]] = value
		else if (key.startsWith('color_')) colors[key.slice('color_'.length)] = value
		else if (key.startsWith('drawablecolor_')) tints[key.slice('drawablecolor_'.length)] = value
		else if (key.startsWith('font_')) fonts[key.slice('font_'.length)] = value
	}
	return { manifest, background, fonts, simple_colors: simple, colors, drawable_tints: tints }
}

/** The theme's fonts as a font of its own, or undefined when it sets none we can use. */
function fontOf(fonts: unknown, name: string): FontManifest | undefined {
	if (!isObject(fonts)) return undefined
	const main: Record<string, string> = {}
	const url = (value: unknown) => (typeof value === 'string' && /^https?:\/\//i.test(value) ? value : undefined)
	const everywhere = url(fonts['*'])
	if (everywhere) for (const family of ALL_WEIGHTS) main[family] = everywhere
	for (const [old, families] of Object.entries(FONT_FAMILIES)) {
		const link = url(fonts[old])
		if (link) for (const family of families) main[family] = link
	}
	return Object.keys(main).length ? { spec: 1, name: `${name} font`, main } : undefined
}

/** Converts an Aliucord theme. Throws if it isn't one (check with `isAliucordTheme` first). */
export function fromAliucord(input: any): AliucordConversion {
	if (!isAliucordTheme(input)) throw new Error("That isn't an Aliucord theme")
	const json = isCurrentFormat(input) ? input : fromLegacyFormat(input)
	const info = json.manifest
	const name = typeof info.name === 'string' && info.name.trim() ? info.name.trim() : 'Aliucord theme'
	const semantic: Record<string, string> = {}
	const raw: Record<string, string> = {}
	const notes: string[] = []
	let placed = 0
	let total = 0

	// Themer paints the same colours whatever Discord theme is on, so a converted theme is one set of
	// colours (spec 3), dark or light by its own background.
	const put = (target: Target, hex: string): boolean => {
		let used = false
		for (const key of target.semantic ?? []) {
			if (semantic[key]) continue
			semantic[key] = hex
			used = true
		}
		for (const key of target.raw ?? []) {
			if (raw[key]) continue
			raw[key] = hex
			used = true
		}
		return used
	}

	const colors: Record<string, unknown> = isObject(json.colors) ? json.colors : {}
	const unplaced: string[] = []
	const known = new Set(COLORS.map(([old]) => old))
	for (const [old, target] of COLORS) {
		if (!(old in colors)) continue
		const hex = argbToHex(colors[old])
		if (!hex) continue
		put(target, hex)
	}
	for (const [old, value] of Object.entries(colors)) {
		const hex = argbToHex(value)
		if (!hex) continue
		total++
		if (known.has(old)) {
			placed++
			continue
		}
		const step = BRAND_STEP.exec(old)
		if (step) {
			put({ raw: [`BRAND_${step[1]}`] }, hex)
			placed++
		} else unplaced.push(old)
	}

	const simple: Record<string, unknown> = isObject(json.simple_colors) ? json.simple_colors : {}
	const droppedSimple: string[] = []
	for (const [key, value] of Object.entries(simple)) {
		const hex = argbToHex(value)
		if (!hex) continue
		total++
		const target = SIMPLE[key]
		if (target) {
			put(target, hex)
			placed++
		} else droppedSimple.push(SIMPLE_DROPPED[key] ?? key)
	}

	const tints: Record<string, unknown> = isObject(json.drawable_tints)
		? json.drawable_tints
		: isObject(json.drawableTints)
			? json.drawableTints
			: {}
	let droppedTints = 0
	for (const [icon, value] of Object.entries(tints)) {
		const hex = argbToHex(value)
		if (!hex) continue
		const target = TINTS[icon]
		if (target) put(target, hex)
		else droppedTints++
	}

	const manifest: BunnyThemeManifest = {
		spec: 3,
		name,
		description: typeof info.description === 'string' ? info.description : undefined,
		authors: typeof info.author === 'string' && info.author.trim() ? [{ name: info.author.trim() }] : undefined,
		main: { type: isLight(semantic.BACKGROUND_PRIMARY) ? 'light' : 'dark', semantic, raw },
	}

	const bg = isObject(json.background) ? json.background : undefined
	if (bg && typeof bg.url === 'string' && /^https?:\/\//i.test(bg.url)) {
		// Themer darkens the picture with a black layer of `overlay_alpha` (0-255, 150 by default).
		const overlay = typeof bg.overlay_alpha === 'number' ? Math.min(255, Math.max(0, bg.overlay_alpha)) : 150
		manifest.main.background = {
			url: bg.url,
			opacity: Math.round((1 - overlay / 255) * 100) / 100,
			blur: typeof bg.blur_radius === 'number' && bg.blur_radius > 0 ? bg.blur_radius : undefined,
		}
	}

	if (unplaced.length) notes.push(`${unplaced.length} old ${unplaced.length === 1 ? 'colour' : 'colours'}: ${unplaced.join(', ')}`)
	if (droppedSimple.length) notes.push(`The ${droppedSimple.join(' and ')}`)
	if (droppedTints) notes.push(`${droppedTints} icon ${droppedTints === 1 ? 'colour' : 'colours'}: Discord no longer has those icons`)
	if (isObject(json.raws) && Object.keys(json.raws).length) notes.push('Replaced sounds and files')

	const origin: ThemeOrigin = {
		format: 'aliucord',
		version: typeof info.version === 'string' ? info.version : undefined,
		notes,
		font: fontOf(json.fonts, name),
	}
	manifest.origin = origin
	return { manifest, placed, total }
}

/** Every colour name the converter can write, so the tests can check Discord still has each one. */
export function aliucordTargets(): { semantic: string[]; raw: string[] } {
	const all = [...COLORS.map(([, target]) => target), ...Object.values(SIMPLE), ...Object.values(TINTS)]
	return {
		semantic: [...new Set(all.flatMap(target => target.semantic ?? []))],
		raw: [...new Set(all.flatMap(target => target.raw ?? []))],
	}
}
