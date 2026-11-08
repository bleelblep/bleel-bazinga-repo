/**
 * Hands the current song to Now Playing (bleelblep.now-playing), which themes Discord in the
 * cover's colours. Both plugins run in the same JS runtime, so one object on `globalThis` is
 * enough: no imports between bundles, and either plugin can load first.
 *
 * Now Playing could read the song off your Discord status instead, but only once Discord has
 * turned the cover into an `mp:` asset, which can fail or lag. This gives it the original cover
 * link straight away. The shape must match Now Playing's `js/lib/art.ts` (`SharedTrack`).
 */

const KEY = '__bleelblepNowPlaying'

export interface SharedTrack {
	title: string
	artist?: string
	album?: string
	/** The cover as an https link, not a Discord asset id. */
	art?: string
	/** Where it came from, e.g. "Last.fm". */
	source: string
}

interface Hub {
	track: SharedTrack | null
	listeners: Set<() => void>
}

function hub(): Hub {
	const g = globalThis as any
	if (!g[KEY]) g[KEY] = { track: null, listeners: new Set() }
	return g[KEY] as Hub
}

/** The song now playing, or null when nothing is (or the status is hidden). */
export function shareTrack(track: SharedTrack | null) {
	try {
		const h = hub()
		const before = h.track
		if (
			before?.title === track?.title &&
			before?.artist === track?.artist &&
			before?.art === track?.art
		)
			return
		h.track = track
		for (const listener of h.listeners) {
			try {
				listener()
			} catch {
				/* a listener's problem, not ours */
			}
		}
	} catch {
		/* sharing is a bonus; the status still works without it */
	}
}

/**
 * Whether Now Playing is installed and running: it listens on the hub from its `start()`
 * (`onSharedTrack` in its `js/lib/theme.ts`). Plugins can't list each other without Developer
 * Mode, so this is how the settings page knows whether to suggest it.
 */
export function nowPlayingInstalled(): boolean {
	try {
		return hub().listeners.size > 0
	} catch {
		return false
	}
}
