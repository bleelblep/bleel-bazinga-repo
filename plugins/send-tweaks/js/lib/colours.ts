/**
 * Discord colours by token name, resolved for the theme in use.
 *
 * Discord resolves a semantic colour through `Tokens.SemanticColor[name][theme].raw` ->
 * `Tokens.RawColor[raw]` (hide-servers-drawer's `ui/theme.ts`, confirmed on 348.1). Themes written in
 * by the Themes plugin go through the same tables, so they are followed too. Read at call time, never
 * cached, so a theme switch needs no reload.
 */

import * as commonTokens from '@valenced/discord/common/tokens'
import { Stores } from '@valenced/discord/flux'
import type { DiscordModules } from '@valenced/discord/types'

/** Discord's colour tables: raw hex by name, and semantic names that point at a raw one per theme. */
interface TokenTables {
	RawColor?: Record<string, unknown>
	SemanticColor?: Record<
		string,
		Record<string, { raw?: string } | undefined> | undefined
	>
}

function tables(): TokenTables | undefined {
	try {
		return commonTokens.Tokens as TokenTables | undefined
	} catch {
		return undefined
	}
}

function currentTheme(): string | undefined {
	try {
		const store = Stores.ThemeStore as
			| DiscordModules.Flux.Store<{ theme?: unknown; getTheme?(): unknown }>
			| undefined
		const theme = store?.theme ?? store?.getTheme?.()
		return typeof theme === 'string' ? theme : undefined
	} catch {
		return undefined
	}
}

/** `#rrggbb` for a raw or semantic token, or undefined when it doesn't resolve. */
export function tokenHex(name: string): string | undefined {
	try {
		const t = tables()
		let raw: unknown = t?.RawColor?.[name]
		if (typeof raw !== 'string') {
			const semantic = t?.SemanticColor?.[name]
			const theme = currentTheme()
			const entry = (theme ? semantic?.[theme] : undefined) ?? semantic?.dark
			raw = entry?.raw ? t?.RawColor?.[entry.raw] : undefined
		}
		if (typeof raw === 'string' && /^#[0-9a-f]{6}/i.test(raw))
			return raw.slice(0, 7).toLowerCase()
	} catch {
		/* unresolved */
	}
	return undefined
}

export function token(name: string, fallback: string): string {
	return tokenHex(name) ?? fallback
}
