export type Activity = {
	name: string
	application_id: string
	flags: number
	type: number
	details?: string
	state?: string
	timestamps?: {
		_enabled?: boolean
		start: number | string
		end?: number | string
	}
	assets?: ActivityAssets
	buttons?: ActivityButton[]
	status_display_type?: number
}

export type ActivityButton = {
	label: string
	url: string
}

export type ActivityAssets = {
	large_image?: string
	large_text?: string
	small_image?: string
	small_text?: string
}

export type ServiceType = 'lastfm' | 'librefm' | 'listenbrainz' | 'bridge'

export type Track = {
	name: string
	artist: string
	album: string
	albumArt: string | null
	url: string
	date: string
	nowPlaying: boolean
	loved: boolean
	from: number
	to: number | null | undefined
	duration?: number
	/**
	 * `from` is the player's real position (Music Bridge), not a scrobble time, so a pause, seek
	 * or replay moves it and the status is re-sent with the new time.
	 */
	live?: boolean
}

export interface ServiceClient {
	fetchLatestScrobble(): Promise<Track>
	validateCredentials(): Promise<boolean>
	getServiceName(): string
}

export interface ServiceConfig {
	name: string
	baseUrl: string
	requiresApiKey: boolean
	requiresToken: boolean
}

export interface MultiScrobblerStorage {
	username: string
	apiKey: string
	librefmUsername: string
	librefmApiKey: string
	listenbrainzUsername: string
	listenbrainzToken: string
	appName: string
	timeInterval: number | string
	showTimestamp: boolean
	listeningTo: boolean
	showLargeText: boolean
	showAlbumInTooltip: boolean
	showDurationInTooltip: boolean
	ignoreYouTubeMusic: boolean
	service: ServiceType | undefined
	ignoreList: string[]
	verboseLogging: boolean
	/** The settings intro card was hidden for good (settings design guide §4.3). */
	introDismissed: boolean
	/** The newest Music Bridge versionCode already announced in a toast (lib/bridgeUpdate.ts). */
	bridgeUpdateToldFor: number
}

export type RevengeJsonStorageApi<S extends object> = {
	cache?: S
	use(): S | undefined
	set(patch: Partial<S>): Promise<void>
}
