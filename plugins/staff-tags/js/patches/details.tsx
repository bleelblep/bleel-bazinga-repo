import { getModules } from '@valenced/modules/finders'
import {
	createFilterGenerator,
	withName,
} from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { cloneElement } from 'react'
import { reportError } from '../../../../shared/report'
import { getTagModule, stores } from '../lib/discord'
import getTag, { isBuiltInTag, tagProps } from '../lib/getTag'
import { settings } from '../lib/state'
import { childList, findInTree, isElement, replaceInTree } from '../lib/tree'
import type { PluginCleanupApi } from '@valenced/plugins/types'
import type { ReactNode } from 'react'
import type { User } from '../lib/discord'
import type { Element } from '../lib/tree'

/** Member list rows -- `UserRow`. The tag goes after the name inside the row's `label`. */

interface RowProps {
	guildId?: string
	user?: User
}

type RowRender = (props: RowProps, ...rest: unknown[]) => ReactNode

/** `React.memo(function UserRow ...)`: the render function is on `type`. */
interface MemoRow {
	type: RowRender
}

const isTagElement = (node: Element) =>
	!!(node.type as { Types?: unknown } | undefined)?.Types

/** The element holding the name: children with a string, directly or one level down. */
const isNameContainer = (node: Element) =>
	Array.isArray(node.props.children) &&
	(node.props.children as ReactNode[]).some(
		child =>
			typeof child === 'string' ||
			(isElement(child) && typeof child.props.children === 'string'),
	)

function withRowTag(
	rendered: ReactNode,
	props: RowProps | undefined,
): ReactNode {
	if (!isElement(rendered)) return rendered
	const label = rendered.props.label as ReactNode
	const nameContainer = findInTree(label, isNameContainer)
	if (!nameContainer) return rendered

	const existing = findInTree(nameContainer, isTagElement)
	if (existing && isBuiltInTag(existing.props.type)) return rendered

	const guild = props?.guildId
		? stores.guild()?.getGuild(props.guildId)
		: undefined
	const tag = getTag(guild, undefined, props?.user, settings().useRoleColor)
	if (!tag) return rendered

	let nextLabel: ReactNode
	if (existing) {
		nextLabel = replaceInTree(
			label,
			node => node === existing,
			node => cloneElement(node, { ...tagProps(tag) }),
		)
	} else {
		const Tag = getTagModule()?.default
		if (typeof Tag !== 'function') return rendered
		nextLabel = replaceInTree(
			label,
			node => node === nameContainer,
			node =>
				cloneElement(node, {
					children: [
						...childList(node.props.children),
						<Tag key="staff-tag" {...tagProps(tag)} />,
					],
				}),
		)
	}
	return cloneElement(rendered, { label: nextLabel })
}

export default function patchDetails(cleanup: PluginCleanupApi) {
	// `withName` can't see through `React.memo`, whose wrapper has no name of its own; the wrapped
	// function on `type` still has one. Built here, not at module scope (coding rule 1).
	const withMemoName = createFilterGenerator<[name: string]>(
		([name], _id, exports) =>
			(exports as { type?: { name?: string } } | undefined)?.type?.name ===
			name,
		([name]) => `bleelblep.staff-tags.memoName(${name})`,
	)

	const patched = new WeakSet<object>()
	const patchRow = (exports: unknown) => {
		// A bare engine job when the module is already loaded: an uncaught throw can close the app.
		try {
			const row = exports as MemoRow | undefined
			// A plain function export has no `type` to patch.
			if (typeof row?.type !== 'function' || patched.has(row)) return
			patched.add(row)
			cleanup(
				instead(row, 'type', function (args, original) {
					const rendered = Reflect.apply(original, this, args)
					try {
						return withRowTag(rendered, args[0])
					} catch (error) {
						reportError('[StaffTags] member row tag failed:', error)
						return rendered
					}
				}),
			)
		} catch (error) {
			reportError('[StaffTags] could not patch UserRow:', error)
		}
	}

	// Both, for builds where UserRow is and isn't memo-wrapped. Several modules may carry a
	// "UserRow", so up to ten are taken instead of the default one.
	cleanup(
		getModules(withName('UserRow'), patchRow, { max: 10 }),
		getModules(withMemoName('UserRow'), patchRow, { max: 10 }),
	)
}
