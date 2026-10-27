import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
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
