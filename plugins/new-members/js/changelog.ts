import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.1.17',
		date: '2026-10-28',
		title: 'Changelog',
		changes: ['A changelog: the clock icon at the top of this page.'],
	},
	{
		version: '0.1.16',
		date: '2026-10-28',
		title: 'Role icons',
		changes: [
			"Someone whose role already has an icon now gets your chosen badge in its place, instead of a plain 🌱 after their name. Their role icon comes back after their first week.",
			'New setting, "If their role has an icon": pick "Keep their role icon" to get the old 🌱 back.',
		],
	},
	{
		version: '0.1.15',
		date: '2026-10-28',
		title: 'Bazinga Plugins',
		changes: ['Now published from the Bazinga Plugins repository.'],
	},
	{
		version: '0.1.14',
		date: '2026-10-26',
		title: 'Valenced',
		changes: ["Ported to Valenced. Settings from Revenge don't carry over."],
	},
	{
		version: '0.1.13',
		date: '2026-10-25',
		title: "Discord's colour picker",
		changes: ['"Icon colour" opens Discord\'s own colour picker.'],
	},
	{
		version: '0.1.12',
		date: '2026-10-25',
		title: 'Settings',
		changes: ["Pick the badge: 🌱, Discord's new member icon, or that icon in a colour you choose."],
	},
	{
		version: '0.1.11',
		date: '2026-10-25',
		title: "Discord's icon",
		changes: ["The badge is Discord's own new member icon, in green."],
	},
	{
		version: '0.1.8',
		date: '2026-10-22',
		title: 'Tap for the join date',
		changes: [
			'The badge sits where role icons go. Tap it to see when they joined.',
			'The profile card is gone.',
		],
	},
	{
		version: '0.1.6',
		date: '2026-10-22',
		title: 'Profile card',
		changes: ["A new member's profile shows when they joined the server. Tapping their name works as normal again."],
	},
	{
		version: '0.1.2',
		date: '2026-10-21',
		title: 'Works with Show Tag',
		changes: ['The 🌱 no longer disappears when Show Tag is on.'],
	},
	{
		version: '0.1.1',
		date: '2026-10-21',
		title: 'First release',
		changes: ['A 🌱 next to the names of people who joined the server in the last week, like on desktop.'],
	},
]
