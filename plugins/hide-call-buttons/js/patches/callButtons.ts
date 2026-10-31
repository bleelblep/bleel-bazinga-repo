import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { after } from '@valenced/patcher'
import { cloneElement, isValidElement } from 'react'
import { reportError } from '../../../../shared/report'
import { DEFAULTS } from '../settings'
import type { JsonStorage } from '@valenced/json-storage'
import type { PluginCleanupApi } from '@valenced/plugins/types'
import type { ReactElement, ReactNode } from 'react'
import type { HideCallButtonsStorage } from '../settings'

const DEBUG: boolean = false

/**
 * Hides the call and camera controls this plugin knows about.
 *
 * One patch type throughout: `after` on the render React calls -- `.type` for the `React.memo`
 * wrappers, `.default` for the plain functions. Modules are found by Discord source path
 * (`getModuleWithImportedPath`, coding rule 3): on 349.5 and later these components' function
 * names are minified, so `withName` has nothing stable to match.
 *
 * | Surface       | Source file                                                | Rule                                  |
 * | ------------- | ---------------------------------------------------------- | ------------------------------------- |
 * | User profile  | `user_profile/native/UserProfileContactButtons.tsx`        | drop the last action (the call)       |
 * | DM header     | `main_tabs_v2/.../channel/header/PrivateChannelButtons.tsx` | drop pressables carrying `disabled`   |
 * | Friends list  | `main_tabs_v2/.../user_list/UserRow.tsx`                   | drop the `call` action + its trailing |
 * | Voice channel | `voice_panel/.../buttons/VoicePanelVideoButton.tsx`        | render `null`                         |
 *
 * Rules locate a control by its position in its own row, never by icon or asset id, and no-op
 * when the shape is missing. Every change is a copy: Discord's compiler reuses rendered elements
 * across renders, so editing one in place would apply the change again on every render.
 */

/** An accessibility action on a friends-list row, as `UserRow` builds it. */
interface AccessibilityAction {
	name?: unknown
}

/** The props this plugin reads or rewrites on the elements it walks. */
interface NodeProps {
	children?: ReactNode
	onPress?: unknown
	disabled?: unknown
	accessibilityActions?: AccessibilityAction[]
	trailing?: ReactNode
}

type Node = ReactElement<NodeProps>

/** Rewrites one patched component's rendered output. */
type Prune = (
	rendered: ReactNode,
	settings: HideCallButtonsStorage,
) => ReactNode

/**
 * Any rendered element: an object with a `$$typeof` and a props object, as 1.3.6 checked.
 *
 * Not React's `isValidElement` alone. In React 19 that accepts only elements tagged
 * `react.transitional.element`, and an element Discord builds any other way (an older tag, a
 * precompiled or hand-built element) fails it. 1.3.7 used it, and the DM header's buttons stopped
 * hiding with no error at all, because every prune rule treats "not an element" as "leave it".
 */
function isNode(node: unknown): node is Node {
	if (isValidElement<NodeProps>(node)) return true
	const candidate = node as { $$typeof?: unknown; props?: unknown } | null
	return (
		typeof candidate === 'object' &&
		candidate !== null &&
		candidate.$$typeof !== undefined &&
		typeof candidate.props === 'object' &&
		candidate.props !== null
	)
}

function hasPress(node: Node): boolean {
	return typeof node.props.onPress === 'function'
}

/** Address in a tree: each step indexes `props.children`, except `-1` = the single non-array child. */
function getAtPath(root: ReactNode, path: number[]): ReactNode {
	let node: ReactNode = root
	for (const step of path) {
		if (!isNode(node)) return undefined
		const children = node.props.children
		node =
			step === -1
				? children
				: Array.isArray(children)
					? (children[step] as ReactNode)
					: undefined
	}
	return node
}

/** A copy of [root] with the children at [path] replaced, cloning only the elements on the way. */
function replaceChildren(
	root: Node,
	path: number[],
	children: ReactNode[],
): Node {
	if (path.length === 0) return cloneElement(root, undefined, ...children)
	const [head, ...rest] = path
	const current = root.props.children
	if (!Array.isArray(current)) return root
	const target = current[head]
	if (!isNode(target)) return root
	const next = [...current]
	next[head] = replaceChildren(target, rest, children)
	return cloneElement(root, undefined, ...next)
}

/** Depth-first, document order: the path of every element carrying an `onPress`. */
export function pressablePaths(root: ReactNode): number[][] {
	const found: number[][] = []
	const visit = (node: ReactNode, path: number[], depth: number) => {
		if (depth > 8 || !isNode(node)) return
		const kids = node.props.children
		if (isNode(kids)) {
			const child = [...path, -1]
			if (hasPress(kids)) found.push(child)
			visit(kids, child, depth + 1)
			return
		}
		if (!Array.isArray(kids)) return
		kids.forEach((kid: ReactNode, i: number) => {
			if (!isNode(kid)) return
			const child = [...path, i]
			if (hasPress(kid)) found.push(child)
			visit(kid, child, depth + 1)
		})
	}
	visit(root, [], 0)
	return found
}

/**
 * Drop a row's last action without leaving an empty wrapper: climb while the subtree still holds
 * only that one pressable. A three-button profile row loses the call button itself (keeping the
 * message icon); a two-button row loses its whole half-width call cell, so the row collapses.
 */
function removeLastPressable(root: Node): Node | undefined {
	const paths = pressablePaths(root)
	if (paths.length < 2) return undefined
	const target = paths[paths.length - 1]

	// Subtree pressable counts only grow as the prefix shortens, so the first miss ends the walk.
	let chosen = target
	for (let len = target.length - 1; len >= 1; len--) {
		const prefix = target.slice(0, len)
		if (pressablePaths(getAtPath(root, prefix)).length !== 1) break
		chosen = prefix
	}

	const path = chosen.slice(0, -1)
	const container = getAtPath(root, path)
	if (!isNode(container) || !Array.isArray(container.props.children))
		return undefined
	const drop = chosen[chosen.length - 1]
	const kept = (container.props.children as ReactNode[]).filter(
		(_, i) => i !== drop,
	)
	return kept.length > 0 ? replaceChildren(root, path, kept) : undefined
}

/** Depth-first pass; `fn` rewrites each element, having already rewritten its children. */
function mapElements(
	node: ReactNode,
	fn: (element: Node) => Node,
	depth = 0,
): ReactNode {
	if (depth > 10) return node
	if (Array.isArray(node)) {
		let changed = false
		const mapped = node.map((child: ReactNode) => {
			const next = mapElements(child, fn, depth + 1)
			if (next !== child) changed = true
			return next
		})
		return changed ? mapped : node
	}
	if (!isNode(node)) return node
	const children = node.props.children
	const next =
		children == null ? children : mapElements(children, fn, depth + 1)
	return fn(next === children ? node : cloneElement(node, undefined, next))
}

/**
 * User profile -- `UserProfileContactButtons`: its whole output is the action row (message + call,
 * or add-friend + message + call) with the call always last. The profile draws no camera button.
 */
export const pruneProfile: Prune = (root, st) => {
	if (!st.upHideVoiceButton || !isNode(root)) return root
	return removeLastPressable(root) ?? root
}

/**
 * DM header -- `PrivateChannelButtons`. Discord gives the call and video pressables a `disabled`
 * prop and the search / overflow ones none, which separates the groups without reaching for an
 * icon. Call first, video second; the App DM header renders only labelled pressables.
 */
export const pruneDM: Prune = (root, st) => {
	if ((!st.dmHideCallButton && !st.dmHideVideoButton) || !isNode(root))
		return root
	const children = root.props.children
	if (!Array.isArray(children)) return root

	const toggles = (children as ReactNode[]).flatMap((child, i) =>
		isNode(child) && hasPress(child) && 'disabled' in child.props ? [i] : [],
	)
	const drop = new Set<number>()
	if (st.dmHideCallButton && toggles.length > 0) drop.add(toggles[0])
	if (st.dmHideVideoButton && toggles.length > 1) drop.add(toggles[1])
	if (drop.size === 0) return root
	const kept = (children as ReactNode[]).filter((_, i) => !drop.has(i))
	return kept.length > 0 ? cloneElement(root, undefined, ...kept) : root
}

/**
 * Friends list -- `UserRow`. `accessibilityActions` and the `trailing` buttons come from one
 * `useMemo`, so index `i` in one is index `i` in the other, and dropping `i` from both needs no
 * knowledge of what the button looks like. Drifted lists are skipped rather than misaligned.
 */
export const pruneFriends: Prune = (root, st) => {
	if (!st.friendsHideCallButton || !isNode(root)) return root
	return mapElements(root, element => {
		const actions = element.props.accessibilityActions
		const trailing = element.props.trailing
		const buttons = isNode(trailing) ? trailing.props.children : undefined
		const index = Array.isArray(actions)
			? actions.findIndex(
					action => String(action?.name).toLowerCase() === 'call',
				)
			: -1
		if (
			!isNode(trailing) ||
			index < 0 ||
			!Array.isArray(buttons) ||
			buttons.length !== actions?.length
		)
			return element
		return cloneElement(element, {
			accessibilityActions: actions.filter((_, i) => i !== index),
			trailing: cloneElement(
				trailing,
				undefined,
				...(buttons as ReactNode[]).filter((_, i) => i !== index),
			),
		})
	})
}

/** Voice channel -- `VoicePanelVideoButton`: the whole button goes. */
export const pruneVoice: Prune = (root, st) =>
	st.hideVCVideoButton ? null : root

/** A component's render function, as the patcher sees it. */
type Render = (...args: unknown[]) => ReactNode

/** Where a module keeps the render React calls: `default.type` for a memo, `default` otherwise. */
function renderTarget(
	ns: unknown,
): { host: Record<string, Render>; key: 'type' | 'default' } | undefined {
	const target = (ns as { default?: unknown } | undefined)?.default
	if (
		target !== null &&
		typeof target === 'object' &&
		typeof (target as { type?: unknown }).type === 'function'
	)
		return { host: target as Record<string, Render>, key: 'type' }
	if (typeof target === 'function')
		return { host: ns as Record<string, Render>, key: 'default' }
	return undefined
}

const SURFACES: Array<[path: string, label: string, prune: Prune]> = [
	[
		'modules/user_profile/native/UserProfileContactButtons.tsx',
		'profile',
		pruneProfile,
	],
	[
		'modules/main_tabs_v2/native/channel/header/PrivateChannelButtons.tsx',
		'dm header',
		pruneDM,
	],
	[
		'modules/main_tabs_v2/native/shared_components/user_list/UserRow.tsx',
		'friends row',
		pruneFriends,
	],
	[
		'modules/voice_panel/native/controls/buttons/VoicePanelVideoButton.tsx',
		'voice camera',
		pruneVoice,
	],
]

/** Hooks every surface. Each lookup and each patch is handed to [cleanup] as it is made. */
export default function patchCallButtons(
	cleanup: PluginCleanupApi,
	jsonStorage: JsonStorage<HideCallButtonsStorage>,
) {
	const settings = (): HideCallButtonsStorage => ({
		...DEFAULTS,
		...jsonStorage.cache,
	})

	for (const [path, label, prune] of SURFACES) {
		cleanup(
			getModuleWithImportedPath<unknown>(path, ns => {
				const target = renderTarget(ns)
				if (!target) {
					if (DEBUG)
						console.warn(`[HideCallButtons] ${label}: nothing to patch`)
					return
				}
				if (DEBUG) console.log(`[HideCallButtons] ${label}: patched`)
				cleanup(
					after(target.host, target.key, rendered => {
						try {
							return prune(rendered, settings())
						} catch (error) {
							reportError(`[HideCallButtons] ${label}:`, error)
							return rendered
						}
					}),
				)
			}),
		)
	}
}
