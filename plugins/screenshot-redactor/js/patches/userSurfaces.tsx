import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import * as finders from '@valenced/modules/finders'
import * as filters from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import * as React from 'react'
import { reportError } from '../../../../shared/report'
import { redactedName } from '../lib/alias'
import { noteNamePatch } from '../lib/diagnostics'
import {
	presentationUser,
	redactPresentation,
	userInPresentation,
} from '../lib/presentation'
import { usePresentationRefresh } from '../lib/refreshSignal'
import {
	getStorage,
	isEnabled,
	redactOptions,
	settings,
	withOriginalResolution,
} from '../lib/state'

const DEBUG: boolean = false

const USER_ROW_PATH =
	'modules/main_tabs_v2/native/shared_components/user_list/UserRow.tsx'
const REACTIONS_PATH = 'modules/reactions/native/MessageReactionsContent.tsx'

function presentationOptions() {
	return {
		...redactOptions(),
		enabled: isEnabled(),
		resolved: settings().redactResolvedNames,
	}
}

/** Runs inside its own component: never add conditional hooks to Discord's renderer. */
function ReactionIdentity({
	render,
	args,
}: {
	render: (...args: any[]) => any
	args: any[]
}) {
	getStorage()?.use()
	usePresentationRefresh()
	const tree = withOriginalResolution(() => render(...args))
	const user = userInPresentation(tree)
	return user ? redactPresentation(tree, user.id, presentationOptions()) : tree
}

function wrapReactionItems(tree: any, depth = 0): any {
	if (depth > 16 || tree == null) return tree
	if (Array.isArray(tree))
		return tree.map(child => wrapReactionItems(child, depth + 1))
	if (!React.isValidElement(tree)) return tree
	const props = tree.props as any
	const patch: Record<string, any> = {}
	if (typeof props.renderItem === 'function') {
		const render = props.renderItem
		patch.renderItem = (...args: any[]) =>
			React.createElement(ReactionIdentity, { render, args })
	}
	if (props.children != null)
		patch.children = wrapReactionItems(props.children, depth + 1)
	return Object.keys(patch).length ? React.cloneElement(tree, patch) : tree
}

/**
 * A selection row: a mode other than plain (`"NONE"`), or a checkbox state of its own. The bundle
 * names the modes `NONE` and `TOGGLE`; if a build passes them as numbers instead, `selected` (which
 * only a checkbox row carries) still catches it.
 */
function isPickerRow(props: any): boolean {
	const mode = props?.mode
	if (typeof mode === 'string' && mode !== 'NONE') return true
	return typeof props?.selected === 'boolean'
}

export default function patchUserSurfaces(): () => void {
	const cleanups: Array<() => void> = []
	const seen = new Set<any>()
	let active = true

	try {
		cleanups.push(
			getModuleWithImportedPath(USER_ROW_PATH, (mod: any) => {
				if (!active) return
				const memo = mod?.default ?? mod
				if (typeof memo?.type !== 'function' || seen.has(memo)) return
				seen.add(memo)
				const original = memo.type
				// Keep the memo object itself so import-time references see the wrapper too. Its own
				// subscription bypasses React.memo; the transform runs even when useMemo holds old labels.
				function RedactedUserRow(this: any, props: any) {
					getStorage()?.use()
					usePresentationRefresh()
					const tree = withOriginalResolution(() =>
						Reflect.apply(original, this, [props]),
					)
					const userId = props?.user?.id
					const options = presentationOptions()
					if (
						!userId ||
						!options.enabled ||
						!options.resolved ||
						(!options.self && userId === options.selfId)
					)
						return tree
					// A picker row (352.6: `mode: "TOGGLE"`, drawn as a TableCheckboxRow with `selected`)
					// is someone choosing who to add or send to. Placeholders there would have them pick
					// blind (AS-04: keep the destination visible), so those rows keep real names.
					if (isPickerRow(props)) return tree
					// The row's label includes guild nicknames, suggestion names and custom labels;
					// replace the final slot, after all those choices, rather than guessing a resolver.
					const safe = React.isValidElement(tree)
						? React.cloneElement(tree, {
								label: redactedName(userId, options.style),
								subLabel: null,
								nameplate: null,
							} as any)
						: tree
					return redactPresentation(safe, userId, options)
				}
				memo.type = RedactedUserRow
				cleanups.push(() => {
					if (memo.type === RedactedUserRow) memo.type = original
				})
				noteNamePatch('UserRow (presentation, subscribed)')
				if (DEBUG)
					console.log('[ScreenshotRedactor] hooked UserRow presentation')
			}),
		)
	} catch (error) {
		reportError('[ScreenshotRedactor] UserRow discovery failed:', error)
	}

	try {
		cleanups.push(
			getModuleWithImportedPath(REACTIONS_PATH, (mod: any) => {
				if (
					!active ||
					typeof mod?.MessageReactionsContent !== 'function' ||
					seen.has(mod)
				)
					return
				seen.add(mod)
				cleanups.push(
					after(mod, 'MessageReactionsContent', (tree: any) => {
						try {
							return wrapReactionItems(tree)
						} catch (error) {
							reportError(
								'[ScreenshotRedactor] reaction presentation failed:',
								error,
							)
							return tree
						}
					}),
				)
				noteNamePatch('MessageReactionsContent (items, subscribed)')
				if (DEBUG)
					console.log('[ScreenshotRedactor] hooked reaction item presentation')
			}),
		)
	} catch (error) {
		reportError('[ScreenshotRedactor] reaction discovery failed:', error)
	}

	// This shared memo object is re-exported by the common component barrel. Patching its type
	// reaches captured imports too, and provides a subscription for avatars in memoized headers.
	const installAvatar = (mod: any) => {
		if (!active) return
		const memo = mod?.Avatar ?? mod?.default?.Avatar
		if (typeof memo?.type !== 'function' || seen.has(memo)) return
		seen.add(memo)
		const original = memo.type
		function RedactedAvatar(this: any, props: any) {
			getStorage()?.use()
			usePresentationRefresh()
			const options = presentationOptions()
			const userId = props?.user?.id
			let next = props
			if (
				userId &&
				options.enabled &&
				options.resolved &&
				options.avatars &&
				(options.self || userId !== options.selfId)
			) {
				const user = presentationUser(
					props.user,
					redactedName(userId, options.style),
					options,
				)
				next = {
					...props,
					user,
					source: user.getAvatarSource(),
					avatarDecoration: null,
				}
			}
			return withOriginalResolution(() => Reflect.apply(original, this, [next]))
		}
		memo.type = RedactedAvatar
		cleanups.push(() => {
			if (memo.type === RedactedAvatar) memo.type = original
		})
		noteNamePatch('Avatar (presentation, subscribed)')
		if (DEBUG)
			console.log('[ScreenshotRedactor] hooked shared Avatar presentation')
	}
	try {
		const { lookupModules, waitForModules } = finders
		const { withProps } = filters
		for (const [mod] of lookupModules(withProps('Avatar', 'AvatarSizes')))
			installAvatar(mod)
		cleanups.push(
			waitForModules(withProps('Avatar', 'AvatarSizes'), installAvatar),
		)
	} catch (error) {
		reportError(
			'[ScreenshotRedactor] Avatar component discovery failed:',
			error,
		)
	}

	return () => {
		active = false
		for (const cleanup of cleanups.reverse()) cleanup()
	}
}
