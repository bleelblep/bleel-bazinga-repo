import { reportError } from '../../../../shared/report'

/**
 * PronounDB (pronoundb.org), the crowdsourced fallback for people whose Discord profile has no
 * pronouns. https://pronoundb.org/wiki/api-docs
 *
 * - v2 lookup: `GET /api/v2/lookup?platform=discord&ids=<id,id,…>` — up to 50 ids per request,
 *   no key. The response maps each known id to `{ sets: { en: ["she", "it"], … }, decoration }`;
 *   ids the database doesn't know are simply absent. **v1 returns 410 Gone — never call it.**
 * - The docs ask for a descriptive User-Agent (the `X-PronounDB-Source` header is the accepted
 *   substitute), and to bulk-fetch rather than hammer per user.
 * - The server caches 5 minutes on a full hit; this client caches an hour, negatives included.
 *
 * Ids are queued and flushed in one batched request after a short debounce, the way the reference
 * plugins do. `URLSearchParams` is not reliably present on Hermes, so the query string is built
 * by hand (same note as translate's providers).
 */

const TAG = '[Pronouns]'
const API = 'https://pronoundb.org/api/v2/lookup?platform=discord&ids='
const BATCH = 50
const DEBOUNCE_MS = 150
const TIMEOUT_MS = 10_000
const TTL_MS = 60 * 60 * 1000
/** Entries kept per map; the oldest go first. A long session in busy servers would otherwise grow without bound. */
const MAX_ENTRIES = 2_000

interface Entry {
	/** Joined `sets.en`, or undefined when PronounDB has nothing for this id. */
	text?: string
	at: number
}

interface LookupResponse {
	[id: string]: { sets?: Record<string, string[]> } | undefined
}

const cache = new Map<string, Entry>()
const pending = new Set<string>()
/** Notified with every id whose pronouns became known (or known-absent) after a flush. */
const listeners = new Set<(ids: string[]) => void>()
/** Every request in flight, so `stop()` can abort them. */
const inFlight = new Set<AbortController>()

let timer: ReturnType<typeof setTimeout> | undefined
let flushing = false
/** Bumped by `stop()`, so a flush that was mid-batch doesn't start another. */
let generation = 0
/** Ids whose last batch failed, and when they may be asked again. Failures are not negatives. */
const retryAt = new Map<string, number>()
const RETRY_MS = 30_000

/** Keeps [map] at MAX_ENTRIES by dropping its oldest insertions. */
function cap(map: Map<string, unknown>) {
	while (map.size > MAX_ENTRIES) {
		const oldest = map.keys().next().value
		if (oldest === undefined) return
		map.delete(oldest)
	}
}

/** The cached text, or undefined (both "absent" and "not fetched yet"). */
export function cached(userId: string): string | undefined {
	const entry = cache.get(userId)
	if (!entry) return undefined
	if (Date.now() - entry.at > TTL_MS) {
		cache.delete(userId)
		return undefined
	}
	return entry.text
}

/** Queues [userId] for the next bulk request. Cheap; duplicates collapse into the set. */
export function request(userId: string) {
	if (cached(userId) !== undefined || cache.has(userId) || pending.has(userId))
		return
	if (Date.now() < (retryAt.get(userId) ?? 0)) return
	pending.add(userId)
	// During a flush the id waits in `pending`; the flush schedules the next one when it ends.
	if (flushing) return
	if (timer !== undefined) clearTimeout(timer)
	timer = setTimeout(flush, DEBOUNCE_MS)
}

/**
 * Forces a fresh lookup for [userId], ignoring the cached answer (including a cached negative) and
 * any pending retry backoff. For the settings page's "Look up again" row.
 */
export function refetch(userId: string) {
	cache.delete(userId)
	retryAt.delete(userId)
	pending.add(userId)
	if (flushing) return
	if (timer !== undefined) clearTimeout(timer)
	timer = setTimeout(flush, DEBOUNCE_MS)
}

/** Every id a batch resolves, for redrawing the rows waiting on it. */
export function onResolved(listener: (ids: string[]) => void): () => void {
	listeners.add(listener)
	return () => listeners.delete(listener)
}

function isAbort(error: unknown): boolean {
	return error instanceof Error && error.name === 'AbortError'
}

async function fetchBatch(ids: string[]): Promise<LookupResponse | undefined> {
	const controller = new AbortController()
	inFlight.add(controller)
	const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
	try {
		const response = await fetch(`${API}${ids.join(',')}`, {
			signal: controller.signal,
			headers: {
				'User-Agent': 'bleelblep/pronouns (Valenced)',
				'X-PronounDB-Source': 'bleelblep/pronouns (Valenced)',
			},
		})
		if (!response.ok) return undefined
		return (await response.json()) as LookupResponse
	} catch (error) {
		// Our own abort (timeout or stop) is not a failure worth reporting.
		if (!isAbort(error)) reportError(`${TAG} PronounDB request failed:`, error)
		return undefined
	} finally {
		clearTimeout(timeout)
		inFlight.delete(controller)
	}
}

async function flush() {
	const started = generation
	timer = undefined
	flushing = true
	try {
		const ids = [...pending]
		pending.clear()
		const resolved: string[] = []
		for (let i = 0; i < ids.length; i += BATCH) {
			const chunk = ids.slice(i, i + BATCH)
			const data = await fetchBatch(chunk)
			if (started !== generation) return
			if (!data) {
				// Network error, timeout or non-2xx: try again later rather than caching "none".
				for (const id of chunk) retryAt.set(id, Date.now() + RETRY_MS)
				cap(retryAt)
				continue
			}
			for (const id of chunk) {
				retryAt.delete(id)
				const sets = data[id]?.sets?.en
				cache.set(id, {
					text: Array.isArray(sets) && sets.length ? sets.join('/') : undefined,
					at: Date.now(),
				})
				resolved.push(id)
			}
			cap(cache)
		}
		if (resolved.length) for (const listener of listeners) listener(resolved)
	} finally {
		flushing = false
		if (started === generation && pending.size && timer === undefined)
			timer = setTimeout(flush, DEBOUNCE_MS)
	}
}

export function stop() {
	generation++
	if (timer !== undefined) clearTimeout(timer)
	timer = undefined
	pending.clear()
	retryAt.clear()
	listeners.clear()
	for (const controller of inFlight) controller.abort()
	inFlight.clear()
}
