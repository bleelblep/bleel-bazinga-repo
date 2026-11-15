import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.1.15',
		date: '2026-11-12',
		title: 'Smoother animated pictures',
		changes: [
			'Animated server icons, avatars and banners open at a lighter size, so the viewer no longer freezes the app or lags when you close it.',
			'New setting: "Full size animated pictures" opens them at the full 4096px again, if you want the detail.',
		],
	},
	{
		version: '0.1.14',
		date: '2026-11-12',
		title: 'Server pictures',
		changes: [
			"Tap a server's icon or banner in its menu to view it full size, with save and share.",
			"Tapping someone's server banner also lets you swipe to their main banner.",
			'A "Loading picture…" toast shows while a full-size picture is on its way.',
		],
	},
	{
		version: '0.1.8',
		date: '2026-11-03',
		title: 'Credit',
		changes: ['A small credit line at the bottom of the settings.'],
	},
	{
		version: '0.1.7',
		date: '2026-10-26',
		title: 'Valenced',
		changes: ["Ported to Valenced. Settings from Revenge don't carry over."],
	},
	{
		version: '0.1.6',
		date: '2026-10-23',
		title: 'Discord version limit removed',
		changes: ['Installs on any Discord version again.'],
	},
	{
		version: '0.1.5',
		date: '2026-10-22',
		title: 'Discord 352.2',
		changes: ['Also starts on Discord 352.2 (was 351.6 or older).'],
	},
	{
		version: '0.1.4',
		date: '2026-10-21',
		title: 'Discord version limit',
		changes: [
			"Only starts on Discord 351.6 or older, so a newer Discord build can't break it.",
		],
	},
	{
		version: '0.1.3',
		date: '2026-10-13',
		title: 'Tidy-up',
		changes: [
			'Errors now show in the Revenge plugin list instead of only the log, and the developer Debug page is gone from normal builds.',
		],
	},
	{
		version: '0.1.2',
		date: '2026-10-09',
		title: 'Works on Discord 350.2',
		changes: [
			'Long-pressing a server profile picture for the main one works again on Discord 350.2 alpha. Older Discord versions still work.',
		],
	},
	{
		version: '0.1.1',
		date: '2026-10-04',
		title: 'First release',
		changes: [
			'Tap a profile picture or banner to view it full size, with save and share.',
			'Long-press a server profile picture to see the main one.',
			'A settings page with the changelog.',
		],
	},
]
