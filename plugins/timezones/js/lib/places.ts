/**
 * Any town or city, online: Open-Meteo's geocoding search (GeoNames data, free, no key), which
 * answers each place with its IANA timezone. Only the typed search text is sent.
 *
 * `GET https://geocoding-api.open-meteo.com/v1/search?name=<text>&count=<n>&language=en` →
 * `{ results?: [{ name, country, admin1, timezone, population, ... }] }`.
 */

import type { ZoneMatch } from './zones'

const API = 'https://geocoding-api.open-meteo.com/v1/search'
const TIMEOUT_MS = 8_000
const COUNT = 10

const cache = new Map<string, ZoneMatch[]>()

/** Places called [query], biggest first; [] for nothing found. Throws when offline. */
export async function searchPlaces(query: string): Promise<ZoneMatch[]> {
	const text = query.trim()
	const key = text.toLowerCase()
	const cached = cache.get(key)
	if (cached) return cached

	const controller = typeof AbortController === 'function' ? new AbortController() : undefined
	const abort = setTimeout(() => controller?.abort(), TIMEOUT_MS)
	try {
		const url = `${API}?name=${encodeURIComponent(text)}&count=${COUNT}&language=en&format=json`
		const res = await fetch(url, { signal: controller?.signal })
		if (!res.ok) throw new Error(`HTTP ${res.status}`)
		const body: any = await res.json()
		const out: ZoneMatch[] = []
		for (const place of Array.isArray(body?.results) ? body.results : []) {
			if (typeof place?.timezone !== 'string' || typeof place?.name !== 'string') continue
			const where = [place.admin1, place.country].filter((part: unknown) => typeof part === 'string' && part && part !== place.name)
			out.push({
				zone: place.timezone,
				title: place.name,
				detail: where.join(', ') || undefined,
				place: place.country && place.country !== place.name ? `${place.name}, ${place.country}` : place.name,
			})
		}
		cache.set(key, out)
		return out
	} finally {
		clearTimeout(abort)
	}
}
