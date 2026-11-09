import Constants from '../constants'
import { DEFAULTS } from '../defaults'
import { serviceFactory } from '../services/ServiceFactory'
import {
	clearActivity,
	fetchAsset,
	flushPending,
	sendRequest,
} from './activity'
import { findAlbumArtUrl } from './artwork'
import {
	debugInfo,
	incrementApiCall,
	incrementConnectionAttempt,
	recordServiceError,
	recordSuccessfulUpdate,
	setDebugInfo,
} from './debug'
import { getSelfPresenceStore } from './modules'
import { shareTrack } from './share'
import { getSettings, pluginState } from './state'
import { formatDuration, getCurrentTimestamp } from './time'
import type { Activity, ServiceType, Track } from '../types'

/**
 * How far (seconds) a live track's start may move before the status is re-sent. Start times are
 * whole seconds and the bridge's position is a little late, so a second or two is just rounding.
 */
const LIVE_DRIFT_S = 3

/** How many more checks may retry a song's album art after the first try. */
const ARTWORK_RETRIES = 3

enum ActivityType {
	PLAYING = 0,
	STREAMING = 1,
	LISTENING = 2,
	COMPETING = 5,
}

class PluginManager {
	private static instance: PluginManager
	private updateTimer?: any
	private reconnectTimer?: any
	private consecutiveFailures = 0
	private isReconnecting = false
	private _currentActivity?: Activity
	private _lastUpdateTime = 0
	/** Extra art lookups made for the current song; ARTWORK_RETRIES means done. */
	private _artTries = ARTWORK_RETRIES
	/**
	 * A check is running. A cover lookup can take many seconds, longer than the check interval,
	 * and two checks at once let a slow one for the last song finish after the new song was shown
	 * and put the old cover (and song) back. A check that finds one running just skips.
	 */
	private _checking = false
	/** A check was asked for while one ran (Music Bridge woke us): run one more after it. */
	private _again = false
	/** The live track start (seconds) on the status now; see Track.live. */
	private _sentFrom?: number
	/** The cover link found for the current song, for Now Playing. */
	private _artUrl?: string
	/** The Discord asset id of the current song's cover, once resolved. */
	private _artId?: string
	/** settingsKey() when the status was last sent. */
	private _sentKey?: string
	/** The song on the status now, for the Status details preview. */
	private _shownTrack?: Track

	private constructor() {
		// singleton pattern
	}

	public static getInstance(): PluginManager {
		if (!PluginManager.instance) {
			PluginManager.instance = new PluginManager()
		}
		return PluginManager.instance
	}

	// Check for new tracks and update Discord status when something changes
	private async updateActivity(again = false) {
		if (this._checking) {
			// A wake from Music Bridge must not be lost: the song may have changed after this check
			// read it. Timer checks just skip.
			if (again) this._again = true
			return
		}
		this._checking = true
		try {
			do {
				this._again = false
				await this.checkOnce()
			} while (this._again && !pluginState.pluginStopped)
		} finally {
			this._checking = false
		}
	}

	/** Music Bridge heard a change (or its 16 s follow-up): check now, even in the background. */
	public checkNow() {
		if (pluginState.pluginStopped || getSettings().service !== 'bridge') return
		void this.updateActivity(true)
	}

	private async checkOnce() {
		if (pluginState.pluginStopped) {
			setDebugInfo('componentMountErrors', [
				...(debugInfo.componentMountErrors || []),
				'Plugin is stopped, skipping update',
			])
			try {
				this.stopUpdates()
			} catch (e) {
				setDebugInfo('lastError', e as Error)
			}
			return
		}

		// A change held back for the 15 s gap whose timer was frozen in the background.
		flushPending()

		const settings = getSettings()
		const serviceName = serviceFactory.getCurrentService().getServiceName()

		// Track current service for debug
		setDebugInfo('currentService', settings.service)

		try {
			// Check if any ignored app is active
			if (settings.ignoreList && settings.ignoreList.length > 0) {
				const ignoredActivity = getSelfPresenceStore()?.findActivity(
					(act: any) => {
						if (!act.name) return false
						return settings.ignoreList.some((ignoredApp: string) =>
							act.name.toLowerCase().includes(ignoredApp.toLowerCase()),
						)
					},
				)

				if (ignoredActivity) {
					setDebugInfo('ignoredActivity', ignoredActivity.name)
					pluginState.lastTrackUrl = undefined
					// Only once: clearing again every check would churn Discord's presence.
					if (pluginState.lastActivity) clearActivity()
					return
				}
			}

			incrementApiCall()
			incrementConnectionAttempt()
			const lastTrack = await serviceFactory
				.getCurrentService()
				.fetchLatestScrobble()
			setDebugInfo('lastTrack', lastTrack)

			if (!lastTrack.nowPlaying) {
				setDebugInfo('lastTrack_nowPlaying', false)
				// Forget the track so it is re-sent once playback resumes
				pluginState.lastTrackUrl = undefined
				if (pluginState.lastActivity) clearActivity()
				return
			}

			const sameSong = pluginState.lastTrackUrl === lastTrack.url
			let art = sameSong ? this._artId : undefined
			if (!sameSong) {
				setDebugInfo('componentMountErrors', [
					...(debugInfo.componentMountErrors || []),
					`Track changed: ${lastTrack.artist} - ${lastTrack.name}`,
				])
				art = await this.resolveArt(lastTrack)
				// No art yet: try again on the next few checks while this song plays.
				this._artTries = art ? ARTWORK_RETRIES : 0
			} else if (!art && this._artTries < ARTWORK_RETRIES) {
				this._artTries++
				art = await this.resolveArt(lastTrack)
				if (art) this._artTries = ARTWORK_RETRIES
			}
			// A newer check may have moved on while this one waited for art.
			if (sameSong && pluginState.lastTrackUrl !== lastTrack.url) return

			// Same song, same art, same settings: nothing to tell Discord. A changed setting
			// (timestamp, listening, tooltip, app name) rebuilds the status straight away instead
			// of waiting for the next song.
			const key = this.settingsKey()
			// A live track that was paused, seeked or replayed has a new start: re-send so the
			// status's time matches the player.
			const moved =
				!!lastTrack.live &&
				settings.showTimestamp &&
				settings.listeningTo &&
				this._sentFrom !== undefined &&
				Math.abs(lastTrack.from - this._sentFrom) > LIVE_DRIFT_S
			if (sameSong && !moved && art === this._artId && key === this._sentKey) {
				recordSuccessfulUpdate()
				this.consecutiveFailures = 0
				return
			}

			const activity = this.buildActivity(lastTrack, art, serviceName)
			setDebugInfo('lastActivity', activity)

			await sendRequest(activity)
			this.share(lastTrack, serviceName)
			pluginState.lastTrackUrl = lastTrack.url
			this._artId = art
			this._sentKey = key
			this._shownTrack = lastTrack
			this._sentFrom = lastTrack.live ? lastTrack.from : undefined
			this._currentActivity = activity
			pluginState.lastActivity = activity
			this.consecutiveFailures = 0
			this._lastUpdateTime = getCurrentTimestamp()
			recordSuccessfulUpdate()
		} catch (error) {
			setDebugInfo('lastError', error as Error)
			recordServiceError(
				settings.service as ServiceType,
				(error as Error).message,
			)
			this.handleError(error as Error)
		}
	}

	/** Everything the status depends on besides the song, so a change re-sends it. */
	private settingsKey(): string {
		const s = getSettings()
		return JSON.stringify([
			s.appName,
			s.listeningTo,
			s.showTimestamp,
			s.showLargeText,
			s.showAlbumInTooltip,
			s.showDurationInTooltip,
		])
	}

	/** The status for [track], from the settings as they are now. */
	private buildActivity(
		track: Track,
		art: string | undefined,
		serviceName: string,
	): Activity {
		const settings = getSettings()

		const activity: Activity = {
			name: settings.appName || Constants.DEFAULT_APP_NAME,
			flags: 0,
			type: settings.listeningTo
				? ActivityType.LISTENING
				: ActivityType.PLAYING,
			details: track.name,
			state: `${track.artist}`,
			status_display_type: 1,
			application_id: Constants.APPLICATION_ID,
		}

		// {{artist}}, {{name}}, {{album}} and {{service}} in the app name.
		if (activity.name.includes('{{')) {
			const variables: Record<string, string> = {
				artist: track.artist,
				name: track.name,
				album: track.album,
				service: serviceName,
			}
			activity.name = activity.name.replace(
				/{{(\w+)}}/g,
				(whole, key: string) =>
					key in variables ? variables[key] || '' : whole,
			)
		}

		// The timestamp only when it's switched on: no `timestamps` at all otherwise.
		if (settings.showTimestamp && settings.listeningTo && track.from) {
			const now = getCurrentTimestamp()
			let startTime = track.from
			// More than an hour old is a stale scrobble time: guess we're a little way in.
			if (startTime < now - 3600) {
				startTime =
					track.duration && track.duration > 0
						? now - Math.min(track.duration * 0.1, 30)
						: now
			}
			activity.timestamps = { start: startTime * 1000 }
			if (track.to) activity.timestamps.end = track.to * 1000
		}

		const assets = this.buildAssets(track, art)
		if (assets) activity.assets = assets
		return activity
	}

	/**
	 * The album art as a Discord asset id, or undefined. Uses the service's cover, or when it has
	 * none, upstream's iTunes lookup by artist and album (lib/artwork.ts).
	 */
	private async resolveArt(track: Track): Promise<string | undefined> {
		this._artUrl = undefined
		try {
			const url =
				track.albumArt ||
				(await findAlbumArtUrl(track.artist, track.album, track.name))
			if (!url) return undefined
			// Kept even if Discord can't use it: Now Playing reads the cover link itself.
			this._artUrl = url
			const [asset] = await fetchAsset([url])
			return asset || undefined
		} catch {
			return undefined
		}
	}

	/** Tells Now Playing about the song (lib/share.ts). */
	private share(track: Track, source: string) {
		shareTrack({
			title: track.name,
			artist: track.artist || undefined,
			album: track.album || undefined,
			art: this._artUrl,
			source,
		})
	}

	/** The activity's `assets`: the art plus the tooltip text the settings ask for. */
	private buildAssets(
		track: Track,
		art: string | undefined,
	): Activity['assets'] | undefined {
		const settings = getSettings()

		let largeText = ''
		if (settings.showLargeText) {
			if (settings.showAlbumInTooltip && track.album) {
				largeText += `on ${track.album}`
			}
			// The duration only shows next to real art, as upstream did.
			if (art && settings.showDurationInTooltip && track.duration) {
				const durationText = formatDuration(track.duration)
				largeText = largeText ? `${largeText} • ${durationText}` : durationText
			}
		}

		if (art)
			return largeText
				? { large_image: art, large_text: largeText }
				: { large_image: art }
		return largeText ? { large_text: largeText } : undefined
	}

	private handleError(error: Error) {
		this.consecutiveFailures++
		setDebugInfo('lastError', error)

		if (this.consecutiveFailures >= Constants.MAX_RETRY_ATTEMPTS) {
			this.startReconnection()
		}
	}

	private startReconnection() {
		if (this.isReconnecting) return

		this.isReconnecting = true
		this.stopUpdates()

		this.reconnectTimer = setInterval(() => {
			this.initialize()
				.then(() => {
					this.stopReconnection()
				})
				.catch(error => {
					this.handleError(error as Error)
				})
		}, Constants.RETRY_DELAY)
	}

	private stopReconnection() {
		if (this.reconnectTimer) {
			clearInterval(this.reconnectTimer)
			this.reconnectTimer = undefined
		}
		this.isReconnecting = false
		this.consecutiveFailures = 0
	}

	// clean up all timers
	private stopUpdates() {
		if (this.updateTimer) {
			clearInterval(this.updateTimer)
			this.updateTimer = undefined
		}
	}

	// start everything up
	public async initialize() {
		if (pluginState.pluginStopped) {
			throw new Error('Plugin is stopped')
		}

		const serviceName = serviceFactory.getCurrentService().getServiceName()
		const isValid = await serviceFactory.validateCurrentService()
		if (!isValid) {
			throw new Error(`Invalid credentials for ${serviceName}`)
		}

		this.stopUpdates()

		// check right away in case something is already playing
		await this.updateActivity()

		const currentService = getSettings().service

		let minInterval: number = Constants.MIN_UPDATE_INTERVAL
		if (currentService === 'librefm') {
			minInterval = Constants.LIBREFM_MIN_UPDATE_INTERVAL
		}
		const interval = Math.max(
			(Number(getSettings().timeInterval) || Number(DEFAULTS.timeInterval)) *
				1000,
			minInterval * 1000,
		)

		this.updateTimer = setInterval(() => this.updateActivity(), interval)
	}

	// stop everything and clean up
	public stop() {
		if (pluginState.pluginStopped) {
			return // already stopped
		}

		pluginState.pluginStopped = true

		try {
			this.stopUpdates()
			this.stopReconnection()
			clearActivity(true)
		} catch (_error) {
			// don't let cleanup errors break things
		}
	}

	// change to a different scrobble service
	public async switchService(_newService: string) {
		if (pluginState.pluginStopped) {
			return
		}

		// stop what we're doing first
		const wasRunning = !pluginState.pluginStopped
		this.stop()

		try {
			// clear cache so we get fresh service instances
			serviceFactory.clearCache()

			// Reset track state when switching services
			pluginState.lastTrackUrl = undefined
			this._currentActivity = undefined
			this._lastUpdateTime = 0

			// start back up with the new service
			if (wasRunning) {
				pluginState.pluginStopped = false
				await this.initialize()
			}
		} catch (_error) {
			// Handle error
		}
	}

	/**
	 * The song and cover link on the status right now, or null when the status is clear. The
	 * Status details preview draws from this, so it always matches what Discord shows.
	 */
	public shownSong(): { track: Track; art?: string } | null {
		if (!pluginState.lastActivity || !this._shownTrack) return null
		return { track: this._shownTrack, art: this._artUrl }
	}

	// get info about what's currently happening
	public getStatus() {
		const serviceName = serviceFactory.getCurrentService().getServiceName()
		return {
			running: !pluginState.pluginStopped,
			service: serviceName,
			consecutiveFailures: this.consecutiveFailures,
			isReconnecting: this.isReconnecting,
			lastTrackUrl: pluginState.lastTrackUrl,
			updateInterval: this.updateTimer ? 'Active' : 'Inactive',
			currentActivity: this._currentActivity,
			lastUpdateTime: this._lastUpdateTime,
		}
	}
}

// expose the manager functions
const manager = PluginManager.getInstance()
export const initialize = () => manager.initialize()
export const stop = () => manager.stop()
export const switchService = (service: string) => manager.switchService(service)
export const getStatus = () => manager.getStatus()
export const getShownSong = () => manager.shownSong()
export const checkNow = () => manager.checkNow()

// Connection status tracking
let connectionAttempts = 0
const MAX_CONNECTION_ATTEMPTS = 3
const RECONNECT_DELAY = 5000

export async function tryInitialize() {
	try {
		await initialize()
		connectionAttempts = 0
	} catch (_error) {
		connectionAttempts++

		if (connectionAttempts < MAX_CONNECTION_ATTEMPTS) {
			setTimeout(tryInitialize, RECONNECT_DELAY)
		}
	}
}
