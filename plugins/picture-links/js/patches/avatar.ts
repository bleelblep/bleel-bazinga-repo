/**
 * Long-press a server avatar on a profile for the person's main avatar (the tap shows the server
 * one). The original plugin's long-press.
 *
 * `HeaderAvatar` (modules/profile_customization/native/HeaderAvatar.tsx, a forwardRef up to 349, a
 * plain function from 350.2) renders a
 * PressableOpacity with `onLongPress: onPress` whenever it's openable, so a long-press just repeats
 * the tap. A `before` on its `render` stashes the props, and the `after` swaps `onLongPress` on the
 * returned pressable. Only when there's an `onPress` (a profile avatar Discord already made
 * openable), so avatars elsewhere don't turn into buttons.
 */

import { FULL_SIZE, fullSize, openImage, TAG } from '../lib/media'
import * as finders from '@valenced/discord/utils/modules/finders'
import { after, before } from '@valenced/patcher'
import * as React from 'react'
import { reportError } from '../../../../shared/report'

const DEBUG: boolean = false

const PATH = 'modules/profile_customization/native/HeaderAvatar.tsx'

function otherAvatar(user: any, guildId: string | undefined): string | undefined {
	try {
		// Only a server avatar has an "other" picture: the tap shows it, so long-press shows the main
		// one. Without one, the long-press keeps doing what the tap does.
		if (!guildId || !user?.hasAvatarForGuild?.(guildId)) return undefined
		const url = user.getAvatarURL(undefined, FULL_SIZE, true)
		if (typeof url === "string") return fullSize(url)
	} catch (error) {
		reportError(`${TAG} avatar URL failed:`, error)
	}
	return undefined
}

export default function patchAvatar(): () => void {
	const patches: Array<() => void> = []
	let lastProps: any
	let unsubscribe: (() => void) | undefined

	const apply = (mod: any) => {
		try {
			// A forwardRef up to 349 (hook its `render`); a plain function from 350.2, which dropped
			// forwardRef app-wide (hook the module's `default` itself).
			const value = mod?.default
			const [target, key] =
				typeof value?.render === 'function'
					? [value, 'render']
					: typeof value?.type === 'function'
						? [value, 'type']
						: typeof value === 'function'
							? [mod, 'default']
							: [undefined, '']
			if (!target) {
				reportError(`${TAG} HeaderAvatar render not found`)
				return
			}
			patches.push(
				before(target, key, (args: any[]) => {
					lastProps = args?.[0]
					return args
				}),
				after(target, key, (ret: any) => {
					const props = lastProps
					lastProps = undefined
					try {
						if (!ret?.props || typeof ret.props.onPress !== 'function' || !props?.user) return ret
						const url = otherAvatar(props.user, props.guildId)
						if (!url) return ret
						return React.cloneElement(ret, {
							onLongPress: () => openImage(url),
						})
					} catch (error) {
						reportError(`${TAG} avatar long-press failed:`, error)
						return ret
					}
				}),
			)
			if (DEBUG) console.log(`${TAG} hooked HeaderAvatar`)
		} catch (error) {
			reportError(`${TAG} failed to hook HeaderAvatar:`, error)
		}
	}

	try {
		unsubscribe = (finders as any).getModuleWithImportedPath(PATH, apply)
	} catch (error) {
		reportError(`${TAG} HeaderAvatar lookup failed:`, error)
	}

	return () => {
		unsubscribe?.()
		for (const unpatch of patches) unpatch()
		patches.length = 0
	}
}
