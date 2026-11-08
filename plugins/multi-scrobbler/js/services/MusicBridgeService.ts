import * as native from '@valenced/modules/native'
import { BaseService } from './BaseService'
import type { Track } from '../types'

/**
 * The phone's own music player, through the Music Bridge app (apps/music-bridge).
 *
 * The bridge pushes each change into this plugin's native half (src/main), which keeps the last
 * one. Reading it is a local call: no network and no account, so the check interval costs nothing
 * but a bridge hop. Upstream's MediaSessionService did this through kmmiio's library and their
 * companion app; Discord can't see a companion's package on Android 11+, so ours is pushed.
 */

const PLUGIN_ID = 'bleelblep.multi-scrobbler'

/** The bridge repeats itself every 30 s while music plays; longer silence means it was stopped. */
const STALE_MS = 95_000

interface BridgeSong {
	title: string
	artist: string | null
	album: string | null
	durationMs: number
	positionMs: number
	playing: boolean
	source: string | null
	sourceName: string | null
	heardAt: number
	now: number
}

export interface BridgeStatus {
	listening: boolean
	heardAt: number
	now: number
}

function call<T>(name: string): Promise<T | null> {
	try {
		const n = native as any
		if (typeof n?.callNativeMethod !== 'function') return Promise.resolve(null)
		return Promise.resolve(
			n.callNativeMethod(`${PLUGIN_ID}.bridge.${name}`, []),
		).catch(() => null)
	} catch {
		// iOS, or the native half didn't load.
		return Promise.resolve(null)
	}
}

export const bridgeStatus = () => call<BridgeStatus>('status')

/** Asks a running bridge to say what's playing (or that nothing is), so it shows as heard. */
export const requestBridge = () => call<boolean>('request')

/**
 * Always the newest Music Bridge APK: GitHub's `latest` release of bleel-bazinga-repo. Only Music
 * Bridge may use that repo's Releases (plugins ship through gh-pages), or this stops pointing at it.
 */
export const BRIDGE_DOWNLOAD_URL =
	'https://github.com/bleelblep/bleel-bazinga-repo/releases/latest/download/music-bridge.apk'

/** Opens the Music Bridge app. False if it isn't installed (or on iOS). */
export const openBridge = () =>
	call<boolean>('open').then(opened => opened === true)

/** A track that says nothing is playing, so the manager clears the status instead of retrying. */
function nothing(): Track {
	return {
		name: '',
		artist: '',
		album: '',
		albumArt: null,
		url: '',
		date: new Date().toISOString(),
		nowPlaying: false,
		loved: false,
		from: 0,
		to: null,
	}
}

export class MusicBridgeService extends BaseService {
	private asked = false

	getServiceName(): string {
		return 'Music Bridge'
	}

	async validateCredentials(): Promise<boolean> {
		const status = await bridgeStatus()
		if (!status?.listening) {
			throw new Error("The phone's music player only works on Android.")
		}
		// A bridge that's already running answers this straight away; otherwise the next song
		// change (or its 30 s repeat) arrives on its own.
		if (!this.asked) {
			this.asked = true
			void call('request')
		}
		return true
	}

	async fetchLatestScrobble(): Promise<Track> {
		const song = await call<BridgeSong>('current')
		if (!song?.title) return nothing()

		const age = song.now - song.heardAt
		if (age > STALE_MS) return nothing()

		const nowSec = Math.floor(Date.now() / 1000)
		let duration: number | undefined
		let elapsed = 0
		if (song.durationMs > 0) {
			duration = Math.floor(song.durationMs / 1000)
			// The position was true when it was sent; move it on by the time since.
			const position = song.positionMs + (song.playing ? Math.max(0, age) : 0)
			elapsed = Math.min(Math.floor(position / 1000), duration)
		}

		return {
			name: song.title,
			artist: song.artist || 'Unknown',
			album: song.album || '',
			// Media sessions only carry pixels, which Discord can't show; the manager looks the
			// cover up by artist and album instead (lib/artwork.ts).
			albumArt: null,
			// Stable per song, so the manager only updates the status when the song changes.
			url: `bridge://${song.source ?? ''}/${encodeURIComponent(song.artist ?? '')}/${encodeURIComponent(song.title)}`,
			date: new Date().toISOString(),
			nowPlaying: song.playing,
			loved: false,
			from: nowSec - elapsed,
			to: duration ? nowSec - elapsed + duration : null,
			duration,
		}
	}
}
