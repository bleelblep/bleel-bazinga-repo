import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.1.8',
		date: '2026-10-26',
		title: 'Valenced',
		changes: ["Ported to Valenced. Settings from Revenge don't carry over."],
	},
	{
		version: '0.1.7',
		date: '2026-10-23',
		title: 'Discord version limit removed',
		changes: ['Installs on any Discord version again.'],
	},
	{
		version: '0.1.6',
		date: '2026-10-22',
		title: 'Discord 352.2',
		changes: ['Also starts on Discord 352.2 (was 351.6 or older).'],
	},
	{
		version: '0.1.5',
		date: '2026-10-21',
		title: 'Discord version limit',
		changes: ["Only starts on Discord 351.6 or older, so a newer Discord build can't break it."],
	},
	{
		version: '0.1.4',
		date: '2026-10-13',
		title: 'Tidy-up',
		changes: ['Errors now show in the Revenge plugin list instead of only the log, and the developer Debug page is gone from normal builds.'],
	},
	{
		version: '0.1.3',
		date: '2026-10-09',
		title: 'Vector fix',
		changes: [
			'Works on JingMatrix Vector and LSPosed with API obfuscation, where it failed to load.',
		],
	},
	{
		version: '0.1.2',
		date: '2026-10-06',
		title: 'Slider cards',
		changes: [
			'Sliders now sit on the same card background as the settings rows around them, with the current value in the row title.',
		],
	},
	{
		version: '0.1.1',
		date: '2026-10-03',
		title: 'Changelog',
		changes: [
			'The clock icon at the top right of the settings shows what changed in every version.',
			'After an update, a short "What\'s new" dialog lists the changes the next time you open the settings.',
		],
	},
	{
		version: '0.1.0',
		date: '2026-10-01',
		title: 'First release',
		changes: [
			'Letters animate as you type and delete, with a gliding cursor.',
		],
	},
]
