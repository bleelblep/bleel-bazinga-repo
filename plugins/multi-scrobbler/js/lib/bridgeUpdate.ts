import { bridgeStatus } from '../services/MusicBridgeService'
import { getSettings, setSettings } from './state'
import { showToast } from './toasts'

/**
 * Says when a newer Music Bridge is out (1.3.13).
 *
 * Discord can't look the app up itself (package visibility), so since 0.4.4 the bridge sends its
 * version with each message. An older bridge sends none and counts as older than 0.4.4.
 *
 * The newest version comes from music-bridge.json on the bazinga site: one small GET per Discord
 * launch, no account, no cookies. If it fails, LATEST below is used. Bump both on each release.
 */

export interface BridgeVersion {
	code: number
	name: string
}

/** The newest Music Bridge this plugin version knows about. */
const LATEST: BridgeVersion = { code: 9, name: '0.4.4' }

const HOST = 'https://bleelblep.github.io/bleel-bazinga-repo/'
const SOURCE = `${HOST}music-bridge.json`
const TIMEOUT_MS = 8_000
const MAX_CHARS = 2_000

let fetched: Promise<BridgeVersion> | undefined

async function download(): Promise<BridgeVersion | null> {
	const controller =
		typeof AbortController === 'function' ? new AbortController() : undefined
	const timer = setTimeout(() => controller?.abort(), TIMEOUT_MS)
	try {
		const response = await fetch(SOURCE, {
			signal: controller?.signal,
			credentials: 'omit',
			headers: { 'Cache-Control': 'no-cache' },
		})
		if (!response.ok) return null
		if (response.url && !response.url.startsWith(HOST)) return null
		const text = await response.text()
		if (text.length > MAX_CHARS) return null
		const data = JSON.parse(text)
		const code = Number(data?.versionCode)
		const name = typeof data?.versionName === 'string' ? data.versionName.slice(0, 32) : ''
		if (!Number.isInteger(code) || code <= 0 || !name) return null
		return { code, name }
	} catch {
		return null
	} finally {
		clearTimeout(timer)
	}
}

/** The newest Music Bridge: the site's, or LATEST if that's newer or the site can't be reached. */
export function latestBridge(): Promise<BridgeVersion> {
	fetched ??= download().then(v => (v && v.code > LATEST.code ? v : LATEST))
	return fetched
}

export interface BridgeUpdate {
	/** What's installed, or null for a bridge older than 0.4.4 (it doesn't say). */
	installed: string | null
	latest: BridgeVersion
}

/** An update, once the bridge has spoken and is older than the newest one; otherwise null. */
export async function bridgeUpdate(): Promise<BridgeUpdate | null> {
	const status = await bridgeStatus()
	if (!status?.listening || !(status.heardAt > 0)) return null
	const latest = await latestBridge()
	const code = Number(status.bridgeVersion) || 0
	if (code >= latest.code) return null
	return { installed: status.bridgeVersionName || null, latest }
}

let toldThisLaunch = false

/** One toast per new version, the first time the bridge is heard after it comes out. */
export async function toastBridgeUpdate() {
	if (toldThisLaunch) return
	toldThisLaunch = true
	const status = await bridgeStatus()
	if (!status?.listening || !(status.heardAt > 0)) {
		// Not heard yet: try again on a later check.
		toldThisLaunch = false
		return
	}
	const update = await bridgeUpdate()
	if (!update) return
	if ((getSettings().bridgeUpdateToldFor ?? 0) >= update.latest.code) return
	setSettings({ bridgeUpdateToldFor: update.latest.code })
	showToast(
		`Music Bridge ${update.latest.name} is out. Get it in Multi Scrobbler's settings`,
	)
}
