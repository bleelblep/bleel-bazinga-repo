/**
 * Keeps the expression picker open after sending a GIF.
 *
 * Traced in the 352.2 bundle (hermes-dec), not yet confirmed on a device:
 *
 * - `modules/expression_picker/native/ExpressionPickerKeyboard.tsx`'s GIF handler calls
 *   `chatInputRef.current.handleSelectGIF(gif)` and then `chatInputRef.current.openSystemKeyboard()`.
 * - `handleSelectGIF` (on the chat input object built in
 *   `modules/chat_input/native/useChatInputRefs.tsx`) sends through Discord's own `sendMessage`, then
 *   calls `dismissKeyboard()` on the same object.
 * - Those two calls, `dismissKeyboard` and `openSystemKeyboard`, are what close the picker. Emoji
 *   never calls them; stickers do, so the methods are only skipped while a GIF send is running.
 *
 * So `useChatInputRefs`' return gets an `after` hook that wraps three methods on its
 * `chatInput.current` object once. The send itself is Discord's unchanged call, run once, with its
 * own arguments and return value (account-safety AS-04): only the two close calls that follow it
 * are skipped. Both callers read the methods by name at call time, so replacing the properties is
 * enough.
 */

import { after } from '@valenced/patcher'
import { findModule } from '../lib/find'
import { settings } from '../lib/state'
import { reportError } from '../../../../shared/report'

const REFS = 'modules/chat_input/native/useChatInputRefs.tsx'
const TAG = '[UITweaks]'
const WRAPPED = Symbol.for('bleelblep.ui-tweaks.keepGifPickerOpen')

/** True from a GIF send until the picker's follow-up `openSystemKeyboard` (or the next turn). */
let skipClose = false

function wrap(input: any) {
	if (!input || typeof input !== 'object' || input[WRAPPED]) return
	const { handleSelectGIF, dismissKeyboard, openSystemKeyboard } = input
	if (typeof handleSelectGIF !== 'function' || typeof dismissKeyboard !== 'function' || typeof openSystemKeyboard !== 'function') return
	input[WRAPPED] = true

	input.handleSelectGIF = function (this: unknown, ...args: unknown[]) {
		if (settings().keepGifPickerOpen) {
			skipClose = true
			setTimeout(() => {
				skipClose = false
			}, 0)
		}
		return Reflect.apply(handleSelectGIF, this, args)
	}
	input.dismissKeyboard = function (this: unknown, ...args: unknown[]) {
		if (skipClose) return undefined
		return Reflect.apply(dismissKeyboard, this, args)
	}
	input.openSystemKeyboard = function (this: unknown, ...args: unknown[]) {
		if (skipClose) {
			skipClose = false
			return undefined
		}
		return Reflect.apply(openSystemKeyboard, this, args)
	}
}

export default (): (() => void) => {
	const undo: Array<() => void> = []
	undo.push(
		findModule(REFS, null, (mod: any) => {
			const host = typeof mod?.default === 'function' ? mod : undefined
			if (!host) {
				reportError(`${TAG} useChatInputRefs has an unknown shape`)
				return
			}
			undo.push(
				after(host, 'default', (refs: any) => {
					try {
						wrap(refs?.chatInput?.current)
					} catch (error) {
						reportError(`${TAG} keeping the GIF picker open failed:`, error)
					}
					return refs
				}),
			)
		}),
	)
	return () => {
		skipClose = false
		for (const fn of undo.reverse()) {
			try {
				fn()
			} catch {
				/* already gone */
			}
		}
	}
}
