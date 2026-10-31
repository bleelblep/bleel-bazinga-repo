import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.5.1',
		date: '2026-10-31',
		title: 'Send splits, really',
		changes: ["0.5.0 hooked a check that Discord's Send never reaches from outside, so the \"too long\" alert still showed. The hook is now on the Send handler itself."],
	},
	{
		version: '0.5.0',
		date: '2026-10-31',
		title: 'Send splits',
		changes: [
			'Tapping Send on a long message sends it as several again, one after another, with a sheet showing the progress and a Stop button. A new setting can show the parts first instead.',
			"Discord's own length check is left as it is: the plugin steps in only where Discord would have shown its \"too long\" alert.",
			"The reply on the first part and the emptying of the message box now use exactly what Discord's own send uses.",
		],
	},
	{
		version: '0.4.2',
		date: '2026-10-31',
		title: 'Sheet scrolls',
		changes: ["The split sheet scrolls, so every part can be read before sending. 0.4.1's fix wasn't one; this uses the list Discord's own sheets scroll with."],
	},
	{
		version: '0.4.0',
		date: '2026-10-31',
		title: 'Splitting you can see',
		changes: [
			'Past the limit, the square is now a button. Tap it to see every part as it will be sent, where it goes, and send them one by one from a sheet with a Stop button.',
			"Discord's own Send is left alone: it refuses a long message the way it always did, and each part goes through Discord's normal send with its normal checks.",
			'Each part waits for Discord to confirm the one before. If a part is refused or not confirmed, the rest stays in the message box, and the sheet says which part stopped.',
			'A pending reply and attachments are not carried into the parts: the sheet says so, so you can send them on their own.',
		],
	},
	{
		version: '0.3.0',
		date: '2026-10-27',
		title: 'Valenced patcher',
		changes: [
			'Needs Discord 350.4 or newer.',
			"Hooks rewritten on Valenced's patcher, and the message box is found by its name instead of its file path.",
			'The Status row on the settings page is gone: a problem attaching to the message box now shows in the plugin list instead.',
		],
	},
	{
		version: '0.2.8',
		date: '2026-10-26',
		title: 'Valenced',
		changes: ["Ported to Valenced. Settings from Revenge don't carry over."],
	},
	{
		version: '0.2.7',
		date: '2026-10-23',
		title: 'Discord version limit removed',
		changes: ['Installs on any Discord version again.'],
	},
	{
		version: '0.2.6',
		date: '2026-10-22',
		title: 'Discord 352.2',
		changes: ['Also starts on Discord 352.2 (was 351.6 or older).'],
	},
	{
		version: '0.2.5',
		date: '2026-10-21',
		title: 'Discord version limit',
		changes: [
			"Only starts on Discord 351.6 or older, so a newer Discord build can't break it.",
		],
	},
	{
		version: '0.2.2',
		date: '2026-10-21',
		title: 'Makes room for other buttons',
		changes: [
			'The square now tells other plugins where it is, so things floating above the message box (like Read All+\'s "Mark read" pill) move out of its way instead of covering it.',
		],
	},
	{
		version: '0.2.1',
		date: '2026-10-18',
		title: 'Splitting actually sends',
		changes: [
			'0.2.0 cut the message but Discord refused it before the plugin was asked: the message box checks the limit itself. While splitting is on, that check now allows up to the "At most" number of messages\' worth, and the plugin cuts at the real limit.',
		],
	},
	{
		version: '0.2.0',
		date: '2026-10-18',
		title: 'Split long messages',
		changes: [
			'Past the limit, a message now goes out as several instead of being refused: cut at a blank line, a line break or the end of a sentence, with code blocks closed and reopened so each part still renders as code.',
			"A wait between the parts, which you set in the settings (1 second to start with). A channel's slowmode is respected when it is longer.",
			'A cap on how many messages one send can become, 5 to start with. Longer than that, the message is sent as typed.',
			'Past the limit with splitting on, the square shows "N messages" in amber instead of red.',
			'If a later part fails to send, the rest goes back into the message box and a toast says so.',
		],
	},
	{
		version: '0.1.9',
		date: '2026-10-13',
		title: 'Tidy-up',
		changes: [
			'Errors now show in the Revenge plugin list instead of only the log, and the developer Debug page is gone from normal builds.',
		],
	},
	{
		version: '0.1.8',
		date: '2026-10-09',
		title: 'The count shows on 350.2',
		changes: [
			"Fixed the count never appearing on Discord 350.2 alpha: 0.1.7 hooked the message box, but Discord's length updates still didn't reach it.",
		],
	},
	{
		version: '0.1.7',
		date: '2026-10-09',
		title: 'Works on Discord 350.2',
		changes: [
			'The counter and send-button badge work again on Discord 350.2 alpha, which rebuilt the message box. Older Discord versions still work.',
		],
	},
	{
		version: '0.1.6',
		date: '2026-10-06',
		title: 'Slider cards',
		changes: [
			'Sliders now sit on the same card background as the settings rows around them, with the current value in the row title.',
		],
	},
	{
		version: '0.1.5',
		date: '2026-10-03',
		title: 'Changelog',
		changes: [
			'The clock icon at the top right of the settings shows what changed in every version.',
			'After an update, a short "What\'s new" dialog lists the changes the next time you open the settings.',
		],
	},
	{
		version: '0.1.2',
		date: '2026-09-29',
		title: 'Floating counter',
		changes: [
			'The count sits in a small square above the message box, on the side you choose.',
			'Turns red with how far over the limit you are.',
		],
	},
	{
		version: '0.1.0',
		date: '2026-09-29',
		title: 'First release',
		changes: ['Shows how many characters your message has.'],
	},
]
