/**
 * A small made-up chat drawn the way the plugin draws the real one, one per settings page, each
 * showing only what that page changes:
 *
 * - Visual style: a time break, Alex's run (avatar, name, joined corners, tail), your reply, and
 *   the typing bubble (or Discord's "…is typing" line).
 * - Colours: Alex, Sam and you, one message each, so colour per person shows.
 * - Message times: one bubble each side; tapping shows its time the way "Message times" is set.
 *
 * Every setting is read live.
 *
 * Sizes and colours copy the native drawing (SpeechBubblesPlugin.kt, BubbleDrawable.kt,
 * TimeTag.kt, TimePopup.kt), so the two should change together. It sits on the theme's chat
 * background (settings design guide §3.5), because their bubbles are picked against that colour.
 *
 * The avatars are hand-drawn initials, not Discord's Avatar (§3.7): these people aren't real users,
 * so there is no user or picture for Discord's component to show.
 *
 * `valenced.*`-backed values are read inside renders and effects only (coding rule 1).
 */

import { Design } from '@valenced/discord/design'
import { useEffect, useRef, useState } from 'react'
import * as ReactNative from 'react-native'
import {
	chatBackground,
	effectiveColors,
	personColor,
	toHex6,
} from '../../theme'
import { Dots } from '../../typing/TypingBubble'
import type { SpeechBubblesStorage } from '../../native'

// Native's sizes, in dp.
const RADIUS = 18
const SMALL_RADIUS = 6
const TAIL_W = 6
const TAIL_H = 14
const PAD_H = 12
const PAD_V = 8
const RIGHT_GAP = 8
const NAME_GAP = 6
const AVATAR_MARGIN = 12
const AVATAR = 32
const AVATAR_GAP = 10
const TIME_SP = 11
const TIME_INSET = 4
const BREAK_SP = 12
const BREAK_PAD = 12
const BREAK_RULE_MARGIN = 16
const POPUP_MS = 3000

type Who = 'alex' | 'sam' | 'me'

interface Message {
	id: string
	who: Who
	text: string
	/** How long ago it was sent, for its time. */
	minutesAgo: number
}

const PEOPLE: Record<Exclude<Who, 'me'>, { name: string; slot: number }> = {
	alex: { name: 'Alex', slot: 2 },
	sam: { name: 'Sam', slot: 5 },
}

export type PreviewPage = 'visual' | 'colours' | 'times'

const SCENES: Record<PreviewPage, Message[]> = {
	visual: [
		{ id: 'a1', who: 'alex', text: 'Still up for tonight?', minutesAgo: 9 },
		{ id: 'a2', who: 'alex', text: 'Thinking pizza at 7 🍕', minutesAgo: 9 },
		{ id: 'm1', who: 'me', text: 'Yes! See you there', minutesAgo: 2 },
	],
	colours: [
		{ id: 'a1', who: 'alex', text: 'Still up for tonight?', minutesAgo: 9 },
		{ id: 's1', who: 'sam', text: 'Count me in!', minutesAgo: 6 },
		{ id: 'm1', who: 'me', text: 'Yes! See you both there', minutesAgo: 2 },
	],
	times: [
		{
			id: 'a1',
			who: 'alex',
			text: 'Tap a bubble to see when it was sent',
			minutesAgo: 9,
		},
		{ id: 'm1', who: 'me', text: 'Like this one', minutesAgo: 2 },
	],
}

/** The phone's own time format where Hermes has Intl, else 12-hour. */
function clock(at: Date): string {
	try {
		return at.toLocaleTimeString(undefined, {
			hour: 'numeric',
			minute: '2-digit',
		})
	} catch {
		const h = at.getHours()
		const m = String(at.getMinutes()).padStart(2, '0')
		return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`
	}
}

const sentAt = (m: Message) => new Date(Date.now() - m.minutesAgo * 60_000)

/** `#RRGGBB` plus a two-digit alpha. */
const withAlpha = (hex: string, alpha: string) => `${toHex6(hex)}${alpha}`

/**
 * The tail: a bubble-coloured block at the bottom corner, with a chat-coloured block beside it whose
 * rounded corner carves the curve, as tall as native's tail and as wide. Needs an opaque chat
 * colour, which [ChatPreview] makes sure of.
 */
function Tail({
	right,
	bg,
	chat,
}: {
	right: boolean
	bg: string
	chat: string
}) {
	const { View } = ReactNative
	const CUT = TAIL_H
	return (
		<>
			<View
				pointerEvents="none"
				style={{
					position: 'absolute',
					bottom: 0,
					...(right ? { right: 0 } : { left: 0 }),
					width: TAIL_W + RADIUS - 4,
					height: TAIL_H,
					backgroundColor: bg,
				}}
			/>
			<View
				pointerEvents="none"
				style={{
					position: 'absolute',
					bottom: 0,
					...(right
						? { right: TAIL_W - CUT, borderBottomLeftRadius: CUT }
						: { left: TAIL_W - CUT, borderBottomRightRadius: CUT }),
					width: CUT,
					height: TAIL_H + 1,
					backgroundColor: chat,
				}}
			/>
		</>
	)
}

/** The time pop-up above a bubble: its own colours, a soft shadow, gone after three seconds. */
function Popup({
	label,
	right,
	inset,
	bg,
	fg,
}: {
	label: string
	right: boolean
	inset: number
	bg: string
	fg: string
}) {
	const { Animated } = ReactNative
	const { Text } = Design
	const fade = useRef<ReactNative.Animated.Value | null>(null)
	if (!fade.current) fade.current = new Animated.Value(0)
	useEffect(() => {
		const a = Animated.timing(fade.current!, {
			toValue: 1,
			duration: 150,
			useNativeDriver: true,
		})
		a.start()
		return () => a.stop()
	}, [])
	return (
		<Animated.View
			pointerEvents="none"
			style={{
				position: 'absolute',
				bottom: '100%',
				marginBottom: 4,
				...(right ? { right: inset } : { left: inset }),
				opacity: fade.current,
				backgroundColor: bg,
				borderRadius: 999,
				paddingHorizontal: 8,
				paddingVertical: 4,
				elevation: 3,
				zIndex: 2,
			}}
		>
			<Text variant="text-xs/medium" style={{ color: fg, fontSize: 12 }}>
				{label}
			</Text>
		</Animated.View>
	)
}

function hint(page: PreviewPage, s: SpeechBubblesStorage): string {
	if (page === 'visual') return 'Changes as you flip the switches below.'
	if (page === 'colours')
		return s.perPerson
			? 'In a group chat like this one, Alex and Sam each get their own colour.'
			: 'Turn on colour per person to give Alex and Sam their own colours.'
	const tap =
		s.times === 'hidden'
			? 'Times are hidden. Pick another option, then tap a bubble.'
			: 'Tap a bubble to see when it was sent.'
	return s.swipeTimes
		? `${tap} In a chat, drag left with two fingers to see every time at once.`
		: tap
}

export function ChatPreview({
	s,
	page,
}: {
	s: SpeechBubblesStorage
	page: PreviewPage
}) {
	const MESSAGES = SCENES[page]
	const breaks = page === 'visual' && s.timeBreaks
	const tappable = page === 'times' && s.times !== 'hidden'
	const { View, Pressable } = ReactNative
	const { Text } = Design

	// Times shown under bubbles ("Tap: under the bubble"), and the one pop-up showing.
	const [below, setBelow] = useState<string[]>([])
	const [popup, setPopup] = useState<string | null>(null)
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
	const clearTimer = () => {
		if (timer.current) clearTimeout(timer.current)
		timer.current = null
	}
	// A new times setting starts clean, as in chat; nothing is left running after the page closes.
	useEffect(() => {
		setBelow([])
		setPopup(null)
		clearTimer()
	}, [s.times])
	useEffect(() => clearTimer, [])

	const tap = (id: string) => {
		if (!tappable) return
		if (s.times === 'below')
			setBelow(shown =>
				shown.includes(id) ? shown.filter(x => x !== id) : [...shown, id],
			)
		else if (s.times === 'popup') {
			clearTimer()
			if (popup === id) {
				setPopup(null)
				return
			}
			setPopup(id)
			timer.current = setTimeout(() => setPopup(null), POPUP_MS)
		}
	}

	const colors = effectiveColors(s)
	// Opaque, so the tail's cut-out matches what is behind it.
	const chat = toHex6(chatBackground())
	const bgOf = (who: Who) => {
		if (who === 'me') return toHex6(colors.ownBg)
		const base = colors.otherBg
		return toHex6(s.perPerson ? personColor(base, PEOPLE[who].slot) : base)
	}
	const fgOf = (who: Who) =>
		toHex6(who === 'me' ? colors.ownText : colors.otherText)
	// Text on the chat background (times, breaks): the theme's text colour, or light grey with
	// own colours, whose text colours are picked for the bubbles (as native does).
	const onChat = s.colors === 'own' ? '#DBDEE1' : toHex6(colors.otherText)
	const avatars = !s.hideAvatars
	const left = avatars ? AVATAR_MARGIN + AVATAR + AVATAR_GAP : AVATAR_MARGIN
	const tailInset = s.tails ? TAIL_W : 0

	const first = MESSAGES[0]
	const label = (m: Message) => `Today at ${clock(sentAt(m))}`

	const rows = MESSAGES.map((m, i) => {
		const prev = MESSAGES[i - 1]
		const next = MESSAGES[i + 1]
		const right = m.who === 'me'
		const startsRun = prev?.who !== m.who
		const endsRun = next?.who !== m.who
		const timeHere = below.includes(m.id)
		// A time under a bubble splits the run there: both bubbles get full corners (0.3.4).
		const joinTop = !startsRun && !below.includes(prev.id)
		const joinBottom = !endsRun && !timeHere
		// The "Roundness" setting, as native draws it (joined corners a third of it, at most 6).
		const radius = s.bubbleRadius
		const small = Math.min(SMALL_RADIUS, radius / 3)
		const top = joinTop ? small : radius
		const bottom = joinBottom ? small : radius
		const bg = bgOf(m.who)
		const fg = fgOf(m.who)
		const person = right ? undefined : PEOPLE[m.who as Exclude<Who, 'me'>]

		const bubble = (
			<Pressable
				onPress={() => tap(m.id)}
				disabled={!tappable}
				accessibilityRole={tappable ? 'button' : undefined}
				accessibilityHint={tappable ? 'Shows when it was sent' : undefined}
				style={{
					maxWidth: '75%',
					...(right ? { paddingRight: tailInset } : { paddingLeft: tailInset }),
				}}
			>
				{s.tails && !joinBottom ? (
					<Tail right={right} bg={bg} chat={chat} />
				) : null}
				<View
					style={{
						backgroundColor: bg,
						paddingHorizontal: PAD_H,
						paddingVertical: PAD_V,
						borderRadius: radius,
						// The tail side's corners are the ones that join (BubbleDrawable).
						...(right
							? { borderTopRightRadius: top, borderBottomRightRadius: bottom }
							: { borderTopLeftRadius: top, borderBottomLeftRadius: bottom }),
					}}
				>
					<Text variant="text-md/normal" style={{ color: fg }}>
						{m.text}
					</Text>
				</View>
				{popup === m.id ? (
					<Popup
						label={label(m)}
						right={right}
						inset={tailInset}
						bg={bg}
						fg={fg}
					/>
				) : null}
			</Pressable>
		)

		return (
			<View
				key={m.id}
				style={{
					marginTop: i === 0 ? 0 : startsRun ? 12 : 2,
					paddingLeft: right ? 0 : left,
					paddingRight: right ? RIGHT_GAP : 0,
					alignItems: right ? 'flex-end' : 'flex-start',
				}}
			>
				{person && startsRun ? (
					<>
						{avatars ? (
							<View
								style={{
									position: 'absolute',
									left: AVATAR_MARGIN,
									top: 0,
									width: AVATAR,
									height: AVATAR,
									borderRadius: AVATAR / 2,
									backgroundColor: bgOf(m.who),
									alignItems: 'center',
									justifyContent: 'center',
								}}
							>
								<Text variant="text-sm/semibold" style={{ color: fg }}>
									{person.name[0]}
								</Text>
							</View>
						) : null}
						<View
							style={{
								flexDirection: 'row',
								alignItems: 'baseline',
								gap: 6,
								marginBottom: NAME_GAP,
							}}
						>
							<Text variant="text-sm/semibold" color="text-default">
								{person.name}
							</Text>
						</View>
					</>
				) : null}
				{bubble}
				{timeHere ? (
					<Text
						style={{
							fontSize: TIME_SP,
							color: withAlpha(onChat, 'B3'),
							marginTop: 2,
							...(right
								? { marginRight: tailInset + TIME_INSET }
								: { marginLeft: tailInset + TIME_INSET }),
						}}
					>
						{label(m)}
					</Text>
				) : null}
			</View>
		)
	})

	const breakColor = withAlpha(onChat, 'E0')
	const rule = withAlpha(onChat, '66')

	return (
		<View style={{ gap: 8 }}>
			<View
				style={{
					backgroundColor: chat,
					borderRadius: 16,
					paddingTop: breaks ? 0 : 16,
					paddingBottom: 12,
				}}
			>
				{breaks ? (
					<View
						style={{
							flexDirection: 'row',
							alignItems: 'center',
							gap: 10,
							paddingVertical: BREAK_PAD,
							paddingHorizontal: BREAK_RULE_MARGIN,
						}}
					>
						<View style={{ flex: 1, height: 1, backgroundColor: rule }} />
						<Text style={{ fontSize: BREAK_SP, color: breakColor }}>
							{`Today ${clock(sentAt(first))}`}
						</Text>
						<View style={{ flex: 1, height: 1, backgroundColor: rule }} />
					</View>
				) : null}
				{rows}
				{page === 'visual' ? (
					<View
						style={{
							height: 26,
							marginTop: 10,
							paddingLeft: left,
							justifyContent: 'center',
						}}
					>
						{s.typingBubble ? (
							<View
								style={{
									alignSelf: 'flex-start',
									height: 20,
									borderRadius: 10,
									paddingHorizontal: 9,
									justifyContent: 'center',
									backgroundColor: bgOf('alex'),
								}}
							>
								<Dots color={fgOf('alex')} />
							</View>
						) : (
							<Text variant="text-xs/normal" color="text-muted">
								Alex is typing…
							</Text>
						)}
					</View>
				) : null}
			</View>
			<Text color="text-muted" variant="text-sm/normal">
				{hint(page, s)}
			</Text>
		</View>
	)
}
