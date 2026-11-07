/**
 * The send animation, played in a made-up chat on the Send animation page: a message leaves a
 * pretend message box and lands as your bubble, the way "How it moves" and "Speed" are set. It
 * plays when the page opens and on every change, and again on a tap.
 *
 * Timings copy Flights.kt: iMessage is 300 ms (box shrinks into the bubble on Telegram's curves),
 * Pop is 380 ms with an overshoot, both times the speed. Nothing here touches the real chat.
 *
 * `valenced.*`-backed values are read inside renders and effects only (coding rule 1).
 */

import { Design } from '@valenced/discord/design'
import { useEffect, useRef, useState } from 'react'
import * as ReactNative from 'react-native'
import { SEND_SPEEDS } from '../../native'
import { chatBackground, effectiveColors, toHex6 } from '../../theme'
import type { ReactNode } from 'react'
import type { SpeechBubblesStorage } from '../../native'

const IMESSAGE_MS = 300
const POP_MS = 380
const TEXT = 'On my way! 🚗'
const PAD_H = 12
const PAD_V = 8
const BOX_H = 40

interface Rect {
	x: number
	y: number
	width: number
	height: number
}

export function SendPreview({ s }: { s: SpeechBubblesStorage }) {
	const { View, Pressable, Animated, Easing } = ReactNative
	const { Text } = Design

	const colors = effectiveColors(s)
	const chat = toHex6(chatBackground())
	const own = toHex6(colors.ownBg)
	const ownText = toHex6(colors.ownText)
	const other = toHex6(colors.otherBg)
	const otherText = toHex6(colors.otherText)
	const radius = s.bubbleRadius
	const pop = s.sendStyle === 'pop'
	const speed = SEND_SPEEDS[s.sendSpeed] ?? 1

	const progress = useRef<ReactNative.Animated.Value | null>(null)
	if (!progress.current) progress.current = new Animated.Value(1)
	const t = progress.current

	const [box, setBox] = useState<Rect | null>(null)
	const [target, setTarget] = useState<Rect | null>(null)
	// "typed": the text sits in the box; "flying"; "landed".
	const [phase, setPhase] = useState<'typed' | 'flying' | 'landed'>('landed')
	const [run, setRun] = useState(0)
	const timers = useRef<ReturnType<typeof setTimeout>[]>([])

	useEffect(() => {
		if (!box || !target) return
		for (const id of timers.current) clearTimeout(id)
		timers.current = []
		let anim: ReactNative.Animated.CompositeAnimation | undefined
		t.setValue(0)
		setPhase('typed')
		// A beat with the text in the box, as if just typed, then send.
		timers.current.push(
			setTimeout(() => {
				setPhase('flying')
				anim = Animated.timing(t, {
					toValue: 1,
					duration: (pop ? POP_MS : IMESSAGE_MS) * speed,
					easing: pop
						? Easing.out(Easing.back(1.6))
						: Easing.bezier(0.19919473, 0.010644531, 0.27920937, 0.9102539),
					// Size and colour move too, which the native driver can't do.
					useNativeDriver: false,
				})
				anim.start(({ finished }) => {
					if (finished) setPhase('landed')
				})
			}, 450),
		)
		return () => {
			anim?.stop()
			for (const id of timers.current) clearTimeout(id)
			timers.current = []
		}
	}, [box, target, pop, speed, run])

	const measure =
		(set: (update: (old: Rect | null) => Rect | null) => void) => (e: ReactNative.LayoutChangeEvent) => {
			const { x, y, width, height } = e.nativeEvent.layout
			// Only a real change restarts the animation.
			set(old =>
				old &&
				old.x === x &&
				old.y === y &&
				old.width === width &&
				old.height === height
					? old
					: { x, y, width, height },
			)
		}

	// The flying copy: from the box to the bubble (iMessage), or growing in place (Pop).
	let flyer: ReactNode = null
	if (phase === 'flying' && box && target) {
		const from = pop
			? {
					x: target.x + target.width * 0.2,
					y: target.y + target.height * 0.2,
					width: target.width * 0.6,
					height: target.height * 0.6,
				}
			: box
		const lerp = (a: number, b: number) =>
			t.interpolate({ inputRange: [0, 1], outputRange: [a, b] })
		flyer = (
			<Animated.View
				pointerEvents="none"
				style={{
					position: 'absolute',
					left: lerp(from.x, target.x),
					top: lerp(from.y, target.y),
					width: lerp(from.width, target.width),
					height: lerp(from.height, target.height),
					borderRadius: pop ? radius : lerp(BOX_H / 2, radius),
					backgroundColor: pop
						? own
						: t.interpolate({
								inputRange: [0, 0.6, 1],
								outputRange: [other, own, own],
							}),
					opacity: pop
						? t.interpolate({ inputRange: [0, 0.3], outputRange: [0, 1], extrapolate: 'clamp' })
						: 1,
					justifyContent: 'center',
					paddingHorizontal: PAD_H,
					overflow: 'hidden',
				}}
			>
				<Text
					variant="text-md/normal"
					numberOfLines={1}
					style={{ color: ownText }}
				>
					{TEXT}
				</Text>
			</Animated.View>
		)
	}

	return (
		<View style={{ gap: 8 }}>
			<Pressable
				onPress={() => setRun(n => n + 1)}
				accessibilityRole="button"
				accessibilityLabel="Play the send animation again"
				style={{
					backgroundColor: chat,
					borderRadius: 16,
					padding: 12,
					gap: 10,
					overflow: 'hidden',
				}}
			>
				<View
					style={{
						alignSelf: 'flex-start',
						backgroundColor: other,
						borderRadius: radius,
						paddingHorizontal: PAD_H,
						paddingVertical: PAD_V,
					}}
				>
					<Text variant="text-md/normal" style={{ color: otherText }}>
						Leaving now?
					</Text>
				</View>

				{/* Where your bubble lands; hidden until it has. */}
				<View
					onLayout={measure(setTarget)}
					style={{
						alignSelf: 'flex-end',
						backgroundColor: own,
						borderRadius: radius,
						paddingHorizontal: PAD_H,
						paddingVertical: PAD_V,
						opacity: phase === 'landed' ? 1 : 0,
					}}
				>
					<Text variant="text-md/normal" style={{ color: ownText }}>
						{TEXT}
					</Text>
				</View>

				<View
					onLayout={measure(setBox)}
					style={{
						height: BOX_H,
						borderRadius: BOX_H / 2,
						backgroundColor: other,
						justifyContent: 'center',
						paddingHorizontal: PAD_H + 4,
						marginTop: 6,
					}}
				>
					<Text
						variant="text-md/normal"
						numberOfLines={1}
						style={{ color: otherText, opacity: phase === 'typed' ? 1 : 0.5 }}
					>
						{phase === 'typed' ? TEXT : 'Message'}
					</Text>
				</View>

				{flyer}
			</Pressable>
			<Text color="text-muted" variant="text-sm/normal">
				{s.sendAnimation
					? 'Tap to play it again. Your real messages still send straight away.'
					: 'Tap to play it. Turn on Send animation to use it in chats.'}
			</Text>
		</View>
	)
}
