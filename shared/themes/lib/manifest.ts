import { fromAliucord, isAliucordTheme } from './aliucord'
import { applyAndroidAlphaKeys, normalizeToHex } from './color'
import type { ColorDefinition, ThemeManifest, ThemeType } from '../types'

/**
 * Discord renamed its background tokens after Vendetta's spec 2 was written. A spec-2 theme that
 * only sets the old name still colours the new one, as it did in classic.
 */
const SPEC2_FALLBACKS: Record<string, string> = {
	BG_BACKDROP: 'BACKGROUND_FLOATING',
	BG_BASE_PRIMARY: 'BACKGROUND_PRIMARY',
	BG_BASE_SECONDARY: 'BACKGROUND_SECONDARY',
	BG_BASE_TERTIARY: 'BACKGROUND_SECONDARY_ALT',
	BG_MOD_FAINT: 'BACKGROUND_MODIFIER_ACCENT',
	BG_MOD_STRONG: 'BACKGROUND_MODIFIER_ACCENT',
	BG_MOD_SUBTLE: 'BACKGROUND_MODIFIER_ACCENT',
	BG_SURFACE_OVERLAY: 'BACKGROUND_FLOATING',
	BG_SURFACE_OVERLAY_TMP: 'BACKGROUND_FLOATING',
	BG_SURFACE_RAISED: 'BACKGROUND_MOBILE_PRIMARY',
}

/** The checks classic made before installing, plus a name so the list has something to show. */
export function validateManifest(json: any): json is ThemeManifest {
	if (typeof json !== 'object' || json === null) return false
	if (typeof json.name !== 'string' || !json.name.trim()) return false
	// Most Vendetta themes leave `spec` out; classic treated those as spec 2.
	const spec = json.spec ?? 2
	if (spec === 2) return true
	return spec === 3 && typeof json.main === 'object' && json.main !== null
}

/**
 * A GitHub page link (`github.com/<user>/<repo>/blob/<ref>/<path>`) as its raw file, which is how
 * Aliucord themes are usually shared. Any other link is returned as it is.
 */
export function rawLink(url: string): string {
	const blob = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+?)(?:\?.*)?$/i.exec(url)
	return blob ? `https://raw.githubusercontent.com/${blob[1]}/${blob[2]}/${blob[3]}` : url
}

/**
 * A downloaded theme file as a manifest: Revenge and Vendetta themes as they are (Themes+ themes are
 * Vendetta themes with a `plus` section), Aliucord themes converted (`lib/aliucord.ts`).
 */
export function readManifest(json: any, options: ReadOptions = {}): ThemeManifest {
	if (isAliucordTheme(json)) {
		if (options.aliucord === false) throw new Error('Aliucord themes are turned off in Themes > Compatibility')
		return fromAliucord(json).manifest
	}
	if (!validateManifest(json)) throw new Error("That link isn't a Revenge, Vendetta, Themes+ or Aliucord theme")
	json.spec ??= 2
	return json
}

export interface ReadOptions {
	/** False refuses Aliucord themes (the Compatibility switch). */
	aliucord?: boolean
}

export async function fetchManifest(url: string, options: ReadOptions = {}): Promise<ThemeManifest> {
	let json: any
	try {
		const response = await fetch(rawLink(url), { cache: 'no-store' } as RequestInit)
		if (!response.ok) throw new Error(`HTTP ${response.status}`)
		json = await response.json()
	} catch (error) {
		throw new Error(`Couldn't download a theme from that link (${(error as Error)?.message ?? error})`)
	}
	return readManifest(json, options)
}

/**
 * Reduces a manifest to the colours to apply.
 *
 * `prefersLight` is the user's own Discord theme, used when `override` is `auto`: a spec-2 theme
 * carries a dark and a light value for each colour, so Auto follows the theme the user picked in
 * Discord rather than always taking dark as classic did.
 *
 * `rawColor` resolves a raw colour name that a spec-3 semantic entry points at.
 */
export function parseManifest(
	manifest: ThemeManifest,
	override: ThemeType,
	prefersLight: boolean,
	rawColor: (name: string) => string | undefined,
): ColorDefinition {
	const semantic: ColorDefinition['semantic'] = {}
	const raw: Record<string, string> = {}

	if (manifest.spec === 3) {
		const main = manifest.main
		const declared = main.type ?? (manifest.type === 'light' ? 'light' : 'dark')
		const type = override === 'auto' ? declared : override

		for (const [key, value] of Object.entries(main.raw ?? {})) {
			const hex = normalizeToHex(value)
			if (hex) raw[key] = hex
		}
		const resolveName = (name: string) => raw[name] ?? rawColor(name)

		for (const [key, value] of Object.entries(main.semantic ?? {})) {
			if (typeof value === 'string') {
				const hex = value.startsWith('#') ? normalizeToHex(value) : resolveName(value)
				if (hex) semantic[key] = { value: hex, opacity: 1 }
			} else if (value && typeof value === 'object') {
				// Classic's naming: `raw` carries a literal colour, `color` names a raw colour.
				const hex = value.type === 'raw' ? normalizeToHex(value.value) : resolveName(value.value)
				if (hex) semantic[key] = { value: hex, opacity: value.opacity ?? 1 }
			}
		}

		applyAndroidAlphaKeys(raw)
		return { type, semantic, raw, background: main.background }
	}

	const type = override === 'auto' ? (prefersLight ? 'light' : 'dark') : override
	const index = type === 'light' ? 1 : 0

	for (const [key, values] of Object.entries(manifest.semanticColors ?? {})) {
		if (!Array.isArray(values)) continue
		// A missing light value falls back to Discord's own light colour, as in classic. Borrowing
		// the dark value would put a dark surface under light-theme text.
		const hex = normalizeToHex(values[index] || undefined)
		if (hex) semantic[key] = { value: hex, opacity: 1 }
	}
	for (const [key, value] of Object.entries(manifest.rawColors ?? {})) {
		const hex = normalizeToHex(value)
		if (hex) raw[key] = hex
	}
	for (const [name, old] of Object.entries(SPEC2_FALLBACKS)) {
		if (!semantic[name] && semantic[old]) semantic[name] = semantic[old]
	}

	applyAndroidAlphaKeys(raw)
	const bg = manifest.background
	return {
		type,
		semantic,
		raw,
		background: bg?.url ? { url: bg.url, blur: bg.blur, opacity: bg.alpha } : undefined,
	}
}
