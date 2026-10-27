// Adapted from Themes+ by nexpid (nexpid/RevengePlugins `src/plugins/themes-plus/src/stuff/resolveColor.ts`,
// CC BY 4.0), with changes; see NOTICE.md.
/**
 * Themes+'s colour values (`PLUS-VERSION-0.md`, "The Color System"). Pure, for the tests.
 *
 * - `"#f0f"` or `"#ff00ff"`: every Discord theme.
 * - `["#dark", "#light", "#midnight"]`: dark is required and also covers Dark and Ash; a missing
 *   light value leaves light mode alone; midnight falls back to dark.
 * - `"RC_<raw>"` / `"SC_<semantic>"`: one of Discord's colours, looked up by the caller.
 */

import type { PlusColor } from '../types'

export interface PlusLookups {
	raw?: (name: string) => string | undefined
	semantic?: (name: string) => string | undefined
}

function single(value: unknown, lookups: PlusLookups): string | undefined {
	if (typeof value !== 'string') return undefined
	const text = value.trim()
	if (text.startsWith('RC_')) return lookups.raw?.(text.slice(3))
	if (text.startsWith('SC_')) return lookups.semantic?.(text.slice(3))
	const short = /^#([0-9a-f]{3})$/i.exec(text)
	if (short) return `#${[...short[1]].map(c => c + c).join('')}`.toLowerCase()
	if (/^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(text)) return text.toLowerCase()
	return undefined
}

/** The colour for `theme` (Discord's ThemeStore value: `light`, `dark`, `darker`, `midnight`). */
export function resolvePlusColor(color: PlusColor | undefined, theme: string, lookups: PlusLookups = {}): string | undefined {
	if (color == null) return undefined
	if (!Array.isArray(color)) return single(color, lookups)
	const [dark, light, midnight] = color
	if (theme === 'light') return single(light, lookups)
	if (theme === 'midnight') return single(midnight, lookups) ?? single(dark, lookups)
	return single(dark, lookups)
}

/** `#rrggbb[aa]` as the signed ARGB int Android views take, e.g. a chat row's `gutterColor`. */
export function hexToArgbInt(hex: string): number | undefined {
	const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex)
	if (!m) return undefined
	const rgb = parseInt(m[1], 16)
	const alpha = m[2] ? parseInt(m[2], 16) : 0xff
	return ((alpha << 24) | rgb) | 0
}
