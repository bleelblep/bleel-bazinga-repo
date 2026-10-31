/**
 * A "Web" tab in Discord's expression picker (emoji / GIFs / stickers), the way Sekai Stickers adds
 * its tab -- see plugins/sekai-stickers/js/lib/picker.ts for how the picker works.
 *
 * Three property swaps: 'browser' on `ExpressionPickerOrder` (tapping a tab looks its type up by
 * index there), a "Web" label in `useExpressionPickerTabData`'s tab strings, and the picker's render
 * filling the empty content slot with the browser.
 *
 * ## Next to other added tabs
 *
 * Sekai Stickers adds a tab the same way. Each label must land at the index its type has in
 * `ExpressionPickerOrder`, so the label goes in only when the strings reach exactly that index.
 * Whichever plugin pushed onto the order first also wrapped the tab-data hook first (inner), so
 * the labels come out in order.
 *
 * Switching the tab off in settings takes 'browser' out of the order and stops adding the label;
 * switching it on puts it back at the end.
 */

import { getModuleByPath } from '../../../../shared/modules'
import { settings } from './store'
import * as React from 'react'
import { reportError } from '../../../../shared/report'

export const VIEW_TYPE = 'browser'
const LABEL = 'Web'
const TAG = '[Pocket Browser]'

const CONSTANTS = 'modules/expression_picker/ExpressionPickerConstants.tsx'
const TAB_DATA = 'modules/expression_picker/native/useExpressionPickerTabData.tsx'
const PICKER = 'modules/expression_picker/native/ExpressionPicker.tsx'

let order: string[] | undefined

/** Puts 'browser' in or out of Discord's tab order to match the Web tab setting. */
export function syncTabOrder() {
	if (!order) return
	const at = order.indexOf(VIEW_TYPE)
	if (settings().showTab && at < 0) order.push(VIEW_TYPE)
	else if (!settings().showTab && at >= 0) order.splice(at, 1)
}

/** [Panel] is drawn in the picker's content area with `{ channel }`. */
export function patchPicker(Panel: (props: { channel: any }) => any): () => void {
	const undo: Array<() => void> = []

	undo.push(
		getModuleByPath(CONSTANTS, null, (mod: any) => {
			const list = mod?.ExpressionPickerOrder
			if (!Array.isArray(list)) throw new Error('ExpressionPickerOrder is not an array')
			order = list
			syncTabOrder()
			const types = mod.ExpressionPickerViewType
			if (types && !types.BROWSER) types.BROWSER = VIEW_TYPE
			undo.push(() => {
				const at = list.indexOf(VIEW_TYPE)
				if (at >= 0) list.splice(at, 1)
				if (types?.BROWSER === VIEW_TYPE) delete types.BROWSER
				order = undefined
			})
		}, TAG),
	)

	undo.push(
		getModuleByPath(TAB_DATA, null, (mod: any) => {
			const original = mod?.default
			if (typeof original !== 'function') throw new Error('useExpressionPickerTabData has no default')
			let lastIn: string[] | undefined
			let lastOut: string[] | undefined
			const wrapper = function (this: unknown, ...args: any[]) {
				const result = original.apply(this, args)
				try {
					const strings = result?.expressionPickerTabStrings
					const index = order ? order.indexOf(VIEW_TYPE) : -1
					// Only when the label lands on our type's index; see "Next to other added tabs".
					if (!Array.isArray(strings) || index < 0 || strings.length !== index) return result
					// Same array back while the labels don't change, so the segmented control's memo holds.
					if (strings !== lastIn) {
						lastIn = strings
						lastOut = [...strings, LABEL]
					}
					const selected = args[0]?.expressionType === VIEW_TYPE
					return {
						...result,
						expressionPickerTabStrings: lastOut,
						...(selected ? { expressionPickerSelectedIndex: index, expressionPickerViewType: VIEW_TYPE } : {}),
					}
				} catch (error) {
					reportError(`${TAG} tab data failed:`, error)
					return result
				}
			}
			mod.default = wrapper
			undo.push(() => {
				if (mod.default === wrapper) mod.default = original
			})
		}, TAG),
	)

	undo.push(
		getModuleByPath(PICKER, null, (mod: any) => {
			const memo = mod?.default
			const original = memo?.type
			if (typeof original !== 'function') throw new Error('ExpressionPicker is not a memo of a function')
			const wrapper = function (this: unknown, props: any, ref: unknown) {
				const tree = original.call(this, props, ref)
				if (props?.expressionType !== VIEW_TYPE) return tree
				try {
					// jsxs(View, { children: [segmented control, jsx(View, { style, children: picker }) ] })
					const children = tree?.props?.children
					const content = Array.isArray(children) ? children[children.length - 1] : undefined
					if (!content?.props || content.props.children != null) return tree
					const filled = React.cloneElement(
						content,
						undefined,
						React.createElement(Panel, { key: 'pocket-browser', channel: props.channel }),
					)
					return React.cloneElement(tree, undefined, ...children.slice(0, -1), filled)
				} catch (error) {
					reportError(`${TAG} picker content failed:`, error)
					return tree
				}
			}
			memo.type = wrapper
			undo.push(() => {
				if (memo.type === wrapper) memo.type = original
			})
		}, TAG),
	)

	return () => {
		for (const fn of undo.reverse()) {
			try {
				fn()
			} catch {
				/* already gone */
			}
		}
	}
}
