/**
 * The bubble colours, resolved from the theme in use the way char-counter's badge does it
 * (`Tokens.default.internal.resolveSemanticColor(ThemeStore.theme, Tokens.default.colors[name])`).
 * Each colour tries a chain of token names and ends in a fixed fallback; which one won is passed on
 * so the settings page can show it. Colours go to native as `#RRGGBBAA` strings, never ints.
 *
 * `valenced.*` is only read inside functions (docs/coding-rules.md rule 1).
 */

import { Tokens } from '@valenced/discord/common/tokens'
import { Stores } from '@valenced/discord/flux'
import { reportError } from '../../../shared/report'

/** The `Tokens` export is typed `any` upstream; this is the part read here. */
interface TokensModule {
	default: {
		colors: Record<string, object | undefined>
		internal: { resolveSemanticColor(theme: string, color: object): string }
	}
}

interface ThemeStoreLike {
	theme: string
	addChangeListener?(fn: () => void): void
	removeChangeListener?(fn: () => void): void
}

type ColorKey = 'ownBg' | 'ownText' | 'otherBg' | 'otherText'

export type BubbleColors = Record<ColorKey, string> & {
	/** Which token each colour came from, or `fallback`. */
	tokens: Record<ColorKey, string>
	/** The chat background, for the ring around reaction badges. */
	chatBg?: string
}

const CHAINS: Record<ColorKey, [string[], string]> = {
	ownBg: [['BUTTON_FILLED_BRAND_BACKGROUND', 'BACKGROUND_BRAND'], '#5865F2FF'],
	ownText: [['WHITE'], '#FFFFFFFF'],
	// Solid surfaces only: BACKGROUND_MOD_NORMAL is a 16% overlay, so the chat background showed
	// through others' bubbles. These are the message box's own colour.
	// The highest surface tier first: the message box's colour (0.1.x-0.3.0) is only a step above
	// the chat background in themes that build their surfaces from one colour (Galaxy), so their
	// bubbles nearly vanished. liftedFromBackground then makes sure of a gap.
	otherBg: [
		[
			'BACKGROUND_SURFACE_HIGHEST',
			'BACKGROUND_SURFACE_HIGHER',
			'MOBILE_CHATINPUT_BACKGROUND_DEFAULT',
			'BACKGROUND_SURFACE_HIGH',
			'CARD_BACKGROUND_DEFAULT',
		],
		'#383A40FF',
	],
	otherText: [['TEXT_DEFAULT'], '#DBDEE1FF'],
}

/** What the chat is drawn on, to keep their bubbles apart from it. */
const CHAT_BACKGROUND: [string[], string] = [
	['CHANNEL_BACKGROUND_DEFAULT', 'BACKGROUND_PRIMARY', 'BACKGROUND_BASE_LOW'],
	'#313338FF',
]
/** Their bubble against the chat background: at least this contrast ratio. */
const MIN_BUBBLE_CONTRAST = 1.35

function hex2(n: number): string {
	return Math.max(0, Math.min(255, Math.round(n)))
		.toString(16)
		.padStart(2, '0')
		.toUpperCase()
}

/** `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()` or `rgba()` to `#RRGGBBAA`; undefined otherwise. */
export function toHex8(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined
	const s = value.trim()
	const short = /^#([0-9a-f]{3})$/i.exec(s)
	if (short) {
		const [r, g, b] = short[1].split('')
		return `#${r}${r}${g}${g}${b}${b}FF`.toUpperCase()
	}
	const long = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s)
	if (long) return `#${long[1]}${long[2] ?? 'FF'}`.toUpperCase()
	const rgb =
		/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(
			s,
		)
	if (rgb) {
		const alpha = rgb[4]
		const a = !alpha
			? 255
			: alpha.endsWith('%')
				? (Number.parseFloat(alpha) / 100) * 255
				: Number.parseFloat(alpha) * 255
		return `#${hex2(+rgb[1])}${hex2(+rgb[2])}${hex2(+rgb[3])}${hex2(a)}`
	}
	return undefined
}

function themeStore(): ThemeStoreLike | undefined {
	return Stores.ThemeStore as unknown as ThemeStoreLike | undefined
}

/** One colour: the first token in the chain that exists and resolves, else the fallback. */
function resolve([names, fallback]: [string[], string]): [string, string] {
	try {
		const tokens: TokensModule = Tokens
		const theme = themeStore()?.theme
		if (theme) {
			for (const name of names) {
				const color = tokens.default.colors[name]
				if (!color) continue
				const hex = toHex8(
					tokens.default.internal.resolveSemanticColor(theme, color),
				)
				if (hex) return [hex, name]
			}
		}
	} catch (error) {
		reportError('[SpeechBubbles] colour lookup failed:', error)
	}
	return [fallback, 'fallback']
}

export function resolveColors(): BubbleColors {
	const tokens = {} as Record<ColorKey, string>
	const colors = {} as Record<ColorKey, string>
	for (const key of Object.keys(CHAINS) as ColorKey[]) {
		const [hex, token] = resolve(CHAINS[key])
		colors[key] = hex
		tokens[key] = token
	}
	const [chat] = resolve(CHAT_BACKGROUND)
	const lifted = liftedFromBackground(colors.otherBg, chat)
	if (lifted !== colors.otherBg) {
		colors.otherBg = lifted
		tokens.otherBg = `${tokens.otherBg} (lifted)`
	}
	return { ...colors, tokens, chatBg: chat }
}

/** `#RRGGBBAA` mixed [t] of the way toward [target] (`#RRGGBB`), alpha kept. */
function mix(hex: string, target: string, t: number): string {
	const a = Number.parseInt(hex.slice(1, 7), 16)
	const b = Number.parseInt(target.slice(1, 7), 16)
	const ch = (shift: number) =>
		hex2(((a >> shift) & 0xff) * (1 - t) + ((b >> shift) & 0xff) * t)
	return `#${ch(16)}${ch(8)}${ch(0)}${hex.slice(7, 9) || 'FF'}`
}

function contrast(a: string, b: string): number {
	const la = luminance(a)
	const lb = luminance(b)
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/**
 * Their bubble colour moved away from the chat background when the two are too close: toward
 * white on a dark background, toward black on a light one, in small steps. A see-through
 * background (a picture theme, like Galaxy's chat) gets one step regardless, since what shows
 * through can't be measured here.
 */
export function liftedFromBackground(bubble: string, chat: string): string {
	const dark = luminance(chat) < 0.5
	const toward = dark ? '#FFFFFF' : '#000000'
	const alpha = Number.parseInt(chat.slice(7, 9) || 'FF', 16)
	let out = bubble
	if (alpha < 0x80) return mix(out, toward, 0.1)
	for (let i = 0; i < 5 && contrast(out, chat) < MIN_BUBBLE_CONTRAST; i++) {
		out = mix(out, toward, 0.08)
	}
	return out
}

/** sRGB channel to linear light (WCAG 2 relative luminance). */
function channel(c: number): number {
	const s = c / 255
	return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
	const n = Number.parseInt(hex.replace('#', '').slice(0, 6), 16)
	return (
		0.2126 * channel((n >> 16) & 0xff) +
		0.7152 * channel((n >> 8) & 0xff) +
		0.0722 * channel(n & 0xff)
	)
}

const LIGHT_TEXT = '#FFFFFFFF'
const DARK_TEXT = '#111214FF'

/** White text wins unless it would be hard to read on [bg] (WCAG ratio under 3); then near-black. */
const MIN_WHITE_CONTRAST = 3

/**
 * White, unless white on [bg] falls under [MIN_WHITE_CONTRAST]; then near-black. Picking whichever
 * ratio was higher (0.1.x-0.3.0) turned mid-tone colours black, since near-black edges out white
 * on a purple like #9573C9, which no messaging app does.
 */
export function textFor(bg: string): string {
	const onWhite = 1.05 / (luminance(bg) + 0.05)
	return onWhite >= MIN_WHITE_CONTRAST ? LIGHT_TEXT : DARK_TEXT
}

/** `#RRGGBB(AA)` to `#RRGGBB`, for the colour picker and the settings. */
export function toHex6(hex: string): string {
	return hex.slice(0, 7).toUpperCase()
}

interface ColorSettings {
	colors: 'theme' | 'swapped' | 'own'
	ownColor: string
	otherColor: string
}

/**
 * The colours in use: the theme's, the theme's swapped, or the user's own ("My own": text picked
 * by contrast; a side left empty keeps the theme's colour).
 */
export function effectiveColors(s: ColorSettings): BubbleColors {
	const colors = resolveColors()
	if (s.colors === 'own') {
		const own = toHex8(s.ownColor) ?? colors.ownBg
		const other = toHex8(s.otherColor) ?? colors.otherBg
		return {
			ownBg: own,
			ownText: textFor(own),
			otherBg: other,
			otherText: textFor(other),
			tokens: {
				ownBg: toHex8(s.ownColor) ? 'custom' : colors.tokens.ownBg,
				ownText: 'contrast',
				otherBg: toHex8(s.otherColor) ? 'custom' : colors.tokens.otherBg,
				otherText: 'contrast',
			},
			chatBg: colors.chatBg,
		}
	}
	return s.colors === 'swapped'
		? { ...swapColors(colors), chatBg: colors.chatBg }
		: colors
}

/** What the chat is drawn on, `#RRGGBBAA`, for the settings preview. */
export function chatBackground(): string {
	return resolve(CHAT_BACKGROUND)[0]
}

/** `#RRGGBB(AA)` to hue (0-360), saturation and value (0-1). */
function toHsv(hex: string): [number, number, number] {
	const n = Number.parseInt(hex.slice(1, 7), 16)
	const r = ((n >> 16) & 0xff) / 255
	const g = ((n >> 8) & 0xff) / 255
	const b = (n & 0xff) / 255
	const max = Math.max(r, g, b)
	const d = max - Math.min(r, g, b)
	let h = 0
	if (d > 0) {
		if (max === r) h = 60 * (((g - b) / d + 6) % 6)
		else if (max === g) h = 60 * ((b - r) / d + 2)
		else h = 60 * ((r - g) / d + 4)
	}
	return [h, max === 0 ? 0 : d / max, max]
}

/** Hue, saturation and value back to `#RRGGBB` plus [alpha] (two hex digits). */
function fromHsv(h: number, sat: number, v: number, alpha = 'FF'): string {
	const c = v * sat
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
	const m = v - c
	const [r1, g1, b1] =
		h < 60
			? [c, x, 0]
			: h < 120
				? [x, c, 0]
				: h < 180
					? [0, c, x]
					: h < 240
						? [0, x, c]
						: h < 300
							? [x, 0, c]
							: [c, 0, x]
	return `#${hex2((r1 + m) * 255)}${hex2((g1 + m) * 255)}${hex2((b1 + m) * 255)}${alpha}`
}

/**
 * "Colour shifts as you scroll", as native works it out (Config.scrollEnds): from [base], a top
 * colour lighter and a touch toward cyan, a bottom one deeper and a touch toward violet, then the
 * colour [t] of the way down (0 the top of the screen, 1 the bottom). [strength] is the setting's
 * 20 to 100. `#RRGGBB` out.
 */
export function scrollShade(base: string, strength: number, t: number): string {
	const k = Math.min(Math.max(strength / 50, 0.2), 2)
	const [h, sat, v] = toHsv(toHex6(base))
	const clamp = (x: number) => Math.min(Math.max(x, 0), 1)
	const shift = (dh: number, ds: number, dv: number) =>
		fromHsv(
			sat > 0.08 ? (((h + dh * k) % 360) + 360) % 360 : h,
			clamp(sat + ds * k),
			clamp(v + dv * k),
		)
	const top = shift(-12, -0.1, 0.12)
	const bottom = shift(10, 0.06, -0.14)
	return toHex6(mix(top, bottom, Math.min(Math.max(t, 0), 1)))
}

/**
 * "Colour per person", generated: their bubble colour turned to one of eight hues. Brightness
 * stays; a grey gets a little saturation so the hues show at all.
 */
export function personColor(base: string, slot: number): string {
	const [h, sat, v] = toHsv(base)
	return fromHsv((h + slot * 45) % 360, Math.max(sat, 0.35), v, base.slice(7, 9) || 'FF')
}

/** "Dark colours only": brightness capped and a little colour kept, so white text reads on it. */
export function darkened(hex: string): string {
	const [h, sat, v] = toHsv(hex)
	return fromHsv(h, Math.max(sat, 0.3), Math.min(v, 0.42), hex.slice(7, 9) || 'FF')
}

/**
 * "Taken from your theme": the hues next to the theme's own, on both sides, 24 to 72 degrees off
 * (0.5.36's palette, which the user liked best). The closest is 24 off, so nobody looks like your
 * accent. Greens and cyans are left out unless the theme itself is one (on a purple theme they
 * looked foreign, 2026-11-06); blues and violets stay.
 *
 * Telling people apart is native's job: it gives each person their own slot (by id) unless that
 * colour is close to one of the people just before them in the chat (SpeechBubblesPlugin.bgFor).
 */
const NEIGHBOUR_OFFSETS = [24, -24, 40, -40, 56, -56, 72, -72]
/** Hues counted as green to cyan, left out of a theme that isn't green or cyan itself. */
const GREEN_FROM = 80
const GREEN_TO = 200
/** Below this saturation a colour counts as grey and has no hue to build on. */
const GREY = 0.15
const PERSON_COLOURS = 8

const greenish = (h: number) => h >= GREEN_FROM && h <= GREEN_TO

/** The theme's own hue: the accent's, else their bubble's, else the chat background's. */
function themeHue(
	colors: Pick<BubbleColors, 'ownBg' | 'otherBg' | 'chatBg'>,
): number | undefined {
	for (const c of [colors.ownBg, colors.otherBg, colors.chatBg ?? chatBackground()]) {
		const [h, sat] = toHsv(c)
		if (sat >= GREY) return h
	}
	return undefined
}

/**
 * The colours "Colour per person" hands out, `#RRGGBBAA`.
 *
 * - Taken from your theme (default): the neighbouring hues above, about as colourful and bright as
 *   your accent, then lifted off the chat background like their bubble. A grey theme has no hue,
 *   so it gets the soft shades.
 * - Soft shades: their bubble colour turned in eight hue steps (0.5.31).
 * - From their profile picture is worked out on the phone (SpeechBubblesPlugin.avatarColor); the
 *   soft shades are its fallback.
 *
 * Each is darkened with "Dark colours only". Text is picked per colour (textFor, native's too).
 */
export function personPalette(
	s: { personPalette: string; personDark: boolean },
	colors: Pick<BubbleColors, 'ownBg' | 'otherBg' | 'chatBg'>,
): string[] {
	const centre = s.personPalette === 'theme' ? themeHue(colors) : undefined
	let out: string[]
	if (centre !== undefined) {
		const [, accentSat, accentV] = toHsv(colors.ownBg)
		const sat = Math.min(Math.max(accentSat * 0.9, 0.4), 0.8)
		const v = Math.min(Math.max(accentV * 0.92, 0.45), 0.9)
		const chat = colors.chatBg ?? chatBackground()
		out = NEIGHBOUR_OFFSETS.map(d => (centre + d + 360) % 360)
			.filter(h => greenish(centre) || !greenish(h))
			.map(h => liftedFromBackground(fromHsv(h, sat, v), chat))
	} else {
		out = Array.from({ length: PERSON_COLOURS }, (_, i) => personColor(colors.otherBg, i))
	}
	return s.personDark ? out.map(darkened) : out
}

/** Whether the theme has a hue for "Taken from your theme" to build on (for the settings page). */
export function themeHasHue(
	colors: Pick<BubbleColors, 'ownBg' | 'otherBg' | 'chatBg'>,
): boolean {
	return themeHue(colors) !== undefined
}

/**
 * A profile picture's main colour made into a bubble colour, as native does it (toneAvatar):
 * saturation and brightness kept within readable limits, then darkened with "Dark colours only".
 * Only the settings preview uses this one.
 */
export function avatarBubble(hex: string, dark: boolean): string {
	const [h, sat, v] = toHsv(hex)
	const out = fromHsv(h, Math.min(Math.max(sat, 0.35), 0.8), Math.min(Math.max(v, 0.35), 0.8))
	return dark ? darkened(out) : out
}

/** Others get the accent colours and you get the surface ones; tokens move with their colours. */
export function swapColors(c: BubbleColors): BubbleColors {
	return {
		ownBg: c.otherBg,
		ownText: c.otherText,
		otherBg: c.ownBg,
		otherText: c.ownText,
		tokens: {
			ownBg: c.tokens.otherBg,
			ownText: c.tokens.otherText,
			otherBg: c.tokens.ownBg,
			otherText: c.tokens.ownText,
		},
	}
}

/** Calls `fn` whenever the theme changes. Returns the unsubscribe. */
export function onThemeChange(fn: () => void): () => void {
	try {
		const store = themeStore()
		if (store?.addChangeListener) {
			store.addChangeListener(fn)
			return () => store.removeChangeListener?.(fn)
		}
		reportError('[SpeechBubbles] ThemeStore has no change listener')
	} catch (error) {
		reportError('[SpeechBubbles] theme listener failed:', error)
	}
	return () => {}
}
