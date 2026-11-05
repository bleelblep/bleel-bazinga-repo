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
 */

import { wrapRender } from '../../../../shared/wrapRender'
import {
	PROTECTED_ITEMS,
	recordSettings,
	sectionId,
	settingsItemHidden,
	settingsSectionHidden,
	type SettingsSectionLayout,
} from '../lib/layout'
import * as settings from '@valenced/discord/modules/settings'
import { reportError } from '../../../../shared/report'

const TAG = '[UITweaks]'

function filterSections(sections: any[]): any[] {
	const out: any[] = []
	for (const section of sections) {
		const items: unknown[] = Array.isArray(section?.settings) ? section.settings : []
		const sectionHidden = settingsSectionHidden(sectionId(section))
		// A hidden section still keeps its protected items (Valenced's way back to this plugin).
		const kept = items.filter(key =>
			typeof key !== 'string' ? true : sectionHidden ? PROTECTED_ITEMS.has(key) : !settingsItemHidden(key),
		)
		if (!kept.length) continue
		out.push(kept.length === items.length ? section : { ...section, settings: kept })
	}
	return out
}

function makeWrapper(original: (...args: any[]) => any) {
	return function (this: unknown, ...args: any[]) {
		const props = args[0]
		try {
			const sections = props?.node?.sections
			if (!Array.isArray(sections)) return Reflect.apply(original, this, args)
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
			if (filtered.length === sections.length && filtered.every((section, i) => section === sections[i])) {
				return Reflect.apply(original, this, args)
			}
			return Reflect.apply(original, this, [{ ...props, node: { ...props.node, sections: filtered } }, ...args.slice(1)])
		} catch (error) {
			reportError(`${TAG} settings page failed:`, error)
			return Reflect.apply(original, this, args)
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
