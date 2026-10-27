import * as finders from '@valenced/modules/finders'
import * as filters from '@valenced/modules/finders/filters'
import * as React from 'react'
import * as ReactNative from 'react-native'
import { reportError } from '../../../../../shared/report'
import { tokenHex } from '../../lib/colours'
import { TAG } from '../../lib/state'
import {
	previewDistance,
	SWIPE_DISTANCE,
	SWIPE_TRAVEL,
	swipeDrag,
	useSwipeState,
} from '../../lib/swipe'
import type { ComponentType, ReactNode } from 'react'
import type { Animated } from 'react-native'
import type { Anchor, Stop, SwipeActions } from '../../lib/swipe'

const BLURPLE = '#5865F2'
const GREEN = '#23A55A'

/** Bands in the capsule's gradient: enough that no step shows at the capsule's full height. */
const BANDS = 40

/**
 * The send button's fill, for the bottom of the capsule, in the order most likely to be exactly it:
 *
 * 1. `CHAT_INPUT_SEND_BUTTON_ACTIVE_BACKGROUND`, Discord's own token for it (in the 348.5 bundle),
 *    resolved for the theme in use, so light, dark and a Themes plugin theme are all followed;
 * 2. the colour read off the button's style (`patches/sendButton.tsx`);
 * 3. the theme's brand colour, then blurple.
 *
 * 0.5.3 tried the style first and the brand colour second, and still drew blue.
 */
function sendButtonColour(fromStyle: unknown): string {
	return (
		tokenHex('CHAT_INPUT_SEND_BUTTON_ACTIVE_BACKGROUND') ??
		toHex(fromStyle) ??
		tokenHex('BACKGROUND_BRAND') ??
		BLURPLE
	)
}

/**
 * A colour as `#rrggbb`, from the forms a React Native style can carry: `#rgb`, `#rrggbb(aa)`,
 * `rgb()`/`rgba()`, or a processed 0xAARRGGBB number. Undefined for anything else (a named colour,
 * a platform colour object), and the caller falls back.
 */
function toHex(colour: unknown): string | undefined {
	const hex2 = (n: number) =>
		Math.max(0, Math.min(255, Math.round(n)))
			.toString(16)
			.padStart(2, '0')
	if (typeof colour === 'number' && Number.isFinite(colour)) {
		const n = colour >>> 0
		return `#${hex2((n >> 16) & 255)}${hex2((n >> 8) & 255)}${hex2(n & 255)}`
	}
	if (typeof colour !== 'string') return undefined
	const value = colour.trim()
	let m = /^#([0-9a-f]{3})$/i.exec(value)
	if (m)
		return `#${m[1]!
			.split('')
			.map(c => c + c)
			.join('')}`.toLowerCase()
	m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(value)
	if (m) return `#${m[1]!.toLowerCase()}`
	m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(value)
	if (m) return `#${hex2(+m[1]!)}${hex2(+m[2]!)}${hex2(+m[3]!)}`
	return undefined
}

function mix(from: string, to: string, t: number): string {
	const channel = (hex: string, i: number) =>
		Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
	const out = [0, 1, 2].map(i =>
		Math.round(channel(from, i) + (channel(to, i) - channel(from, i)) * t),
	)
	return `rgb(${out.join(', ')})`
}

/**
 * Top (green, send unchanged) to the send button's colour at the bottom, with nothing in between: the
 * middle (Preview) is whatever the two blend to. RN has no gradient fill and Discord's native
 * gradient view is not reachable by a stable name, so the gradient is thin stacked bands; the
 * capsule's rounded clip hides their square ends. Recomputed only when the bottom colour changes.
 */
let gradient: { top: string; bottom: string; bands: string[] } | undefined
const gradientBands = (top: string, bottom: string) => {
	if (gradient?.bottom !== bottom || gradient.top !== top) {
		gradient = {
			top,
			bottom,
			bands: Array.from({ length: BANDS }, (_, i) =>
				mix(top, bottom, i / (BANDS - 1)),
			),
		}
	}
	return gradient.bands
}

/** A label beside the capsule, level with one stop, lit while letting go would land on it. */
function StopLabel({
	top,
	right,
	opacity,
	lit,
	colour,
	idle,
	active,
}: {
	top: number
	right: number
	opacity: Animated.WithAnimatedValue<number>
	lit: boolean
	colour: string
	idle: string
	active: string
}) {
	const { Animated, Text } = ReactNative
	return (
		<Animated.View
			style={{
				position: 'absolute',
				right,
				top: top - 14,
				height: 28,
				justifyContent: 'center',
				paddingHorizontal: 12,
				borderRadius: 14,
				backgroundColor: lit ? colour : 'rgba(17, 18, 20, 0.9)',
				opacity,
			}}
		>
			<Text
				numberOfLines={1}
				style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}
			>
				{lit ? active : idle}
			</Text>
		</Animated.View>
	)
}

/**
 * Discord bundles `@gorhom/portal` (module 4708 on 348.5: `Portal`, `PortalHost`, `PortalProvider`,
 * `usePortal`). Its `Portal` draws its children into the app-level host, outside the chat bar, which
 * clips anything drawn past the send button's own bounds (0.4.1's indicator never showed).
 */
type PortalComponent = ComponentType<{ children?: ReactNode }>

interface PortalModule {
	Portal?: PortalComponent
	PortalHost?: unknown
	PortalProvider?: unknown
	default?: { Portal?: PortalComponent }
}

/** The icon drawn on the send button, as Discord's generated icon components take it. */
type IconComponent = ComponentType<{ size?: string; color?: string }>

function getPortal(): PortalComponent | undefined {
	try {
		const { lookupModule } = finders
		const { withProps } = filters
		const mod = lookupModule(
			withProps<PortalModule>('Portal', 'PortalHost', 'PortalProvider'),
		)?.[0]
		return mod?.Portal ?? mod?.default?.Portal
	} catch {
		return undefined
	}
}

let Boundary: ComponentType<{ children?: ReactNode }> | undefined

/**
 * Renders nothing instead of taking the chat bar down if the capsule throws -- for one, `Portal`
 * throws when there is no `PortalProvider` above the chat bar. Built on first use, because
 * `React.Component` must not be read at module scope.
 */
function getBoundary(): ComponentType<{ children?: ReactNode }> {
	if (Boundary) return Boundary
	Boundary = class extends (
		React.Component<{ children?: ReactNode }, { failed: boolean }>
	) {
		state = { failed: false }
		static getDerivedStateFromError() {
			return { failed: true }
		}
		componentDidCatch(error: unknown) {
			reportError(
				`${TAG} swipe capsule failed, hold-and-swipe still works without it:`,
				error,
			)
		}
		render() {
			return this.state.failed ? null : this.props.children
		}
	}
	return Boundary
}

/**
 * The hold-and-swipe capsule, like Google Allo's: while the gesture is armed the send button
 * stretches up into a tall bar with the button's own corners, and a knob carrying the send icon rides up it with the finger. It
 * has two stops, each with a label beside it that lights up once letting go would land there:
 * Preview halfway (a tick marks it on the pill), Send unchanged at the very top. The pill is a
 * gradient from the send button's own colour at the button to green at the top.
 *
 * Drawn exactly over the real button (its page position comes from the touch that went down on it),
 * through the app-level portal. `pointerEvents="none"`: the touch stays with the button underneath.
 */
function Capsule({
	Icon,
	anchor,
	armed,
	stop,
	actions,
	buttonColour,
	buttonRadius,
}: {
	Icon?: IconComponent
	anchor: Anchor
	armed: boolean
	stop: Stop
	actions: SwipeActions
	buttonColour?: unknown
	buttonRadius?: number
}) {
	const PREVIEW_DISTANCE = previewDistance(actions)
	const both = actions.preview && actions.send
	const { Animated, Dimensions, Text, View } = ReactNative

	const grow = React.useRef(new Animated.Value(0)).current
	React.useEffect(() => {
		Animated.spring(grow, {
			toValue: armed ? 1 : 0,
			// Height is a layout prop, so this one stays on the JS driver.
			useNativeDriver: false,
			friction: 8,
			tension: 160,
		}).start()
	}, [armed])

	const bottomColour = sendButtonColour(buttonColour)
	// Preview alone tops out in the colour Preview has when both are on.
	// (as hex: the gradient mixes hex colours).
	const topColour = actions.send
		? GREEN
		: (toHex(mix(GREEN, bottomColour, 0.5)) ?? GREEN)
	const size = Math.max(anchor.width, anchor.height)
	const knob = size - 8
	// The button's own corners at both ends, not a pill. When its radius can't be read, a rounded
	// square in the proportion Discord's send button has.
	const radius = Math.min(size / 2, buttonRadius ?? Math.round(size * 0.3))
	const knobRadius = Math.max(0, radius - 4)
	const drag = swipeDrag()
	const knobY = drag.interpolate({
		inputRange: [0, SWIPE_TRAVEL],
		outputRange: [0, -SWIPE_TRAVEL],
		extrapolate: 'clamp',
	})
	const previewOpacity = drag.interpolate({
		inputRange: [0, PREVIEW_DISTANCE * 0.4, PREVIEW_DISTANCE],
		outputRange: [0, 0.8, 1],
		extrapolate: 'clamp',
	})
	const sendFrom = both ? PREVIEW_DISTANCE : 0
	const sendOpacity = drag.interpolate({
		inputRange: [
			sendFrom,
			sendFrom + (SWIPE_DISTANCE - sendFrom) * 0.4,
			SWIPE_DISTANCE,
		],
		outputRange: [0, 0.8, 1],
		extrapolate: 'clamp',
	})

	// Bottom-anchored on the button: it grows upward from the button's own shape.
	const left = anchor.x + anchor.width / 2 - size / 2
	const bottom = anchor.y + anchor.height
	// Where the knob's centre sits when the finger is exactly at a stop.
	const knobCentre = (distance: number) => bottom - 4 - knob / 2 - distance
	const labelRight = Dimensions.get('window').width - left + 8

	return (
		<View
			pointerEvents="none"
			style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
		>
			<Animated.View
				style={{
					position: 'absolute',
					left,
					top: grow.interpolate({
						inputRange: [0, 1],
						outputRange: [bottom - size, bottom - size - SWIPE_TRAVEL],
					}),
					width: size,
					height: grow.interpolate({
						inputRange: [0, 1],
						outputRange: [size, size + SWIPE_TRAVEL],
					}),
					opacity: grow.interpolate({
						inputRange: [0, 0.15, 1],
						outputRange: [0, 1, 1],
					}),
					borderRadius: radius,
					backgroundColor: bottomColour,
					overflow: 'hidden',
					alignItems: 'center',
					justifyContent: 'flex-end',
					paddingBottom: 4,
					elevation: 8,
				}}
			>
				<View
					style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
				>
					{gradientBands(topColour, bottomColour).map((colour, i) => (
						<View key={i} style={{ flex: 1, backgroundColor: colour }} />
					))}
				</View>
				{/* The Preview stop's tick, measured from the capsule's bottom like the knob. Only when it is
				    a middle stop. */}
				{both ? (
					<View
						style={{
							position: 'absolute',
							left: size / 2 - 8,
							width: 16,
							height: 2,
							borderRadius: 1,
							bottom: 4 + knob / 2 + PREVIEW_DISTANCE - 1,
							backgroundColor: 'rgba(255, 255, 255, 0.6)',
						}}
					/>
				) : null}
				<Animated.View
					style={{
						width: knob,
						height: knob,
						borderRadius: knobRadius,
						alignItems: 'center',
						justifyContent: 'center',
						backgroundColor: stop
							? 'rgba(255, 255, 255, 0.45)'
							: 'rgba(255, 255, 255, 0.28)',
						transform: [{ translateY: knobY }],
					}}
				>
					{Icon ? (
						<Icon size="sm" color="#FFFFFF" />
					) : (
						<Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700' }}>
							↑
						</Text>
					)}
				</Animated.View>
			</Animated.View>

			{/* Labels sit just left of the capsule, each level with its stop; they leave with the capsule. */}
			{actions.preview ? (
				<StopLabel
					top={knobCentre(PREVIEW_DISTANCE)}
					right={labelRight}
					opacity={Animated.multiply(previewOpacity, grow)}
					lit={stop === 1}
					colour={mix(GREEN, bottomColour, 0.5)}
					idle="Preview"
					active="Let go to preview"
				/>
			) : null}
			{actions.send ? (
				<StopLabel
					top={knobCentre(SWIPE_DISTANCE)}
					right={labelRight}
					opacity={Animated.multiply(sendOpacity, grow)}
					lit={stop === 2}
					colour={GREEN}
					idle="Send unchanged"
					active="Let go to send unchanged"
				/>
			) : null}
		</View>
	)
}

export default function SwipeIndicator({
	Icon,
	actions,
	buttonColour,
	buttonRadius,
}: {
	Icon?: IconComponent
	actions: SwipeActions
	buttonColour?: unknown
	buttonRadius?: number
}) {
	const { armed, stop, anchor } = useSwipeState()
	const Portal = getPortal()
	if (!Portal || !anchor) return null
	const SafeBoundary = getBoundary()
	return (
		<SafeBoundary>
			<Portal>
				<Capsule
					Icon={Icon}
					anchor={anchor}
					armed={armed}
					stop={stop}
					actions={actions}
					buttonColour={buttonColour}
					buttonRadius={buttonRadius}
				/>
			</Portal>
		</SafeBoundary>
	)
}
