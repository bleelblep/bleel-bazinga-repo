/**
 * Equicord's timezone list, read only: `GET https://timezone.creations.works/list` answers
 * `{ "<id>": { "timezone": "Europe/London", ... } }` for everyone who set theirs from Equicord.
 * Equicord downloads the whole list the same way, with no sign-in; setting your own there needs
 * a Discord sign-in, which this plugin doesn't do.
 *
 * One download, kept in memory and fetched again after an hour, the first time a zone is asked
 * for after that. A failed download pauses (30 s, doubling to 10 min) and is reported once per
 * outage, like the shared list (lib/shared.ts). The answer is capped in entries, so a huge or
 * broken list can't fill memory.
 */

import { cleanZone } from './zones'
import { reportError } from '../../../../shared/report'

const TAG = '[Timezones]'
const API = 'https://timezone.creations.works/list'
const TTL_MS = 60 * 60_000
const TIMEOUT_MS = 15_000
const BACKOFF_MIN_MS = 30_000
const BACKOFF_MAX_MS = 10 * 60_000
const MAX_ENTRIES = 200_000

let zones = new Map<string, string>()
let loadedAt = 0
let loading = false
let pausedUntil = 0
let backoff = 0
let stopped = true
const listeners = new Set<() => void>()

function notify() {
	for (const fn of listeners) {
		try {
			fn()
		} catch {
			/* keep going */
		}
	}
}

/**
 * [id]'s zone from Equicord's list: a string, null when the list is loaded and they aren't on it,
 * undefined while it isn't loaded yet (which starts a download).
 */
export function equicordZone(id: string): string | null | undefined {
	if (stopped) return undefined
	if (Date.now() - loadedAt > TTL_MS) load()
	if (!loadedAt) return undefined
	return zones.get(id) ?? null
}

async function load() {
	if (loading || stopped || Date.now() < pausedUntil) return
	loading = true
	const controller = typeof AbortController === 'function' ? new AbortController() : undefined
	const abort = setTimeout(() => controller?.abort(), TIMEOUT_MS)
	try {
		const res = await fetch(API, {
			headers: { Accept: 'application/json' },
			credentials: 'omit',
			signal: controller?.signal,
		})
		if (!res.ok) throw new Error(`HTTP ${res.status}`)
		const body: any = await res.json()
		if (!body || typeof body !== 'object') throw new Error('not a list')
		const next = new Map<string, string>()
		for (const id in body) {
			if (next.size >= MAX_ENTRIES) break
			if (!/^\d{15,21}$/.test(id)) continue
			const zone = cleanZone(body[id]?.timezone)
			if (zone) next.set(id, zone)
		}
		if (stopped) return
		zones = next
		loadedAt = Date.now()
		backoff = 0
		pausedUntil = 0
		notify()
	} catch (error) {
		if (!backoff) reportError(`${TAG} Equicord timezone list failed:`, error)
		backoff = backoff ? Math.min(backoff * 2, BACKOFF_MAX_MS) : BACKOFF_MIN_MS
		pausedUntil = Date.now() + backoff
	} finally {
		clearTimeout(abort)
		loading = false
	}
}

export function onEquicord(fn: () => void): () => void {
	listeners.add(fn)
	return () => listeners.delete(fn)
}

export function startEquicord() {
	stopped = false
	backoff = 0
	pausedUntil = 0
}

export function stopEquicord() {
	stopped = true
	zones = new Map()
	loadedAt = 0
	listeners.clear()
}
