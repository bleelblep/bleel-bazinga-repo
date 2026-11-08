// The same helper as Hide Servers' ui/theme.ts: Discord's colour tokens for the theme in use.
// Classic Revenge needed a two-tier colour system: a flat `colors` map plus a separate
// "semantic colour" resolver (@vendetta/ui's semanticColors + colorResolver.resolveSemanticColor).
//
// Valenced keeps both tiers, in one place. Confirmed live on 348.1:
//
//   valenced.discord.common.tokens.Tokens.RawColor       // { WHITE: '#ffffff', NEUTRAL_73: '#…' }
//   valenced.discord.common.tokens.Tokens.SemanticColor  // { BORDER_SUBTLE: { dark: { raw, opacity }, … } }
//
// This read `valenced.discord.common.Tokens` -- capital T, which does not exist. Behind `?.` and a
// fallback it failed silently, so every colour here was its hardcoded default and none tracked the
// user's theme: BACKGROUND_BASE_LOWEST resolves to #121214 on the 'darker' theme, not #1e1f22.

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
