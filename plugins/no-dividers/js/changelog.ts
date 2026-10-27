import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.1.15',
		date: '2026-10-28',
		title: 'Bazinga Plugins',
		changes: ['Now published from the Bazinga Plugins repository.'],
	},
	{
		version: '0.1.14',
		date: '2026-10-28',
		title: 'Plainer settings',
		changes: ['The settings page no longer has the retro icon background.'],
	},
	{
		version: '0.1.13',
		date: '2026-10-26',
		title: 'Tidy-up',
		changes: ['Small internal changes.'],
	},
	{
		version: '0.1.12',
		date: '2026-10-26',
		title: 'Slanted pattern',
		changes: ['The background icons run in slanted rows instead of a straight grid.'],
	},
	{
		version: '0.1.11',
		date: '2026-10-26',
		title: 'Bigger icons',
		changes: ['The background icons are a little bigger.'],
	},
	{
		version: '0.1.10',
		date: '2026-10-26',
		title: 'Retro icons',
		changes: ['The settings background is now see-through retro computer icons instead of punched tape.'],
	},
	{
		version: '0.1.9',
		date: '2026-10-26',
		title: 'Punched tape',
		changes: ['The settings page has a faint retro punched-tape pattern in the background.'],
	},
	{
		version: '0.1.8',
		date: '2026-10-26',
		title: 'Tidier credit',
		changes: ['The credit is a small line at the bottom of the settings page instead of a row.'],
	},
	{
		version: '0.1.7',
		date: '2026-10-26',
		title: 'Credit',
		changes: ['The settings page shows who made the plugin.'],
	},
	{
		version: '0.1.6',
		date: '2026-10-26',
		title: 'Valenced',
		changes: ["Ported to Valenced. Settings from Revenge don't carry over."],
	},
	{
		version: '0.1.5',
		date: '2026-10-23',
		title: 'Discord version limit removed',
		changes: ['Installs on any Discord version again.'],
	},
	{
		version: '0.1.4',
		date: '2026-10-22',
		title: 'Discord 352.2',
		changes: ['Also starts on Discord 352.2 (was 351.6 or older).'],
	},
	{
		version: '0.1.3',
		date: '2026-10-21',
		title: 'Discord version limit',
		changes: ["Only starts on Discord 351.6 or older, so a newer Discord build can't break it."],
	},
	{
		version: '0.1.2',
		date: '2026-10-13',
		title: 'Tidy-up',
		changes: ['Errors now show in the Revenge plugin list instead of only the log, and the developer Debug page is gone from normal builds.'],
	},
	{
		version: '0.1.1',
		date: '2026-10-04',
		title: 'First release',
		changes: [
			'Removes the thin lines between rows in settings and other lists.',
			'A settings page with the changelog.',
		],
	},
]
