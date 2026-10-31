/**
 * The chat box's handle: to open the picker on the Web tab when a link is tapped, and to put the
 * page's address in the message.
 *
 * ChatInput's render passes `chatInputRef` to its children (Send Tweaks and Sekai Stickers read it
 * the same way). Its handle has, among others (348.5 bundle):
 *
 * - `openCustomKeyboard(keyboardParams)`, which ends in `setKeyboardType({ type, context })`.
 * - `insertText(text)`, which inserts at the caret, as Discord's own "mention" taps do.
 *
 * Which picker tab shows is the expression keyboard's context. On 350.2 the picker's own tab
 * buttons set it with `setKeyboardContext(KeyboardTypes.EXPRESSION, { type: <view type> })`
 * (`modules/keyboard/native/KeyboardUIStore.native.tsx`); older builds used `expressionType`.
 * Passing only `expressionType` opened the picker on Emoji, so the context carries both keys and
 * is also set directly, the way the tab buttons do.
 */

import { getModuleByPath } from '../../../../shared/modules'
import { wrapRender } from '../../../../shared/wrapRender'
import { VIEW_TYPE } from './picker'
import * as finders from '@valenced/discord/utils/modules/finders'
import { reportError } from '../../../../shared/report'

const PATH = 'modules/chat_input/native/ChatInput.tsx'
const KEYBOARD_TYPES = 'modules/keyboard/native/KeyboardTypes.tsx'
const KEYBOARD_STORE = 'modules/keyboard/native/KeyboardUIStore.native.tsx'
const TAG = '[Pocket Browser]'

type Handle = {
	openCustomKeyboard?: (params: { type: string; context?: unknown }) => void
	insertText?: (text: string, location?: number, addSpace?: boolean) => void
}
type Ref = { current?: Handle | null }

let latest: Ref | undefined
let expressionKeyboard = 'expression'
let setKeyboardContext: ((type: string, context: unknown) => void) | undefined

function findRef(node: any, depth = 0): Ref | undefined {
	if (!node || typeof node !== 'object' || depth > 12) return undefined
	if (Array.isArray(node)) {
		for (const child of node) {
			const ref = findRef(child, depth + 1)
			if (ref) return ref
		}
		return undefined
	}
	const ref = node.props?.chatInputRef
	if (ref && typeof ref === 'object' && 'current' in ref) return ref
	return findRef(node.props?.children, depth + 1)
}

export function patchChatInput(): () => void {
	let undo: (() => void) | undefined
	let active = true
	const unsubscribe = (finders as any).getModuleWithImportedPath(PATH, (exports: any) => {
		if (!active || undo) return
		// memo(forwardRef) up to 349, memo(function) from 350.2: wrapRender handles both.
		undo = wrapRender(exports, original => function (this: unknown, ...args: any[]) {
			const tree = Reflect.apply(original, this, args)
			if (active) {
				try {
					latest = findRef(tree) ?? latest
				} catch {
					/* keep the last one */
				}
			}
			return tree
		})
		if (!undo) reportError(`${TAG} could not wrap the chat input: unknown component shape`)
	})
	const unsubscribeTypes = getModuleByPath(KEYBOARD_TYPES, null, (mod: any) => {
		const value = mod?.KeyboardTypes?.EXPRESSION
		if (typeof value === 'string') expressionKeyboard = value
	}, TAG)
	const unsubscribeStore = getModuleByPath(KEYBOARD_STORE, null, (mod: any) => {
		if (typeof mod?.setKeyboardContext === 'function') setKeyboardContext = mod.setKeyboardContext
	}, TAG)
	return () => {
		active = false
		unsubscribe?.()
		unsubscribeTypes()
		unsubscribeStore()
		setKeyboardContext = undefined
		undo?.()
		latest = undefined
	}
}

/** Opens the picker on the Web tab. False when there's no chat box on screen to open it from. */
export function openWebTab(): boolean {
	const input = latest?.current
	if (typeof input?.openCustomKeyboard !== 'function') return false
	const context = { type: VIEW_TYPE, expressionType: VIEW_TYPE }
	try {
		setKeyboardContext?.(expressionKeyboard, context)
		input.openCustomKeyboard({ type: expressionKeyboard, context })
		setKeyboardContext?.(expressionKeyboard, context)
		// The keyboard opens after interactions finish; set the tab again once it has.
		setTimeout(() => {
			try {
				setKeyboardContext?.(expressionKeyboard, context)
			} catch {
				/* the picker is already showing; worst case it's on another tab */
			}
		}, 350)
		return true
	} catch (error) {
		reportError(`${TAG} opening the Web tab failed:`, error)
		return false
	}
}

/** Adds [text] to the message at the caret, with a space after. */
export function addToMessage(text: string): boolean {
	const input = latest?.current
	if (typeof input?.insertText !== 'function') return false
	try {
		input.insertText(text, undefined, true)
		return true
	} catch (error) {
		reportError(`${TAG} adding to the message failed:`, error)
		return false
	}
}
