import * as React from 'react'
import { Animated } from 'react-native'

/**
 * The hold-and-swipe gesture's live state, shared between the touch handlers on the send button
 * (`patches/sendButton.tsx`) and the capsule drawn over it (`ui/components/SwipeIndicator.tsx`).
 *
 * `armed`/`stop`/the button's place change a few times per gesture and re-render the capsule. The
 * finger's position changes every frame, so it goes into an `Animated.Value` instead and never
 * re-renders anything.
 *
 * The stops follow the two swipe switches. Both on: Preview halfway, Send unchanged at the very top.
 * One on: its stop is at the top, so the whole capsule is one action.
 */

/** Where letting go lands: 0 cancels, 1 previews, 2 sends unchanged. */
export type Stop = 0 | 1 | 2

/** Which actions the swipe has, from the settings. */
export type SwipeActions = { preview: boolean; send: boolean }

/** How far the capsule stretches above the button, and so how far the knob can travel. */
export const SWIPE_TRAVEL = 168

/**
 * How far up (dp) the finger has to go before letting go previews: the middle of the capsule when
 * Send unchanged is also on, otherwise the top.
 */
export function previewDistance(actions: SwipeActions): number {
	return actions.send ? SWIPE_TRAVEL / 2 : SWIPE_TRAVEL
}

/**
 * How far up (dp) the finger has to go before letting go sends unchanged: always the top, where the
 * knob stops. The finger can overshoot (the knob is clamped), so reaching it needs no precision.
 */
export const SWIPE_DISTANCE = SWIPE_TRAVEL

/** The stop for a finger [up] dp above where it went down. */
export function stopAt(up: number, actions: SwipeActions): Stop {
	if (actions.send && up >= SWIPE_DISTANCE) return 2
	if (actions.preview && up >= previewDistance(actions)) return 1
	return 0
}

/** The send button's place on screen (page coordinates), taken from the touch that went down on it. */
export type Anchor = { x: number; y: number; width: number; height: number }

type State = { armed: boolean; stop: Stop; anchor?: Anchor }

let state: State = { armed: false, stop: 0 }
const listeners = new Set<() => void>()
let drag: Animated.Value | undefined

/** Created on first use: `valenced.react` must not be read at module scope (coding rule 1). */
export function swipeDrag(): Animated.Value {
	drag ??= new Animated.Value(0)
	return drag
}

export function setSwipe(patch: Partial<State>) {
	const next = { ...state, ...patch }
	if (
		next.armed === state.armed &&
		next.stop === state.stop &&
		next.anchor === state.anchor
	)
		return
	state = next
	for (const listener of listeners) {
		try {
			listener()
		} catch {
			/* one broken listener must not stop the gesture */
		}
	}
}

/** Where the finger is: how far up (dp) from where it went down, clamped to the capsule. */
export function setSwipeDistance(up: number) {
	swipeDrag().setValue(Math.max(0, Math.min(SWIPE_TRAVEL, up)))
}

/** The gesture state, re-rendering whenever it changes. Call like a hook. */
export function useSwipeState(): State {
	const [, redraw] = React.useReducer((n: number) => n + 1, 0)
	React.useEffect(() => {
		listeners.add(redraw)
		return () => {
			listeners.delete(redraw)
		}
	}, [])
	return state
}
