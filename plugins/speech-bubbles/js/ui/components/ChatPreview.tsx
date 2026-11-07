/**
 * A small made-up chat drawn the way the plugin draws the real one, one per settings page, each
 * showing only what that page changes:
 *
 * - Visual style: a time break, Alex's run (avatar, name, joined corners, tail) ending in a link
 *   with its preview (iMessage's card or Discord's), your edited reply ("Edited" under it or
 *   "(edited)" in it) with your picture when that's on, and the typing bubble (or Discord's
 *   "…is typing" line).
 * - Colours: Alex, Sam and you, one message each, so colour per person shows.
 * - Message times: one bubble each side; tapping shows its time the way "Message times" is set.
 *
 * Every setting is read live. "Colour shifts as you scroll" shades each bubble by where it sits in
 * the preview, top lighter, bottom deeper, as the real chat does by where it sits on the screen.
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
	avatarBubble,
	personPalette,
	scrollShade,
	textFor,
	toHex6,
} from '../../theme'
import { selfAvatarSource } from '../../typing/stores'
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
	/** It has been edited ("Edited" under it, or Discord's "(edited)" in it). */
	edited?: boolean
	/** A link preview under it. */
	card?: Card
}

interface Card {
	site: string
	title: string
	description: string
	/** The made-up picture: a colour with an emoji on it. */
	picture: string
	emoji: string
}

const PIZZA: Card = {
	site: 'Slice',
	title: 'Slice: pizza by the slice',
	description: 'Fresh pizza, open late. Order ahead and skip the queue.',
	picture: '#C0392B',
	emoji: '🍕',
}

/** [picture]: the made-up main colour of their profile picture, for "From their profile picture". */
/** [slot]: their soft shade (by id); [order]: when they show up, for theme colours. */
const PEOPLE: Record<Exclude<Who, 'me'>, { name: string; slot: number; order: number; picture: string }> = {
	alex: { name: 'Alex', slot: 2, order: 0, picture: '#E67E22' },
	sam: { name: 'Sam', slot: 5, order: 1, picture: '#1ABC9C' },
}

export type PreviewPage = 'visual' | 'colours' | 'times'

const SCENES: Record<PreviewPage, Message[]> = {
	visual: [
		{ id: 'a1', who: 'alex', text: 'Still up for tonight?', minutesAgo: 9 },
		{
			id: 'a2',
			who: 'alex',
			text: 'Thinking here at 7: slice.pizza',
			minutesAgo: 9,
			card: PIZZA,
		},
		{ id: 'm1', who: 'me', text: 'Yes! See you there', minutesAgo: 2, edited: true },
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

/** Your own picture (or your initial if it can't be had), on the right like theirs on the left. */
function SelfAvatar({ bg, fg }: { bg: string; fg: string }) {
	const { View, Image } = ReactNative
	const { Text } = Design
	const source = selfAvatarSource()
	return (
		<View
			style={{
				position: 'absolute',
				right: AVATAR_MARGIN,
				top: 0,
				width: AVATAR,
				height: AVATAR,
				borderRadius: AVATAR / 2,
				overflow: 'hidden',
				backgroundColor: bg,
				alignItems: 'center',
				justifyContent: 'center',
			}}
		>
			{source ? (
				<Image source={source as never} style={{ width: AVATAR, height: AVATAR }} />
			) : (
				<Text variant="text-sm/semibold" style={{ color: fg }}>
					Y
				</Text>
			)}
		</View>
	)
}

/** A link preview as Discord draws it: the colour strip on the left, the site, title and description, the picture under them. */
function LinkCard({
	card,
	radius,
	onChat,
	inset,
}: {
	card: Card
	radius: number
	onChat: string
	inset: number
}) {
	const { View } = ReactNative
	const { Text } = Design
	const strip = withAlpha(onChat, '1F')
	const picture = (height: number, corner: number) => (
		<View
			style={{
				height,
				borderRadius: corner,
				backgroundColor: card.picture,
				alignItems: 'center',
				justifyContent: 'center',
			}}
		>
			<Text style={{ fontSize: height * 0.45 }}>{card.emoji}</Text>
		</View>
	)
	return (
		<View
			style={{
				width: '72%',
				marginTop: 4,
				marginLeft: inset,
				borderRadius: radius,
				overflow: 'hidden',
				backgroundColor: strip,
				flexDirection: 'row',
			}}
		>
			<View style={{ width: 4, backgroundColor: card.picture }} />
			<View style={{ flex: 1, padding: 10, gap: 4 }}>
				<Text style={{ fontSize: 11, color: withAlpha(onChat, '99') }}>{card.site}</Text>
				<Text variant="text-sm/semibold" color="text-link" numberOfLines={1}>
					{card.title}
				</Text>
				<Text variant="text-xs/normal" color="text-default" numberOfLines={2}>
					{card.description}
				</Text>
				<View style={{ marginTop: 4 }}>{picture(72, 4)}</View>
			</View>
		</View>
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
	// The colour per person as native hands it out: the palette's colour at the person's slot, with
	// white or black text picked for it.
	const palette = personPalette(s, colors)
	const personBg = (who: Exclude<Who, 'me'>) =>
		s.personPalette === 'avatar'
			? avatarBubble(PEOPLE[who].picture, s.personDark)
			: palette[
					(s.personPalette === 'theme' ? PEOPLE[who].order * 3 : PEOPLE[who].slot) %
						palette.length
				]
	const bgOf = (who: Who) => {
		if (who === 'me') return toHex6(colors.ownBg)
		return toHex6(s.perPerson ? personBg(who) : colors.otherBg)
	}
	const fgOf = (who: Who) => {
		if (who === 'me') return toHex6(colors.ownText)
		return toHex6(s.perPerson ? textFor(personBg(who)) : colors.otherText)
	}
	// Text on the chat background (times, breaks): the theme's text colour, or light grey with
	// own colours, whose text colours are picked for the bubbles (as native does).
	const onChat = s.colors === 'own' ? '#DBDEE1' : toHex6(colors.otherText)
	const avatars = !s.hideAvatars
	const left = avatars ? AVATAR_MARGIN + AVATAR + AVATAR_GAP : AVATAR_MARGIN
	// "Show my profile picture": your side keeps the same column on the right.
	const ownRight = s.ownAvatar ? AVATAR_MARGIN + AVATAR + AVATAR_GAP : RIGHT_GAP
	const tailInset = s.tails ? TAIL_W : 0
	// "Colour shifts as you scroll": how far down the preview each message sits, 0 to 1.
	const shade = (hex: string, i: number) =>
		s.scrollColor
			? scrollShade(
					hex,
					s.scrollColorStrength,
					MESSAGES.length > 1 ? 0.15 + (0.7 * i) / (MESSAGES.length - 1) : 0.5,
				)
			: hex

	const first = MESSAGES[0]
	const label = (m: Message) => `Today at ${clock(sentAt(m))}`

	const rows = MESSAGES.map((m, i) => {
		const prev = MESSAGES[i - 1]
		const next = MESSAGES[i + 1]
		const right = m.who === 'me'
		const startsRun = prev?.who !== m.who
		const endsRun = next?.who !== m.who
		const timeShown = below.includes(m.id)
		const editedHere = !!m.edited && s.editedLabel
		// Anything under the bubble (its time, "Edited", a link preview) splits the run there.
		const timeHere = timeShown || editedHere || !!m.card
		// A time under a bubble splits the run there: both bubbles get full corners (0.3.4).
		const joinTop =
			!startsRun && !below.includes(prev.id) && !(prev.edited && s.editedLabel) && !prev.card
		const joinBottom = !endsRun && !timeHere
		// The "Roundness" setting, as native draws it (joined corners a third of it, at most 6).
		const radius = s.bubbleRadius
		const small = Math.min(SMALL_RADIUS, radius / 3)
		const top = joinTop ? small : radius
		const bottom = joinBottom ? small : radius
		const solid = shade(bgOf(m.who), i)
		// "Bubble opacity": the bubble's colour with the alpha native gives it.
		const alpha = Math.round((Math.min(Math.max(s.bubbleOpacity, 30), 100) / 100) * 255)
			.toString(16)
			.padStart(2, '0')
			.toUpperCase()
		const bg = `${solid}${alpha}`
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
						{m.edited && !s.editedLabel ? (
							<Text style={{ color: withAlpha(fg, 'A6'), fontSize: 12 }}> (edited)</Text>
						) : null}
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
					paddingRight: right ? ownRight : 0,
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
						{s.hideNames ? null : (
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
						)}
					</>
				) : null}
				{right && startsRun && s.ownAvatar ? (
					<SelfAvatar bg={solid} fg={fg} />
				) : null}
				{bubble}
				{m.card ? (
					<LinkCard
						card={m.card}
						radius={s.bubbleRadius}
						onChat={onChat}
						inset={tailInset}
					/>
				) : null}
				{editedHere ? (
					<Text
						style={{
							fontSize: TIME_SP,
							// In your bubble colour, as iMessage writes "Edited" in blue (TimeTag).
							color: toHex6(colors.ownBg),
							marginTop: 2,
							...(right
								? { marginRight: tailInset + TIME_INSET }
								: { marginLeft: tailInset + TIME_INSET }),
						}}
					>
						{timeShown ? `Edited · ${label(m)}` : 'Edited'}
					</Text>
				) : null}
				{timeShown && !editedHere ? (
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
