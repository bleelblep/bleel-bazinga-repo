/**
 * Discord's media viewer, and full-size image URLs.
 *
 * `openMediaModal` lives in modules/media_viewer/native/components/openMediaModal.tsx as a named
 * export, and Discord's callers read it off the module at call time, so both our own calls and the
 * `before` hook in patches/viewerOptions.ts go through the same function.
 */

import * as finders from '@valenced/discord/utils/modules/finders'
import {
	getModuleDependencies,
	isModuleInitialized,
} from '@valenced/modules/metro'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { Image } from 'react-native'
import { reportError } from '../../../../shared/report'
import { showToast } from '../../../../shared/toast'
import { settings } from './settings'

export const TAG = '[PictureLinks]'
export const MEDIA_PATH =
	'modules/media_viewer/native/components/openMediaModal.tsx'
export const FULL_SIZE = 4096
/**
 * Animated pictures stop here. Every frame of a 4096px GIF decodes to ~64 MB, so an animated
 * server icon at full size froze the app for seconds and made the viewer's close animation crawl.
 * 1024 is still larger than anything Discord shows. The "Full size animated pictures" setting
 * lifts the cap.
 */
const ANIMATED_CAP = 1024

/** The size animated pictures open at: the cap, or FULL_SIZE when the setting is on. */
export function animatedSize(): number {
	return settings().fullSizeAnimated ? FULL_SIZE : ANIMATED_CAP
}
const TOAST_DELAY = 300

/** Marks viewers this plugin opened, so the options hook leaves them alone. */
export const OUR_SOURCE = 'picture_links'

function lookupMedia(): any {
	try {
		const mod = (finders as any).lookupModuleWithImportedPath(MEDIA_PATH)?.[0]
		if (typeof mod?.openMediaModal === 'function') return mod
	} catch {}
	return undefined
}

function loadedId(...props: string[]): number | undefined {
	try {
		return lookupModule(withProps<any>(...(props as [string])), {
			returnNamespace: true,
		})?.[1] as number | undefined
	} catch {
		return undefined
	}
}

/** At most this many unloaded modules get loaded looking for the viewer. */
const MAX_TRIES = 4
/** Module ids to scan for unloaded modules (352.6 has about 20,000). */
const MAX_ID = 60000

/**
 * Discord loads the viewer only the first time it opens a picture, and the finders can only see
 * loaded code (nothing finds an unloaded module by its exports). So after a fresh start, a server
 * icon tapped before any picture had no viewer to open.
 *
 * Unloaded modules still have their dependency lists, so this picks the viewer out by what it
 * imports (checked live with devtools on 352.6, 2026-11-05):
 * - it needs both the action-sheet module (`showActionSheet`) and `getWindowDimensions`, which
 *   narrows about 20,000 modules to ~18;
 * - Discord's chat code (`MessagesHandlers`, loaded at startup) imports it, which leaves 2;
 * - Metro numbers a file's own helpers right after it, so one that imports `id + 1` goes first.
 * It then loads them in that order until one has `openMediaModal` (on 352.6, the first). Only on a
 * tap, and only while the viewer isn't loaded. An earlier version started from a forum module
 * instead, which turned out not to be loaded at every startup.
 */
function loadMedia(): any {
	try {
		const require = (globalThis as any).__r
		if (typeof require !== 'function') return undefined
		const sheet = loadedId('showActionSheet', 'ACTION_SHEET_HEIGHT_HALF')
		const dims = loadedId('getWindowDimensions')
		if (sheet == null || dims == null) return undefined
		const chatId = loadedId('MessagesHandlers')
		const chatDeps: unknown[] =
			chatId == null ? [] : (getModuleDependencies(chatId) ?? [])

		const ranked: Array<[id: number, rank: number]> = []
		for (let id = 0; id < MAX_ID; id++) {
			let deps: unknown[] | undefined
			try {
				if (isModuleInitialized(id)) continue
				deps = getModuleDependencies(id)
			} catch {
				continue
			}
			if (!Array.isArray(deps) || !deps.includes(sheet) || !deps.includes(dims))
				continue
			const rank =
				(chatDeps.includes(id) ? 2 : 0) + (deps.includes(id + 1) ? 1 : 0)
			ranked.push([id, rank])
		}
		ranked.sort((a, b) => b[1] - a[1] || a[0] - b[0])

		for (const [id] of ranked.slice(0, MAX_TRIES)) {
			try {
				const exports = require(id)
				if (typeof exports?.openMediaModal === 'function') return exports
			} catch {}
		}
	} catch (error) {
		reportError(`${TAG} loading the viewer failed:`, error)
	}
	return undefined
}

export function mediaModule(): any {
	return lookupMedia() ?? loadMedia()
}

/** Whether a CDN URL points at an animated picture (an `a_` hash or `animated=true`). */
export function isAnimated(url: string): boolean {
	const [base, query = ''] = url.split('?')
	return /(^|&)animated=true/.test(query) || /\/a_[0-9a-f]+\./.test(base)
}

/**
 * The same image at `size` (at most animatedSize() when it's animated), as PNG unless it's
 * animated. Discord's CDN serves every avatar and banner hash at any power-of-two size up to 4096.
 */
export function fullSize(url: string, size = FULL_SIZE): string {
	const [base, query = ''] = url.split('?')
	const animated = isAnimated(url)
	const params = query
		.split('&')
		.filter(p => p && !p.startsWith('size='))
		.concat(`size=${animated ? Math.min(size, animatedSize()) : size}`)
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
 * A full-size Discord CDN URL for an image hash (`kind` is `icons`, `banners` or `splashes`).
 * Animated hashes start with `a_` and come as GIF, at animatedSize().
 */
export function cdnURL(
	kind: string,
	id: string | undefined,
	hash: string | null | undefined,
): string | undefined {
	if (!id || typeof hash !== 'string' || !hash) return undefined
	const animated = hash.startsWith('a_')
	const ext = animated ? 'gif' : 'png'
	const size = animated ? animatedSize() : FULL_SIZE
	return `https://cdn.discordapp.com/${kind}/${id}/${hash}.${ext}?size=${size}`
}

/**
 * Open images the way Discord opens a profile avatar (as a sheet over the profile), but with
 * saving and sharing on. More than one URL opens a gallery you swipe through.
 */
export async function openImage(uris: string | string[], origin?: any) {
	const openMediaModal = mediaModule()?.openMediaModal
	if (typeof openMediaModal !== 'function') {
		reportError(`${TAG} openMediaModal not found`)
		return
	}
	const list = (Array.isArray(uris) ? uris : [uris]).filter(
		(u, i, all) => u && all.indexOf(u) === i,
	)
	if (!list.length) return
	// Measuring downloads the full-size picture first, which can take a few seconds. Say so when
	// it isn't instant, without flashing a toast on a cached picture.
	const toast = setTimeout(
		() => showToast('Loading picture…', 'PictureLinksLoading'),
		TOAST_DELAY,
	)
	let sizes: Array<{ width: number; height: number }>
	try {
		sizes = await Promise.all(list.map(imageSize))
	} finally {
		clearTimeout(toast)
	}
	openMediaModal({
		initialSources: list.map((uri, mediaIndex) => ({
			uri,
			sourceURI: uri,
			mediaIndex,
			width: sizes[mediaIndex].width,
			height: sizes[mediaIndex].height,
			accessoryType: 'embed',
		})),
		initialIndex: 0,
		originViewOrOriginLayout: origin,
		analyticsSource: OUR_SOURCE,
		openAs: 'action-sheet',
		shareable: true,
		disableDownload: false,
	})
}
