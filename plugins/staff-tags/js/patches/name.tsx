import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { after } from '@valenced/patcher'
import { cloneElement, createElement } from 'react'
import { reportError } from '../../../../shared/report'
import { getTagModule, stores } from '../lib/discord'
import getTag, { isBuiltInTag, tagProps } from '../lib/getTag'
import { settings } from '../lib/state'
import { findInTree, replaceInTree } from '../lib/tree'
import type { PluginCleanupApi } from '@valenced/plugins/types'
import type { ReactNode } from 'react'
import type { User } from '../lib/discord'
import type { Element } from '../lib/tree'

const DEBUG: boolean = false

/**
 * Profile header tag -- `modules/user_profile/native/UserProfilePrimaryInfo.tsx`.
 *
 * Found by source path: the file exports `DisplayName` (name + bot tag row) as a named export,
 * and 349.5 minifies function names, so there is nothing for `withName` to match (coding rule 3).
 *
 * `default` renders DisplayName through its own module scope, not the exports object, so
 * patching `DisplayName` changes nothing. Instead: `after` on `default`, find the element whose
 * `type` is DisplayName and swap in a wrapper that adds the tag to DisplayName's output.
 *
 * DisplayName's output (349.5): one row whose children are `[name, botTag | null, chevron?]`,
 * the bot tag being a component with a static `Types`. A built-in tag (bot, system) is kept;
 * otherwise the staff tag replaces a non-built-in one, or goes right after the name.
 */
const PATH = 'modules/user_profile/native/UserProfilePrimaryInfo.tsx'

interface DisplayNameProps {
	guildId?: string
	user?: User
}

type DisplayName = (props: DisplayNameProps) => ReactNode

interface ProfileModule {
	default: (...args: unknown[]) => ReactNode
	DisplayName?: DisplayName
}

/** Discord's tag component carries its enum of built-in tags as a static `Types`. */
const isTagElement = (node: Element) =>
	!!(node.type as { Types?: unknown } | undefined)?.Types

/** The open channel, when it belongs to the profile's guild -- for channel-level mod roles. */
function channelFor(guildId: string) {
	const channel = stores
		.channel()
		?.getChannel(stores.selectedChannel()?.getChannelId())
	return channel?.guild_id === guildId ? channel : undefined
}

function addTag(
	rendered: ReactNode,
	props: DisplayNameProps | undefined,
): ReactNode {
	const { guildId, user } = props ?? {}
	if (!user || !guildId) return rendered

	const existing = findInTree(rendered, isTagElement)
	if (existing && isBuiltInTag(existing.props.type)) return rendered

	const tag = getTag(
		stores.guild()?.getGuild(guildId),
		channelFor(guildId),
		user,
		settings().useRoleColor,
	)
	if (!tag) return rendered

	if (existing)
		return replaceInTree(
			rendered,
			node => node === existing,
			node => cloneElement(node, { ...tagProps(tag) }),
		)

	const Tag = getTagModule()?.default
	if (typeof Tag !== 'function') return rendered
	const element = (
		<Tag key="staff-tag" style={{ marginLeft: 0 }} {...tagProps(tag)} />
	)
	const isRow = (node: Element) =>
		Array.isArray(node.props.children) && node.props.children.length >= 2
	// Discord leaves the bot-tag slot (index 1) empty for people; use it so the tag sits right after
	// the name and before the chevron.
	return replaceInTree(rendered, isRow, row => {
		const children = [...(row.props.children as ReactNode[])]
		if (!children[1]) children[1] = element
		else children.splice(1, 0, element)
		return cloneElement(row, { children })
	})
}

export default function patchName(cleanup: PluginCleanupApi) {
	// One wrapper per DisplayName function, so React sees a stable component type.
	const wrappers = new WeakMap<DisplayName, DisplayName>()
	const wrap = (Original: DisplayName) => {
		let wrapper = wrappers.get(Original)
		if (!wrapper) {
			wrapper = props => {
				const rendered = Original(props)
				try {
					return addTag(rendered, props)
				} catch (error) {
					reportError('[StaffTags] profile tag:', error)
					return rendered
				}
			}
			wrappers.set(Original, wrapper)
		}
		return wrapper
	}

	cleanup(
		getModuleWithImportedPath<ProfileModule>(PATH, module => {
			// A bare engine job when the module is already loaded: an uncaught throw can close the app.
			try {
				const DisplayName = module?.DisplayName
				if (
					typeof module?.default !== 'function' ||
					typeof DisplayName !== 'function'
				) {
					if (DEBUG) console.warn('[StaffTags] profile: nothing to patch')
					return
				}
				cleanup(
					after(module, 'default', rendered => {
						try {
							return replaceInTree(
								rendered,
								node => node.type === DisplayName,
								node =>
									createElement(wrap(DisplayName), {
										...(node.props as DisplayNameProps),
										key: node.key,
									}),
							)
						} catch (error) {
							reportError('[StaffTags] profile:', error)
							return rendered
						}
					}),
				)
			} catch (error) {
				reportError('[StaffTags] could not patch the profile header:', error)
			}
		}),
	)
}
