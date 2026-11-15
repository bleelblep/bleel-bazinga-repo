import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '1.8.14',
		date: '2026-11-12',
		title: 'Emoji from hidden servers, properly',
		changes: [
			'Fixed: some emoji from hidden servers could still go missing from the picker and autocomplete until a reload, even with "Hide their emoji and stickers too" off.',
		],
	},
	{
		version: '1.8.13',
		date: '2026-11-10',
		title: 'Stickers from hidden servers',
		changes: [
			'Fixed: hiding a server also took its stickers out of the sticker picker. They stay now, like its emoji, unless "Hide their emoji and stickers too" is on.',
			'Fixed: opening a forum could show a red error about forum posts.',
		],
	},
	{
		version: '1.8.12',
		date: '2026-11-08',
		title: 'Hide threads and forum posts',
		changes: [
			'Long-press a thread in the channel list and pick "Hide thread" to hide just that thread. Its channel stays.',
			'Forum posts can be hidden too: long-press a post in a forum and pick "Hide post".',
			'Hidden threads and posts are listed with their channel in settings, to show them again.',
		],
	},
	{
		version: '1.8.9',
		date: '2026-11-02',
		title: 'Tidier settings',
		changes: [
			"The \"local to this device\" note can be hidden for good with \"Don't show again\".",
			'"Show them all again" on the Servers page asks first, since it clears the whole list.',
			'Turning "Hide their emoji too" on or off offers the reload it needs.',
		],
	},
	{
		version: '1.8.8',
		date: '2026-11-02',
		title: 'Emoji from hidden servers',
		changes: [
			"Hiding a server no longer takes its emoji out of the emoji picker and autocomplete.",
			'Want them gone too? Turn on "Hide their emoji too" in settings.',
		],
	},
	{
		version: '1.8.7',
		date: '2026-11-01',
		title: 'The tick stays under your finger',
		changes: ['Tapping the eye at the bottom of the server bar keeps the bottom in place, so the hidden servers show just above the tick instead of pushing it off screen.'],
	},
	{
		version: '1.8.6',
		date: '2026-11-01',
		title: 'Same servers in view',
		changes: ['Tapping the eye or the tick keeps the same servers in view, instead of landing a bit off.'],
	},
	{
		version: '1.8.5',
		date: '2026-11-01',
		title: 'Server bar keeps its place, again',
		changes: ['Tapping the eye or the tick keeps the server bar where you had it scrolled (1.8.4 missed this on Discord 352.6).'],
	},
	{
		version: '1.8.4',
		date: '2026-11-01',
		title: 'Server bar keeps its place',
		changes: [
			'Tapping the eye or the tick no longer jumps the server bar back to the top.',
			'The eye button is always there now, so its on/off switch is gone from settings.',
		],
	},
	{
		version: '1.8.3',
		date: '2026-11-01',
		title: 'One way to hide from the bar',
		changes: [
			'"Hide server" and "Hide or show servers" are gone from the server long-press menu. Use the eye at the bottom of the server bar instead: no reload needed.',
			'A small "Made by bleelblep" line at the foot of the settings page.',
		],
	},
	{
		version: '1.8.2',
		date: '2026-10-30',
		title: 'Hide whole folders',
		changes: ['While hiding servers from the bar, tap the small eye on a folder’s corner to hide the whole folder.'],
	},
	{
		version: '1.8.1',
		date: '2026-10-30',
		title: 'Hide and show from the server bar',
		changes: [
			`Tap the eye at the bottom of the server bar (or pick "Hide or show servers" from a server's long-press menu). Every server shows, hidden ones darkened with a crossed-out eye.`,
			'Tap a server to hide or show it. Open a folder to pick servers inside it; a hidden folder shows again with a tap.',
			"Tap the tick when you're done. The eye button can be turned off in settings.",
		],
	},
	{
		version: '1.7.9',
		date: '2026-10-28',
		title: 'Reload after hiding',
		changes: ["Hiding a server from its long-press menu asks to reload Discord, so it's gone from the server bar straight away."],
	},
	{
		version: '1.7.8',
		date: '2026-10-28',
		title: 'Hide from the server menu',
		changes: [
			'Long-press a server in the server bar and pick "Hide server". If you are in that server, you go to Home first.',
		],
	},
	{
		version: '1.7.7',
		date: '2026-10-28',
		title: 'Bazinga Plugins',
		changes: ['Now published from the Bazinga Plugins repository.'],
	},
	{
		version: '1.7.6',
		date: '2026-10-26',
		title: 'Valenced',
		changes: ["Ported to Valenced. Settings from Revenge don't carry over."],
	},
	{
		version: '1.7.5',
		date: '2026-10-23',
		title: 'Discord version limit removed',
		changes: ['Installs on any Discord version again.'],
	},
	{
		version: '1.7.4',
		date: '2026-10-22',
		title: 'Discord 352.2',
		changes: ['Also starts on Discord 352.2 (was 351.6 or older).'],
	},
	{
		version: '1.7.3',
		date: '2026-10-21',
		title: 'Discord version limit',
		changes: ["Only starts on Discord 351.6 or older, so a newer Discord build can't break it."],
	},
	{
		version: '1.7.2',
		date: '2026-10-18',
		title: 'Hidden channels really hide',
		changes: ['Hiding a channel now takes it out of the channel list. Before, the toast showed but the channel stayed.'],
	},
	{
		version: '1.7.1',
		date: '2026-10-18',
		title: 'Hide channels on Discord 351',
		changes: ['"Hide channel" now shows up in the long-press menu, and hiding works, on Discord 351.'],
	},
	{
		version: '1.7.0',
		date: '2026-10-17',
		title: 'Hide channels',
		changes: [
			'New: hide channels in a server. Long-press a channel and pick "Hide channel"; hiding a category hides its channels too.',
			'Hidden channels are listed in settings under Channels, where you can show them again.',
			"Like servers, hiding is only on this device. Hiding a channel doesn't mute it.",
		],
	},
	{
		version: '1.6.11',
		date: '2026-10-13',
		title: 'Tidy-up',
		changes: ['Errors now show in the Revenge plugin list instead of only the log, and the developer Debug page is gone from normal builds.'],
	},
	{
		version: '1.6.10',
		date: '2026-10-13',
		title: 'Discord 350.4',
		changes: ['Pop-up messages work on Discord 350.4. Before, showing one could crash Discord.'],
	},
	{
		version: '1.6.9',
		date: '2026-10-04',
		title: 'Discord 349.5',
		changes: [
			'Hiding servers works again on Discord 349.5. Older versions keep working.',
		],
	},
	{
		version: '1.6.8',
		date: '2026-10-03',
		title: 'Reload prompt',
		changes: [
			"Reload Discord in the Developer section now opens Revenge's own Reload Required prompt.",
		],
	},
	{
		version: '1.6.6',
		date: '2026-10-03',
		title: 'Changelog',
		changes: [
			'The clock icon at the top right of the settings shows what changed in every version.',
			'After an update, a short "What\'s new" dialog lists the changes the next time you open the settings.',
		],
	},
	{
		version: '1.6.5',
		date: '2026-10-02',
		title: 'Shorter description',
		changes: [
			'A shorter description.',
		],
	},
	{
		version: '1.6.4',
		date: '2026-09-27',
		title: 'Settings icons',
		changes: [
			'The settings rows have the right icons.',
		],
	},
	{
		version: '1.6.3',
		date: '2026-09-24',
		title: 'Theme colours',
		changes: [
			'Colours follow your theme instead of falling back to fixed ones.',
		],
	},
	{
		version: '1.2.0',
		date: '2026-07-31',
		title: 'First Revenge Next release',
		changes: [
			'Hide servers or whole folders from your server list, only on your device.',
		],
	},
]
