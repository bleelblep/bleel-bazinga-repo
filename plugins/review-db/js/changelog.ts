import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.1.23',
		date: '2026-10-28',
		title: 'Fixes',
		changes: [
			"When reviews can't load (offline, or too many requests), the profile card says so and lets you tap to try again, instead of \"No reviews yet\".",
			'Settings changed right after turning the plugin on are saved.',
		],
	},
	{
		version: '0.1.22',
		date: '2026-10-28',
		title: 'Bazinga Plugins',
		changes: ['Now published from the Bazinga Plugins repository.'],
	},
	{
		version: '0.1.21',
		date: '2026-10-28',
		title: 'Sign-in works again',
		changes: ["Authorize now opens Discord's own sign-in screen even when Discord hasn't loaded it yet."],
	},
	{
		version: '0.1.20',
		date: '2026-10-28',
		title: 'Safer sign-in',
		changes: [
			"Signing in only uses Discord's own Authorize screen. If it isn't ready, ReviewDB tells you instead of asking Discord directly.",
		],
	},
	{
		version: '0.1.19',
		date: '2026-10-26',
		title: 'Valenced',
		changes: ["Ported to Valenced. Settings from Revenge don't carry over."],
	},
	{
		version: '0.1.18',
		date: '2026-10-23',
		title: 'Discord version limit removed',
		changes: ['Installs on any Discord version again.'],
	},
	{
		version: '0.1.17',
		date: '2026-10-22',
		title: 'Discord 352.2',
		changes: ['Also starts on Discord 352.2 (was 351.6 or older).'],
	},
	{
		version: '0.1.16',
		date: '2026-10-21',
		title: 'Discord version limit',
		changes: ["Only starts on Discord 351.6 or older, so a newer Discord build can't break it."],
	},
	{
		version: '0.1.15',
		date: '2026-10-13',
		title: 'Tidy-up',
		changes: ['Errors now show in the Revenge plugin list instead of only the log, and the developer Debug page is gone from normal builds.'],
	},
	{
		version: '0.1.14',
		date: '2026-10-13',
		title: 'Discord 350.4',
		changes: ['Pop-up messages work on Discord 350.4. Before, showing one could crash Discord.'],
	},
	{
		version: '0.1.13',
		date: '2026-10-03',
		title: 'Votes UI tweak',
		changes: [
			'Votes are now displayed as plain icons on the right with the count.',
			'Thanks to @kmmiio99o for this update.',
		],
	},
	{
		version: '0.1.11',
		date: '2026-10-03',
		title: 'Changelog',
		changes: [
			'The clock icon at the top right of the settings shows what changed in every version.',
			'After an update, a short "What\'s new" dialog lists the changes the next time you open the settings.',
		],
	},
	{
		version: '0.1.10',
		date: '2026-10-02',
		title: 'Red danger icons',
		changes: ['Delete and report rows have red icons.'],
	},
	{
		version: '0.1.8',
		date: '2026-10-02',
		title: "Discord's look",
		changes: [
			"Reviews use Discord's own components.",
			'Reviews on bot profiles.',
		],
	},
	{
		version: '0.1.7',
		date: '2026-10-02',
		title: 'First public release',
		changes: [
			'Read and write reviews on user profiles and servers, with voting.',
		],
	},
]
