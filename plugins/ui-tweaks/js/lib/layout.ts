/**
 * What can be hidden, as last seen on screen, and whether a given row or section is hidden.
 *
 * Both surfaces are discovered rather than hard-coded: the long-press sheet's rows differ by
 * message (yours vs others', pinned, threads) and by what other plugins inject, and the settings
 * page differs by account, build and installed plugins. The patches report what they render;
 * the settings pages list it.
 */

import { settings, update } from './state'
import { reportError } from '../../../../shared/report'

// ---- Long-press sheet ---------------------------------------------------------------------------

/**
 * The sheet as last seen. `sections`: Discord's own sections, each listing every row label seen in
 * it (plugin rows that land inside them too). `plugins`: sections other plugins add, by key
 * (`plugin:<first row>`), with their row labels.
 *
 * Sections are identified by their rows, not their position (`v: 2`, 0.3.2): which sections a menu
 * shows depends on the message -- one you can't reply to has no Reply/Forward section, so the
 * Copy Text section comes first -- and 0.2.x/0.3.1 numbered them by position, so hiding "the
 * middle one" hit whichever section happened to be second, and rows of different sections got
 * recorded together. `hiddenSheetGroups` keys Discord sections by their index here + 1.
 */
export interface SheetLayout {
	v?: number
	sections: string[][]
	plugins: Record<string, string[]>
}

export const SHEET_LAYOUT_VERSION = 2

export function sheetLayout(raw = settings().sheetLayout): SheetLayout {
	try {
		const parsed = raw ? JSON.parse(raw) : undefined
		// Position-based layouts (0.2.x-0.3.1) mixed sections up; they are rediscovered instead.
		if (!parsed || parsed.v !== SHEET_LAYOUT_VERSION) return { v: SHEET_LAYOUT_VERSION, sections: [], plugins: {} }
		return tidyLayout({
			v: SHEET_LAYOUT_VERSION,
			sections: Array.isArray(parsed.sections) ? parsed.sections : [],
			plugins: parsed.plugins ?? {},
		})
	} catch {
		return { v: SHEET_LAYOUT_VERSION, sections: [], plugins: {} }
	}
}

/**
 * Rows other plugins add, by plugin. Their labels change with the message: Veil names the person
 * ("Blur messages from Alice"), Pronouns and Timezones show a value or a prompt, toggles flip
 * between Show and Hide. Keyed by the first row's label, one plugin turned into a section per
 * person and per state (0.4.6 and older). Each pattern maps every variant to one row, and the
 * rows to the plugin, so its section is listed once under the plugin's name.
 */
const KNOWN_ROWS: Array<{ plugin: string; rows: Array<[RegExp, string]> }> = [
	{ plugin: 'Pronouns', rows: [[/^Pronouns(?::.*|…|\.\.\.)?$/, 'Pronouns'], [/^(?:Show|Hide) their pronouns$/, 'Show or hide their pronouns']] },
	{ plugin: 'Timezones', rows: [[/^(?:Their time.*|Set their timezone(?:…|\.\.\.)?)$/, 'Their time']] },
	{ plugin: 'Translate', rows: [[/^(?:Translate|Translating(?:…|\.\.\.)?|Show original)$/, 'Translate']] },
	{ plugin: 'TL;DR', rows: [[/^TL;DR$/, 'TL;DR']] },
	{ plugin: 'Valid User', rows: [[/^Fix \d+ @mentions?$/, 'Fix @mentions']] },
	{
		plugin: 'Veil',
		rows: [
			[/^(?:Show sticker|Hide sticker again)$/, 'Show or hide sticker'],
			[/^Blur messages from .+/, 'Blur this person'],
			[/^Blur everything in .+/, 'Blur this channel'],
			[/^Stop blurring .+/, 'Stop blurring'],
		],
	},
	{ plugin: 'Screenshot Redactor', rows: [[/^(?:Show|Hide) names$/, 'Hide or show names']] },
	{ plugin: 'Global Emojis', rows: [[/^Save to Global Stickers$/, 'Save to Global Stickers']] },
	{ plugin: 'Ghost Log', rows: [[/^(?:Edit local edit|Local edit)$/, 'Local edit'], [/^Revert local edit$/, 'Revert local edit']] },
]

function knownRow(label: string): { plugin: string; key: string } | undefined {
	for (const { plugin, rows } of KNOWN_ROWS) {
		for (const [pattern, key] of rows) if (pattern.test(label)) return { plugin, key }
	}
	return undefined
}

/** The plugin a set of row keys belongs to, when it's one UI Tweaks knows. */
function knownPlugin(keys: string[]): string | undefined {
	for (const key of keys) {
		const found = KNOWN_ROWS.find(({ rows }) => rows.some(([, canonical]) => canonical === key))
		if (found) return found.plugin
	}
	return undefined
}

/**
 * The section key for a plugin's rows: `plugin:<name>` for plugins in [KNOWN_ROWS]; otherwise the
 * saved plugin section sharing a row with it, or `plugin:<first row>` for a new one.
 */
export function pluginSectionKey(keys: string[], layout: SheetLayout): string {
	const plugin = knownPlugin(keys)
	if (plugin) return `plugin:${plugin}`
	for (const [key, known] of Object.entries(layout.plugins)) {
		if (keys.some(label => known.includes(label))) return key
	}
	return `plugin:${keys[0] ?? '?'}`
}

/** Older layouts, saved with raw labels and a section per label variant, folded together. */
function tidyLayout(layout: SheetLayout): SheetLayout {
	const unique = (labels: string[]) => [...new Set(labels.map(rowKey))]
	const sections = layout.sections.map(unique)
	const tidy: SheetLayout = { v: SHEET_LAYOUT_VERSION, sections, plugins: {} }
	for (const labels of Object.values(layout.plugins)) {
		const keys = unique(Array.isArray(labels) ? labels : [])
		if (!keys.length) continue
		const key = pluginSectionKey(keys, tidy)
		if (!tidy.plugins[key]) tidy.plugins[key] = []
		const known = tidy.plugins[key]
		for (const label of keys) if (!known.includes(label)) known.push(label)
	}
	return tidy
}

/** The saved section sharing the most rows with [labels], or -1 when none shares any. */
export function sectionIndexFor(layout: SheetLayout, labels: string[]): number {
	let best = -1
	let bestOverlap = 0
	layout.sections.forEach((known, index) => {
		const overlap = labels.filter(label => known.includes(label)).length
		if (overlap > bestOverlap) {
			best = index
			bestOverlap = overlap
		}
	})
	return best
}

/**
 * The stable part of a row label. Known plugin rows map to one name for every variant (see
 * [KNOWN_ROWS]); for the rest, plugins put live values in theirs ("Pronouns: she/her",
 * "Pronouns…"), so everything from the first ": " and a trailing ellipsis are dropped.
 */
export function rowKey(label: string): string {
	return knownRow(label)?.key ?? label.split(': ')[0].replace(/(…|\.\.\.)$/, '').trim()
}

/**
 * Merges one opened sheet into the saved layout and returns it. Each section joins the saved one
 * it shares rows with, or becomes a new one; a row is listed once, where first seen.
 */
export function recordSheet(sections: string[][], plugins: Record<string, string[]>): SheetLayout {
	const layout = sheetLayout()
	let changed = false
	const listed = (label: string) =>
		layout.sections.some(known => known.includes(label)) || Object.values(layout.plugins).some(known => known.includes(label))
	for (const labels of sections) {
		let index = sectionIndexFor(layout, labels)
		if (index < 0) {
			if (labels.every(listed)) continue
			index = layout.sections.push([]) - 1
			changed = true
		}
		const known = layout.sections[index]
		for (const label of labels) {
			if (listed(label)) continue
			known.push(label)
			changed = true
		}
	}
	for (const [key, labels] of Object.entries(plugins)) {
		if (!(key in layout.plugins)) {
			layout.plugins[key] = []
			changed = true
		}
		const known = layout.plugins[key]
		for (const label of labels) {
			if (listed(label)) continue
			known.push(label)
			changed = true
		}
	}
	const json = JSON.stringify(layout)
	// Also saves an older layout once it has been tidied (see tidyLayout).
	if (changed || json !== settings().sheetLayout) save({ sheetLayout: json })
	return layout
}

export function sheetRowHidden(key: string): boolean {
	return settings().hiddenSheetRows?.[key] === true
}

/** A Discord section by position ("1" = top), or a plugin section by its `plugin:` key. */
export function sheetGroupHidden(id: number | string): boolean {
	return settings().hiddenSheetGroups?.[String(id)] === true
}

// ---- Discord settings page ----------------------------------------------------------------------

export interface SettingsSectionLayout {
	/** The section's label, or `item:<first key>` for an unlabelled one (Log Out). */
	id: string
	label?: string
	settings: string[]
}

/**
 * Items that stay whatever is hidden: Valenced's own pages lead back to this plugin's settings, so
 * hiding them would leave no way to undo it short of clearing storage.
 */
export const PROTECTED_ITEMS = new Set(['Valenced', 'ValencedPlugins'])

export function sectionId(section: { label?: unknown; settings?: unknown }): string {
	if (typeof section.label === 'string' && section.label) return section.label
	const first = Array.isArray(section.settings) ? section.settings[0] : undefined
	return `item:${String(first ?? '?')}`
}

export function settingsLayout(raw = settings().settingsLayout): SettingsSectionLayout[] {
	try {
		const parsed = raw ? JSON.parse(raw) : []
		return Array.isArray(parsed) ? parsed : []
	} catch {
		return []
	}
}

/** Saves the settings page's sections as rendered (unfiltered), when they changed. */
export function recordSettings(sections: SettingsSectionLayout[]) {
	const json = JSON.stringify(sections)
	if (json !== settings().settingsLayout) save({ settingsLayout: json })
}

export function settingsSectionHidden(id: string): boolean {
	return settings().hiddenSettingsSections?.[id] === true
}

export function settingsItemHidden(key: string): boolean {
	if (PROTECTED_ITEMS.has(key)) return false
	const s = settings()
	// Hide Quests (patches/quests.ts) takes the Quests row with it.
	if (key === 'QUEST_HOME' && s.hideQuests) return true
	return s.hiddenSettingsItems?.[key] === true
}

// ---- Shared -----------------------------------------------------------------------------------------

/**
 * Discovery writes come from inside renders; a storage write there would re-render subscribers
 * (the settings page) mid-render, so they are deferred a tick.
 */
function save(patch: Parameters<typeof update>[0]) {
	setTimeout(() => {
		try {
			update(patch)
		} catch (error) {
			reportError('[UITweaks] saving the layout failed:', error)
		}
	}, 0)
}
