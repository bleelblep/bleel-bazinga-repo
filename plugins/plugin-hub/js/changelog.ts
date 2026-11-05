import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.7.15',
		date: '2026-11-05',
		title: 'Tidier stop',
		changes: ['A Hub page left open after the plugin is switched off no longer saves changes.'],
	},
	{
		version: '0.7.14',
		date: '2026-10-26',
		title: 'Valenced',
		changes: ["Ported to Valenced. Settings from Revenge don't carry over."],
	},
	{
		version: '0.7.13',
		date: '2026-10-23',
		title: 'Discord version limit removed',
		changes: ['Installs on any Discord version again.'],
	},
	{
		version: '0.7.12',
		date: '2026-10-22',
		title: 'Discord 352.2',
		changes: ['Also starts on Discord 352.2 (was 351.6 or older).'],
	},
	{
		version: '0.7.11',
		date: '2026-10-21',
		title: 'Discord version limit',
		changes: ["Only starts on Discord 351.6 or older, so a newer Discord build can't break it."],
	},
	{
		version: '0.7.10',
		date: '2026-10-13',
		title: 'Tidy-up',
		changes: ['Errors now show in the Revenge plugin list instead of only the log, and the developer Debug page is gone from normal builds.'],
	},
	{
		version: '0.7.9',
		date: '2026-10-13',
		title: 'Discord 350.4',
		changes: ['Pop-up messages work on Discord 350.4. Before, showing one could crash Discord.'],
	},
	{
		version: '0.7.8',
		date: '2026-10-03',
		title: 'Settings placement',
		changes: [
			"Plugin Hub sits below Cloud Backup in Discord's settings when both are installed.",
		],
	},
	{
		version: '0.7.7',
		date: '2026-10-03',
		title: 'Changelog',
		changes: [
			'The clock icon at the top right of the settings shows what changed in every version.',
			'After an update, a short "What\'s new" dialog lists the changes the next time you open the settings.',
		],
	},
	{
		version: '0.7.6',
		date: '2026-10-03',
		title: 'Own settings section',
		changes: [
			'Plugin Hub has its own section in Discord\'s settings.',
			'AI Core info on the AI Hub, and groups you can collapse.',
		],
	},
	{
		version: '0.7.0',
		date: '2026-09-27',
		title: 'Plugin Doctor moved out',
		changes: [
			'Plugin Doctor became its own plugin, Diagnostics.',
		],
	},
	{
		version: '0.5.1',
		date: '2026-09-26',
		title: 'Plugin Doctor',
		changes: [
			'Plugin Doctor, and plugins with optional AI show on both hubs.',
		],
	},
	{
		version: '0.2.6',
		date: '2026-09-22',
		title: 'Hub and AI Hub',
		changes: [
			'Hub and AI Hub rows in their own section below Revenge.',
		],
	},
	{
		version: '0.2.1',
		date: '2026-09-22',
		title: 'First release',
		changes: [
			'Shortcuts into the plugins you choose, in four layouts.',
		],
	},
]
