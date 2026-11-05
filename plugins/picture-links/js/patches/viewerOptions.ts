/**
 * Discord's own avatar viewer, unlocked. Tapping a profile avatar already calls
 * `openUserProfileAvatarMediaViewer`, which opens the media viewer with
 * `analyticsSource: "user_profile_avatar"`, saving and sharing off, the overlay buttons hidden and
 * a reduced size. This `before` rewrites exactly those options on the way in and leaves every other
 * viewer (attachments, embeds) untouched. It returns the args array (coding rule 2).
 */

import { FULL_SIZE, fullSize, MEDIA_PATH, TAG } from '../lib/media'
import * as finders from '@valenced/discord/utils/modules/finders'
import { before } from '@valenced/patcher'
import { reportError } from '../../../../shared/report'

const DEBUG: boolean = false

const AVATAR_SOURCE = 'user_profile_avatar'

export default function patchViewerOptions(): () => void {
	let unpatch: (() => void) | undefined
	let unsubscribe: (() => void) | undefined

	const apply = (mod: any) => {
		try {
			if (typeof mod?.openMediaModal !== 'function') {
				reportError(`${TAG} openMediaModal not found on ${MEDIA_PATH}`)
				return
			}
			unpatch = before(mod, 'openMediaModal', (args: any[]) => {
				try {
					const options = args?.[0]
					if (options?.analyticsSource === AVATAR_SOURCE) {
						options.shareable = true
						options.disableDownload = false
						options.disableMediaOverlayButton = false
						options.disableMediaOverlayFooter = false
						options.initialSources = (options.initialSources ?? []).map((source: any) =>
							typeof source?.uri === 'string'
								? {
										...source,
										uri: fullSize(source.uri),
										sourceURI: fullSize(source.uri),
										width: FULL_SIZE,
										height: FULL_SIZE,
									}
								: source,
						)
					}
				} catch (error) {
					reportError(`${TAG} viewer options failed:`, error)
				}
				return args
			})
			if (DEBUG) console.log(`${TAG} hooked openMediaModal`)
		} catch (error) {
			reportError(`${TAG} failed to hook openMediaModal:`, error)
		}
	}

	try {
		unsubscribe = (finders as any).getModuleWithImportedPath(MEDIA_PATH, apply)
	} catch (error) {
		reportError(`${TAG} openMediaModal lookup failed:`, error)
	}

	return () => {
		unsubscribe?.()
		unpatch?.()
	}
}
