/**
 * The count, in a small floating square just above the message box, on the left or right.
 *
 * Drawn by the chat input itself (`modules/chat_input/native/ChatInput.tsx`): its render returns a
 * container (`collapsable: false`, `onLayout`, a long children array) holding the fade, the message
 * box and the accessories above it. The square is added to that container, absolutely placed from
 * its top edge (`bottom: '100%'`), so it floats without making anything taller. When the "…is
 * typing" line is showing (the container then holds Discord's solid typing fill: `pointerEvents:
 * 'none'`, absolute-fill, a background), the square moves up above it.
 *
 * The container has no name to match, so it is found by that shape. The tree Discord returned is
 * never edited in place (its compiler caches elements): the path down to the container is cloned.
 */

import { Tokens } from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { instead } from '@valenced/patcher'
import { findInReactFiber } from '@valenced/utils/react'
import { cloneElement, isValidElement } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { FloaterProbe } from '../../../../shared/chatFloaters'
import { reportError } from '../../../../shared/report'
import { FONT_SIZE } from '../index'
import { withMemoizedNamedExoticComponent } from './filters'
import { forgetChatInput, rememberChatInput } from './input'
import { limit, useLength } from './length'
import { replaceElement } from './react'
import { offerSplit, planSplit } from './sender'
import type { DiscordModules } from '@valenced/discord/types'
import type { PluginCleanupApi } from '@valenced/plugins/types'
import type { ReactElement, ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import type { CharCounterStorage } from '../index'

const GAP = 8
/** Roughly the "…is typing" line's height, so the square clears it. */
const TYPING_LINE = 26

interface ContainerProps {
	collapsable?: boolean
	onLayout?: unknown
	children: ReactNode[]
}

type ContainerElement = ReactElement<ContainerProps>

interface FillProps {
	pointerEvents?: string
	children?: ReactNode
	style?: StyleProp<ViewStyle>
}

/** The `Tokens` export is typed `any` upstream; this is the part of it the square reads. */
interface TokensModule {
	default: {
		colors: Record<string, object | undefined>
		internal: { resolveSemanticColor(theme: string, color: object): string }
	}
}

function isContainer(node: unknown): node is ContainerElement {
	if (!isValidElement<Partial<ContainerProps>>(node)) return false
	const { props } = node
	return (
		props.collapsable === false &&
		typeof props.onLayout === 'function' &&
		Array.isArray(props.children)
	)
}

function isTypingFill(node: ReactNode): boolean {
	if (!isValidElement<FillProps>(node)) return false
	const { props } = node
	if (props.pointerEvents !== 'none' || props.children != null || !props.style)
		return false
	const style = StyleSheet.flatten(props.style) ?? {}
	return (
		style.position === 'absolute' &&
		style.top === 0 &&
		style.bottom === 0 &&
		style.backgroundColor != null
	)
}

/** A colour by token name through the theme in use, as Show Timeout Duration resolves its red. */
function token(name: string, fallback: string): string {
	try {
		const tokens: TokensModule = Tokens
		const { theme } = Stores.ThemeStore as DiscordModules.Flux.Store<{
			theme: string
		}>
		const color = tokens.default.colors[name]
		const resolved = color
			? tokens.default.internal.resolveSemanticColor(theme, color)
			: undefined
		return typeof resolved === 'string' ? resolved : fallback
	} catch {
		return fallback
	}
}

/** 4000 -> "4,000". Hermes' toLocaleString doesn't always group, so done by hand. */
function grouped(n: number): string {
	return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function characters(n: number): string {
	return `${grouped(n)} ${n === 1 ? 'character' : 'characters'}`
}

function label(
	length: number,
	max: number,
	show: CharCounterStorage['show'],
	parts = 0,
): string {
	if (length > max)
		return parts
			? `Split into ${parts} ›`
			: `${characters(length - max)} over the limit`
	if (show === 'left') return `${characters(max - length)} left`
	if (show === 'limit') return `${grouped(length)} / ${characters(max)}`
	return characters(length)
}

/** The square's text size, clamped, from settings stored before there was one too. */
export function fontSizeOf(s: Partial<CharCounterStorage>): number {
	const size = Number(s.fontSize)
	return Number.isFinite(size)
		? Math.min(FONT_SIZE.max, Math.max(FONT_SIZE.min, Math.round(size)))
		: FONT_SIZE.default
}

/** The square itself, shared with the settings page's preview. */
export function CounterSquare({
	text,
	colour,
	fontSize,
}: {
	text: string
	colour: string
	fontSize: number
}) {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { Text } = Design
	return (
		<View
			style={{
				minWidth: 32,
				// 28 dp at 12 pt, as before, growing with the text.
				minHeight: Math.round(fontSize * 1.34) + 12,
				paddingHorizontal: 8,
				paddingVertical: 4,
				borderRadius: 8,
				alignItems: 'center',
				justifyContent: 'center',
				backgroundColor: token(
					'MOBILE_CHATINPUT_BACKGROUND_DEFAULT',
					'#222327',
				),
				elevation: 4,
			}}
		>
			<Text
				variant="text-xs/semibold"
				color={colour}
				lineClamp={1}
				style={{ fontSize, lineHeight: Math.round(fontSize * 1.34) }}
			>
				{text}
			</Text>
		</View>
	)
}

function Badge({
	settings,
	typing,
}: {
	settings: () => CharCounterStorage
	typing: boolean
}) {
	const length = useLength()
	const s = settings()
	const max = limit()
	if (length <= 0) return null
	if (s.onlyNearLimit && length < max * 0.9) return null

	const over = length > max
	const near = length >= max * 0.9
	// Past the limit with splitting on, the square offers the split: the real plan's count, from the
	// text in the box, so what it says is what the sheet will show. Nothing is sent from here.
	const parts = over && s.split ? (planSplit(s)?.parts.length ?? 0) : 0
	const side = s.side === 'right' ? { right: 16 } : { left: 16 }

	const square = (
		<CounterSquare
			text={label(length, max, s.show, parts)}
			// The colours Discord's own counter uses past the limit, and its warning shade before.
			colour={
				over && !parts
					? 'text-feedback-critical'
					: near
						? 'text-feedback-warning'
						: 'text-muted'
			}
			fontSize={fontSizeOf(s)}
		/>
	)

	return (
		<View
			pointerEvents={parts ? 'box-none' : 'none'}
			style={{
				position: 'absolute',
				bottom: '100%',
				marginBottom: GAP + (typing ? TYPING_LINE : 0),
				...side,
			}}
		>
			{parts ? (
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={`Split into ${parts} messages`}
					onPress={() => offerSplit(settings())}
				>
					{square}
				</Pressable>
			) : (
				square
			)}
			{/* Tells other floaters above the message box (Read All's pill) where the square is. */}
			<FloaterProbe id="char-counter" />
		</View>
	)
}

export function patchBadge(
	cleanup: PluginCleanupApi,
	settings: () => CharCounterStorage,
): void {
	// Whether the container has ever been found this session: a miss before that is reported once.
	let placed = false

	cleanup(
		getModules(withMemoizedNamedExoticComponent('ChatInput'), ChatInput => {
			cleanup(forgetChatInput)
			cleanup(
				instead(ChatInput, 'type', function (args, original) {
					const tree = Reflect.apply(original, this, args)
					// The chat input on screen: its channel and the handle that writes its text, for the split sheet.
					try {
						rememberChatInput(args[0], tree)
					} catch {
						/* the square still draws; the split is just not offered */
					}
					if (!isValidElement(tree)) return tree
					const container = findInReactFiber(tree, isContainer)
					if (!container) {
						if (!placed)
							reportError(
								'[CharCounter] chat input layout not recognised; the square cannot be placed',
							)
						return tree
					}
					placed = true

					const typing = container.props.children.some(isTypingFill)
					return replaceElement(
						tree,
						element => element === container,
						element =>
							cloneElement(
								element,
								undefined,
								...container.props.children,
								<Badge
									key="char-counter"
									settings={settings}
									typing={typing}
								/>,
							),
					)
				}),
			)
		}),
	)
}
