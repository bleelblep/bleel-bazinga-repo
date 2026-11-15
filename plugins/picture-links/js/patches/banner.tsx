/**
 * Tap a profile banner to view it full size. The original plugin wrapped `ProfileBanner` in a
 * Pressable; on 348+ the banner is `UserProfileBanner({ displayProfile, … })`
 * (modules/user_profile/native/UserProfileBanner.tsx), which Discord loads at 600px and doesn't
 * open at all. Animated banners already have a PressableOpacity that pauses them on tap, so those
 * get a long-press instead and keep their tap.
 *
 * When the banner on show is someone's server banner, the viewer opens with their main banner as a
 * second image to swipe to.
 *
 * Same `before` stash / `after` pair as patches/avatar.ts.
 */

import { cdnURL, fullSize, openImage, TAG } from '../lib/media'
import * as finders from '@valenced/discord/utils/modules/finders'
import { after, before } from '@valenced/patcher'
import * as React from 'react'
import * as ReactNative from 'react-native'
import { reportError } from '../../../../shared/report'

const DEBUG: boolean = false

const PATH = 'modules/user_profile/native/UserProfileBanner.tsx'

/**
 * The banner on show, then the person's main banner when the one on show is a server banner.
 * DisplayProfile (352) keeps the main profile on `_userProfile` and the server one on
 * `_guildMemberProfile`; `isUsingGuildMemberBanner()` says which `getBannerURL` used.
 */
function bannerURLs(displayProfile: any): string[] {
	const urls: string[] = []
	try {
		const url = displayProfile?.getBannerURL?.({ canAnimate: true, size: 4096 })
		if (typeof url === 'string') urls.push(fullSize(url))
		if (
			displayProfile?.guildId &&
			displayProfile.isUsingGuildMemberBanner?.()
		) {
			const main = cdnURL(
				'banners',
				displayProfile.userId,
				displayProfile._userProfile?.banner,
			)
			if (main) urls.push(main)
		}
	} catch (error) {
		reportError(`${TAG} banner URL failed:`, error)
	}
	return urls
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
						if (
							!ret?.props ||
							props?.pendingBanner ||
							props?.disableInteraction
						)
							return ret
						const urls = bannerURLs(props?.displayProfile)
						if (!urls.length) return ret

						const { Pressable } = ReactNative
						const open = () => openImage(urls)
						const child = ret.props.children

						// Animated banner: Discord's own pressable pauses it on tap. Keep that, add a hold.
						if (child?.props && typeof child.props.onPress === 'function') {
							return React.cloneElement(ret, {
								children: React.cloneElement(child, { onLongPress: open }),
							})
						}
						return React.cloneElement(ret, {
							children: (
								<Pressable
									accessibilityRole="imagebutton"
									accessibilityLabel="View banner"
									onPress={open}
								>
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
