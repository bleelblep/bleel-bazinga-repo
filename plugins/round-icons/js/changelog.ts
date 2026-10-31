import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '1.3.7',
		date: '2026-10-31',
		title: 'Renamed',
		changes: ['Fuck Squares is now called Round Corners. Nothing else changed.'],
	},
	{
		version: '1.3.6',
		date: '2026-10-28',
		title: 'You bar avatar',
		changes: ["The square corner and stray circle next to your avatar in the You bar are gone: the bar's old background layer isn't drawn any more."],
	},
	{
		version: '1.3.5',
		date: '2026-10-28',
		title: 'Text boxes fixed',
		changes: ['Bigger text boxes, like your profile Bio, are rounded instead of pill-shaped, so their text is no longer cut off.'],
	},
	{
		version: '1.3.4',
		date: '2026-10-26',
		title: 'Valenced',
		changes: ["Ported to Valenced. Settings from Revenge don't carry over."],
	},
	{
		version: '1.3.3',
		date: '2026-10-23',
		title: 'Discord version limit removed',
		changes: ['Installs on any Discord version again.'],
	},
	{
		version: '1.3.2',
		date: '2026-10-22',
		title: 'Discord 352.2',
		changes: ['Also starts on Discord 352.2 (was 351.6 or older).'],
	},
	{
		version: '1.3.1',
		date: '2026-10-21',
		title: 'Discord version limit',
		changes: ["Only starts on Discord 351.6 or older, so a newer Discord build can't break it."],
	},
	{
		version: '1.3.0',
		date: '2026-10-19',
		title: 'Round everything',
		changes: [
			'Server folders are round too: a closed folder is a circle, an open one a pill.',
			'"Everything else" now makes small things fully round (channel rows and icons, input fields, segmented controls, the media keyboard, voice pills, the quest dock, buttons) and gives big containers (cards, settings rows, voice tiles, keyboard tops) their pre-redesign corners.',
		],
	},
	{
		version: '1.2.3',
		date: '2026-10-19',
		title: 'The Quests bar, found',
		changes: ["The Quests / Shop / Settings bar isn't the You bar after all: it's drawn with the You tab's banner. That's hooked now, so the bar is a pill."],
	},
	{
		version: '1.2.2',
		date: '2026-10-19',
		title: 'Message box and the Quests bar',
		changes: [
			'The message box keeps its fill and is a pill: 1.2.x had wrapped its animated views, which stripped their rounding and background. Animated views are never wrapped now, and the box is changed through its corner tokens only.',
			"The Quests / Shop / Settings bar on the You tab is the You bar grown taller, so it's a pill now too.",
		],
	},
	{
		version: '1.2.1',
		date: '2026-10-19',
		title: 'Round means round',
		changes: ["Discord's \"fully round\" corner value is so large Android draws it as no corner at all, which made the message box and the You tab's buttons square. Every corner is now capped to a size Android draws as a proper circle or pill."],
	},
	{
		version: '1.2.0',
		date: '2026-10-19',
		title: 'The redesign’s corners, undone at the source',
		changes: [
			"Discord's corners are design tokens that answer differently under the redesign's experiment flags. The plugin now asks those tokens for their pre-redesign values, so the message box (24, not 8), rows, cards, the channel list, folders, input fields, segmented controls, the media keyboard, voice panels and the quest dock all get their old corners. Sizes and spacing are untouched.",
			'The message box fix from 1.1.4 was aimed at the wrong token; this replaces it.',
		],
	},
	{
		version: '1.1.4',
		date: '2026-10-18',
		title: 'Message box and profile buttons',
		changes: [
			'The message box is a pill, on by default now (its corner is a design token, overridden like the You bar’s).',
			'New: the Quests, Shop and Settings buttons at the top of the You tab become circles.',
		],
	},
	{
		version: '1.1.3',
		date: '2026-10-18',
		title: 'You bar, properly',
		changes: ["The You bar's corners come from a design token its background animations read, not from any style, so the token is overridden now: the bar is a pill and its buttons circles, live."],
	},
	{
		version: '1.1.2',
		date: '2026-10-18',
		title: 'Shows what it found',
		changes: ["Each switch now says how many of its Discord components were found and hooked on this build, and names any it couldn't find, so you can tell what's working without guessing."],
	},
	{
		version: '1.1.1',
		date: '2026-10-18',
		title: 'Round send button',
		changes: ["The send button is a circle like the other chat buttons (1.0.x briefly kept it square by mistake: this plugin undoes squares, it doesn't add them). Send Tweaks' swipe capsule follows."],
	},
	{
		version: '1.0.10',
		date: '2026-10-18',
		title: 'Rebuilt from scratch',
		changes: [
			'Every square has its own switch: server icons, the server bar buttons, the You bar, the chat bar buttons, and the message box.',
			"Server icons are rounded by Discord's own icon component now, so they're round everywhere, not only in the server list, and the selected server can morph into a rounded square (Classic) or stay round.",
			"Tells Send Tweaks the send button is round, so its swipe capsule matches.",
			'No native code any more: nothing cuts pictures as they draw, and nothing guesses shapes across the whole app. Each square is rounded inside its own component only.',
		],
	},
	{
		version: '0.2.6',
		date: '2026-10-09',
		title: 'Earlier versions',
		changes: ['Round server icons by native drawing, the selection frame, the You bar and chat buttons by shape.'],
	},
]
