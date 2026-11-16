// A copy of Hide Servers' token() (docs/settings-design-guide.md §3.5). Call while rendering only.

import * as commonTokens from '@valenced/discord/common/tokens'
import { Stores } from '@valenced/discord/flux'

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
		return typeof theme === 'string' ? theme : 'dark'
	} catch {
		return 'dark'
	}
}

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
		/* fall through */
	}
	return fallback
}
