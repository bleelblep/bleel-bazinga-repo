/**
 * Chat backgrounds for Themes API themes. Written when Revenge's Themes API was colours only.
 * Valenced's has its own `background` field on a theme, drawn by `valenced.api.themes`, so a theme
 * that sets both may get two backgrounds. Kept as it was at the user's request (2026-10-26). A theme plugin registers its themes' backgrounds here; Theme Backgrounds
 * (plugins/theme-backgrounds) draws the one for the theme in use, if the user has it on.
 *
 * Kept on `globalThis` so it's one list across plugins (each plugin bundles its own copy of this file),
 * keyed the way the Themes API keys a pick: plugin id, group id, theme id.
 */

export interface ThemeBackground {
	url: string
	/** React Native `blurRadius`, as in classic Vendetta themes. */
	blur?: number
	/** How strongly the image shows, 0-1 (classic `alpha`); the chat's colour fills the rest. */
	opacity?: number
}

const KEY = '__bleelblepThemeBackgrounds'

function registry(): Map<string, ThemeBackground> {
	const g = globalThis as any
	if (!(g[KEY] instanceof Map)) g[KEY] = new Map<string, ThemeBackground>()
	return g[KEY]
}

export const themeKey = (plugin: string, group: string, theme: string) => `${plugin}\u0000${group}\u0000${theme}`

/** Registers [background] for one theme; returns an unregister. */
export function registerThemeBackground(plugin: string, group: string, theme: string, background: ThemeBackground): () => void {
	const key = themeKey(plugin, group, theme)
	registry().set(key, background)
	return () => {
		if (registry().get(key) === background) registry().delete(key)
	}
}

export function registeredBackground(plugin: string, group: string, theme: string): ThemeBackground | undefined {
	return registry().get(themeKey(plugin, group, theme))
}
