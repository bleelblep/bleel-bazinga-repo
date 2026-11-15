/**
 * Tap a server's icon or banner in its menu (the sheet from tapping the server name) to view it
 * full size, with save and share.
 *
 * `GuildActionSheetHeader({ guild })` (modules/guild_action_sheet/native/components/
 * GuildActionSheetHeader.tsx, 352) draws the banner (or the invite splash when there's no banner)
 * as a FastImage with a CDN `source`. The icon is a `GuildIconInner` element for real servers (see
 * isGuildIcon); only a non-record guild gets an icon image with a `source`. A server without an
 * icon has nothing to open.
 *
 * The `after` walks the returned tree for those elements and wraps each in a Pressable, keeping
 * the layout where it was. Same `before` stash / `after` pair as patches/avatar.ts.
 */

import { cdnURL, openImage, TAG } from '../lib/media'
import * as finders from '@valenced/discord/utils/modules/finders'
import { after, before } from '@valenced/patcher'
import * as React from 'react'
import * as ReactNative from 'react-native'
import { reportError } from '../../../../shared/report'

const DEBUG: boolean = false

const PATH =
	'modules/guild_action_sheet/native/components/GuildActionSheetHeader.tsx'
const NAME = 'GuildActionSheetHeader'
const MAX_DEPTH = 8

function sourceURI(source: any): string | undefined {
	const first = Array.isArray(source) ? source[0] : source
	return typeof first?.uri === 'string' ? first.uri : undefined
}

/** Which of the server's pictures an image shows, as a full-size URL. */
function pictureFor(
	uri: string,
	guild: any,
): { url: string; label: string } | undefined {
	const id = guild.id
	if (uri.includes(`/icons/${id}/`)) {
		const url = cdnURL('icons', id, guild.icon)
		return url ? { url, label: 'View server icon' } : undefined
	}
	if (uri.includes(`/banners/${id}/`)) {
		const url = cdnURL('banners', id, guild.banner)
		return url ? { url, label: 'View server banner' } : undefined
	}
	if (uri.includes(`/splashes/${id}/`)) {
		const url = cdnURL('splashes', id, guild.splash)
		return url ? { url, label: 'View server banner' } : undefined
	}
	return undefined
}

function makePressable(node: any, url: string, label: string): any {
	const { Pressable, StyleSheet } = ReactNative
	return (
		<Pressable
			accessibilityRole="imagebutton"
			accessibilityLabel={label}
			onPress={() => openImage(url)}
			style={[node.props.style, { overflow: 'hidden' }]}
		>
			{React.cloneElement(node, { style: StyleSheet.absoluteFill })}
		</Pressable>
	)
}

/**
 * A real server's icon is `GuildIconInner({ guild, size, animate })` (checked live on 352.6): it
 * picks its own image, so there's no `source` to match. `GuildBadgeV2` also gets `guild`, but no
 * `size`.
 */
function isGuildIcon(node: any, guild: any): boolean {
	const props = node.props
	return (
		typeof node.type !== 'string' &&
		props.guild?.id === guild.id &&
		props.size != null &&
		'animate' in props
	)
}

const LAYOUT_KEYS = [
	'position',
	'top',
	'left',
	'right',
	'bottom',
	'margin',
	'marginTop',
	'marginBottom',
	'marginLeft',
	'marginRight',
	'marginHorizontal',
	'marginVertical',
	'alignSelf',
	'zIndex',
]

/**
 * The icon sizes itself from `size`, so the Pressable only takes over where it sits (position and
 * margins) and the icon keeps the rest of its style.
 */
function wrapIcon(node: any, url: string): any {
	const { Pressable, StyleSheet } = ReactNative
	const flat: Record<string, any> = StyleSheet.flatten(node.props.style) ?? {}
	const outer: Record<string, any> = {}
	const inner: Record<string, any> = {}
	for (const [key, value] of Object.entries(flat)) {
		if (LAYOUT_KEYS.includes(key)) outer[key] = value
		else inner[key] = value
	}
	return (
		<Pressable
			accessibilityRole="imagebutton"
			accessibilityLabel="View server icon"
			onPress={() => openImage(url)}
			style={outer}
		>
			{React.cloneElement(node, { style: inner })}
		</Pressable>
	)
}

/** Copies only the branches that change; returns the same node when nothing matched. */
function wrapPictures(node: any, guild: any, depth = 0): any {
	if (depth > MAX_DEPTH || !node) return node
	if (Array.isArray(node)) {
		let changed = false
		const next = node.map(child => {
			const out = wrapPictures(child, guild, depth + 1)
			if (out !== child) changed = true
			return out
		})
		return changed ? next : node
	}
	if (typeof node !== 'object' || !node.props) return node

	const uri = sourceURI(node.props.source)
	if (uri) {
		const picture = pictureFor(uri, guild)
		if (picture) return makePressable(node, picture.url, picture.label)
	} else if (isGuildIcon(node, guild)) {
		const url = cdnURL('icons', guild.id, guild.icon)
		if (url) return wrapIcon(node, url)
	}

	const children = node.props.children
	if (children == null) return node
	const nextChildren = wrapPictures(children, guild, depth + 1)
	return nextChildren === children
		? node
		: React.cloneElement(node, { children: nextChildren })
}

/** The header may be the module's default, a memo/forwardRef around it, or a named export. */
function findTarget(mod: any): [any, string] | undefined {
	const candidates = [mod?.default, mod?.[NAME]]
	for (const value of candidates) {
		if (typeof value?.type === 'function') return [value, 'type']
		if (typeof value?.render === 'function') return [value, 'render']
	}
	if (typeof mod?.default === 'function') return [mod, 'default']
	if (typeof mod?.[NAME] === 'function') return [mod, NAME]
	return undefined
}

export default function patchGuild(): () => void {
	const patches: Array<() => void> = []
	let lastProps: any
	let unsubscribe: (() => void) | undefined

	const apply = (mod: any) => {
		try {
			const found = findTarget(mod)
			if (!found) {
				reportError(`${TAG} ${NAME} not found`)
				return
			}
			const [target, key] = found
			patches.push(
				before(target, key, (args: any[]) => {
					lastProps = args?.[0]
					return args
				}),
				after(target, key, (ret: any) => {
					const props = lastProps
					lastProps = undefined
					try {
						const guild = props?.guild
						if (!ret || !guild?.id) return ret
						return wrapPictures(ret, guild)
					} catch (error) {
						reportError(`${TAG} server header failed:`, error)
						return ret
					}
				}),
			)
			if (DEBUG) console.log(`${TAG} hooked ${NAME}`)
		} catch (error) {
			reportError(`${TAG} failed to hook ${NAME}:`, error)
		}
	}

	try {
		unsubscribe = (finders as any).getModuleWithImportedPath(PATH, apply)
	} catch (error) {
		reportError(`${TAG} ${NAME} lookup failed:`, error)
	}

	return () => {
		unsubscribe?.()
		for (const unpatch of patches) unpatch()
		patches.length = 0
	}
}
