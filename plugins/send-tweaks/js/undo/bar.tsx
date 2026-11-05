/**
 * The Undo bar: a pill just above the message box while a message is waiting. The left says
 * what's waiting, the right is the Undo button with the seconds left, and a thin line under it
 * all drains as the time runs out. Tap anywhere on it to undo.
 *
 * Placed like Character Counter's square: appended to the chat input's
 * own container (`modules/chat_input/native/ChatInput.tsx`) and absolutely placed from its top
 * edge (`bottom: '100%'`), so nothing gets taller. Taps there land, as Discord's own Jump To
 * Present button shows. It keeps out of the way of Discord's "…is typing" line, and reports
 * itself to shared/chatFloaters.tsx so Read All's pill moves above it rather than onto it.
 *
 * The bar shows in whichever chat is open. Undo from another chat still works: the text goes
 * back to the chat it was sent from, and the toast says so.
 */

import * as commonTokens from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import * as React from 'react'
import * as ReactNative from 'react-native'
import { FloaterProbe } from '../../../../shared/chatFloaters'
import { reportError } from '../../../../shared/report'
import { findRef, forgetComposer, rememberComposer } from './box'
import { barLabel, fractionLeft, secondsLeft } from './held'
import { heldList, newest, subscribe, undo } from './holds'
import { TAG } from './state'

const KEY = 'send-tweaks-undo-bar'
const GAP = 8
/** Roughly the "…is typing" line's height (as Character Counter's). */
const TYPING_LINE = 26

export const barStatus = { placed: false, lastError: '' }

function flatten(style: unknown): Record<string, any> {
	try {
		return ReactNative.StyleSheet.flatten(style as any) ?? {}
	} catch {
		return {}
	}
}

function isContainer(node: any): boolean {
	const props = node?.props
	return (
		!!props &&
		props.collapsable === false &&
		typeof props.onLayout === 'function' &&
		Array.isArray(props.children)
	)
}

/** Discord's solid fill behind the "…is typing" line (as Character Counter's badge.tsx). */
function isTypingFill(node: any): boolean {
	const props = node?.props
	if (
		!props ||
		props.pointerEvents !== 'none' ||
		props.children != null ||
		!props.style
	)
		return false
	const style = flatten(props.style)
	return (
		style.position === 'absolute' &&
		style.top === 0 &&
		style.bottom === 0 &&
		style.backgroundColor != null
	)
}

function find(root: any, depth = 0): any {
	if (!root || typeof root !== 'object' || depth > 25) return undefined
	if (!Array.isArray(root) && isContainer(root)) return root
	const children = Array.isArray(root) ? root : root.props?.children
	if (Array.isArray(children)) {
		for (const child of children) {
			const found = find(child, depth + 1)
			if (found) return found
		}
	} else if (children && typeof children === 'object') {
		return find(children, depth + 1)
	}
	return undefined
}

/** A colour by token name through the theme in use (Character Counter's `token`). */
function token(name: string, fallback: string): string {
	try {
		const tables = (commonTokens as any)?.Tokens
		const theme = (Stores as any).ThemeStore?.theme ?? 'darker'
		const semantic = tables?.SemanticColor?.[name]
		const entry = semantic?.[theme] ?? semantic?.darker ?? semantic?.dark
		const raw = entry?.raw ? tables?.RawColor?.[entry.raw] : undefined
		return typeof raw === 'string' ? raw : fallback
	} catch {
		return fallback
	}
}

/** "#general", a DM's name, or a fallback, for the toast when Undo happens from another chat. */
export function channelName(channelId: string): string {
	try {
		const channel = (Stores as any).ChannelStore?.getChannel?.(channelId)
		if (!channel) return 'the other chat'
		if (channel.guild_id && channel.name) return `#${channel.name}`
		if (channel.name) return channel.name
		const recipient = channel.recipients?.[0] ?? channel.rawRecipients?.[0]
		const userId = typeof recipient === 'string' ? recipient : recipient?.id
		const user = userId
			? (Stores as any).UserStore?.getUser?.(userId)
			: undefined
		const name = user?.globalName ?? user?.global_name ?? user?.username
		return name ? `your DM with ${name}` : 'the other chat'
	} catch {
		return 'the other chat'
	}
}

/** The newest held message, re-read on every queue change and four times a second for the count. */
function useNewest() {
	const [, redraw] = React.useReducer((n: number) => n + 1, 0)
	React.useEffect(() => subscribe(redraw), [])
	const held = newest()
	const id = held?.id
	React.useEffect(() => {
		if (id === undefined) return
		const interval = setInterval(redraw, 250)
		return () => clearInterval(interval)
	}, [id])
	return held
}

/** The pill itself. Shared with the settings page's preview, where nothing is held. */
export function UndoPill({
	label,
	seconds,
	fraction,
	drainMs,
	pressed = false,
}: {
	label: string
	seconds: number
	/** How much of the line is still filled, 1 to 0, when the pill mounts. */
	fraction: number
	/** When set, the line drains from `fraction` to empty over this long (ms), every frame. */
	drainMs?: number
	pressed?: boolean
}) {
	const { View } = ReactNative
	const { Text } = Design as any
	const accent = token('TEXT_BRAND', '#5865F2')
	return (
		<View
			style={{
				borderRadius: 16,
				overflow: 'hidden',
				backgroundColor: token(
					'MOBILE_CHATINPUT_BACKGROUND_DEFAULT',
					'#222327',
				),
				elevation: 4,
				opacity: pressed ? 0.7 : 1,
			}}
		>
			<View
				style={{
					flexDirection: 'row',
					alignItems: 'center',
					gap: 12,
					paddingLeft: 14,
					paddingRight: 12,
					paddingVertical: 8,
				}}
			>
				<Text
					variant="text-sm/normal"
					color="text-muted"
					lineClamp={1}
					style={{ flexShrink: 1 }}
				>
					{label}
				</Text>
				<Text variant="text-sm/semibold" style={{ color: accent }}>
					{`Undo · ${seconds}s`}
				</Text>
			</View>
			<DrainLine fraction={fraction} drainMs={drainMs} colour={accent} />
		</View>
	)
}

/**
 * The line under the pill, draining as the time runs out.
 *
 * Driven by one native animation, not by the bar's re-renders: those come four times a second
 * for the countdown, and a width set from them stepped visibly. The filled part is a full-width
 * view slid left behind the clipped track, so the native driver can move it (it animates
 * transforms, never widths). The track's width comes from its layout, so the slide covers it
 * exactly on any screen.
 */
function DrainLine({
	fraction,
	drainMs,
	colour,
}: {
	fraction: number
	drainMs?: number
	colour: string
}) {
	const { View, Animated, Easing } = ReactNative
	const [width, setWidth] = React.useState(0)
	const start = Math.max(0, Math.min(1, fraction))
	const progress = React.useRef(new Animated.Value(start)).current

	React.useEffect(() => {
		if (!drainMs || drainMs <= 0) {
			progress.setValue(start)
			return
		}
		// The UI-thread driver, which Discord's own animations use on Android and iOS alike. A
		// build without it throws on start, so the JS-thread driver is the fallback: the same
		// drain, run from JS.
		let animation: any
		for (const useNativeDriver of [true, false]) {
			try {
				animation = Animated.timing(progress, {
					toValue: 0,
					duration: drainMs,
					easing: Easing.linear,
					useNativeDriver,
				})
				animation.start()
				break
			} catch {
				animation = undefined
			}
		}
		return () => animation?.stop()
	}, [drainMs])

	return (
		<View
			onLayout={(e: any) => setWidth(e.nativeEvent.layout.width)}
			style={{
				height: 2,
				overflow: 'hidden',
				backgroundColor: token(
					'BACKGROUND_MOD_SUBTLE',
					'rgba(255,255,255,0.08)',
				),
			}}
		>
			{width > 0 ? (
				<Animated.View
					style={{
						height: 2,
						width,
						backgroundColor: colour,
						transform: [
							{
								translateX: progress.interpolate({
									inputRange: [0, 1],
									outputRange: [-width, 0],
								}),
							},
						],
					}}
				/>
			) : null}
		</View>
	)
}

function Bar({ typing }: { typing: boolean }) {
	const held = useNewest()
	if (!held) return null
	const { View, Pressable } = ReactNative
	const now = Date.now()
	const count = heldList().length
	const seconds = secondsLeft(held, now)
	const fraction = fractionLeft(held, now)

	return (
		<View
			pointerEvents="box-none"
			style={{
				position: 'absolute',
				bottom: '100%',
				left: 12,
				right: 12,
				marginBottom: GAP + (typing ? TYPING_LINE : 0),
				alignItems: 'center',
			}}
		>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={`Undo sending, ${seconds} seconds left`}
				onPress={() => {
					const open = (Stores as any).SelectedChannelStore?.getChannelId?.()
					undo(
						held.id,
						typeof open === 'string' ? open : undefined,
						channelName,
					)
				}}
			>
				{({ pressed }: { pressed: boolean }) => (
					// Keyed by the held message, so a new one restarts the drain from the top.
					<UndoPill
						key={held.id}
						label={barLabel(held, count)}
						seconds={seconds}
						fraction={fraction}
						drainMs={Math.max(0, held.at - now)}
						pressed={pressed}
					/>
				)}
			</Pressable>
			{/* Tells other floaters above the message box (Read All's pill) where the bar is. */}
			<FloaterProbe id={KEY} />
		</View>
	)
}

/**
 * Called from `lib/composer.ts`' hook on the chat input's render, with the tree it drew: keeps the
 * input's handle for Undo to write the text back, and puts the bar into its container. Never throws.
 */
export function decorateChatInput(tree: unknown): void {
	try {
		// The render's props aren't passed to an `after` hook, so the chat is the one on screen:
		// the chat input only draws for the open chat.
		const open = (Stores as any).SelectedChannelStore?.getChannelId?.()
		rememberComposer(
			typeof open === 'string' ? open : undefined,
			findRef(tree, 'chatInputRef'),
			findRef(tree, 'chatInputStateRef'),
		)
		const container = find(tree)
		if (
			container &&
			!container.props.children.some((child: any) => child?.key === KEY)
		) {
			const typing = container.props.children.some((child: any) =>
				isTypingFill(child),
			)
			container.props.children = [
				...container.props.children,
				React.createElement(Bar, { key: KEY, typing }),
			]
			barStatus.placed = true
		}
	} catch (error) {
		if (!barStatus.lastError)
			reportError(`${TAG} placing the Undo bar failed:`, error)
		barStatus.lastError = `place: ${(error as Error)?.message ?? error}`
	}
}

/** On stop. */
export function forgetChatInput() {
	forgetComposer()
	barStatus.placed = false
}
