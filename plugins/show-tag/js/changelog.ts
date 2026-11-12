import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '1.3.6',
		date: '2026-11-04',
		title: 'Works with Staff Tags',
		changes: [
			'"Small and dim" now works beside a Staff Tags or Pronouns tag, instead of falling back to brackets. On Android the username sits small and dim after the name (or under it, with "Below the name"). Restart Discord once after updating.',
			'On iOS, names with another tag still use brackets.',
		],
	},
	{
		version: '1.3.5',
		date: '2026-11-02',
		title: 'Credit line',
		changes: [
			'The foot of the settings now reads "Made by Cynosphere", who made the original, with a smaller "Ported by bleelblep" underneath.',
		],
	},
	{
		version: '1.3.4',
		date: '2026-11-02',
		title: 'Small and dim',
		changes: [
			'New "Small and dim" setting: the username shows in small, dim text after the name instead of in brackets, so names read normally. Replies and bots keep the brackets.',
			'With it on, "Below the name" puts the username on its own line under the name (Android). Restart Discord once after updating.',
		],
	},
	{
		version: '1.3.1',
		date: '2026-11-01',
		title: 'Made by',
		changes: ['A small "Made by bleelblep" line at the foot of the settings page.'],
	},
	{
		version: '1.3.0',
		date: '2026-10-27',
		title: 'Tidier under the hood',
		changes: [
			'Switching the plugin on or off from the plugin list no longer asks for a reload. Messages already on screen keep their current name until they redraw.',
			'Needs Discord 350.2 or newer, which is what it is tested on.',
			'The name rules are shared by the message header and the reply preview, and are covered by tests.',
		],
	},
	{
		version: '1.2.9',
		date: '2026-10-26',
		title: 'Valenced',
		changes: ["Ported to Valenced. Settings from Revenge don't carry over."],
	},
	{
		version: '1.2.8',
		date: '2026-10-23',
		title: 'Discord version limit removed',
		changes: ['Installs on any Discord version again.'],
	},
	{
		version: '1.2.7',
		date: '2026-10-22',
		title: 'Discord 352.2',
		changes: ['Also starts on Discord 352.2 (was 351.6 or older).'],
	},
	{
		version: '1.2.6',
		date: '2026-10-21',
		title: 'Discord version limit',
		changes: [
			"Only starts on Discord 351.6 or older, so a newer Discord build can't break it.",
		],
	},
	{
		version: '1.2.5',
		date: '2026-10-13',
		title: 'Tidy-up',
		changes: [
			'Errors now show in the Revenge plugin list instead of only the log, and the developer Debug page is gone from normal builds.',
		],
	},
	{
		version: '1.2.4',
		date: '2026-10-03',
		title: 'Changelog',
		changes: [
			'The clock icon at the top right of the settings shows what changed in every version.',
			'After an update, a short "What\'s new" dialog lists the changes the next time you open the settings.',
		],
	},
	{
		version: '1.2.3',
		date: '2026-09-28',
		title: 'Tidier settings',
		changes: [
			'A shorter description and settings that match the other plugins.',
		],
	},
	{
		version: '1.2.0',
		date: '2026-07-31',
		title: 'First Revenge Next release',
		changes: [
			'Shows usernames next to display names in chat, including replies.',
		],
	},
]
