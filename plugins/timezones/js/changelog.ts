import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.2.2',
		date: '2026-10-28',
		title: 'Bazinga Plugins',
		changes: ['Now published from the Bazinga Plugins repository.'],
	},
	{
		version: '0.2.1',
		date: '2026-10-26',
		title: 'Valenced',
		changes: ["Ported to Valenced. Settings from Revenge don't carry over."],
	},
	{
		version: '0.2.0',
		date: '2026-10-25',
		title: 'Search any country or city',
		changes: [
			'Type a country (Kenya, UK, New Zealand) to get its timezones, even offline.',
			'Every timezone is searchable now, by city, region (Indiana) or old name (Calcutta).',
			'Any town or city works too, found online through Open-Meteo. Turn it off under Lookups.',
			'The place you pick is saved and shown, like "Mombasa, Kenya".',
		],
	},
	{
		version: '0.1.3',
		date: '2026-10-23',
		title: 'Discord version limit removed',
		changes: ['Installs on any Discord version again.'],
	},
	{
		version: '0.1.2',
		date: '2026-10-22',
		title: 'Discord 352.2',
		changes: ['Also starts on Discord 352.2 (was 351.6 or older).'],
	},
	{
		version: '0.1.1',
		date: '2026-10-21',
		title: 'Discord version limit',
		changes: ["Only starts on Discord 351.6 or older, so a newer Discord build can't break it."],
	},
	{
		version: '0.1.0',
		date: '2026-10-15',
		title: 'First version',
		changes: [
			"Set someone's timezone from the message long-press menu or settings.",
			'Their local time shows after the timestamp on their messages, with their weekday when it differs.',
			"People you haven't set can come from the shared timezone list, which you can turn off.",
		],
	},
]
