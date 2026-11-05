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

/**
 * "Colour per person": their bubble colour turned to one of eight hues, as native does it
 * (SpeechBubblesPlugin.personColor). Brightness stays; a grey gets a little saturation.
 */
export function personColor(base: string, slot: number): string {
	const n = Number.parseInt(base.slice(1, 7), 16)
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
	const sat = Math.max(max === 0 ? 0 : d / max, 0.35)
	h = (h + slot * 45) % 360
	const c = max * sat
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
	const m = max - c
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
	return `#${hex2((r1 + m) * 255)}${hex2((g1 + m) * 255)}${hex2((b1 + m) * 255)}${base.slice(7, 9) || 'FF'}`
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
