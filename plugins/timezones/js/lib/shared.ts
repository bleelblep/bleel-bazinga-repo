/**
 * The shared timezone list the Aliucord original reads: `POST /api/user/bulk` with a JSON array of
 * user ids, answering `{ "<id>": { "timezone": "Europe/London", ... } | null }`. People add
 * themselves there from other clients; this only reads.
 *
 * Ids queue up and go out in one request after a short pause, at most 100 per request. Answers,
 * including "not listed", are kept in memory for an hour; failures aren't, so they retry later.
 */

import { cleanZone } from './zones'
import { reportError } from '../../../../shared/report'

const TAG = '[Timezones]'
const API = 'https://timezonedb.catvibers.me/api/user/bulk'
const BATCH = 100
const DEBOUNCE_MS = 300
const TTL_MS = 60 * 60_000
const TIMEOUT_MS = 10_000

interface Entry {
	zone?: string
	at: number
}

const cache = new Map<string, Entry>()
const queue = new Set<string>()
const inFlight = new Set<string>()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setTimeout> | undefined
let stopped = false

/** The shared zone for [id]: a string, null when they aren't listed, undefined when not known yet. */
export function sharedZone(id: string): string | null | undefined {
	const entry = cache.get(id)
	if (!entry) return undefined
	if (Date.now() - entry.at > TTL_MS) return undefined
	return entry.zone ?? null
}

/** Asks about [id] unless the answer is fresh or a request is already on its way. */
export function want(id: string) {
	if (stopped || !/^\d{15,21}$/.test(id)) return
	if (sharedZone(id) !== undefined || inFlight.has(id) || queue.has(id)) return
	queue.add(id)
	if (timer === undefined) timer = setTimeout(flush, DEBOUNCE_MS)
}

/** Drops [id]'s answer and asks again. */
export function refetch(id: string) {
	cache.delete(id)
	want(id)
}

export function onShared(fn: () => void): () => void {
	listeners.add(fn)
	return () => listeners.delete(fn)
}

function notify() {
	for (const fn of listeners) {
		try {
			fn()
		} catch {
			/* keep going */
		}
	}
}

async function flush() {
	timer = undefined
	if (stopped || !queue.size) return
	const ids = [...queue].slice(0, BATCH)
	for (const id of ids) {
		queue.delete(id)
		inFlight.add(id)
	}
	if (queue.size) timer = setTimeout(flush, DEBOUNCE_MS)

	const controller = typeof AbortController === 'function' ? new AbortController() : undefined
	const abort = setTimeout(() => controller?.abort(), TIMEOUT_MS)
	try {
		const res = await fetch(API, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(ids),
			signal: controller?.signal,
		})
		if (!res.ok) throw new Error(`HTTP ${res.status}`)
		const body: any = await res.json()
		const now = Date.now()
		for (const id of ids) {
			const value = body?.[id]
			cache.set(id, { zone: cleanZone(value?.timezone), at: now })
		}
		if (!stopped) notify()
	} catch (error) {
		// Offline or the service is down: nothing cached, the next sighting asks again.
		reportError(`${TAG} shared timezone lookup failed:`, error)
	} finally {
		clearTimeout(abort)
		for (const id of ids) inFlight.delete(id)
	}
}

export function startShared() {
	stopped = false
}

export function stopShared() {
	stopped = true
	if (timer !== undefined) clearTimeout(timer)
	timer = undefined
	queue.clear()
	listeners.clear()
}
