/**
 * The live composer handle, scoped to its own send button through React context.
 *
 * `ChatInput` passes two refs to its autocomplete and accessory children: `chatInputRef` (the
 * input's handle, with `getText()`) and `chatInputStateRef` (its live text, caret and edit id).
 * An `after` hook on its render finds them in the tree, without relying on component names, hands
 * them to Replace as you type (`lib/liveReplace.ts`), and wraps the tree in a provider so the send
 * button patch can read the draft at release time.
 */

import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { after } from '@valenced/patcher'
import { createContext, createElement } from 'react'
import { reportError } from '../../../../shared/report'
import { attachLive, detachLive } from './liveReplace'
import { renderHost } from './renderHost'
import type { Context, ReactNode } from 'react'

/** The chat input's handle. Only `getText` is read here. */
export interface ComposerRef {
	current?: { getText?: () => unknown } | null
}

/** The chat input's state ref, handed on to Replace as you type as it is. */
interface ComposerStateRef {
	current?: Record<string | symbol, unknown> | null
}

let context: Context<ComposerRef | undefined> | undefined

export function composerContext(): Context<ComposerRef | undefined> {
	return (context ??= createContext<ComposerRef | undefined>(undefined))
}

/** Depth-first: the first element in the tree whose props carry a ref under [prop]. */
function findRef<T extends { current?: unknown }>(
	node: ReactNode,
	prop: string,
): T | undefined {
	if (!node || typeof node !== 'object') return undefined
	if (Array.isArray(node)) {
		for (const child of node) {
			const ref = findRef<T>(child, prop)
			if (ref) return ref
		}
		return undefined
	}
	const props = (node as { props?: Record<string, unknown> }).props
	const ref = props?.[prop]
	if (ref && typeof ref === 'object' && 'current' in ref) return ref as T
	return findRef<T>(props?.children as ReactNode, prop)
}

export function patchComposer(): () => void {
	let undo: (() => void) | undefined
	let active = true

	const unsubscribe = getModuleWithImportedPath<unknown>(
		'modules/chat_input/native/ChatInput.tsx',
		exports => {
			if (!active || undo) return
			const target = renderHost(exports)
			if (!target) {
				reportError(
					'[SendTweaks] could not hook the chat input: unknown component shape',
				)
				return
			}
			const Context = composerContext()
			undo = after(target.host, target.key, tree => {
				if (!active) return tree
				const ref = findRef<ComposerRef>(tree, 'chatInputRef')
				try {
					// Replace as you type (lib/liveReplace.ts) needs the same handle.
					attachLive(ref, findRef<ComposerStateRef>(tree, 'chatInputStateRef'))
				} catch (error) {
					reportError(
						'[SendTweaks] Replace as you type could not attach:',
						error,
					)
				}
				return createElement(Context.Provider, { value: ref }, tree)
			})
		},
	)

	return () => {
		active = false
		unsubscribe?.()
		undo?.()
		detachLive()
	}
}

/** Read at release time, not render time: typing does not necessarily re-render the send button. */
export function readComposer(ref: ComposerRef | undefined): string | undefined {
	const text = ref?.current?.getText?.()
	return typeof text === 'string' ? text : undefined
}
