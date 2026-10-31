/**
 * Auto-expands the picker sheet when the system keyboard opens while the Web tab is showing, so a
 * page's text field doesn't hide the page behind the IME.
 *
 * Discord's own keyboard state machine ignores an IME summoned by a page -- the custom keyboard and
 * the system keyboard normally never share the screen -- so the sheet stays at its partial snap
 * point and the keyboard covers it. Here the sheet is expanded through its own handle while the IME
 * is visible on the Web tab, and collapsed again when the IME hides (unless it was already full).
 *
 * The handle: `modules/expression_picker/native/ExpressionPickerKeyboard.tsx` (memo(fn) on 350.2)
 * renders `PortalKeyboardBottomSheet` with a `ref` whose current has `expandActionSheet`,
 * `collapseActionSheet` and `snapToIndex`. The sheet itself can't be wrapped: it is a plain function
 * the picker captured at import time, so swapping its export changes nothing (0.1.5 tried that, plus
 * writing `animatedIndex`, and never ran). Verified on device 2026-10-11.
 *
 * Two IME signals: the native `keyboardChanged` bridge (window insets, any IME) wins once it has
 * reported; KeyboardUIStore's `systemKeyboardOpen` is the fallback. The store's state is
 * `{ byAppEntry: { main, share } }` on 350.2 and the zustand `subscribe` is on `default`.
 * `valenced.*` is only read inside functions and renders.
 */

import { getModuleByPath } from '../../../../shared/modules'
import { wrapRender } from '../../../../shared/wrapRender'
import { VIEW_TYPE } from './picker'
import { settings } from './store'
import * as modulesNative from '@valenced/modules/native'
import { reportError } from '../../../../shared/report'

const PICKER = 'modules/expression_picker/native/ExpressionPickerKeyboard.tsx'
const KEYBOARD_STORE = 'modules/keyboard/native/KeyboardUIStore.native.tsx'
const KEYBOARD_TYPES = 'modules/keyboard/native/KeyboardTypes.tsx'
const ID = 'bleelblep.pocket-browser'
const TAG = '[Pocket Browser]'

/** The native bridge's last report; undefined until it reports, then it outranks the store. */
let nativeOpen: boolean | undefined
let storeOpen = false
let expanded = false
/** Whether the sheet was below full height when expanded, so hiding the IME should collapse it. */
let collapseAfter = false
let expressionKeyboard = 'expression'
let keyboardStore: any
/** The sheet's ref, from the picker's last render. */
let sheetRef: { current?: any } | undefined
let sheetIndex: { value?: unknown } | undefined

function keyboardState(): any {
	const state = keyboardStore?.default?.getState?.()
	return state?.byAppEntry?.main ?? state
}

/** Whether the picker is open on the Web tab (the expression keyboard's context carries its type). */
function webTabActive(): boolean {
	try {
		const state = keyboardState()
		if (!state || state.keyboardType !== expressionKeyboard) return false
		const context = state.keyboardContexts?.[expressionKeyboard]
		return context?.type === VIEW_TYPE || context?.expressionType === VIEW_TYPE
	} catch {
		return false
	}
}

function apply() {
	const keyboardOpen = nativeOpen ?? storeOpen
	const want = settings().autoExpand && keyboardOpen && webTabActive()
	if (want === expanded) return
	const handle = sheetRef?.current
	if (want) {
		if (typeof handle?.expandActionSheet !== 'function') return
		const index = sheetIndex?.value
		collapseAfter = typeof index !== 'number' || index < 1
		expanded = true
		try {
			handle.expandActionSheet()
		} catch (error) {
			reportError(`${TAG} could not expand the picker:`, error)
		}
	} else {
		expanded = false
		// The picker may have closed meanwhile; then there is nothing to restore.
		if (collapseAfter && keyboardState()?.keyboardType === expressionKeyboard) {
			try {
				handle?.collapseActionSheet?.()
			} catch (error) {
				reportError(`${TAG} could not collapse the picker:`, error)
			}
		}
		collapseAfter = false
	}
}

export function patchAutoExpand(): () => void {
	const undo: Array<() => void> = []

	// The native insets watcher: fires for any IME, even one a page summoned.
	try {
		const native = modulesNative as any
		if (typeof native.registerJSMethod === 'function') {
			native.registerJSMethod(`${ID}.keyboardChanged`, (visible: unknown) => {
				nativeOpen = !!visible
				apply()
			})
		}
	} catch (error) {
		reportError(`${TAG} could not listen to the keyboard bridge:`, error)
	}

	undo.push(
		getModuleByPath(KEYBOARD_TYPES, null, (mod: any) => {
			const value = mod?.KeyboardTypes?.EXPRESSION
			if (typeof value === 'string') expressionKeyboard = value
		}, TAG),
	)

	// Discord's own keyboard state: the fallback signal, and the Web tab check.
	undo.push(
		getModuleByPath(KEYBOARD_STORE, null, (mod: any) => {
			keyboardStore = mod
			const read = () => {
				storeOpen = !!keyboardState()?.systemKeyboardOpen
				apply()
			}
			if (typeof mod?.default?.subscribe !== 'function') {
				reportError(`${TAG} KeyboardUIStore has no subscribe; using the native signal only`)
				return
			}
			const unsubscribe = mod.default.subscribe(read)
			read()
			if (typeof unsubscribe === 'function') undo.push(unsubscribe)
		}, TAG),
	)

	// The picker: remember the sheet's handle from the element it renders.
	undo.push(
		getModuleByPath(PICKER, null, (exports: any) => {
			const installed = wrapRender(exports, (original: (...args: any[]) => any) => function (this: unknown, ...args: any[]) {
				const element = Reflect.apply(original, this, args)
				try {
					const props = element?.props
					const ref = props?.ref ?? element?.ref
					if (ref && typeof ref === 'object') {
						sheetRef = ref
						sheetIndex = props?.animatedIndex
					}
				} catch {
					/* never break the picker */
				}
				return element
			})
			if (!installed) reportError(`${TAG} could not wrap the picker: unknown component shape`)
			undo.push(() => installed?.())
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
		sheetRef = undefined
		sheetIndex = undefined
		keyboardStore = undefined
		nativeOpen = undefined
		storeOpen = false
		expanded = false
		collapseAfter = false
	}
}
