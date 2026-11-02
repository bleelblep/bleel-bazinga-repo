/**
 * Whether Discord's "Jump to present" button is showing in a channel, so the square can move up
 * out of its way.
 *
 * The button (`components_native/chat/JumpToPresentButton.tsx`) is a round icon button on the
 * right, just above the message box. It shows while
 * `useChatBottomManagerUIStore.getState().showJumpToPresentButtonChannelId.get(screenIndex)` is the
 * channel. That store (`modules/chat_input/native/useChatBottomManagerUIStore.tsx`) is a zustand
 * store on the module's `default`, next to `updateShouldShowJumpToPresentButton`. Every value in
 * it is a Map keyed by screen index. Traced in the 352.2 bundle with hermes-dec; the names are the
 * same in 352.6.
 *
 * Its size and right spacing are the tokens `modules.mobile.JUMP_TO_PRESENT_BUTTON_SIZE` and
 * `JUMP_TO_PRESENT_RIGHT_SPACING`: 40 and 12 on 352.6 (read on the phone, 2026-11-02), and the
 * fallback when they don't resolve.
 *
 * The button also hides while autocomplete is open. The square doesn't track that: moving up for
 * an autocomplete that covers that spot anyway costs nothing.
 */

import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { useEffect, useState } from 'react'

interface ChatBottomState {
	showJumpToPresentButtonChannelId?: unknown
}

interface UIStore {
	getState(): ChatBottomState
	subscribe(listener: () => void): () => void
}

let store: UIStore | undefined
let lastTry = 0
/** A miss is retried, but not on every keystroke. */
const RETRY_MS = 5000

function uiStore(): UIStore | undefined {
	if (store) return store
	const now = Date.now()
	if (now - lastTry < RETRY_MS) return undefined
	lastTry = now
	try {
		// Initialized scope (withProps' default), so a miss is never cached as permanent (coding rule 3).
		const [exports] = lookupModule(
			withProps<{ default?: unknown; updateShouldShowJumpToPresentButton?: unknown }>(
				'updateShouldShowJumpToPresentButton',
			),
		)
		const candidate = exports?.default as Partial<UIStore> | undefined
		if (
			typeof candidate?.getState === 'function' &&
			typeof candidate.subscribe === 'function'
		)
			store = candidate as UIStore
	} catch {
		/* the square just stays where it is */
	}
	return store
}

function showingIn(channelId: string): boolean {
	try {
		const map = uiStore()?.getState().showJumpToPresentButtonChannelId
		if (!(map instanceof Map)) return false
		for (const value of map.values()) if (value === channelId) return true
	} catch {
		/* unknown: don't move */
	}
	return false
}

const BUTTON_SIZE = 40
const RIGHT_SPACING = 12

/** A `modules.mobile` token's number, or the fallback. Read at call time, never at module scope. */
function mobileToken(name: string, fallback: number): number {
	try {
		const [found] = lookupModule(
			withProps<{ modules?: any; default?: { modules?: any }; unsafe_rawColors?: unknown; radii?: unknown }>(
				'unsafe_rawColors',
				'radii',
			),
		)
		const token = (found?.modules ?? found?.default?.modules)?.mobile?.[name]
		const value =
			typeof token?.resolve === 'function'
				? token.resolve({ enabledExperiments: [], density: 'default' })
				: token
		return typeof value === 'number' && value >= 0 && value < 200 ? value : fallback
	} catch {
		return fallback
	}
}

let clearance: number | undefined

/** How far from the right edge the button's left side is: its spacing plus its size. */
export function jumpButtonClearance(): number {
	clearance ??=
		mobileToken('JUMP_TO_PRESENT_RIGHT_SPACING', RIGHT_SPACING) +
		mobileToken('JUMP_TO_PRESENT_BUTTON_SIZE', BUTTON_SIZE)
	return clearance
}

/** Re-renders when the store changes. The same hooks run every render, found or not. */
export function useJumpToPresentShowing(channelId: string | undefined): boolean {
	const [, setTick] = useState(0)
	useEffect(() => {
		const s = uiStore()
		if (!s) return
		try {
			return s.subscribe(() => setTick(n => n + 1))
		} catch {
			return
		}
	}, [])
	return channelId ? showingIn(channelId) : false
}
