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

export const barBackground = () => token("BACKGROUND_BASE_LOWEST", "#1e1f22")
export const separator = () => token("BORDER_SUBTLE", "#2b2d31")
export const selectedPill = () => token("WHITE", "#ffffff")
export const iconInactive = () => token("MOBILE_GUILDBAR_ICON_DEFAULT", "#949ba4")
export const iconActive = () => token("WHITE", "#ffffff")
export const mentionBadge = () => token("STATUS_DANGER", "#ed4245")
export const unreadDot = () => token("WHITE", "#ffffff")
export const folderTint = (color?: number | null) => {
	if (color == null) return token("BACKGROUND_BRAND", "#5865f2")
	return `#${(color >>> 0).toString(16).padStart(6, "0").slice(-6)}`
}

// Stock's selected-icon fill: the Home button morphs from a circle with a neutral background
// to a rounded square filled with the theme's brand/accent color when selected. Reusing
// BACKGROUND_BRAND rather than a hardcoded hex is what makes this track the user's actual
// installed theme instead of always rendering Discord's default blurple.
export const selectedFill = () => token("BACKGROUND_BRAND", "#5865f2")

// Only used by ContextMenu.tsx, the fallback path for when the native action sheet (see
// lib/guildMenu.ts) isn't available -- kept theme-aware for the same reason as everything
// else here, but expect it to be reached rarely.
export const sheetBackground = () => token("MOBILE_ACTIONSHEET_BACKGROUND", "#2b2d31")
export const sheetBackdrop = () => "rgba(0,0,0,0.55)" // not a semantic token on any build seen so far
export const textMuted = () => token("TEXT_MUTED", "#949ba4")
export const textNormal = () => token("TEXT_DEFAULT", "#dbdee1")
export const dangerText = () => token("STATUS_DANGER", "#f23f42")
export const pressedOverlay = () => token("TABLEROW_BACKGROUND_PRESSED", "#35373c")
export const avatarFallback = () => token("MOBILE_GUILDBAR_ICON_BACKGROUND_DEFAULT", token("BACKGROUND_ACCENT", "#4e5058"))
