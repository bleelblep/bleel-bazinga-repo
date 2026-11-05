/**
 * Tap a profile banner to view it full size. The original plugin wrapped `ProfileBanner` in a
 * Pressable; on 348+ the banner is `UserProfileBanner({ displayProfile, … })`
 * (modules/user_profile/native/UserProfileBanner.tsx), which Discord loads at 600px and doesn't
 * open at all. Animated banners already have a PressableOpacity that pauses them on tap, so those
 * get a long-press instead and keep their tap.
 *
 * Same `before` stash / `after` pair as patches/avatar.ts.
 */

import { fullSize, openImage, TAG } from '../lib/media'
import * as finders from '@valenced/discord/utils/modules/finders'
import { after, before } from '@valenced/patcher'
import * as React from 'react'
import * as ReactNative from 'react-native'
import { reportError } from '../../../../shared/report'

const DEBUG: boolean = false

const PATH = 'modules/user_profile/native/UserProfileBanner.tsx'

function bannerURL(displayProfile: any): string | undefined {
	try {
		const url = displayProfile?.getBannerURL?.({ canAnimate: true, size: 4096 })
		if (typeof url === 'string') return fullSize(url)
	} catch (error) {
		reportError(`${TAG} banner URL failed:`, error)
	}
	return undefined
}

export default function patchBanner(): () => void {
	const patches: Array<() => void> = []
	let lastProps: any
	let unsubscribe: (() => void) | undefined

	const apply = (mod: any) => {
		try {
			if (typeof mod?.default !== 'function') {
				reportError(`${TAG} UserProfileBanner not found`)
				return
			}
			patches.push(
				before(mod, 'default', (args: any[]) => {
					lastProps = args?.[0]
					return args
				}),
				after(mod, 'default', (ret: any) => {
					const props = lastProps
					lastProps = undefined
					try {
						// Skip the edit-profile preview (a pending image, not a URL) and banners Discord made inert.
						if (!ret?.props || props?.pendingBanner || props?.disableInteraction) return ret
						const url = bannerURL(props?.displayProfile)
						if (!url) return ret

						const { Pressable } = ReactNative
						const open = () => openImage(url)
						const child = ret.props.children

						// Animated banner: Discord's own pressable pauses it on tap. Keep that, add a hold.
						if (child?.props && typeof child.props.onPress === 'function') {
							return React.cloneElement(ret, { children: React.cloneElement(child, { onLongPress: open }) })
						}
						return React.cloneElement(ret, {
							children: (
								<Pressable accessibilityRole="imagebutton" accessibilityLabel="View banner" onPress={open}>
									{child}
								</Pressable>
							),
						})
					} catch (error) {
						reportError(`${TAG} banner press failed:`, error)
						return ret
					}
				}),
			)
			if (DEBUG) console.log(`${TAG} hooked UserProfileBanner`)
		} catch (error) {
			reportError(`${TAG} failed to hook UserProfileBanner:`, error)
		}
	}

	try {
		unsubscribe = (finders as any).getModuleWithImportedPath(PATH, apply)
	} catch (error) {
		reportError(`${TAG} UserProfileBanner lookup failed:`, error)
	}

	return () => {
		unsubscribe?.()
		for (const unpatch of patches) unpatch()
		patches.length = 0
	}
}
