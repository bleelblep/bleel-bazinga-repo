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

// ---- Long-press sheet order ---------------------------------------------------------------------

/**
 * The saved order (see UITweaksStorage.sheetOrder). Empty lists mean Discord's own order. `homes`:
 * rows dragged into another section, by row key -> that section's id.
 */
export interface SheetOrder {
	sections: string[]
	rows: string[]
	homes: Record<string, string>
}

function parseHomes(parsed: any): Record<string, string> {
	const out: Record<string, string> = {}
	if (parsed?.homes && typeof parsed.homes === 'object') {
		for (const [key, id] of Object.entries(parsed.homes)) if (typeof id === 'string') out[key] = id
	}
	return out
}

export function sheetOrder(raw = settings().sheetOrder): SheetOrder {
	try {
		const parsed = raw ? JSON.parse(raw) : undefined
		return {
			sections: Array.isArray(parsed?.sections) ? parsed.sections.map(String) : [],
			rows: Array.isArray(parsed?.rows) ? parsed.rows.map(String) : [],
			homes: parseHomes(parsed),
		}
	} catch {
		return { sections: [], rows: [], homes: {} }
	}
}

/**
 * Groups with their items moved to the group they were dragged into ([homes]), when that group is
 * here. An item whose home isn't on screen stays where Discord put it.
 */
export function rehome<T>(
	groups: Array<{ id: string; items: T[] }>,
	keyOf: (item: T) => string | undefined,
	homes: Record<string, string>,
): Array<{ id: string; items: T[] }> {
	const ids = new Set(groups.map(group => group.id))
	const moving: Array<[string, T]> = []
	const out = groups.map(group => ({
		id: group.id,
		items: group.items.filter(item => {
			const key = keyOf(item)
			const home = key === undefined ? undefined : homes[key]
			if (home && home !== group.id && ids.has(home)) {
				moving.push([home, item])
				return false
			}
			return true
		}),
	}))
	for (const [home, item] of moving) out.find(group => group.id === home)?.items.push(item)
	return out
}

/** [lists] saved as the new order: each list's keys to the end, so they compare in this order. */
function reordered(order: string[], lists: string[][]): string[] {
	const keys = new Set(lists.flat())
	return [...order.filter(key => !keys.has(key)), ...lists.flat()]
}

/**
 * Moves [key] into section [to] at [index] (counted without it). [fromKeys] and [toKeys] are both
 * sections' rows as shown, so both keep their order.
 */
export function moveSheetRow(key: string, from: string, fromKeys: string[], to: string, toKeys: string[], index: number) {
	const order = sheetOrder()
	const target = toKeys.filter(k => k !== key)
	target.splice(Math.max(0, Math.min(index, target.length)), 0, key)
	const source = from === to ? [] : fromKeys.filter(k => k !== key)
	saveOrder({ ...order, rows: reordered(order.rows, [source, target]), homes: { ...order.homes, [key]: to } })
}

function saveOrder(order: SheetOrder) {
	update({ sheetOrder: JSON.stringify(order) })
}

/**
 * [items] in the saved [order]. Only the items the order lists move, and only among their own
 * places: anything it doesn't list (a row first seen today, a plugin's section) keeps its spot.
 */
export function arrange<T>(items: T[], keyOf: (item: T) => string | undefined, order: string[]): T[] {
	if (items.length < 2 || !order.length) return items
	const rank = new Map<string, number>()
	order.forEach((key, index) => {
		if (!rank.has(key)) rank.set(key, index)
	})
	const rankOf = (item: T) => {
		const key = keyOf(item)
		return key === undefined ? undefined : rank.get(key)
	}
	const ranked = items.filter(item => rankOf(item) !== undefined)
	if (ranked.length < 2) return items
	const sorted = [...ranked].sort((a, b) => rankOf(a)! - rankOf(b)!)
	let next = 0
	return items.map(item => (rankOf(item) !== undefined ? sorted[next++] : item))
}

/**
 * Saves one section's rows in this order. Rows are only ever compared with their own section's,
 * so the section's keys go to the end of the list; where the other sections' keys sit doesn't
 * matter.
 */
export function setSectionRowOrder(keys: string[]) {
	const order = sheetOrder()
	const unique = [...new Set(keys)]
	saveOrder({ ...order, rows: [...order.rows.filter(key => !unique.includes(key)), ...unique] })
}

/** Saves the sections in this order, by id ("1" = Discord's first, `plugin:` keys for plugins). */
export function setSectionOrder(ids: Array<number | string>) {
	saveOrder({ ...sheetOrder(), sections: [...new Set(ids.map(String))] })
}

/** [list] with the item at [index] moved to [to]. */
export function moved<T>(list: T[], index: number, to: number): T[] {
	if (index < 0 || index >= list.length || to < 0 || to >= list.length || index === to) return list
	const next = [...list]
	const [item] = next.splice(index, 1)
	next.splice(to, 0, item)
	return next
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

/** The saved order of Discord's settings (see UITweaksStorage.settingsOrder); `homes` as in SheetOrder. */
export function settingsOrder(raw = settings().settingsOrder): { sections: string[]; items: string[]; homes: Record<string, string> } {
	try {
		const parsed = raw ? JSON.parse(raw) : undefined
		return {
			sections: Array.isArray(parsed?.sections) ? parsed.sections.map(String) : [],
			items: Array.isArray(parsed?.items) ? parsed.items.map(String) : [],
			homes: parseHomes(parsed),
		}
	} catch {
		return { sections: [], items: [], homes: {} }
	}
}

/** Moves a settings item into section [to] at [index], as moveSheetRow does for the menu. */
export function moveSettingsItem(key: string, from: string, fromKeys: string[], to: string, toKeys: string[], index: number) {
	const order = settingsOrder()
	const target = toKeys.filter(k => k !== key)
	target.splice(Math.max(0, Math.min(index, target.length)), 0, key)
	const source = from === to ? [] : fromKeys.filter(k => k !== key)
	update({
		settingsOrder: JSON.stringify({ ...order, items: reordered(order.items, [source, target]), homes: { ...order.homes, [key]: to } }),
	})
}

/** Saves one settings section's items in this order (only compared within their section). */
export function setSettingsItemOrder(keys: string[]) {
	const order = settingsOrder()
	const unique = [...new Set(keys)]
	update({ settingsOrder: JSON.stringify({ ...order, items: [...order.items.filter(key => !unique.includes(key)), ...unique] }) })
}

/** Flips one settings item. A hidden section comes back with only that item shown. */
export function toggleSettingsItem(sectionKey: string, items: string[], key: string) {
	const s = settings()
	const hiddenItems = { ...s.hiddenSettingsItems }
	const hiddenSections = { ...s.hiddenSettingsSections }
	if (settingsSectionHidden(sectionKey)) {
		hiddenSections[sectionKey] = null
		for (const item of items) hiddenItems[item] = item === key ? null : true
	} else {
		hiddenItems[key] = hiddenItems[key] === true ? null : true
	}
	update({ hiddenSettingsItems: hiddenItems, hiddenSettingsSections: hiddenSections })
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
