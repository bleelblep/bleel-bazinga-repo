/**
 * Completes a theme so every one of Discord's colours follows it, not just the ones it names.
 *
 * Discord 348.5 has 409 semantic colours; a typical older theme names a few dozen, and even after
 * the name and grey-ramp shims (`legacy.ts`) Catppuccin Frappé Mauve reaches about 170. The rest
 * still show Discord's own greys and blurple. No name table can close that gap, because most of
 * the 409 have no old equivalent at all. But every one of them is drawn from a raw colour, and
 * the raw colours fall into two kinds:
 *
 * - **Greys** (`NEUTRAL_*`, `PLUM_*`, `PRIMARY_*`, the grey behind every `OPACITY_*`). Most of the
 *   409. The theme tells us, through the colours it does set, where Discord's greys go: Discord's
 *   `#1a1a1e` chat surface became Frappé's `#303446`, Discord's `#efeff1` text became `#c6d0f5`,
 *   and so on. Those pairs, ordered by how light Discord's colour is, form a ramp; every other
 *   grey is placed on it by its own lightness, blending between the two nearest pairs.
 * - **Colours** (blurple, blue, red, yellow, green, pink…). Each is matched to the theme's colour
 *   of the same kind, found the same way (Discord's red became the theme's red). It takes that
 *   colour's hue and saturation and keeps its own lightness relative to the pair, so Discord's
 *   darker and lighter reds stay darker and lighter.
 *
 * The result is written as raw colours only, never over anything the theme set itself, and each
 * keeps the alpha of the colour it replaces (the `OPACITY_*` family carries alpha in the value).
 * A kind of colour the theme gives no example of is left as Discord's, and reported.
 */

interface Rgb {
	r: number
	g: number
	b: number
}
interface Hsl {
	h: number
	s: number
	l: number
}

function parse(hex: string): { rgb: Rgb; alpha: string } | undefined {
	const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i.exec(hex)
	if (!m) return undefined
	return {
		rgb: { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) },
		alpha: m[4] ?? '',
	}
}

function toHex({ r, g, b }: Rgb): string {
	const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
	return `#${c(r)}${c(g)}${c(b)}`
}

function toHsl({ r, g, b }: Rgb): Hsl {
	const [R, G, B] = [r / 255, g / 255, b / 255]
	const max = Math.max(R, G, B)
	const min = Math.min(R, G, B)
	const l = (max + min) / 2
	if (max === min) return { h: 0, s: 0, l }
	const d = max - min
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
	const h =
		max === R ? ((G - B) / d + (G < B ? 6 : 0)) / 6 : max === G ? ((B - R) / d + 2) / 6 : ((R - G) / d + 4) / 6
	return { h: h * 360, s, l }
}

function fromHsl({ h, s, l }: Hsl): Rgb {
	const L = Math.max(0, Math.min(1, l))
	const S = Math.max(0, Math.min(1, s))
	if (S === 0) return { r: L * 255, g: L * 255, b: L * 255 }
	const q = L < 0.5 ? L * (1 + S) : L + S - L * S
	const p = 2 * L - q
	const hue = (t: number) => {
		let x = t
		if (x < 0) x += 1
		if (x > 1) x -= 1
		if (x < 1 / 6) return p + (q - p) * 6 * x
		if (x < 1 / 2) return q
		if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
		return p
	}
	const H = h / 360
	return { r: hue(H + 1 / 3) * 255, g: hue(H) * 255, b: hue(H - 1 / 3) * 255 }
}

/** Perceived lightness, 0-1 (Rec. 709 luma on gamma-encoded values: cheap and ordered well enough). */
function lightness({ r, g, b }: Rgb): number {
	return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

/** Discord's greys are faintly blue-violet; anything this unsaturated counts as grey. */
const GREY_SATURATION = 0.16

type Kind = 'grey' | 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'brand' | 'purple' | 'pink'

function kindOf(rgb: Rgb): Kind {
	const { h, s, l } = toHsl(rgb)
	if (s < GREY_SATURATION || l < 0.04 || l > 0.97) return 'grey'
	if (h < 15 || h >= 345) return 'red'
	if (h < 40) return 'orange'
	if (h < 65) return 'yellow'
	if (h < 165) return 'green'
	if (h < 200) return 'teal'
	if (h < 222) return 'blue'
	if (h < 255) return 'brand' // Discord's blurple sits around 235
	if (h < 290) return 'purple'
	return 'pink'
}

interface Pair {
	from: Rgb
	to: Rgb
}

/** Where a grey of Discord's lands, blending between the two theme pairs around its lightness. */
function onRamp(ramp: Array<{ at: number; to: Rgb }>, rgb: Rgb): Rgb {
	const at = lightness(rgb)
	if (at <= ramp[0].at) return shade(ramp[0].to, at - ramp[0].at)
	const last = ramp[ramp.length - 1]
	if (at >= last.at) return shade(last.to, at - last.at)
	for (let i = 1; i < ramp.length; i++) {
		const hi = ramp[i]
		if (at > hi.at) continue
		const lo = ramp[i - 1]
		const t = hi.at === lo.at ? 0 : (at - lo.at) / (hi.at - lo.at)
		return {
			r: lo.to.r + (hi.to.r - lo.to.r) * t,
			g: lo.to.g + (hi.to.g - lo.to.g) * t,
			b: lo.to.b + (hi.to.b - lo.to.b) * t,
		}
	}
	return last.to
}

/** The colour made lighter or darker by `delta` (in lightness), keeping hue and saturation. */
function shade(rgb: Rgb, delta: number): Rgb {
	const hsl = toHsl(rgb)
	return fromHsl({ ...hsl, l: hsl.l + delta })
}

/** A Discord colour moved onto the theme's colour of the same kind, keeping its relative shade. */
function onKind(pairs: Pair[], rgb: Rgb): Rgb {
	const at = lightness(rgb)
	let best = pairs[0]
	for (const pair of pairs) {
		if (Math.abs(lightness(pair.from) - at) < Math.abs(lightness(best.from) - at)) best = pair
	}
	const target = toHsl(best.to)
	const delta = toHsl(rgb).l - toHsl(best.from).l
	return fromHsl({ h: target.h, s: target.s, l: target.l + delta })
}

/** WCAG contrast ratio of two `#rrggbb` colours, 1 to 21. */
function contrast(a: string, b: string): number {
	const lum = (hex: string) => {
		const { r, g, b: blue } = parse(hex)?.rgb ?? { r: 0, g: 0, b: 0 }
		const [R, G, B] = [r, g, blue].map(v => {
			const c = v / 255
			return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
		})
		return 0.2126 * R + 0.7152 * G + 0.0722 * B
	}
	const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
	return (hi + 0.05) / (lo + 0.05)
}

/** Text or icon colour -> the filled control it is drawn on (348.5 names). */
const ON_FILL: Array<[string, string]> = [
	['CONTROL_PRIMARY_TEXT_DEFAULT', 'CONTROL_PRIMARY_BACKGROUND_DEFAULT'],
	['CONTROL_CRITICAL_PRIMARY_TEXT_DEFAULT', 'CONTROL_CRITICAL_PRIMARY_BACKGROUND_DEFAULT'],
	['CONTROL_CONNECTED_TEXT_DEFAULT', 'CONTROL_CONNECTED_BACKGROUND_DEFAULT'],
	['BADGE_TEXT_BRAND', 'BADGE_BACKGROUND_BRAND'],
	['CHAT_INPUT_SEND_BUTTON_ICON_ACTIVE_TINT', 'CHAT_INPUT_SEND_BUTTON_ACTIVE_BACKGROUND'],
	['CHECKBOX_ICON_ACTIVE', 'CHECKBOX_BACKGROUND_SELECTED_DEFAULT'],
	['SWITCH_THUMB_ICON_ACTIVE', 'SWITCH_THUMB_BACKGROUND_SELECTED_DEFAULT'],
	['MOBILE_VOICE_MESSAGE_RECORDING_LOCK_ICON_ACTIVE', 'MOBILE_VOICE_MESSAGE_RECORDING_LOCK_BACKGROUND_ACTIVE'],
	['STATUS_POSITIVE_TEXT', 'STATUS_POSITIVE_BACKGROUND'],
	['STATUS_WARNING_TEXT', 'STATUS_WARNING_BACKGROUND'],
	['CONTROL_EXPRESSIVE_TEXT_DEFAULT', 'CONTROL_EXPRESSIVE_BACKGROUND_DEFAULT'],
	['CONTROL_OVERLAY_PRIMARY_TEXT_DEFAULT', 'CONTROL_OVERLAY_PRIMARY_BACKGROUND_DEFAULT'],
]

export interface PaletteResult {
	/** Raw colours added. */
	added: number
	/** Text/icon colours on filled controls changed so they stay readable. */
	readable: number
	/** Kinds of Discord colour the theme had no example of, left as Discord's. */
	unmatched: Kind[]
	/** Discord colours (by semantic name) that now follow the theme, of how many there are. */
	covered: number
	total: number
}

/**
 * Fills `raw` in place. `rows` is Discord's `SemanticColor` table, `original` reads Discord's own
 * raw colour, `reference` is the Discord theme the theme is built on (`darker` or `light`).
 */
export function completePalette(
	semantic: Record<string, { value: string; opacity: number }>,
	raw: Record<string, string>,
	rows: Record<string, any>,
	original: (name: string) => string | undefined,
	reference: string,
): PaletteResult {
	// What the theme set itself, before anything here adds to it.
	const own = new Set(Object.keys(semantic))

	// 1. Pairs: what the theme did to Discord's colours, wherever both sides are solid colours.
	const pairs: Pair[] = []
	const addPair = (from: string | undefined, to: string | undefined) => {
		const a = from && parse(from)
		const b = to && parse(to)
		if (!a || !b || a.alpha || b.alpha) return
		pairs.push({ from: a.rgb, to: b.rgb })
	}
	for (const [name, own] of Object.entries(semantic)) {
		const base = rows[name]?.[reference]
		if (!base?.raw || own.opacity < 0.99 || (base.opacity ?? 1) < 0.99) continue
		addPair(original(base.raw), own.value)
	}
	for (const [name, value] of Object.entries(raw)) addPair(original(name), value)

	// 2. The grey ramp, one point per lightness (averaged where several pairs agree).
	const byLevel = new Map<number, Rgb[]>()
	const coloured = new Map<Kind, Pair[]>()
	for (const pair of pairs) {
		const kind = kindOf(pair.from)
		if (kind === 'grey') {
			const at = Math.round(lightness(pair.from) * 200) / 200
			byLevel.set(at, [...(byLevel.get(at) ?? []), pair.to])
		} else {
			coloured.set(kind, [...(coloured.get(kind) ?? []), pair])
		}
	}
	const ramp = [...byLevel]
		.map(([at, tos]) => ({
			at,
			to: {
				r: tos.reduce((n, c) => n + c.r, 0) / tos.length,
				g: tos.reduce((n, c) => n + c.g, 0) / tos.length,
				b: tos.reduce((n, c) => n + c.b, 0) / tos.length,
			},
		}))
		.sort((a, b) => a.at - b.at)

	// 3. Every raw colour Discord draws this theme's semantic colours with, that nobody set.
	const needed = new Set<string>()
	for (const row of Object.values<any>(rows)) {
		const name = row?.[reference]?.raw
		if (typeof name === 'string') needed.add(name)
	}

	let added = 0
	const unmatched = new Set<Kind>()
	for (const name of needed) {
		if (raw[name]) continue
		const theirs = original(name)
		const parsed = theirs && parse(theirs)
		if (!parsed) continue
		// Fully transparent stays transparent.
		if (parsed.alpha === '00') continue
		const kind = kindOf(parsed.rgb)
		let mapped: Rgb | undefined
		if (kind === 'grey') {
			if (ramp.length) mapped = onRamp(ramp, parsed.rgb)
		} else {
			const matches = coloured.get(kind)
			if (matches?.length) mapped = onKind(matches, parsed.rgb)
		}
		if (!mapped) {
			unmatched.add(kind)
			continue
		}
		raw[name] = toHex(mapped) + parsed.alpha
		added++
	}

	// 4. Text and icons drawn on a filled control. Discord draws them white; the ramp moves that
	// white to the theme's text colour, which on a pale accent (Catppuccin's mauve) is unreadable.
	// Each pair the theme didn't set itself gets the most readable of: the theme's darkest and
	// lightest ramp colours, and Discord's own colour.
	let readable = 0
	const colourOf = (name: string): string | undefined => {
		const own = semantic[name]?.value
		if (own) return own.slice(0, 7)
		const base = rows[name]?.[reference]
		const value = base?.raw ? (raw[base.raw] ?? original(base.raw)) : undefined
		return value?.slice(0, 7)
	}
	const candidates = [ramp[0]?.to, ramp[ramp.length - 1]?.to].filter(Boolean).map(c => toHex(c as Rgb))
	for (const [fg, bg] of ON_FILL) {
		if (own.has(fg) || !rows[fg] || !rows[bg]) continue
		const fill = colourOf(bg)
		const current = colourOf(fg)
		if (!fill || !current || contrast(current, fill) >= 4.5) continue
		const discords = original(rows[fg]?.[reference]?.raw)?.slice(0, 7)
		const options = [...candidates, discords, current].filter((c): c is string => !!c && !!parse(c))
		const best = options.reduce((a, b) => (contrast(b, fill) > contrast(a, fill) ? b : a))
		if (best !== current) {
			semantic[fg] = { value: best, opacity: 1 }
			readable++
		}
	}

	// 5. Coverage: rows whose colour now comes from the theme (named, or its raw colour set), with
	// fully transparent ones counted as done since there is nothing to colour.
	let covered = 0
	let total = 0
	for (const [name, row] of Object.entries<any>(rows)) {
		const base = row?.[reference]
		if (!base?.raw) continue
		total++
		const theirs = original(base.raw)
		if (semantic[name] || raw[base.raw] || (theirs && parse(theirs)?.alpha === '00')) covered++
	}

	return { added, readable, unmatched: [...unmatched], covered, total }
}
