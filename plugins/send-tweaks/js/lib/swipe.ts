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

/**
 * How far up (dp) a flick (no hold) has to end for it to preview. Far enough that the finger is
 * clear of the pressable's press-retention area (20dp above it by default) even from the button's
 * bottom edge.
 */
export const FLICK_DISTANCE = 64

/** How far up (dp) before the flick's ghost button shows, so a tap's jitter draws nothing. */
export const FLICK_SHOW = 4

/** How far the ghost floats on past the finger when the flick previews. */
const FLICK_LIFT = 48

/**
 * The flick's ghost button (`ui/components/SwipeIndicator.tsx`): `moving` while the finger is on
 * its way up, `ready` once letting go would preview, `done` when it did, `idle` otherwise.
 */
export type FlickPhase = 'idle' | 'moving' | 'ready' | 'done'

type State = { armed: boolean; stop: Stop; anchor?: Anchor; flick: FlickPhase }

let state: State = { armed: false, stop: 0, flick: 'idle' }
const listeners = new Set<() => void>()
let drag: Animated.Value | undefined
let flick: Animated.Value | undefined

/** The flick's finger distance, like `swipeDrag`. Created on first use (coding rule 1). */
export function flickDrag(): Animated.Value {
	flick ??= new Animated.Value(0)
	return flick
}

export function setFlickDistance(up: number) {
	flickDrag().setValue(Math.max(0, up))
}

/*
 * A flick is over in about a tenth of a second, faster than React can redraw. So the ghost is drawn
 * entirely from these values, set straight from the touch handlers, and never waits for a render:
 * the finger's distance (`flickDrag`), whether this touch may show it (`flickShow`), and the float
 * on past the finger when it previews (`flickLift`). JS-driven throughout, since they are combined
 * with `flickDrag`, which `setValue` moves.
 */
let show: Animated.Value | undefined
let lift: Animated.Value | undefined

export function flickShow(): Animated.Value {
	show ??= new Animated.Value(0)
	return show
}

export function flickLift(): Animated.Value {
	lift ??= new Animated.Value(0)
	return lift
}

/** A new touch on the button: the ghost follows from here, still hidden until the finger rises. */
export function startFlick() {
	flickShow().stopAnimation()
	flickLift().stopAnimation()
	flickDrag().setValue(0)
	flickLift().setValue(0)
	flickShow().setValue(1)
}

/** Hides the ghost at once: the hold armed, so the capsule takes over. */
export function hideFlick() {
	flickShow().setValue(0)
}

/** The finger left: float the ghost on and fade it if it previewed, otherwise just fade it. */
export function endFlick(previewed: boolean) {
	const fade = Animated.timing(flickShow(), {
		toValue: 0,
		duration: previewed ? 220 : 140,
		useNativeDriver: false,
	})
	if (!previewed) {
		fade.start()
		return
	}
	Animated.parallel([
		fade,
		Animated.timing(flickLift(), {
			toValue: FLICK_LIFT,
			duration: 220,
			useNativeDriver: false,
		}),
	]).start()
}

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
		next.anchor === state.anchor &&
		next.flick === state.flick
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
