/**
 * Discord's colour tokens, resolved for the theme in use (Ash, Dark, Onyx, Light).
 *
 * Same helper as hide-servers-drawer's ui/theme.ts; see docs/plugin-design-language.md §3.5.
 * Every colour takes the dark-theme hex it replaced as a fallback, so a renamed token costs one
 * wrong shade on a light theme rather than an invisible control.
 */

import * as commonTokens from "@valenced/discord/common/tokens";
import { Stores } from "@valenced/discord/flux";

function tokenTables(): any {
	try {
		return (commonTokens as any)?.Tokens;
	} catch {
		return undefined;
	}
}

function currentTheme(): string {
	try {
		const store = (Stores as any).ThemeStore;
		const theme = store?.theme ?? store?.getTheme?.();
		return typeof theme === "string" ? theme : "dark";
	} catch {
		return "dark";
	}
}

/** A colour by token name: raw names directly, semantic names through the current theme. */
export function token(name: string, fallback: string): string {
	const tables = tokenTables();
	if (!tables) return fallback;
	try {
		const raw = tables.RawColor?.[name];
		if (typeof raw === "string") return raw;
		const semantic = tables.SemanticColor?.[name];
		if (semantic) {
			const entry =
				semantic[currentTheme()] ?? semantic.darker ?? semantic.dark;
			const resolved = entry?.raw ? tables.RawColor?.[entry.raw] : undefined;
			if (typeof resolved === "string") return resolved;
		}
	} catch {
		/* fall through to the hardcoded fallback */
	}
	return fallback;
}

/**
 * A hex colour with an alpha byte, for faint washes and borders (`withAlpha(c, '1f')`). A colour in
 * any other form (rgb(), a named colour) comes back as `fallback`, which should already carry alpha.
 */
export function withAlpha(
	colour: string,
	alpha: string,
	fallback: string,
): string {
	const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(
		colour?.trim?.() ?? "",
	)?.[1];
	if (!hex) return fallback;
	const full =
		hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex.slice(0, 6);
	return `#${full}${alpha}`;
}
