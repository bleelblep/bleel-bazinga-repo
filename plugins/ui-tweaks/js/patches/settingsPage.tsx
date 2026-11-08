/**
 * Hides sections and items of Discord's settings page (You → gear).
 *
 * The page renders through Valenced's re-export of Discord's settings list,
 * `valenced.discord.modules.settings.renderer.SettingListRenderer.SearchableSettingsList`
 * (memo(fn) on 350.4). Its props carry `node.sections`: `[{ label, settings: [item keys] }]`,
 * already including Valenced's and plugins' own sections (verified live 2026-10-11). The wrapper
 * hands the original a copy with hidden sections and items left out, and records the full list
 * for this plugin's settings page. `SettingsList` (the non-searchable variant) gets the same
 * wrapper in case a screen uses it.
 *
 * The memo's `type` is swapped (shared/wrapRender), not patched, and Discord reads it on every
 * render, so a change applies the next time the page opens.
 *
 * Sections and items are also put in the saved order (lib/layout.ts settingsOrder). On the main
 * page (the one holding Valenced's own item) an Edit button floats at the bottom; it swaps the list
 * for ui/SettingsEditor.tsx, where items are hidden, shown and dragged in place. Discord's list
 * renders as a child component (`Inner`) so the hooks here never change count between the two.
 */

import * as React from 'react'
import * as ReactNative from 'react-native'

import { wrapRender } from '../../../../shared/wrapRender'
import {
	arrange,
	PROTECTED_ITEMS,
	recordSettings,
	rehome,
	sectionId,
	settingsItemHidden,
	settingsOrder,
	settingsSectionHidden,
	type SettingsSectionLayout,
} from '../lib/layout'
import { settings as tweakSettings } from '../lib/state'
import { EditSettingsButton, SettingsEditor, useSettingsEditing } from '../ui/SettingsEditor'
import * as settings from '@valenced/discord/modules/settings'
import { reportError } from '../../../../shared/report'

const TAG = '[UITweaks]'

function filterSections(sections: any[]): any[] {
	const order = settingsOrder()
	const out: any[] = []
	const arranged = arrange(sections, sectionId, order.sections)
	// Items dragged into another section (on the settings page's Edit) go there first.
	const homed = rehome(
		arranged.map(section => ({ id: sectionId(section), items: (Array.isArray(section?.settings) ? section.settings : []) as unknown[] })),
		key => (typeof key === 'string' ? key : undefined),
		order.homes,
	)
	for (const [position, section] of arranged.entries()) {
		const listed: unknown[] = Array.isArray(section?.settings) ? section.settings : []
		const items = arrange(homed[position].items, key => (typeof key === 'string' ? key : undefined), order.items)
		const sectionHidden = settingsSectionHidden(sectionId(section))
		// A hidden section still keeps its protected items (Valenced's way back to this plugin).
		const kept = items.filter(key =>
			typeof key !== 'string' ? true : sectionHidden ? PROTECTED_ITEMS.has(key) : !settingsItemHidden(key),
		)
		if (!kept.length) continue
		const same = kept.length === listed.length && kept.every((key, index) => key === listed[index])
		out.push(same ? section : { ...section, settings: kept })
	}
	return out
}

/** The main settings page: the one listing Valenced's own item. */
function isMainPage(sections: any[]): boolean {
	return sections.some(section => Array.isArray(section?.settings) && section.settings.includes('Valenced'))
}

function makeWrapper(original: (...args: any[]) => any) {
	const Inner = ({ args }: { args: any[] }) => original(...args)
	const list = (args: any[]) => React.createElement(Inner, { args })
	return function (this: unknown, ...args: any[]) {
		const editing = useSettingsEditing()
		const props = args[0]
		try {
			const sections = props?.node?.sections
			if (!Array.isArray(sections)) return list(args)
			const main = isMainPage(sections) && tweakSettings().settingsEditButton
			const { View } = ReactNative
			if (main && editing) return React.createElement(SettingsEditor, { sections })
			recordSettings(
				sections.map(
					(section: any): SettingsSectionLayout => ({
						id: sectionId(section),
						label: typeof section?.label === 'string' ? section.label : undefined,
						settings: (Array.isArray(section?.settings) ? section.settings : []).filter(
							(key: unknown): key is string => typeof key === 'string',
						),
					}),
				),
			)
			const filtered = filterSections(sections)
			const same = filtered.length === sections.length && filtered.every((section, i) => section === sections[i])
			const shown = list(same ? args : [{ ...props, node: { ...props.node, sections: filtered } }, ...args.slice(1)])
			if (!main) return shown
			return React.createElement(View, { style: { flex: 1 } }, shown, React.createElement(EditSettingsButton))
		} catch (error) {
			reportError(`${TAG} settings page failed:`, error)
			return list(args)
		}
	}
}

export default (): (() => void) => {
	const undo: Array<() => void> = []
	const renderer = (settings as any)?.renderer?.SettingListRenderer
	for (const name of ['SearchableSettingsList', 'SettingsList']) {
		const component = renderer?.[name]
		const restore = component ? wrapRender(component, makeWrapper) : undefined
		if (restore) undo.push(restore)
		else reportError(`${TAG} could not wrap ${name}: missing or unknown shape`)
	}
	return () => {
		for (const fn of undo.reverse()) fn()
	}
}
