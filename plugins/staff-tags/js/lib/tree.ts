import { cloneElement, isValidElement } from 'react'
import type { ReactElement, ReactNode } from 'react'

/** A rendered element, with the props this plugin reads typed loosely. */
export type Element = ReactElement<{
	children?: ReactNode
	[prop: string]: unknown
}>

const MAX_DEPTH = 30

export function isElement(node: unknown): node is Element {
	return isValidElement(node)
}

/** Depth-first: the first element under [root] (itself included) that [match] accepts. */
export function findInTree(
	root: ReactNode,
	match: (node: Element) => boolean,
	depth = 0,
): Element | undefined {
	if (depth > MAX_DEPTH) return undefined
	if (Array.isArray(root)) {
		for (const child of root as ReactNode[]) {
			const found = findInTree(child, match, depth + 1)
			if (found) return found
		}
		return undefined
	}
	if (!isElement(root)) return undefined
	if (match(root)) return root
	return findInTree(root.props.children, match, depth + 1)
}

/**
 * A copy of [root] with the first element [match] accepts replaced by `replace(element)`, cloning
 * only its ancestors. Discord's compiler reuses rendered elements across renders, so editing one
 * in place would apply the change again on every render.
 */
export function replaceInTree(
	root: ReactNode,
	match: (node: Element) => boolean,
	replace: (node: Element) => ReactNode,
	depth = 0,
): ReactNode {
	if (depth > MAX_DEPTH || !isElement(root)) return root
	if (match(root)) return replace(root)
	const children = root.props.children
	if (Array.isArray(children)) {
		const list = children as ReactNode[]
		for (let i = 0; i < list.length; i++) {
			const next = replaceInTree(list[i], match, replace, depth + 1)
			if (next !== list[i]) {
				const copy = [...list]
				copy[i] = next
				return cloneElement(root, { children: copy })
			}
		}
		return root
	}
	const next = replaceInTree(children, match, replace, depth + 1)
	return next === children ? root : cloneElement(root, { children: next })
}

/** [children] as an array, for adding one more next to them. */
export function childList(children: ReactNode): ReactNode[] {
	if (children == null) return []
	return Array.isArray(children) ? [...(children as ReactNode[])] : [children]
}
