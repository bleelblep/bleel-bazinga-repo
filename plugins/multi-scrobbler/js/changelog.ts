import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '1.3.11',
		date: '2026-11-08',
		title: 'Right covers',
		changes: [
			"Album art no longer shows someone else's cover. A cover found by search must be by the song's artist, and the right album or song wins; when nothing matches, no cover is better than a wrong one.",
			"A slow cover lookup for the last song can't put its cover back after the next song has started.",
		],
	},
	{
		version: '1.3.10',
		date: '2026-11-08',
		title: 'Get Music Bridge from here',
		changes: [
			'A "Get Music Bridge" row in the settings downloads the newest Music Bridge app, for "This phone". Tap it again later to update.',
		],
	},
	{
		version: '1.3.9',
		date: '2026-11-07',
		title: 'Finds Music Bridge more reliably',
		changes: [
			'"This phone" no longer says it needs Music Bridge while nothing is playing. The settings ask the app and wait a few seconds for its answer (needs Music Bridge 0.4.2).',
		],
	},
	{
		version: '1.3.8',
		date: '2026-11-07',
		title: 'Clearer settings',
		changes: [
			`The ignore list is now called "Hide for other apps" and says what it's for: hiding your music status when Spotify or another app already shows it on your profile.`,
			'Music Bridge now sits with the other services, under "Set up", as "This phone".',
		],
	},
	{
		version: '1.3.7',
		date: '2026-11-06',
		title: 'Open Music Bridge from here',
		changes: [
			'An "Open Music Bridge" row in the settings opens the app, to pick which apps show on your status.',
		],
	},
	{
		version: '1.3.6',
		date: '2026-11-03',
		title: 'Preview matches your status',
		changes: [
			'The Status details preview shows the song and album art actually on your status, instead of looking up your last Last.fm scrobble separately.',
		],
	},
	{
		version: '1.3.5',
		date: '2026-11-03',
		title: 'Tidier settings',
		changes: [
			"A service that isn't connected says so in red.",
			'The account rows are just names now; the service list above already shows which are connected.',
			`The note at the top of the settings has a "Don't show again" button.`,
		],
	},
	{
		version: '1.3.4',
		date: '2026-11-03',
		title: 'Calmer status updates',
		changes: [
			'Your status changes at most once every 15 seconds, however fast songs skip or settings change. Quick changes are merged into one.',
			'Services that are set up now say "Connected" in green.',
			'Removed the Music Bridge and Now Playing cards from the settings page.',
		],
	},
	{
		version: '1.3.3',
		date: '2026-11-03',
		title: 'Album art fixed',
		changes: [
			"Album art shows again. Covers are turned into Discord images by Discord's own helper, which the plugin now loads itself instead of waiting for Discord to.",
			"Removed the backup image lookup: Discord refused it every time, and it can't be made to work safely.",
			'With a Last.fm API key saved, covers come from Last.fm first and iTunes second, so more releases find theirs.',
		],
	},
	{
		version: '1.3.2',
		date: '2026-11-03',
		title: 'Finds more album art',
		changes: [
			'The cover search uses the first artist, so songs listed as "Artist • Artist" or "feat." find their art.',
			'Picks the cover by the right artist when the search turns up several.',
			"When a cover can't be shown, the reason now appears in the plugin's errors.",
		],
	},
	{
		version: '1.3.1',
		date: '2026-11-03',
		title: 'Settings apply straight away',
		changes: [
			'Turning the timestamp, "Listening to" or the album tooltip on or off now changes your status at once, instead of on the next song.',
			"Album art uses Discord's own image helper more often, catching it as soon as Discord loads it.",
			'{{artist}} and the other app-name fields no longer leave a stray "}" behind.',
		],
	},
	{
		version: '1.3.0',
		date: '2026-11-03',
		title: 'Music from this phone',
		changes: [
			'New source, "This phone": shows whatever is playing on your phone (Spotify, YouTube Music or any player) with no scrobbling account, through the new Music Bridge app. Android 10 or newer.',
			'When nothing is playing, your status is cleared once instead of on every check.',
		],
	},
	{
		version: '1.2.9',
		date: '2026-11-02',
		title: 'Bigger credit',
		changes: [
			'"Made by kmmiio99o" at the foot of the settings is a size bigger.',
		],
	},
	{
		version: '1.2.8',
		date: '2026-11-02',
		title: 'Credit line',
		changes: [
			'The foot of the settings now reads "Made by kmmiio99o", with a smaller "Ported by bleelblep" underneath.',
		],
	},
	{
		version: '1.2.7',
		date: '2026-11-01',
		title: 'Now Playing suggestion',
		changes: [
			"The settings page suggests the Now Playing theme, or says where to turn it on when it's installed.",
		],
	},
	{
		version: '1.2.6',
		date: '2026-11-01',
		title: 'Works with Now Playing',
		changes: [
			"Hands the song and its cover straight to the Now Playing theme, so it changes colour as soon as the song does, even when Discord hasn't shown the cover yet.",
		],
	},
	{
		version: '1.2.5',
		date: '2026-11-01',
		title: 'Album art shows more often',
		changes: [
			'Album art no longer goes missing when Discord has not loaded its image helper yet.',
			'If the art does not load, it tries again a few times while the song plays.',
			'Sharper covers from Last.fm and Libre.fm, and a cover search when the service has none.',
		],
	},
	{
		version: '1.2.4',
		date: '2026-11-01',
		title: 'Credit',
		changes: [
			'The settings page credits kmmiio99o, who made the plugin, and no longer has a background pattern.',
		],
	},
	{
		version: '1.2.3',
		date: '2026-11-01',
		title: 'Tidier settings',
		changes: [
			'Settings follow your theme, with icons, and the text fields and slider sit in proper rows.',
			'Removing an app from the ignore list asks first.',
			'Logging moved onto the Debug page, under Developer.',
		],
	},
	{
		version: '1.2.2',
		date: '2026-11-01',
		title: 'Connection results show',
		changes: [
			'Test connection now shows whether it worked, not just "Testing".',
		],
	},
	{
		version: '1.2.1',
		date: '2026-11-01',
		title: 'Toast fix',
		changes: [
			"Messages no longer crash Discord's toast; they use Discord's own toast.",
		],
	},
	{
		version: '1.2.0',
		date: '2026-11-01',
		title: 'Valenced',
		changes: [
			"Ported to Valenced from kmmiio99o's Multi Scrobbler. No extra library needed.",
		],
	},
]
