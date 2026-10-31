import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.3.0',
		date: '2026-10-27',
		title: 'One owner for settings',
		changes: [
			'Needs Discord 350.2 or newer.',
			"Settings are kept by the app side only and handed to native, so the What's new dialog no longer disappears after an update.",
			'If the message box cannot be found on a Discord version, the plugin is disabled with that reason instead of running with nothing hooked.',
		],
	},
	{
		version: '0.2.5',
		date: '2026-10-26',
		title: 'Valenced',
		changes: ["Ported to Valenced. Settings from Revenge don't carry over."],
	},
	{
		version: '0.2.4',
		date: '2026-10-22',
		title: 'Discord version limit removed',
		changes: [
			'Installs on any Discord version again. Newer Discord versions have not been tested yet.',
		],
	},
	{
		version: '0.2.3',
		date: '2026-10-22',
		title: 'Discord 352.2',
		changes: ['Also starts on Discord 352.2 (was 351.6 or older).'],
	},
	{
		version: '0.2.2',
		date: '2026-10-21',
		title: 'Discord version limit',
		changes: [
			"Only starts on Discord 351.6 or older, so a newer Discord build can't break it.",
		],
	},
	{
		version: '0.2.1',
		date: '2026-10-13',
		title: 'ANSI colours',
		changes: [
			'ANSI colour in the selection menu: pick a colour and the text goes into a ```ansi block, coloured for everyone.',
		],
	},
	{
		version: '0.2.0',
		date: '2026-10-13',
		title: 'Format from the selection menu',
		changes: [
			'Select text in the message box to get Bold, Italic, Underline, Strikethrough, Spoiler, Code, Code block, Link, headings, Subtext and Quote next to Copy and Paste. Tap one again to undo it.',
			'Choose which ones show in settings.',
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
		title: 'Vector fix',
		changes: [
			'Works on JingMatrix Vector and LSPosed with API obfuscation, where it failed to load.',
		],
	},
	{
		version: '0.1.1',
		date: '2026-10-03',
		title: 'Changelog',
		changes: [
			'The clock icon at the top right of the settings shows what changed in every version.',
			"Settings are kept by the app side only and handed to native, so the What's new dialog no longer disappears after an update.",
		],
	},
	{
		version: '0.1.0',
		date: '2026-10-01',
		title: 'First release',
		changes: ['Bold, italics, code, spoilers and more are styled as you type.'],
	},
]
