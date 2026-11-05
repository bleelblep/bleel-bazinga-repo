/// <reference types="@valenced/types/hidden" />
import * as hiddenPlugins from '@valenced/plugins/_'

/**
 * What is installed, when Valenced will say.
 *
 * ## Why this needs Developer Mode
 *
 * The plugin API Valenced gives a plugin exposes no list of other plugins -- `plugins` on the
 * unscoped API is `constants` and a version formatter, nothing more
 * (`lib/plugins/src/apis/plugins.ts` in revenge-bundle-next). The registry itself, `pList`, is only
 * reachable through the hidden API, which the internal "Developer Mode" plugin
 * (`valenced.api.hidden`) attaches as `unscoped.hidden` -- and that is off by default on release
 * builds and switched on from Valenced's settings.
 *
 * So discovery is optional by construction. When the hidden API is there, this lists everything.
 * When it is not, `listInstalled` returns undefined and the pages say why, while the hub itself
 * carries on working from the snapshots in storage (see `Entry` in `types.ts`).
 *
 * The manifest declares `valenced.api.hidden` as an **optional** dependency. That documents the
 * relationship and gets the hub started after Developer Mode when both are on, without making
 * Developer Mode a requirement -- a required dependency would keep it switched on permanently,
 * and while it is on the hidden API is visible to every installed plugin, not just this one.
 *
 * Read lazily, at render time, never at module scope (coding rule 1) -- and because Developer
 * Mode can be switched on mid-session, which a value captured at start would miss.
 */

export const AI_CORE_ID = 'bleelblep.ai-core'
export const OWN_ID = 'bleelblep.plugin-hub'
export const MY_PREFIX = 'bleelblep.'

export interface Installed {
	id: string
	name: string
	author?: string
	icon?: string
	description?: string
	/** Has a settings page, and so a route the hub can open. */
	hasSettings: boolean
	enabled: boolean
	/** Depends on AI Core, or is AI Core. */
	ai: boolean
	/** Uses AI Core only if it is there: listed on both the Hub and the AI Hub. */
	aiOptional: boolean
	mine: boolean
}

export function internals(): any {
	try {
		return (hiddenPlugins as any)
	} catch {
		// The hidden API is built from lazy properties; a failure resolving one is "not available".
		return undefined
	}
}

export function discoveryAvailable(): boolean {
	return internals()?.pList instanceof Map
}

export function listInstalled(): Installed[] | undefined {
	const internal = internals()
	const list: Map<string, any> | undefined = internal?.pList
	if (!(list instanceof Map)) return undefined

	const isEnabled = (plugin: any): boolean => {
		try {
			return typeof internal.isPluginEnabled === 'function'
				? !!internal.isPluginEnabled(plugin)
				: true
		} catch {
			return true
		}
	}

	const out: Installed[] = []
	for (const plugin of list.values()) {
		const manifest = plugin?.manifest
		const id: unknown = manifest?.id
		if (typeof id !== 'string' || id === OWN_ID) continue

		out.push({
			id,
			name: typeof manifest.name === 'string' ? manifest.name : id,
			author: typeof manifest.author === 'string' ? manifest.author : undefined,
			icon: typeof manifest.icon === 'string' ? manifest.icon : undefined,
			description:
				typeof manifest.description === 'string'
					? manifest.description
					: undefined,
			hasSettings: typeof plugin.SettingsComponent === 'function',
			enabled: isEnabled(plugin),
			ai: id === AI_CORE_ID || !!manifest.dependencies?.[AI_CORE_ID],
			aiOptional: id !== AI_CORE_ID && !!manifest.dependencies?.[AI_CORE_ID]?.optional,
			mine: id.startsWith(MY_PREFIX),
		})
	}

	return out.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Whether AI Core is running, for the AI Hub row.
 *
 * AI Core sets `globalThis.__bleelblepAiCore` from its `start` and clears it on stop, so this works
 * without Developer Mode. With Developer Mode on, the live list is asked as well, which also covers
 * an AI Core older than the marker.
 */
export function aiCoreRunning(): boolean {
	if ((globalThis as any).__bleelblepAiCore === true) return true
	return !!listInstalled()?.some(plugin => plugin.id === AI_CORE_ID && plugin.enabled)
}

/** Belongs on the AI Hub page: AI Core itself, or a plugin that depends on it. */
export function usesAiCore(plugin: { id: string; ai: boolean }): boolean {
	return plugin.ai
}

/**
 * AI Core's own record of a plugin that depends on it, and the route of that plugin's AI screen if
 * it gave one (`setSettingsRoute`). Read from a lookup AI Core sets on start, so it works without
 * Developer Mode; undefined when AI Core is not running or the plugin is not one of its dependents.
 */
export function aiCoreDependent(id: string): { route?: string } | undefined {
	try {
		const lookup = (globalThis as any).__bleelblepAiCoreDependent
		return typeof lookup === 'function' ? lookup(id) : undefined
	} catch {
		return undefined
	}
}

/** Where the AI Hub should open a plugin: its AI screen when it named one, otherwise its settings. */
export function aiRouteOf(id: string): string | undefined {
	const route = aiCoreDependent(id)?.route
	return typeof route === 'string' && route ? route : undefined
}

type Classified = { id: string; ai: boolean; aiOptional?: boolean }

/**
 * Whether a plugin is listed on the Hub (`ai` false) or the AI Hub (`ai` true).
 *
 * - Plugins that need AI Core (Catch-up, TL;DR, AI Core itself): the AI Hub only.
 * - Plugins that use it only if it is there (Send Tweaks, Veil, Second Thoughts): **both**. Most of
 *   what they do has nothing to do with AI, so they stay on the Hub, and the AI Hub opens their AI
 *   screen rather than their settings.
 * - Everything else: the Hub only.
 *
 * The saved entry is a snapshot from when it was added, so it can predate a plugin gaining AI
 * features. The live list (Developer Mode) wins when it is there, and AI Core's own record of its
 * dependents counts too, so a plugin can reach the AI Hub without being added again.
 */
export function onPage(entry: Classified, ai: boolean): boolean {
	const live = listInstalled()?.find(plugin => plugin.id === entry.id)
	const snapshot = live ?? entry
	const aiListed = snapshot.ai || !!aiCoreDependent(entry.id)
	if (ai) return aiListed
	if (!aiListed) return true
	// AI Core knows it, but it was saved as not-AI: it gained optional AI features since.
	if (!snapshot.ai) return true
	return !!snapshot.aiOptional
}
