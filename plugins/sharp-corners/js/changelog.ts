import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.1.7',
		date: '2026-10-31',
		title: 'Renamed',
		changes: ['Fuck Circles is now called Sharp Corners. Nothing else changed.'],
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
		title: 'Status dots on Discord 352.2',
		changes: [
			"Fixed the \"no getAvatarStatusCutout\" error on Discord 352.2. The hole around the status dot is square again.",
			"Installs on any Discord version.",
		],
	},
	{
		version: '0.1.4',
		date: '2026-10-22',
		title: 'Discord 352.2',
		changes: [
			"Corners on Discord's React Native screens are sharp again on Discord 352.2. Needs Revenge 1.9.1 or newer on 352.2.",
		],
	},
	{
		version: '0.1.3',
		date: '2026-10-21',
		title: 'Discord version limit',
		changes: ["Only starts on Discord 351.6 or older, so a newer Discord build can't break it."],
	},
	{
		version: '0.1.2',
		date: '2026-10-18',
		title: 'Square emoji row',
		changes: [
			'The quick reactions at the top of the message long-press menu are square now.',
			'The press ripple on buttons is square too. Discord gave it its own rounded shape.',
		],
	},
	{
		version: '0.1.1',
		date: '2026-10-18',
		title: 'Square status dots',
		changes: [
			'Status dots are square now. Discord draws them as round pictures, so they get redrawn as squares in the status colour; offline is a hollow square.',
			'The gap cut out of the avatar around the dot is square too.',
		],
	},
	{
		version: '0.1.0',
		date: '2026-10-19',
		title: 'First version',
		changes: [
			"Every corner in Discord's screens goes sharp: buttons, the message box, the You bar, cards, menus, server icons, pictures.",
			"The chat too: message avatars, embeds, attachments, reactions and voice messages.",
			'Circles become squares: avatars, status dots, round buttons. Switch that off to keep circles and only sharpen rounded corners.',
		],
	},
]
