import * as React from 'react'
import { redactedAvatarUrl, redactedName } from './alias'
import type { RedactOptions } from './rowSchema'

export interface PresentationOptions extends RedactOptions {
	enabled: boolean
	resolved: boolean
}

/** Keep store records intact: only copy React elements and their presentation props. */
export function redactPresentation(
	tree: any,
	userId: string,
	options: PresentationOptions,
): any {
	if (
		!options.enabled ||
		!options.resolved ||
		(!options.self && userId === options.selfId)
	)
		return tree
	const name = redactedName(userId, options.style)
	const avatar = redactedAvatarUrl(userId)

	const walk = (node: any, depth: number): any => {
		if (depth > 20 || node == null) return node
		if (Array.isArray(node)) return node.map(child => walk(child, depth + 1))
		if (!React.isValidElement(node)) return node
		const props = node.props as any
		const patch: Record<string, any> = {}
		// These props identify a user-label component in the reaction sheet. It reads the raw
		// username as well as nick, so supplying a nickname alone still leaks the secondary name.
		if (props.user?.id === userId && 'nick' in props) {
			patch.nick = name
			patch.user = presentationUser(props.user, name, options)
		}
		if (options.avatars) {
			if (props.user?.id === userId) {
				patch.user = presentationUser(props.user, name, options)
				patch.avatarDecoration = null
			}
			// Reaction rows pass a precomputed source to their leading Avatar rather than a user.
			if (
				'source' in props &&
				(props.size != null || props.user?.id === userId)
			)
				patch.source = { uri: avatar }
			if ('avatarDecoration' in props) patch.avatarDecoration = null
		}
		for (const key of [
			'children',
			'label',
			'leading',
			'subLabel',
			'trailing',
		] as const) {
			if (props[key] != null) patch[key] = walk(props[key], depth + 1)
		}
		return Object.keys(patch).length ? React.cloneElement(node, patch) : node
	}
	return walk(tree, 0)
}

/** A private view of a record; ids, methods and event targets still refer to the same person. */
export function presentationUser(
	user: any,
	name: string,
	options: RedactOptions,
): any {
	const copy = Object.create(Object.getPrototypeOf(user))
	Object.assign(copy, user, {
		username: name,
		globalName: name,
		global_name: name,
	})
	if (options.avatars) {
		const source = { uri: redactedAvatarUrl(user.id) }
		Object.assign(copy, {
			avatarDecoration: null,
			getAvatarSource: () => source,
			getAvatarURL: () => source.uri,
		})
	}
	return copy
}

export function userInPresentation(tree: any, depth = 0): any {
	if (depth > 12 || tree == null) return undefined
	if (Array.isArray(tree)) {
		for (const child of tree) {
			const user = userInPresentation(child, depth + 1)
			if (user) return user
		}
		return undefined
	}
	if (tree.props?.user?.id) return tree.props.user
	for (const key of ['label', 'children', 'leading'] as const) {
		const user = userInPresentation(tree.props?.[key], depth + 1)
		if (user) return user
	}
	return undefined
}
