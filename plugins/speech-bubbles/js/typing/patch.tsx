/**
 * Puts the typing bubble above the message box and hides Discord's own "…is typing" line while
 * the bubble is on.
 *
 * - The bubble is placed like Character Counter's square: an `after` on the ChatInput memo's
 *   `type` (so it composes with other plugins' wrappers), finding the container (`collapsable:
 *   false`, `onLayout`, a children array) and cloning the path down to it with the bubble added.
 *   Discord's solid typing fill (the backdrop of the strip the typing line uses, which the chat
 *   list leaves room for) is kept: the bubble sits inside that strip.
 * - Discord's typing line (`modules/chat/native/TypingIndicator.tsx`, the module with
 *   `useTypingUserIdsForDisplay`, found the way Palm's Better Typing Indicators finds it) renders
 *   nothing while the bubble is on and the channel is in scope.
 *
 * Every patch reads the settings at render, so turning the bubble off gives Discord's own line
 * back without a reload. All patches go through `cleanup`, so stop undoes them.
 */

import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import { findInReactFiber } from '@valenced/utils/react'
import { cloneElement, isValidElement } from 'react'
import { reportError } from '../../../../shared/report'
import { withMemoizedNamedExoticComponent } from '../lib/filters'
import { replaceElement } from '../lib/react'
import { effectiveColors } from '../theme'
import { selectedChannel } from './stores'
import { TypingBubble } from './TypingBubble'
import type { PluginCleanupApi } from '@valenced/plugins/types'
import type { FC, MemoExoticComponent, ReactElement, ReactNode } from 'react'
import type { SpeechBubblesStorage } from '../native'
import type { BasicChannel } from './stores'
import type { TypingLook } from './TypingBubble'

interface ContainerProps {
	collapsable?: boolean
	onLayout?: unknown
	children: ReactNode[]
}

type ContainerElement = ReactElement<ContainerProps>

type MemoComponent<P> = MemoExoticComponent<FC<P>> & { type: FC<P> }

function isContainer(node: unknown): node is ContainerElement {
	if (!isValidElement<Partial<ContainerProps>>(node)) return false
	const { props } = node
	return (
		props.collapsable === false &&
		typeof props.onLayout === 'function' &&
		Array.isArray(props.children)
	)
}

function inScope(
	channel: BasicChannel | undefined,
	s: SpeechBubblesStorage,
): boolean {
	return !!channel && (!channel.guild_id || s.everywhere)
}

export function patchTyping(
	cleanup: PluginCleanupApi,
	settings: () => SpeechBubblesStorage,
): void {
	const look = (): TypingLook => {
		const s = settings()
		const colors = effectiveColors(s)
		return {
			bg: colors.otherBg,
			fg: colors.otherText,
			tails: s.tails,
			avatars: !s.hideAvatars,
		}
	}
	const everywhere = () => settings().everywhere
	let placed = false

	cleanup(
		getModules(withMemoizedNamedExoticComponent('ChatInput'), ChatInput => {
			cleanup(
				after(ChatInput, 'type', tree => {
					try {
						const s = settings()
						if (!s.typingBubble || !isValidElement(tree)) return tree
						const container = findInReactFiber(tree, isContainer)
						if (!container) {
							if (!placed)
								reportError(
									'[SpeechBubbles] chat input layout not recognised; the typing bubble cannot be placed',
								)
							return tree
						}
						placed = true
						const children = container.props.children
						return replaceElement(
							tree,
							element => element === container,
							element =>
								cloneElement(
									element,
									undefined,
									...children,
									<TypingBubble
										key="speech-bubbles-typing"
										look={look}
										everywhere={everywhere}
									/>,
								),
						)
					} catch (error) {
						reportError('[SpeechBubbles] typing bubble failed:', error)
						return tree
					}
				}),
			)
		}),
		// modules/chat/native/TypingIndicator.tsx
		getModules(
			withProps<{
				default: MemoComponent<{ channel: BasicChannel }>
				useTypingUserIdsForDisplay: unknown
			}>('useTypingUserIdsForDisplay'),
			TypingIndicatorModule => {
				const TypingIndicator = TypingIndicatorModule.default
				if (!TypingIndicator || typeof TypingIndicator.type !== 'function')
					return
				cleanup(
					after(TypingIndicator, 'type', tree => {
						try {
							const s = settings()
							if (!s.typingBubble) return tree
							// `after` gets only the result: the channel comes from the rendered item.
							const item = (
								tree as ReactElement<{ item?: { channel?: BasicChannel } }>
							)?.props?.item
							const channel = item?.channel ?? selectedChannel()
							if (!inScope(channel, s)) return tree
							// The bubble above the message box replaces this line.
							return null
						} catch (error) {
							reportError('[SpeechBubbles] typing line patch failed:', error)
							return tree
						}
					}),
				)
			},
		),
	)
}
