/**
 * Resolves album artwork as a public https URL for Discord rich presence (upstream's iTunes lookup).
 *
 * Local media sessions only expose raw bitmap bytes, which Discord cannot render, so the cover is
 * looked up by artist and album instead. Results, misses included, are cached per search.
 *
 * Players often put every artist in one field ("Charli XCX • Logic Pro X", "A, B & C", "A feat. B"),
 * which iTunes can't match, so the searches use the first artist and the title without "(feat. …)".
 */

import Constants from '../constants'
import { getSettings } from './state'

const CACHE_LIMIT = 128
/** Cover link per search; '' is a remembered miss. */
const artworkCache = new Map<string, string>()

/** The first artist out of a combined artist field. */
export function firstArtist(artist: string): string {
	const first = artist
		.split(
			/\s*(?:•|·|;|\/|,|&|\bfeat\.?|\bft\.?|\bfeaturing\b|\bx\b|\bwith\b)\s*/i,
		)[0]
		?.trim()
	return first || artist.trim()
}

/** A title without "(feat. …)", "[Remastered]" and the like. */
function plainTitle(title: string): string {
	return title
		.replace(
			/\s*[([][^)\]]*(?:feat|ft\.|with|remaster|version|edit|mix)[^)\]]*[)\]]/gi,
			'',
		)
		.trim()
}

/** Lower case, accents and punctuation gone, spaces squeezed: "Beyoncé" and "beyonce" match. */
function norm(text: string): string {
	let plain = text
	try {
		plain = plain.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
	} catch {
		/* no normalize on this engine: accents stay, matching is a little stricter */
	}
	// Letters outside a-z (Japanese, Cyrillic, accented) are kept; only punctuation goes.
	return plain
		.toLowerCase()
		.replace(/[^a-z0-9\u00c0-\uffff]+/g, ' ')
		.trim()
}

/** What the search was for, to judge each iTunes result against. */
interface Want {
	/** The first artist ("Simon" out of "Simon & Garfunkel"). */
	lead: string
	/** The whole artist field, so "Simon & Garfunkel" still matches its own results. */
	artist: string
	album: string
	song: string
}

/**
 * Whether a result is by the artist we want. Either name may hold the other: iTunes says
 * "Charli xcx" where the player said "Charli XCX • Troye Sivan", or "Simon & Garfunkel" where we
 * cut the lead down to "Simon".
 */
function byArtist(result: any, want: Want): boolean {
	const theirs = norm(String(result?.artistName ?? ''))
	if (!theirs) return false
	return [want.lead, want.artist].map(norm).some(ours => {
		if (!ours) return false
		if (theirs === ours) return true
		// Part of a name only from three letters up, or "MØ" would match half of iTunes.
		const [short, long] =
			ours.length < theirs.length ? [ours, theirs] : [theirs, ours]
		return short.length >= 3 && ` ${long} `.includes(` ${short} `)
	})
}

/** Higher is a better match: right album and right song beat just the right artist. */
function score(result: any, want: Want): number {
	let points = 0
	const album = norm(want.album)
	const song = norm(plainTitle(want.song))
	if (album && norm(String(result?.collectionName ?? '')).startsWith(album))
		points += 2
	if (song && norm(plainTitle(String(result?.trackName ?? ''))) === song)
		points += 1
	return points
}

async function queryItunes(term: string, want: Want): Promise<string | null> {
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), 5000)
	try {
		const res = await fetch(
			`https://itunes.apple.com/search?media=music&entity=song&limit=10&term=${encodeURIComponent(term)}`,
			{ signal: controller.signal },
		)
		if (!res.ok) return null
		const json: any = await res.json()
		const results: any[] = (json?.results ?? []).filter(
			(r: any) => typeof r?.artworkUrl100 === 'string' && r.artworkUrl100,
		)
		// Only a result by the artist we asked for: iTunes ranks loosely, and its first result for
		// a song it doesn't know is often someone else's, which put strangers' covers on the status.
		// No cover beats a wrong one. With no artist to go on, the album and song must both match.
		const candidates =
			want.lead || want.artist
				? results.filter(r => byArtist(r, want))
				: results.filter(r => score(r, want) === 3)
		const pick = candidates
			.map((r, i) => ({ r, points: score(r, want), i }))
			.sort((a, b) => b.points - a.points || a.i - b.i)[0]?.r
		// Upgrade the 100x100 thumbnail to full resolution.
		return pick
			? String(pick.artworkUrl100).replace('100x100', '600x600')
			: null
	} catch {
		return null
	} finally {
		clearTimeout(timeout)
	}
}

/** Last.fm's biggest image in a `image: [{ '#text', size }]` list, skipping its grey placeholder. */
function lastFmImage(images: unknown): string | null {
	if (!Array.isArray(images)) return null
	for (const size of ['mega', 'extralarge', 'large', 'medium']) {
		const url = images.find((i: any) => i?.size === size)?.['#text']
		if (
			typeof url === 'string' &&
			url.startsWith('https://') &&
			!Constants.DEFAULT_COVER_HASHES.some(hash => url.includes(hash))
		)
			return url
	}
	return null
}

/**
 * The cover from Last.fm, when a Last.fm API key is saved (Last.fm settings page). Asks for the
 * song first (its album's cover), then the album. Last.fm knows releases iTunes doesn't.
 */
async function queryLastFm(
	artist: string,
	title: string,
	album: string,
): Promise<string | null> {
	const apiKey = getSettings().apiKey
	if (!apiKey || !artist) return null
	const asks: Record<string, string>[] = []
	if (title) asks.push({ method: 'track.getInfo', artist, track: title })
	if (album) asks.push({ method: 'album.getInfo', artist, album })
	for (const ask of asks) {
		const controller = new AbortController()
		const timeout = setTimeout(() => controller.abort(), 5000)
		try {
			const params = new URLSearchParams({
				...ask,
				api_key: apiKey,
				autocorrect: '1',
				format: 'json',
			})
			const res = await fetch(
				`${Constants.SERVICES.lastfm.baseUrl}/?${params}`,
				{
					signal: controller.signal,
				},
			)
			if (!res.ok) continue
			const json: any = await res.json()
			const url = lastFmImage(json?.track?.album?.image ?? json?.album?.image)
			if (url) return url
		} catch {
			/* next ask, then iTunes */
		} finally {
			clearTimeout(timeout)
		}
	}
	return null
}

/** Best-effort cover-art URL, or null when nothing sensible was found. */
export async function findAlbumArtUrl(
	artist: string,
	album: string,
	title: string,
): Promise<string | null> {
	const fullArtist = artist && artist.toLowerCase() !== 'unknown' ? artist : ''
	const lead = fullArtist ? firstArtist(fullArtist) : ''
	const song = plainTitle(title)

	// Last.fm first (when there's a key), then iTunes.
	const fmKey = `lastfm:${lead}|${song}|${album}`.toLowerCase()
	const fmCached = artworkCache.get(fmKey)
	if (fmCached) return fmCached
	if (fmCached === undefined) {
		const url = await queryLastFm(lead, song, album)
		if (artworkCache.size >= CACHE_LIMIT) artworkCache.clear()
		// A miss is only remembered when a key was there to ask with.
		if (url || getSettings().apiKey) artworkCache.set(fmKey, url ?? '')
		if (url) return url
	}
	const terms = [
		lead && album ? `${lead} ${album}` : '',
		lead && song ? `${lead} ${song}` : '',
		album && song ? `${album} ${song}` : '',
	].filter((t, i, all) => t && all.indexOf(t) === i)

	for (const term of terms) {
		// The whole search, not just the term: the same term now picks differently per artist,
		// album and song.
		const key = `itunes:${term}|${fullArtist}|${album}|${song}`.toLowerCase()
		const cached = artworkCache.get(key)
		if (cached !== undefined) {
			if (cached) return cached
			continue
		}
		const url = await queryItunes(term, {
			lead,
			artist: fullArtist,
			album,
			song,
		})
		if (artworkCache.size >= CACHE_LIMIT) artworkCache.clear()
		artworkCache.set(key, url ?? '')
		if (url) return url
	}
	return null
}
