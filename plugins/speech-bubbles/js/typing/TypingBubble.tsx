/**
 * The typing bubble: a compact "their bubble" coloured pill with three dots pulsing in turn, inside
 * the thin strip above the message box where Discord's "…is typing" line goes (the chat list leaves
 * room for it). It starts where their bubbles start and, in group chats, the typers' avatars sit
 * centred in the avatar column; both positions come from native (a row on screen, else Discord's
 * dimensions). It pops in with a spring and shrinks away when typing stops (kept mounted until the
 * animation is done).
 *
 * `valenced.*`-backed values (Design, ReactNative) are only read inside renders and effects
 * (docs/coding-rules.md rule 1).
 */

import { Design } from '@valenced/discord/design'
import { useEffect, useRef, useState } from 'react'
import * as ReactNative from 'react-native'
import { FloaterProbe } from '../../../../shared/chatFloaters'
import { chatMetrics } from '../native'
import { toHex6 } from '../theme'
import {
	avatarSource,
	GROUP_DM,
	selectedChannel,
	typingUserIds,
	useTypingStores,
} from './stores'
import type { ChatMetrics } from '../native'
import type { BasicChannel } from './stores'

export interface TypingLook {
	bg: string
	fg: string
	tails: boolean
	/** Typers' avatars in group chats (off with "Hide avatars"). */
	avatars: boolean
}

const DOT = 5
const AVATAR = 16
const AVATAR_OVERLAP = 6
const MAX_AVATARS = 3
/** Height of the strip above the message box Discord keeps for its typing line (as Character Counter). */
const STRIP = 26
const PILL = 20
/** Fallbacks before native has answered: Discord's usual 72dp content start and 16 + 40/2 avatar centre. */
const FALLBACK: Required<Omit<ChatMetrics, 'measured'>> = {
	bubbleLeft: 72,
	avatarCenter: 36,
}

let lastMetrics: ChatMetrics = {}

/** Typers in [channel] if the bubble should show there, else []. */
export function typersFor(
	channel: BasicChannel | undefined,
	everywhere: boolean,
): string[] {
	if (!channel) return []
	if (channel.guild_id && !everywhere) return []
	return typingUserIds(channel.id)
}

/** Three dots pulsing in turn; also drawn by the settings preview. */
export function Dots({ color }: { color: string }) {
	const { Animated, View } = ReactNative
	const dots = useRef<ReactNative.Animated.Value[] | null>(null)
	if (!dots.current) dots.current = [0, 1, 2].map(() => new Animated.Value(0.3))
	useEffect(() => {
		const values = dots.current ?? []
		const pulse = (v: ReactNative.Animated.Value) =>
			Animated.sequence([
				Animated.timing(v, {
					toValue: 1,
					duration: 300,
					useNativeDriver: true,
				}),
				Animated.timing(v, {
					toValue: 0.3,
					duration: 300,
					useNativeDriver: true,
				}),
			])
		const loop = Animated.loop(Animated.stagger(150, values.map(pulse)))
		loop.start()
		return () => loop.stop()
	}, [])
	return (
		<View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
			{(dots.current ?? []).map((opacity, i) => (
				<Animated.View
					key={i}
					style={{
						width: DOT,
						height: DOT,
						borderRadius: DOT / 2,
						backgroundColor: color,
						opacity,
					}}
				/>
			))}
		</View>
	)
}

function Avatars({
	ids,
	guildId,
	ring,
}: {
	ids: string[]
	guildId: string | null | undefined
	ring: string
}) {
	const { View, Image } = ReactNative
	const shown = ids.slice(0, MAX_AVATARS)
	return (
		<View style={{ flexDirection: 'row', alignItems: 'center' }}>
			{shown.map((id, i) => {
				const source = avatarSource(id, guildId)
				return (
					<View
						key={id}
						style={{
							width: AVATAR,
							height: AVATAR,
							borderRadius: AVATAR / 2,
							marginLeft: i === 0 ? 0 : -AVATAR_OVERLAP,
							borderWidth: 1.5,
							borderColor: ring,
							backgroundColor: ring,
							overflow: 'hidden',
						}}
					>
						{source ? (
							<Image
								source={source as any}
								style={{ width: '100%', height: '100%' }}
							/>
						) : null}
					</View>
				)
			})}
		</View>
	)
}

export function TypingBubble({
	look,
	everywhere,
}: {
	look: () => TypingLook
	everywhere: () => boolean
}) {
	const { Animated, View } = ReactNative
	useTypingStores()
	const channel = selectedChannel()
	const ids = typersFor(channel, everywhere())
	const visible = ids.length > 0

	// While shrinking away, keep showing who was typing.
	const last = useRef<{ ids: string[]; channel?: BasicChannel }>({ ids: [] })
	if (visible) last.current = { ids, channel }
	const [mounted, setMounted] = useState(visible)
	const [metrics, setMetrics] = useState<ChatMetrics>(lastMetrics)
	// Where the columns are: asked again each time someone starts typing (theme, avatars setting
	// or rotation may have moved them).
	useEffect(() => {
		if (!visible) return
		let live = true
		chatMetrics().then(m => {
			lastMetrics = m
			if (live) setMetrics(m)
		})
		return () => {
			live = false
		}
	}, [visible])
	const anim = useRef<ReactNative.Animated.Value | null>(null)
	if (!anim.current) anim.current = new Animated.Value(visible ? 1 : 0)

	useEffect(() => {
		const value = anim.current
		if (!value) return
		if (visible) {
			setMounted(true)
			const a = Animated.spring(value, {
				toValue: 1,
				friction: 6,
				tension: 120,
				useNativeDriver: true,
			})
			a.start()
			return () => a.stop()
		}
		const a = Animated.timing(value, {
			toValue: 0,
			duration: 160,
			useNativeDriver: true,
		})
		a.start(({ finished }) => {
			if (finished) setMounted(false)
		})
		return () => a.stop()
	}, [visible])

	if (!mounted && !visible) return null
	const { Text } = Design
	const { bg, fg, tails, avatars } = look()
	const shownChannel = last.current.channel
	const group =
		!!shownChannel &&
		(shownChannel.type === GROUP_DM || !!shownChannel.guild_id)
	const typers = last.current.ids
	const shownAvatars = Math.min(typers.length, MAX_AVATARS)
	const more = typers.length - shownAvatars
	const bgHex = toHex6(bg)
	const fgHex = toHex6(fg)
	const value = anim.current
	const bubbleLeft = metrics.bubbleLeft ?? FALLBACK.bubbleLeft
	const avatarCenter = metrics.avatarCenter ?? FALLBACK.avatarCenter
	const stackWidth = shownAvatars
		? AVATAR + (shownAvatars - 1) * (AVATAR - AVATAR_OVERLAP)
		: 0
	const pop = {
		opacity: value ?? 1,
		transform: [
			{
				scale:
					value?.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) ??
					1,
			},
		],
	}

	return (
		<View
			pointerEvents="none"
			style={{
				position: 'absolute',
				bottom: '100%',
				left: 0,
				right: 0,
				height: STRIP,
			}}
		>
			{group && avatars && shownAvatars ? (
				<Animated.View
					style={[
						{
							position: 'absolute',
							top: (STRIP - AVATAR) / 2,
							left: Math.max(4, avatarCenter - stackWidth / 2),
						},
						pop,
					]}
				>
					<Avatars ids={typers} guildId={shownChannel?.guild_id} ring={bgHex} />
				</Animated.View>
			) : null}
			<Animated.View
				style={[
					{
						position: 'absolute',
						top: (STRIP - PILL) / 2,
						left: bubbleLeft,
					},
					pop,
				]}
			>
				<View
					style={{
						height: PILL,
						borderRadius: PILL / 2,
						paddingHorizontal: 9,
						flexDirection: 'row',
						alignItems: 'center',
						gap: 5,
						backgroundColor: bgHex,
					}}
				>
					<Dots color={fgHex} />
					{group && more > 0 ? (
						<Text
							variant="text-xxs/semibold"
							style={{ color: fgHex }}
						>{`+${more}`}</Text>
					) : null}
				</View>
				{tails ? (
					<>
						<View
							style={{
								position: 'absolute',
								left: -2,
								bottom: -1,
								width: 6,
								height: 6,
								borderRadius: 3,
								backgroundColor: bgHex,
							}}
						/>
						<View
							style={{
								position: 'absolute',
								left: -5,
								bottom: -3,
								width: 3,
								height: 3,
								borderRadius: 1.5,
								backgroundColor: bgHex,
							}}
						/>
					</>
				) : null}
				{/* Tells other floaters above the message box (Character Counter, Read All) where it is. */}
				<FloaterProbe id="speech-bubbles-typing" />
			</Animated.View>
		</View>
	)
}
