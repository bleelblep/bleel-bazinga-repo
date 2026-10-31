import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '1.3.13',
		date: '2026-10-27',
		title: 'Staff tags are back',
		changes: [
			'ADMIN, STAFF, MOD, VC Mod and Chat Mod show again. 1.3.12 could pick up the wrong Discord permission module, so only OWNER appeared.',
		],
	},
	{
		version: '1.3.12',
		date: '2026-10-27',
		title: 'Steadier tags',
		changes: [
			'ADMIN, STAFF and MOD tags no longer go missing for a whole session when Discord loads its permission code late.',
			'Tags in the member list can no longer appear twice.',
			'Colours typed as plain RGB, like 240, 178, 50, are accepted, as the field always said.',
			'Switching the plugin on from the plugin list no longer asks for a reload.',
			'Needs Discord 350.2 or newer.',
		],
	},
	{
		version: '1.3.11',
		date: '2026-10-26',
		title: 'Valenced',
		changes: ["Ported to Valenced. Settings from Revenge don't carry over."],
	},
	{
		version: '1.3.10',
		date: '2026-10-23',
		title: 'Discord version limit removed',
		changes: ['Installs on any Discord version again.'],
	},
	{
		version: '1.3.9',
		date: '2026-10-22',
		title: 'Discord 352.2',
		changes: ['Also starts on Discord 352.2 (was 351.6 or older).'],
	},
	{
		version: '1.3.8',
		date: '2026-10-21',
		title: 'Discord version limit',
		changes: [
			"Only starts on Discord 351.6 or older, so a newer Discord build can't break it.",
		],
	},
	{
		version: '1.3.7',
		date: '2026-10-13',
		title: 'Tidy-up',
		changes: [
			'Errors now show in the Revenge plugin list instead of only the log, and the developer Debug page is gone from normal builds.',
		],
	},
	{
		version: '1.3.6',
		date: '2026-10-04',
		title: 'Profile tags are back',
		changes: [
			'Staff tags show next to the name on user profiles again.',
			"Fixed the same way as Hide Call Buttons 1.3.1, thanks to @kmmiio99o's rework there.",
		],
	},
	{
		version: '1.3.4',
		date: '2026-10-03',
		title: 'Changelog',
		changes: [
			'The clock icon at the top right of the settings shows what changed in every version.',
			'After an update, a short "What\'s new" dialog lists the changes the next time you open the settings.',
		],
	},
	{
		version: '1.3.3',
		date: '2026-10-02',
		title: 'Tag editor',
		changes: ['Tag editor fields sit in rows like the rest of the settings.'],
	},
	{
		version: '1.3.2',
		date: '2026-09-27',
		title: 'Works with Clyde Utils',
		changes: ['No crash alongside Clyde Utils.'],
	},
	{
		version: '1.3.1',
		date: '2026-09-24',
		title: 'Customise tags',
		changes: ["Change each tag's text, colour, gradient, icon and visibility."],
	},
	{
		version: '1.2.0',
		date: '2026-07-31',
		title: 'First Revenge Next release',
		changes: ['Extra tags for owners, admins, mods and webhooks.'],
	},
]
