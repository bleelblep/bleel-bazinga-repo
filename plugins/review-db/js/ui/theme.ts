// Theme-token colours for the few things this plugin draws itself. Same resolver as
// hide-servers-drawer/js/ui/theme.ts (see docs/plugin-design-language.md 3.5).

import { Stores } from '@valenced/discord/flux'
import * as commonTokens from '@valenced/discord/common/tokens'

function tokenTables(): any {
	try {
		return (commonTokens as any)?.Tokens
	} catch {
		return undefined
	}
}

/** The theme actually in use ('dark', 'light', 'midnight', 'darker', 'ash', …). */
function currentTheme(): string {
	try {
		const store = (Stores as any).ThemeStore
		const theme = store?.theme ?? store?.getTheme?.()
		return typeof theme === "string" ? theme : "dark"
	} catch {
		return "dark"
	}
}

/**
 * A colour by token name. Raw names resolve directly; semantic names resolve through the current
 * theme to a raw name. Anything unresolvable falls back, so a renamed token costs one wrong shade
 * rather than an invisible bar.
 */
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

