/**
 * Discord's colour tokens, resolved for the theme in use (Ash, Dark, Onyx, Light).
 *
 * Read from Discord's token tables at call time, since the theme can change while the plugin runs.
 * Every colour takes the dark-theme hex it replaced as a fallback, so a renamed token costs one
 * wrong shade on a light theme rather than an invisible control.
 */

import { Stores } from '@valenced/discord/flux'
import * as commonTokens from '@valenced/discord/common/tokens'

function tokenTables(): any {
	try {
		return (commonTokens as any)?.Tokens
	} catch {
		return undefined
	}
}

function currentTheme(): string {
	try {
		const store = (Stores as any).ThemeStore
		const theme = store?.theme ?? store?.getTheme?.()
		return typeof theme === "string" ? theme : "dark"
	} catch {
		return "dark"
	}
}

/** A colour by token name: raw names directly, semantic names through the current theme. */
export function token(name: string, fallback: string): string {
	const tables = tokenTables()
	if (!tables) return fallback
	try {
		const raw = tables.RawColor?.[name]
		if (typeof raw === "string") return raw
		const semantic = tables.SemanticColor?.[name]
		if (semantic) {
			const entry = semantic[currentTheme()] ?? semantic.darker ?? semantic.dark
			const resolved = entry?.raw ? tables.RawColor?.[entry.raw] : undefined
			if (typeof resolved === "string") return resolved
		}
	} catch {
		/* fall through to the hardcoded fallback */
	}
	return fallback
}

