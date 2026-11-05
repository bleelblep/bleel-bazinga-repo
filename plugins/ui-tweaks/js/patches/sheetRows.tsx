/**
 * Hides rows, whole sections, and the emoji row of the message long-press sheet.
 *
 * The sheet opens through `ActionSheetActionCreators.openLazy(promise, 'MessageLongPressActionSheet',
 * props)`; the promise resolves to a module whose `default` renders (verified live on 350.4):
 *
 *     AnalyticsLocationProvider
 *       ActionSheet  header=<EmojiRow message channel />
 *         ActionSheetRowGroup        <- a section; 3 on 350.4 (actions / tools / Report-Delete)
 *           ActionSheetRow label="Reply" icon onPress …
 *
 * Rows are matched by their `label` string, which is what the user sees. Sections are matched by
 * the rows they hold (lib/layout.ts `sectionIndexFor`); 0.2.x-0.3.1 matched them by position,
 * which hit the wrong section on messages missing the top one. 0.1.x matched icons
 * through `getAssetByName`, which returns an asset entry, never the icon component, so nothing ever
 * matched and nothing was hidden.
 *
 * Plugins add their own rows and sections with their own hooks on the same module, and hook
 * order isn't fixed. So the module hook wraps what the module rendered in a stand-in
 * (patches/sheetEdit.tsx) that draws Discord's sheet with the hidden rows left out, plus the
 * in-sheet edit mode (0.8.0). It does its work when the sheet renders, after every plugin has added
 * its rows. Discord's ActionSheet element itself is left alone: 0.8.1 swapped its type, and Ghost
 * Log NG, which finds the sheet by that type, lost its Local edit row. (0.7.x and earlier wrapped `Design.ActionSheet`'s memo instead; on 352 it is a plain
 * function, so that wrap never installed and the module hook pruned directly.) Plugin rows are told
 * apart by their icon: Discord's rows pass an `IconComponent`, plugins pass an asset `source`.
 *
 * 0.3.0 extended this to every long-press menu; that broke hiding on device and was rolled back
 * in 0.3.1 to this message-only version.
 *
 * The derived promise patches the module once (a WeakSet; 0.1.x stacked another `after` hook on
 * every open).
 */

import { SheetStandIn, findActionSheet } from './sheetEdit'
import * as actions from '@valenced/discord/actions'
import { after, before } from '@valenced/patcher'
import { reportError } from '../../../../shared/report'

const DEBUG: boolean = false

const TAG = '[UITweaks]'
const SHEET_KEY = 'MessageLongPressActionSheet'

const patched = new WeakSet<any>()

function patchSheetModule(mod: any, patches: Array<() => void>): any {
	if (!mod || typeof mod.default !== 'function' || patched.has(mod)) return mod
	patched.add(mod)
	patches.push(
		after(mod, 'default', (rendered: any) => {
			try {
				if (rendered == null || rendered?.type === SheetStandIn) return rendered
				if (!findActionSheet(rendered)) {
					if (DEBUG) console.warn(`${TAG} long-press sheet: no ActionSheet in the render`)
					return rendered
				}
				// Wrapped from outside: Discord's ActionSheet element stays as it is, so plugins whose
				// hooks run after ours still find it (patches/sheetEdit.tsx).
				return <SheetStandIn>{rendered}</SheetStandIn>
			} catch (error) {
				reportError(`${TAG} long-press sheet failed:`, error)
			}
			return rendered
		}),
	)
	return mod
}

export default (): (() => void) => {
	const { ActionSheetActionCreators } = actions
	const patches: Array<() => void> = []

	patches.push(
		before(ActionSheetActionCreators as any, 'openLazy', (args: any[]) => {
			try {
				const [sheet, key] = args
				if (key === SHEET_KEY && sheet && typeof sheet.then === 'function') {
					// A *derived* promise, not a `.then` bolted onto theirs (see pronouns/screenshot-redactor).
					args[0] = sheet.then((mod: any) => patchSheetModule(mod, patches))
				}
			} catch (error) {
				reportError(`${TAG} openLazy hook failed:`, error)
			}
			// A before-hook must return the args array (coding rule 2).
			return args
		}),
	)

	return () => {
		for (const unpatch of patches.splice(0)) {
			try {
				unpatch()
			} catch {
				/* already gone */
			}
		}
	}
}
