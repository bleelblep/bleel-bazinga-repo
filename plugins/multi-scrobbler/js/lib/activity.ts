import { Dispatcher } from '@valenced/discord/common/flux'
import { reportError } from '../../../../shared/report'
import Constants from '../constants'
import { stop } from './manager'
import { getAssetManager } from './modules'
import { shareTrack } from './share'
import { pluginState } from './state'
import type { Activity } from '../types'

/**
 * The fewest milliseconds between two status changes. Each change becomes a presence update on
 * Discord's own connection, so whatever the source or settings do (skipping songs, pausing and
 * playing, toggling settings), the plugin never changes the status more than four times a
 * minute. Changes inside the gap are merged: only the newest is sent when it ends.
 */
const MIN_GAP_MS = 15_000

let lastSentAt = 0
let pendingTimer: ReturnType<typeof setTimeout> | undefined

function dispatch(activity: Activity | null) {
	lastSentAt = Date.now()
	Dispatcher.dispatch({
		type: 'LOCAL_ACTIVITY_UPDATE',
		activity: activity,
		pid: 2312,
		socketId: 'Multi-Scrobbler@Valenced',
	})
}

/** Clears the user's activity. [now] skips the gap; only the plugin stopping uses it. */
export function clearActivity(now = false) {
	shareTrack(null)
	return sendRequest(null, now)
}

/** Sends the activity details to Discord, at most once per MIN_GAP_MS (see above). */
export function sendRequest(activity: Activity | null, now = false) {
	if (pluginState.pluginStopped) {
		stop()
		activity = null
		now = true
	}

	pluginState.lastActivity = activity

	if (pendingTimer) {
		clearTimeout(pendingTimer)
		pendingTimer = undefined
	}
	const wait = lastSentAt + MIN_GAP_MS - Date.now()
	if (now || wait <= 0) {
		dispatch(activity)
		return
	}
	pendingTimer = setTimeout(() => {
		pendingTimer = undefined
		dispatch(
			pluginState.pluginStopped ? null : (pluginState.lastActivity ?? null),
		)
	}, wait)
}

/** Resolved asset ids by image URL, so a song that comes round again doesn't look it up twice. */
const ASSET_CACHE_LIMIT = 128
const assetCache = new Map<string, string>()
/** Links Discord refused this session. */
const refused = new Set<string>()

function cacheAssets(urls: string[], ids: string[]) {
	urls.forEach((url, i) => {
		const id = ids[i]
		if (!id) return
		if (assetCache.size >= ASSET_CACHE_LIMIT) assetCache.clear()
		assetCache.set(url, id)
	})
}

/** A rejected lookup's status and Discord error code, never its body (account-safety AS-08). */
function describe(error: any): string {
	const status = typeof error?.status === 'number' ? error.status : undefined
	const code =
		typeof error?.body?.code === 'number' ? error.body.code : undefined
	if (status === undefined)
		return error instanceof Error ? error.message : 'unknown error'
	return code ? `HTTP ${status}, code ${code}` : `HTTP ${status}`
}

/**
 * Resolves cover links to Discord image ids (`mp:external/…`) through Discord's own
 * `fetchAssetIds` (utils/ApplicationAssetUtils.tsx, found or loaded by lib/modules.ts).
 *
 * Only Discord's helper is used. Up to 1.3.2 a direct external-assets request backed it up; that
 * request went out without Discord's login and was refused (401) every time, and making it work
 * would mean adding the login ourselves, which account safety rules out (AS-01/AS-02). Without
 * the helper the status just has no cover. A refused lookup is not retried (AS-05).
 */
export async function fetchAsset(
	asset: string[],
	appId: string = Constants.APPLICATION_ID,
): Promise<string[]> {
	const remoteUrls = (asset ?? []).filter(url => url?.startsWith('https://'))
	if (remoteUrls.length === 0) return []

	const cached = remoteUrls.map(url => assetCache.get(url))
	if (cached.every(Boolean)) return cached as string[]
	// Discord already said no to one of these this session: don't ask again (AS-05).
	if (remoteUrls.some(url => refused.has(url))) return []

	const assetManager = getAssetManager()
	if (typeof assetManager?.fetchAssetIds !== 'function') {
		reportError(
			'Album art',
			new Error("Discord's image helper isn't available"),
		)
		return []
	}
	try {
		const result = await assetManager.fetchAssetIds(appId, remoteUrls)
		if (Array.isArray(result) && result[0]) {
			cacheAssets(remoteUrls, result)
			return result
		}
		reportError('Album art', new Error("Discord's image helper found no image"))
	} catch (error) {
		for (const url of remoteUrls) {
			if (refused.size >= ASSET_CACHE_LIMIT) refused.clear()
			refused.add(url)
		}
		reportError(`Album art: Discord refused the cover (${describe(error)})`)
	}
	return []
}
