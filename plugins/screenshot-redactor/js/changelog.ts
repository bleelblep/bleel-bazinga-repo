import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.27.17',
		date: '2026-11-17',
		title: 'On Bazinga',
		changes: [
			'Now available from the Bazinga plugin repository.',
			'A small credit line at the foot of the settings page.',
		],
	},
	{
		version: '0.27.16',
		date: '2026-11-13',
		title: 'Safer nicknames, honest status',
		changes: [
			'People without a friend nickname no longer appear to have one. Server and other nickname lookups are left alone, and saving a placeholder as a nickname is blocked: the real nickname is kept.',
			'"Names hidden" only shows when the hooks actually worked. Otherwise it says what is not hidden on this Discord version, here and in Settings.',
			'Card numbers whose digits add up to exactly 100 (about 1 in 30) are now blanked.',
			'Pickers for choosing people (adding to a group, sending to someone) keep real names.',
			'No more fake "message edited" events to repaint the chat. If a chat cannot be repainted, the toast says to reopen it.',
			'One chat list failing to repaint no longer stops the rest, and old chat lists are forgotten.',
			'Less work while redaction is off, and nothing keeps running after the plugin stops.',
			'Badge hiding is now off by default, as the settings always said.',
		],
	},
	{
		version: '0.27.15',
		date: '2026-10-26',
		title: 'Valenced',
		changes: ["Ported to Valenced. Settings from Revenge don't carry over."],
	},
	{
		version: '0.27.14',
		date: '2026-10-23',
		title: 'Discord version limit removed',
		changes: ['Installs on any Discord version again.'],
	},
	{
		version: '0.27.13',
		date: '2026-10-22',
		title: 'Discord 352.2',
		changes: ['Also starts on Discord 352.2 (was 351.6 or older).'],
	},
	{
		version: '0.27.12',
		date: '2026-10-21',
		title: 'Discord version limit',
		changes: [
			"Only starts on Discord 351.6 or older, so a newer Discord build can't break it.",
		],
	},
	{
		version: '0.27.11',
		date: '2026-10-13',
		title: 'Tidy-up',
		changes: [
			'Errors now show in the Revenge plugin list instead of only the log, and the developer Debug page is gone from normal builds.',
		],
	},
	{
		version: '0.27.10',
		date: '2026-10-13',
		title: 'Discord 350.4',
		changes: [
			'Pop-up messages work on Discord 350.4. Before, showing one could crash Discord.',
		],
	},
	{
		version: '0.27.9',
		date: '2026-10-05',
		title: 'Menu placement and redaction refresh',
		changes: [
			'Keep the redaction toggle inside the message menu instead of beneath the status bar.',
			'Improve name restoration and refresh redaction consistently across user surfaces.',
			'Available through the regular update channel.',
		],
	},
	{
		version: '0.27.9-beta4',
		date: '2026-10-05',
		title: 'Message menu placement',
		changes: [
			'Keep the redaction toggle inside the message menu on Discord builds with unnamed components, instead of beneath the status bar.',
		],
	},
	{
		version: '0.27.9-beta3',
		date: '2026-10-04',
		title: 'Restore DM names',
		changes: [
			'Generate original chat rows with real name resolution before saving them for restoration.',
			'Redact a private outgoing row instead of the producer’s cached result, preventing saved placeholders from returning when redaction is switched off.',
		],
	},
	{
		version: '0.27.9-beta2',
		date: '2026-10-04',
		title: 'Refresh lifecycle',
		changes: [
			'Redaction settings now share one refresh subscription, including changes made outside the settings screen.',
			'Queued refreshes are coalesced and cancelled when an explicit refresh runs or the plugin stops.',
			'Corrected native forceReload handling: it refreshes views without discarding the mirrored row list.',
		],
	},
	{
		version: '0.27.9-beta1',
		date: '2026-10-04',
		title: 'Identity surfaces and refresh',
		changes: [
			'Member and reaction rows now redact at their presentation boundary, including precomputed nicknames and secondary usernames.',
			'Member rows, reaction rows, shared user avatars and unnamed group DM titles subscribe to redaction changes.',
			'Fixed missed default-export resolvers and mutations of cached reply previews and chat options; settings changes share one refresh subscription.',
		],
	},
	{
		version: '0.27.8',
		date: '2026-10-03',
		title: 'Changelog',
		changes: [
			'The clock icon at the top right of the settings shows what changed in every version.',
			'After an update, a short "What\'s new" dialog lists the changes the next time you open the settings.',
		],
	},
	{
		version: '0.27.7',
		date: '2026-10-03',
		title: 'Group DM titles',
		changes: [
			'Group DM titles are redacted, and original names are kept so they come back.',
		],
	},
	{
		version: '0.27.0',
		date: '2026-09-22',
		title: 'Personal details',
		changes: ['Personal details typed into messages are redacted too.'],
	},
]
