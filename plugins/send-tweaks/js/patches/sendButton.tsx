/**
 * Hold the send button and swipe up to preview the message or send it unchanged.
 *
 * ## Where the button is (Discord 348, checked live over devtools)
 *
 * `ChatInputSendButton` (`modules/chat_input/native/accessories/`) renders a transition group whose
 * item is a memo that finally draws `ChatInputActionButton`
 * (`modules/chat_input/native/action_buttons/ChatInputActionButton.tsx`, a `memo(forwardRef(...))`
 * up to 349, a plain `memo(...)` from 350.2 alpha; `lib/renderHost.ts` handles both).
 * That same component draws the chat bar's other round buttons too. Its render returns a pressable
 * with `onPress` and `disabled`, holding the icon it was given. The send button is the one whose
 * icon is the `SendMessageIcon` export resolved by imported path. Discord 349.5 strips its function
 * name; neither that name nor the translated accessibility label ("Send") can identify it.
 *
 * `ChatInputActionButton` takes no `onLongPress` and drops unknown props, so the prop is added to
 * the pressable it returns. The pressable honours it, and a long-press does not also send.
 *
 * ## Hold and swipe
 *
 * The long-press only arms the gesture; the finger's raw touch events (`onTouchMove`,
 * `onTouchEnd`, which go to the view the touch started on wherever the finger goes) decide the rest.
 * While armed, `ui/components/SwipeIndicator.tsx` draws a slide track above the button whose knob
 * follows the finger. With both swipe switches on the track has two stops: letting go halfway shows
 * a preview (`lib/preview.ts`), at the top sends unchanged, and anywhere lower cancels. With one on,
 * its stop is the top (`lib/swipe.ts`). The long-press is what keeps this from also sending normally: once
 * it fires, the pressable never calls `onPress` for that touch. A quick swipe with no hold never
 * arms and never sends, because the finger leaves the button before the press could count.
 *
 * The pressable passes the touch props on to its view (checked live on 348.5). If it ever stops,
 * `onTouchStart` never arrives and the swipe can't be followed; the long-press then opens the
 * preview straight away instead of doing nothing.
 *
 * ## Tap to preview
 *
 * Not everyone can hold and slide (testers reported the hold never registering, and some people
 * just can't do the gesture). With "Tap send to preview" on, a plain tap opens the preview, and its
 * Send button calls Discord's own `onPress`. An empty or unreadable draft (attachments only, the
 * composer not found yet) and slash commands send normally, so a tap never gets stuck.
 *
 * ## An `instead` on the render
 *
 * The hook needs the props (to recognise the send button by its icon) and the rendered element (to
 * add props to it), so it is an `instead` that calls the original and works on the result. It only
 * adds props to the send button's output; every other button, and the send button's tap, are
 * untouched. Round Icons hooks the same component; both go through the patcher, which chains them.
 *
 * While the button is disabled (nothing typed yet) the pressable ignores presses, so none of this
 * happens until there is something to send.
 */

import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { instead } from '@valenced/patcher'
import * as React from 'react'
import * as ReactNative from 'react-native'
import { Vibration } from 'react-native'
import { reportError } from '../../../../shared/report'
import { composerContext, readComposer } from '../lib/composer'
import { sendOnce } from '../lib/nextSend'
import { showPreview } from '../lib/preview'
import { renderHost } from '../lib/renderHost'
import { settings, TAG } from '../lib/state'
import { setSwipe, setSwipeDistance, stopAt } from '../lib/swipe'
import SwipeIndicator from '../ui/components/SwipeIndicator'
import type { ComponentType, ReactElement, ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import type { Stop, SwipeActions } from '../lib/swipe'

const DEBUG: boolean = false

const PATH =
	'modules/chat_input/native/action_buttons/ChatInputActionButton.tsx'
const ICON_PATH =
	'design/components/Icon/native/redesign/generated/SendMessageIcon.tsx'

/** What `ChatInputActionButton` is given. The icon is what identifies the send button. */
interface ActionButtonProps {
	IconComponent?: ComponentType<{ size?: string; color?: string }>
	backgroundColor?: unknown
	color?: unknown
}

/** A touch event as React Native delivers it: only the fields read here. */
interface TouchEvent {
	nativeEvent?: { pageX?: number; pageY?: number }
	currentTarget?: {
		measureInWindow?: (
			callback: (x: number, y: number, width: number, height: number) => void,
		) => void
	}
}

type TouchHandler = (event: TouchEvent) => void
type TouchProp = 'onTouchStart' | 'onTouchMove' | 'onTouchEnd' | 'onTouchCancel'

/** The pressable the button renders: the props this plugin reads, chains or adds. */
interface PressableProps {
	onPress?: (...args: unknown[]) => void
	onLongPress?: () => void
	delayLongPress?: number
	disabled?: boolean
	style?:
		| StyleProp<ViewStyle>
		| ((state: { pressed: boolean }) => StyleProp<ViewStyle>)
	children?: ReactNode
	onTouchStart?: TouchHandler
	onTouchMove?: TouchHandler
	onTouchEnd?: TouchHandler
	onTouchCancel?: TouchHandler
}

type ButtonElement = ReactElement<PressableProps>
type SendPress = PressableProps['onPress']

/** Counts for the Debug page. Kept only in debug builds. */
const status = {
	installed: false,
	moduleId: -1,
	swiped: 0,
	previewed: 0,
	tapped: 0,
	fallbacks: 0,
	touchesSeen: false,
}

export function sendButtonStatus() {
	return { ...status }
}

/** The touch in progress on the send button. One finger, one button: module state is enough. */
const gesture = { touched: false, armed: false, stop: 0 as Stop, startY: 0 }

function buzz(ms: number) {
	try {
		Vibration.vibrate(ms)
	} catch {
		/* no vibration is fine */
	}
}

/**
 * Where the button is on screen, for the capsule drawn over it. `currentTarget` is the pressable's
 * own view (the touch's `target` may be the icon inside it), so measuring it gives the whole button.
 * Falls back to a 40dp square around the finger if the view can't be measured.
 */
function anchorFrom(event: TouchEvent) {
	const n = event.nativeEvent
	const guess = () =>
		setSwipe({
			anchor: {
				x: (n?.pageX ?? 0) - 20,
				y: (n?.pageY ?? 0) - 20,
				width: 40,
				height: 40,
			},
		})
	const view = event.currentTarget
	if (typeof view?.measureInWindow !== 'function') {
		guess()
		return
	}
	try {
		view.measureInWindow((x, y, width, height) => {
			if (width > 0 && height > 0) setSwipe({ anchor: { x, y, width, height } })
			else guess()
		})
	} catch {
		guess()
	}
}

/** Calls the pressable's own handler for [name], if it had one, before ours. */
function chain(
	element: ButtonElement,
	name: TouchProp,
	ours: TouchHandler,
): TouchHandler {
	const theirs = element.props[name]
	return event => {
		if (typeof theirs === 'function') theirs(event)
		try {
			ours(event)
		} catch (error) {
			reportError(`${TAG} send button ${name} failed:`, error)
		}
	}
}

function swipeProps(
	element: ButtonElement,
	send: SendPress,
	actions: SwipeActions,
	getDraft: () => string | undefined,
): Partial<PressableProps> {
	const sendFn = send ? () => send() : undefined
	const pageY = (event: TouchEvent): number =>
		event.nativeEvent?.pageY ?? gesture.startY
	const end = () => {
		gesture.touched = false
		gesture.armed = false
		gesture.stop = 0
		setSwipe({ armed: false, stop: 0 })
		setSwipeDistance(0)
	}
	return {
		delayLongPress: 250,
		onLongPress: () => {
			// The pressable dropped the touch props, so the swipe can't be followed: the hold alone
			// previews instead (or sends unchanged, when that is the only action).
			if (!gesture.touched) {
				if (DEBUG) status.fallbacks++
				buzz(10)
				if (actions.preview) {
					if (showPreview(getDraft(), sendFn) && DEBUG) status.previewed++
				} else if (actions.send) {
					if (DEBUG) status.swiped++
					sendOnce('raw', sendFn)
				}
				return
			}
			gesture.armed = true
			gesture.stop = 0
			setSwipeDistance(0)
			setSwipe({ armed: true, stop: 0 })
			buzz(10)
		},
		onTouchStart: chain(element, 'onTouchStart', event => {
			gesture.touched = true
			gesture.armed = false
			gesture.stop = 0
			gesture.startY = pageY(event)
			if (DEBUG) status.touchesSeen = true
			anchorFrom(event)
		}),
		onTouchMove: chain(element, 'onTouchMove', event => {
			if (!gesture.armed) return
			const up = gesture.startY - pageY(event)
			setSwipeDistance(up)
			const stop = stopAt(up, actions)
			if (stop === gesture.stop) return
			const higher = stop > gesture.stop
			gesture.stop = stop
			setSwipe({ stop })
			// A tick for each stop reached on the way up; nothing on the way back down.
			if (higher) buzz(stop === 2 ? 20 : 12)
		}),
		onTouchEnd: chain(element, 'onTouchEnd', event => {
			const armed = gesture.armed
			const stop = stopAt(gesture.startY - pageY(event), actions)
			end()
			if (!armed) return
			// Letting go below the first stop cancels.
			if (stop === 1) {
				if (showPreview(getDraft(), sendFn) && DEBUG) status.previewed++
			} else if (stop === 2) {
				if (DEBUG) status.swiped++
				sendOnce('raw', sendFn)
			}
		}),
		onTouchCancel: chain(element, 'onTouchCancel', () => end()),
	}
}

/** A pressable's style as one object, whether it was given as a list or a function of state. */
function flatStyle(style: PressableProps['style']): ViewStyle | undefined {
	const { StyleSheet } = ReactNative
	const raw = typeof style === 'function' ? style({ pressed: false }) : style
	return (StyleSheet.flatten(raw) ?? undefined) as ViewStyle | undefined
}

/**
 * The send button's corner radius, so the capsule has the same corners: the first `borderRadius`
 * on the pressable or the views inside it (a few levels down; the icon is the innermost). Undefined
 * when none carries one, and the capsule uses its own guess.
 */
function buttonRadius(element: ButtonElement): number | undefined {
	// Round Icons draws the send button as a circle and says so (its lib/bridge.ts); measuring the
	// element here could still see Discord's rounded square, since both plugins hook the same
	// component and ours may run first. Then the capsule's corner is half the button's size.
	try {
		const bridge = (
			globalThis as { __bleelblepSquares?: { sendRound?: boolean } }
		).__bleelblepSquares
		if (bridge?.sendRound === true) {
			const flat = flatStyle(element.props.style)
			const size = Math.min(
				typeof flat?.width === 'number' ? flat.width : Infinity,
				typeof flat?.height === 'number' ? flat.height : Infinity,
			)
			if (Number.isFinite(size) && size > 0) return size / 2
		}
	} catch {
		/* no bridge */
	}
	try {
		let node: ReactNode = element
		for (
			let depth = 0;
			depth < 4 && React.isValidElement<PressableProps>(node);
			depth++
		) {
			const radius = flatStyle(node.props.style)?.borderRadius
			if (typeof radius === 'number' && radius >= 0) return radius
			const children: ReactNode = node.props.children
			node = Array.isArray(children)
				? (children as ReactNode[]).find(child => React.isValidElement(child))
				: children
		}
	} catch {
		/* the capsule's own guess */
	}
	return undefined
}

/**
 * The send button's own fill, so the swipe capsule grows out of it in the same colour. Read off the
 * pressable's style (or a colour prop on the action button); undefined when neither carries one, and
 * the capsule then falls back to the theme's brand colour.
 */
function buttonColour(
	element: ButtonElement,
	props: ActionButtonProps,
): unknown {
	try {
		const own = flatStyle(element.props.style)?.backgroundColor
		if (own != null) return own
		const child = element.props.children
		const inner = React.isValidElement<PressableProps>(child)
			? flatStyle(child.props.style)?.backgroundColor
			: undefined
		if (inner != null) return inner
		return props.backgroundColor ?? props.color
	} catch {
		return undefined
	}
}

/**
 * Tap send to preview: the tap opens the preview instead of sending. Anything there is nothing to
 * preview for (empty or unreadable draft, a slash command) goes straight to Discord's own `onPress`.
 */
function tapProps(
	send: SendPress,
	getDraft: () => string | undefined,
): Partial<PressableProps> {
	return {
		onPress: (...args: unknown[]) => {
			const draft = getDraft()
			if (
				draft === undefined ||
				!draft.trim() ||
				draft.trimStart().startsWith('/')
			) {
				send?.(...args)
				return
			}
			try {
				if (showPreview(draft, send && (() => send(...args)))) {
					if (DEBUG) status.tapped++
					return
				}
			} catch (error) {
				reportError(`${TAG} tap preview failed, sending normally:`, error)
			}
			send?.(...args)
		},
	}
}

/** A separate component keeps our context hook out of Discord's own hook chain. */
function SwipeButton({
	element,
	buttonProps,
	actions,
	tapPreview,
}: {
	element: ButtonElement
	buttonProps: ActionButtonProps
	actions: SwipeActions
	tapPreview: boolean
}) {
	const composer = React.useContext(composerContext())
	const getDraft = () => readComposer(composer)
	const swipe = actions.preview || actions.send
	const send = element.props.onPress
	return React.cloneElement(
		element,
		{
			...(swipe ? swipeProps(element, send, actions, getDraft) : null),
			...(tapPreview ? tapProps(send, getDraft) : null),
		},
		element.props.children,
		!swipe ? null : (
			<SwipeIndicator
				key="send-tweaks-swipe"
				Icon={buttonProps.IconComponent}
				actions={actions}
				buttonColour={buttonColour(element, buttonProps)}
				buttonRadius={buttonRadius(element)}
			/>
		),
	)
}

export default function patchSendButton(): () => void {
	let undo: (() => void) | undefined
	let sendIcon: unknown

	const install = (exports: unknown, id: number) => {
		if (undo) return
		const target = renderHost<ActionButtonProps>(exports)
		if (!target) {
			reportError(
				`${TAG} could not hook the send button: module ${id} is neither memo(forwardRef) nor memo(function)`,
			)
			return
		}

		let active = true
		const unpatch = instead(target.host, target.key, function (args, original) {
			const element = original.apply(this, args)
			const [props] = args
			const s = settings()
			const actions = {
				preview: !!s.swipePreview,
				send: !!s.swipeSendUnchanged,
			}
			const tapPreview = !!s.tapToPreview
			if (!active || (!actions.preview && !actions.send && !tapPreview))
				return element
			try {
				if (!React.isValidElement<PressableProps>(element)) return element
				const child = element.props.children
				const icon =
					props?.IconComponent ??
					(React.isValidElement(child) ? child.type : undefined)
				if (!sendIcon || icon !== sendIcon) return element
				return (
					<SwipeButton
						element={element}
						buttonProps={props ?? {}}
						actions={actions}
						tapPreview={tapPreview}
					/>
				)
			} catch (error) {
				reportError(`${TAG} send button long-press failed:`, error)
				return element
			}
		})

		status.installed = true
		status.moduleId = id
		if (DEBUG) console.log(`${TAG} send button long-press on module ${id}`)
		undo = () => {
			active = false
			unpatch()
		}
	}

	let unsubscribe: (() => void) | undefined
	let unsubscribeIcon: (() => void) | undefined
	try {
		unsubscribeIcon = getModuleWithImportedPath<{ SendMessageIcon?: unknown }>(
			ICON_PATH,
			exports => {
				sendIcon = exports?.SendMessageIcon
			},
		)
		unsubscribe = getModuleWithImportedPath<unknown>(PATH, (exports, id) =>
			install(exports, id),
		)
	} catch (error) {
		reportError(`${TAG} could not look for the send button:`, error)
	}

	return () => {
		status.installed = false
		unsubscribe?.()
		unsubscribeIcon?.()
		undo?.()
		sendIcon = undefined
		undo = undefined
	}
}
