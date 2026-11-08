// Theme colours for the views this plugin draws itself (settings design guide §3.5). Copied from
// Hide Servers' `js/ui/theme.ts`, the reference copy. Call while rendering, never at module scope.

import * as commonTokens from '@valenced/discord/common/tokens'
import { Stores } from '@valenced/discord/flux'

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
		return typeof theme === 'string' ? theme : 'dark'
	} catch {
		return 'dark'
	}
}

/**
 * A colour by token name. Raw names resolve directly; semantic names resolve through the current
 * theme. Anything unresolvable falls back to the dark-theme hex it replaced.
 */
export function token(name: string, fallback: string): string {
	const tables = tokenTables()
	if (!tables) return fallback

	try {
		const raw = tables.RawColor?.[name]
		if (typeof raw === 'string') return raw

		const semantic = tables.SemanticColor?.[name]
		if (semantic) {
			const entry = semantic[currentTheme()] ?? semantic.darker ?? semantic.dark
			const resolved = entry?.raw ? tables.RawColor?.[entry.raw] : undefined
			if (typeof resolved === 'string') return resolved
		}
	} catch {
		/* fall through to the fallback */
	}

	return fallback
}
