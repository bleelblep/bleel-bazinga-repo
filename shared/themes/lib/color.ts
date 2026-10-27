/**
 * Colour parsing without chroma-js, which classic used and Valenced doesn't expose (porting
 * rule 4). Everything comes out as `#rrggbb` or `#rrggbbaa`, the two forms React Native reads.
 */

import { processColor } from 'react-native'

function hex2(n: number): string {
	return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
}

/** `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, or anything React Native's `processColor` knows. */
export function normalizeToHex(input: unknown): string | undefined {
	if (typeof input !== 'string') return undefined
	const value = input.trim()

	const short = /^#([0-9a-f]{3,4})$/i.exec(value)
	if (short) return `#${[...short[1]].map(c => c + c).join('')}`.toLowerCase()
	if (/^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)) return value.toLowerCase()

	// Names, rgb(), hsl(): React Native parses them to an ARGB int on Android.
	try {
		const processed = processColor(value)
		if (typeof processed !== 'number') return undefined
		const n = processed >>> 0
		const alpha = (n >>> 24) & 0xff
		const rgb = `#${hex2((n >>> 16) & 0xff)}${hex2((n >>> 8) & 0xff)}${hex2(n & 0xff)}`
		return alpha === 0xff ? rgb : `${rgb}${hex2(alpha)}`
	} catch {
		return undefined
	}
}

/** The colour at `alpha` (0-1) times its own alpha. */
export function withAlpha(hex: string, alpha: number): string {
	const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex)
	if (!m) return hex
	const own = m[2] ? parseInt(m[2], 16) / 255 : 1
	const a = Math.max(0, Math.min(1, own * alpha))
	return a >= 1 ? `#${m[1]}` : `#${m[1]}${hex2(a * 255)}`
}

/**
 * Keys Discord's Android build reads that are alpha variants of other raw colours. Classic derived
 * them so a theme that sets `BLACK` also moves `BLACK_ALPHA_60`.
 */
const ANDROID_ALPHA_KEYS: Record<string, [string, number]> = {
	BLACK_ALPHA_60: ['BLACK', 0.6],
	BRAND_NEW_360_ALPHA_20: ['BRAND_360', 0.2],
	BRAND_NEW_360_ALPHA_25: ['BRAND_360', 0.25],
	BRAND_NEW_500_ALPHA_20: ['BRAND_500', 0.2],
	PRIMARY_DARK_500_ALPHA_20: ['PRIMARY_500', 0.2],
	PRIMARY_DARK_700_ALPHA_60: ['PRIMARY_700', 0.6],
	STATUS_GREEN_500_ALPHA_20: ['GREEN_500', 0.2],
	STATUS_RED_500_ALPHA_20: ['RED_500', 0.2],
}

export function applyAndroidAlphaKeys(raw: Record<string, string>) {
	for (const [key, [source, alpha]] of Object.entries(ANDROID_ALPHA_KEYS)) {
		if (raw[source]) raw[key] = withAlpha(raw[source], alpha)
	}
}
