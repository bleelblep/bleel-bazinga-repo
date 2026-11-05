/**
 * Hides items in the menu that opens when you long-press + in the message box (Camera, Photos,
 * Poll, Thread, Apps, Files, Schedule Message, and items plugins add there: WordArt, Sekai Stickers).
 *
 * The + button is `modules/chat_input/native/action_buttons/ChatInputActions.tsx`, a `React.memo`
 * that renders a design `ContextMenu` with `{ items, triggerOnLongPress: true, ... }`, each item
 * `{ label, IconComponent, action }` (found by WordArt's and Sekai Stickers' lib/plusMenu.ts).
 *
 * Those plugins add their items with their own `after` on the same memo, and the order the hooks
 * run in isn't ours to choose. So instead of filtering the array here, the ContextMenu element's
 * type is swapped for a stable wrapper that filters `items` when the menu itself renders, after
 * every hook has run. Items are told apart by label (as the long-press message menu's rows are),
 * and every label seen is recorded for the settings page. The items left keep their own actions.
 */

import { after } from '@valenced/patcher'
import { findModule } from '../lib/find'
import { settings, update } from '../lib/state'
import { reportError } from '../../../../shared/report'

const TAG = '[UITweaks]'
const ACTIONS = 'modules/chat_input/native/action_buttons/ChatInputActions.tsx'

/** The labels seen in the menu, in its order, for the settings page. */
export function plusMenuLabels(raw = settings().plusMenuLayout): string[] {
	try {
		const parsed = raw ? JSON.parse(raw) : []
		return Array.isArray(parsed) ? parsed.filter((label): label is string => typeof label === 'string') : []
	} catch {
		return []
	}
}

/** Adds labels not seen before (after the ones already known), and saves only on a change. */
function record(labels: string[]) {
	const known = plusMenuLabels()
	const added = labels.filter(label => !known.includes(label))
	if (added.length) update({ plusMenuLayout: JSON.stringify([...known, ...added]) })
}

function labelOf(item: any): string | undefined {
	return typeof item?.label === 'string' ? item.label : undefined
}

/** One wrapper per ContextMenu type, so React sees the same component on every render. */
const wrappers = new Map<unknown, (props: any) => any>()
const isWrapper = new Set<unknown>()

function wrapperFor(Original: any): (props: any) => any {
	let Wrapper = wrappers.get(Original)
	if (Wrapper) return Wrapper
	Wrapper = function PlusMenu(props: any) {
		let items = props?.items
		try {
			if (Array.isArray(items)) {
				record(items.map(labelOf).filter((label): label is string => Boolean(label)))
				const hidden = settings().hiddenPlusMenuItems ?? {}
				const kept = items.filter(item => {
					const label = labelOf(item)
					return !label || hidden[label] !== true
				})
				if (kept.length !== items.length) items = kept
			}
		} catch (error) {
			reportError(`${TAG} filtering the + long-press menu failed:`, error)
		}
		return <Original {...props} items={items} />
	}
	wrappers.set(Original, Wrapper)
	isWrapper.add(Wrapper)
	return Wrapper
}

/** The ContextMenu element (the one with `triggerOnLongPress`) somewhere in [node]. */
function findMenu(node: any, depth = 0): any {
	if (depth > 40 || !node || typeof node !== 'object') return undefined
	if (Array.isArray(node)) {
		for (const child of node) {
			const found = findMenu(child, depth + 1)
			if (found) return found
		}
		return undefined
	}
	const props = node.props
	if (props?.triggerOnLongPress === true && Array.isArray(props.items)) return node
	return findMenu(props?.children, depth + 1)
}

export default (): (() => void) => {
	const undo: Array<() => void> = []
	undo.push(
		findModule(ACTIONS, null, (mod: any) => {
			const memo = mod?.default
			if (!memo || typeof memo.type !== 'function') {
				reportError(`${TAG} the + button has an unexpected shape`)
				return
			}
			undo.push(
				after(memo, 'type', (tree: any) => {
					try {
						const menu = findMenu(tree)
						// Skip an element that already has a wrapper (a second pass over the same tree).
						if (menu && menu.type != null && !isWrapper.has(menu.type)) {
							menu.type = wrapperFor(menu.type)
						}
					} catch (error) {
						reportError(`${TAG} finding the + long-press menu failed:`, error)
					}
					return tree
				}),
			)
		}),
	)
	return () => {
		for (const fn of undo.reverse()) {
			try {
				fn()
			} catch {
				/* already gone */
			}
		}
	}
}
