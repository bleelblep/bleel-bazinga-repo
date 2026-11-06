/**
 * The custom status bubble on profiles, squared. The bubble itself is a View (its corner goes
 * through Corners.kt), but the bump joining it to the avatar is `StatusBubbleConnector({
 * backgroundColor, borderColor, style })` in `modules/user_profile/native/UserProfileCustomStatusBubble.tsx`
 * (352.2 hasm, unchanged in 352.6): a 20 x 11 SVG of a half circle drawn with an arc
 * (`M0 10 A10 10 0 0 1 20 10 L20 11 L0 11 Z`, plus a 1px outline), which no shape hook sees.
 *
 * The connector isn't exported, so the bubble's rendered tree is searched for an element of that
 * name and it's swapped for a square block of the same size, fill and outline. The tree Discord
 * returned is never edited in place (its compiler caches elements): the path down to it is cloned.
 */

import { getModuleByPath } from '../../../../shared/modules'
import { reportError } from '../../../../shared/report'
import { after } from '@valenced/patcher'
import * as react from '@valenced/react'
import * as ReactNative from 'react-native'
import { componentTarget } from './status'

const TAG = '[Sharp Corners]'
const PATH = 'modules/user_profile/native/UserProfileCustomStatusBubble.tsx'
const CONNECTOR = 'StatusBubbleConnector'

function isConnector(node: any): boolean {
	const type = node?.type
	return typeof type === 'function' && (type.name === CONNECTOR || type.displayName === CONNECTOR)
}

function squareConnector(node: any): any {
	const { React } = react
	const { View } = ReactNative
	const { backgroundColor, borderColor, style } = node.props ?? {}
	return React.createElement(View, {
		key: node.key,
		pointerEvents: 'none',
		style: [
			style,
			{
				width: 20,
				height: 11,
				borderRadius: 0,
				backgroundColor,
				borderColor,
				borderTopWidth: 1,
				borderLeftWidth: 1,
				borderRightWidth: 1,
			},
		],
	})
}

/** Swaps the connector anywhere in the tree, a few levels deep at most. */
function swap(node: any, depth = 0): any {
	const { React } = react
	if (node == null || depth > 10) return node
	if (Array.isArray(node)) {
		let changed = false
		const next = node.map(child => {
			const swapped = swap(child, depth + 1)
			if (swapped !== child) changed = true
			return swapped
		})
		return changed ? next : node
	}
	if (!React.isValidElement(node)) return node
	if (isConnector(node)) return squareConnector(node)
	const children = (node as any).props?.children
	if (children == null || typeof children !== 'object') return node
	const next = swap(children, depth + 1)
	return next === children ? node : React.cloneElement(node as any, { children: next } as any)
}

/** Squares the status bubble's connector while `active()` says so. Returns a cleanup. */
export function squareStatusBubble(active: () => boolean): () => void {
	const cleanups: Array<() => void> = []
	cleanups.push(
		getModuleByPath(
			PATH,
			null,
			(ns: any) => {
				const target = componentTarget(ns?.default, ns)
				if (!target) throw new Error(`${PATH}: default is not a component`)
				cleanups.push(
					after(target[0], target[1], (tree: any) => {
						if (!active()) return tree
						try {
							return swap(tree)
						} catch (error) {
							reportError(`${TAG} status bubble failed:`, error)
							return tree
						}
					}),
				)
			},
			TAG,
		),
	)
	return () => {
		for (const cleanup of cleanups.splice(0).reverse()) {
			try {
				cleanup()
			} catch {
				/* already gone */
			}
		}
	}
}
