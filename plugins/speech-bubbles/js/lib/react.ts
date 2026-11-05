/**
 * Replaces one element in a rendered tree without touching the original. Discord's compiler caches
 * rendered elements, so an in-place edit would apply again on every render; the path down to the
 * replaced element is cloned instead. From Palm's Better Typing Indicators (`shared.react.ts`),
 * on React's own `isValidElement` and `cloneElement`.
 */

import { cloneElement, isValidElement } from 'react'
import type { ReactElement, ReactNode } from 'react'

const NotFound = Symbol()

// `any` here is Palm's own: the walker meets elements of every prop shape, and the caller narrows.
type Predicate = (element: ReactElement<any>) => boolean
type Replacer = (element: ReactElement<any>) => ReactNode

/** The new tree, or the original one when nothing matched. */
export function replaceElement(
	tree: ReactNode,
	predicate: Predicate,
	replacer: Replacer,
): ReactNode {
	const result = replace(tree, predicate, replacer)
	return result === NotFound ? tree : result
}

function replace(
	node: ReactNode,
	predicate: Predicate,
	replacer: Replacer,
): ReactNode | typeof NotFound {
	if (Array.isArray(node)) {
		for (let i = 0; i < node.length; i++) {
			const result = replace(node[i], predicate, replacer)
			if (result === NotFound) continue
			const copy = node.slice()
			copy[i] = result
			return copy
		}
		return NotFound
	}

	if (!isValidElement<{ children?: ReactNode }>(node)) return NotFound
	if (predicate(node)) return replacer(node)

	const children = node.props.children
	if (children == null) return NotFound

	const result = replace(children, predicate, replacer)
	if (result === NotFound) return NotFound

	// Separate arguments, so React treats them as static children like the original JSX did.
	return Array.isArray(result)
		? cloneElement(node, undefined, ...result)
		: cloneElement(node, undefined, result)
}
