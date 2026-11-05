/**
 * Discord's media viewer, and full-size image URLs.
 *
 * `openMediaModal` lives in modules/media_viewer/native/components/openMediaModal.tsx as a named
 * export, and Discord's callers read it off the module at call time, so both our own calls and the
 * `before` hook in patches/viewerOptions.ts go through the same function.
 */

import * as finders from '@valenced/discord/utils/modules/finders'
import { Image } from 'react-native'
import { reportError } from '../../../../shared/report'

export const TAG = '[PictureLinks]'
export const MEDIA_PATH = 'modules/media_viewer/native/components/openMediaModal.tsx'
export const FULL_SIZE = 4096

/** Marks viewers this plugin opened, so the options hook leaves them alone. */
export const OUR_SOURCE = 'picture_links'

export function mediaModule(): any {
	try {
		return (finders as any).lookupModuleWithImportedPath(MEDIA_PATH)?.[0]
	} catch {
		return undefined
	}
}

/**
 * The same image at `size`, as PNG unless it's animated. Discord's CDN serves every avatar and
 * banner hash at any power-of-two size up to 4096.
 */
export function fullSize(url: string, size = FULL_SIZE): string {
	const [base, query = ''] = url.split('?')
	const params = query
		.split('&')
		.filter(p => p && !p.startsWith('size='))
		.concat(`size=${size}`)
	const animated = /(^|&)animated=true/.test(query) || /\/a_[0-9a-f]+\./.test(base)
	const path = animated ? base : base.replace(/\.webp$/, '.png')
	return `${path}?${params.join('&')}`
}

function imageSize(uri: string): Promise<{ width: number; height: number }> {
	return new Promise(resolve => {
		try {
			Image.getSize(
				uri,
				(width: number, height: number) => resolve({ width, height }),
				() => resolve({ width: FULL_SIZE, height: FULL_SIZE }),
			)
		} catch {
			resolve({ width: FULL_SIZE, height: FULL_SIZE })
		}
	})
}

/**
 * Open one image the way Discord opens a profile avatar (as a sheet over the profile), but with
 * saving and sharing on.
 */
export async function openImage(uri: string, origin?: any) {
	const openMediaModal = mediaModule()?.openMediaModal
	if (typeof openMediaModal !== 'function') {
		reportError(`${TAG} openMediaModal not found`)
		return
	}
	const { width, height } = await imageSize(uri)
	openMediaModal({
		initialSources: [{ uri, sourceURI: uri, mediaIndex: 0, width, height, accessoryType: 'embed' }],
		initialIndex: 0,
		originViewOrOriginLayout: origin,
		analyticsSource: OUR_SOURCE,
		openAs: 'action-sheet',
		shareable: true,
		disableDownload: false,
	})
}
