import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '2.2.0',
		date: '2026-11-17',
		title: 'Server details',
		changes: [
			"Tap a server you're no longer in to see its ID, its vanity link (or an invite, if Discord had already seen one) and its owner. Tap any of them to copy it.",
			'Only what Discord already had on this phone is used: no invite is requested or created. Servers are filled in from the next time Discord connects.',
		],
	},
	{
		version: '2.1.1',
		date: '2026-11-17',
		title: 'On Bazinga',
		changes: [
			'Now available from the Bazinga plugin repository.',
		],
	},
	{
		version: '2.1.0',
		date: '2026-11-13',
		title: 'New friends and avatars',
		changes: [
			'New friends: tells you when someone accepts your request, and records the ones you accept.',
			'Avatar changes: when a friend changes their avatar, the old and new pictures are saved on this phone. Tap one in the history to see both large.',
			'Fixed: if Discord was slow to load your lists after connecting, it now waits and looks again instead of saving a half-loaded list.',
		],
	},
	{
		version: '2.0.0',
		date: '2026-11-13',
		title: 'Rewritten for Valenced',
		changes: [
			'Your own removals are marked "by you" and never pop up.',
			'Changes that happened while Discord was closed show up when it next connects.',
			'Also tells you when a friend request is cancelled or turned down, and when a friend changes their name.',
		],
	},
]
