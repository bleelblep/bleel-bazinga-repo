/**
 * Hides the GIFs and/or Stickers tab of the expression picker.
 *
 * `modules/expression_picker/ExpressionPickerConstants.tsx` exports `ExpressionPickerOrder`, one
 * shared array that the picker reads three ways, each on every render (350.2 bundle):
 *
 * - `ExpressionPicker`'s `visibleTabs` prop defaults to it, and `useExpressionPickerTabData` shows a
 *   built-in tab only when `visibleTabs.includes(type)`;
 * - the tab strip's `onSetActiveIndex(i)` opens `ExpressionPickerOrder[i]`;
 * - the selected index is `ExpressionPickerOrder.indexOf(expressionType)`.
 *
 * So taking a type out of the array hides its tab and keeps every tap and index lined up, and it
 * applies live. Tabs other plugins add (Pocket Browser's Web, Sekai Stickers) key their labels to
 * their index in the same array, so they stay lined up too. Emoji can't be hidden: the keyboard
 * opens on it.
 */

import { findModule } from '../lib/find'
import { onUpdate, settings } from '../lib/state'

const CONSTANTS = 'modules/expression_picker/ExpressionPickerConstants.tsx'

/** Discord's built-in tabs in their own order; a re-shown tab goes back after the ones before it. */
const BUILT_IN = ['emoji', 'gif', 'sticker'] as const

let order: string[] | undefined

function hidden(type: string): boolean {
	const s = settings()
	return (type === 'gif' && s.hidePickerGifs) || (type === 'sticker' && s.hidePickerStickers)
}

function sync() {
	if (!order) return
	for (const type of BUILT_IN) {
		const at = order.indexOf(type)
		if (hidden(type) && at >= 0) {
			order.splice(at, 1)
		} else if (!hidden(type) && at < 0) {
			// After the last built-in tab that precedes it and is present, so plugin tabs stay at the end.
			let insertAt = 0
			for (const before of BUILT_IN.slice(0, BUILT_IN.indexOf(type))) {
				const index = order.indexOf(before)
				if (index >= 0) insertAt = index + 1
			}
			order.splice(insertAt, 0, type)
		}
	}
}

export default (): (() => void) => {
	const undo: Array<() => void> = []
	undo.push(
		findModule(CONSTANTS, ['ExpressionPickerOrder'], (mod: any) => {
			if (!Array.isArray(mod?.ExpressionPickerOrder)) return
			order = mod.ExpressionPickerOrder
			sync()
		}),
	)
	undo.push(onUpdate(sync))
	return () => {
		for (const fn of undo.reverse()) fn()
		// Put every built-in tab back.
		if (order) {
			const list = order
			order = undefined
			for (const type of BUILT_IN) {
				if (list.includes(type)) continue
				let insertAt = 0
				for (const before of BUILT_IN.slice(0, BUILT_IN.indexOf(type))) {
					const index = list.indexOf(before)
					if (index >= 0) insertAt = index + 1
				}
				list.splice(insertAt, 0, type)
			}
		}
	}
}
