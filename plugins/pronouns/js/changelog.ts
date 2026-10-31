import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.5.2',
		date: '2026-10-31',
		title: 'Stops cleanly',
		changes: [
			'Turning the plugin off while a PronounDB lookup is in progress no longer lets a later batch run.',
		],
	},
	{
		version: '0.5.1',
		date: '2026-10-30',
		title: 'Links stay links',
		changes: [
			'A message that is only a link keeps its blue, tappable link when a pronoun badge appears on it.',
		],
	},
	{
		version: '0.5.0',
		date: '2026-10-27',
		title: 'Only real pronouns by default',
		changes: [
			'"Only real pronouns" is now on for everyone, including people who had the plugin before: bios, ages and jokes in the pronouns field no longer show as a badge. Turn it back off under Pronoun sources if you want the whole field.',
			'Switching the plugin on from the plugin list no longer asks for a reload.',
			'Needs Discord 350.4 or newer, which is what it is tested on.',
			'Switching the plugin off stops any PronounDB request still in flight, and the lookup cache no longer grows without limit.',
		],
	},
	{
		version: '0.4.10',
		date: '2026-10-26',
		title: 'No more blank badges',
		changes: [
			'Pronouns that are only spaces or invisible characters (like ㅤ) no longer show an empty badge.',
			'Extra spaces around and inside pronouns are trimmed.',
			"A server profile with blank pronouns now falls back to the account's pronouns.",
		],
	},
	{
		version: '0.4.9',
		date: '2026-10-26',
		title: 'Valenced',
		changes: ["Ported to Valenced. Settings from Revenge don't carry over."],
	},
	{
		version: '0.4.8',
		date: '2026-10-23',
		title: 'Discord version limit removed',
		changes: ['Installs on any Discord version again.'],
	},
	{
		version: '0.4.7',
		date: '2026-10-22',
		title: 'Discord 352.2',
		changes: ['Also starts on Discord 352.2 (was 351.6 or older).'],
	},
	{
		version: '0.4.6',
		date: '2026-10-21',
		title: 'Discord version limit',
		changes: [
			"Only starts on Discord 351.6 or older, so a newer Discord build can't break it.",
		],
	},
	{
		version: '0.4.5',
		date: '2026-10-18',
		title: 'Badges load on their own again',
		changes: [
			"Fixed badges only showing after you opened someone's profile: one profile request that never answered stalled every other one for the rest of the session. Requests now time out and retry.",
			'Badges in a busy channel load several times faster: three profiles load at once, newest messages first.',
		],
	},
	{
		version: '0.4.4',
		date: '2026-10-18',
		title: 'Account pronouns in servers',
		changes: [
			"In servers, pronouns set on someone's account now show when their server profile has none. Before, a loaded server profile stopped the account profile from ever being fetched, which hid your own pronouns too.",
		],
	},
	{
		version: '0.4.3',
		date: '2026-10-18',
		title: 'Better at spotting real pronouns',
		changes: [
			'"Only real pronouns" now knows which pronoun words are also everyday words or parts of names (shi, ki, kit, fox, star, cat, one, her, his, it and more). On their own or inside a name they no longer make a badge; written as a set like it/its, cat/cats or shi/hir they still do.',
			'Slashes written as \\ or other slash-like characters count, so she\\her shows as she/her.',
			'Brackets and "but" no longer hide the pronouns before them: "any (ask)" shows any.',
			'With any/all turned off, he/any still shows he.',
			'PronounDB answers are no longer run through the name check, so its "it" still shows.',
		],
	},
	{
		version: '0.4.2',
		date: '2026-10-18',
		title: 'Names are not pronouns',
		changes: [
			'"Only real pronouns" no longer picks a pronoun word out of a name or sentence: "Emperor Shi Hao" shows no badge instead of "Shi". Sets written with a slash, like he/him, still count anywhere in the field.',
		],
	},
	{
		version: '0.4.1',
		date: '2026-10-15',
		title: 'Settings that fit in',
		changes: [
			'A shorter settings index with People, Pronoun sources and Badge colour pages.',
			'Person entries now reveal separate edit, refresh and confirmed removal actions.',
			'Colour editors identify the global colour, default colour and selected person. Adding an existing person preserves their colour.',
		],
	},
	{
		version: '0.4.0',
		date: '2026-10-15',
		title: 'People and colour pages, PronounDB toggle',
		changes: [
			'Whose pronouns show, the lists, and pronouns you set now live on their own People page.',
			'Badge colour now has its own page too, with a new choice: one colour for everyone, or a colour per person with a default for everyone else.',
			'New "Also check PronounDB" switch turns pronoundb.org lookups off entirely, so nothing is sent there if you only want Discord\'s own pronouns.',
			'A pronouns-you-set entry can now be edited in place instead of only cleared and redone.',
			'Look up again on the People page re-asks PronounDB for the people on your list, skipping the cache.',
		],
	},
	{
		version: '0.3.2',
		date: '2026-10-14',
		title: 'Discord 351.2',
		changes: [
			'Fixed a "profile store found but unusable" error on Discord 351.2: Pronouns now tries again instead of giving up for the session, and only reports an error if Discord’s pronouns still can’t be read.',
		],
	},
	{
		version: '0.3.1',
		date: '2026-10-13',
		title: 'Badge colour',
		changes: [
			'Pick the badge colour in settings, or have it match each person’s role colour in servers.',
			'The Try it box is gone.',
		],
	},
	{
		version: '0.3.0',
		date: '2026-10-13',
		title: 'Cleaner pronouns, lists that stick',
		changes: [
			'New Only real pronouns setting: shows just the pronouns from a profile and hides bios, ages and jokes. Neopronouns count, Any and All are your choice, and you can allow extra words.',
			'Show and hide lists now save properly, even if you change them before restarting Discord.',
			'Lists show each person’s pronouns, you can add people by user ID, and clear a list in one go.',
			'Pronouns you set yourself are listed in settings, where you can clear them.',
		],
	},
	{
		version: '0.2.4',
		date: '2026-10-13',
		title: 'False error',
		changes: [
			'No more "profile store found but unusable" error in the Revenge plugin list. Nothing was actually wrong.',
		],
	},
	{
		version: '0.2.3',
		date: '2026-10-13',
		title: 'Tidy-up',
		changes: [
			'Errors now show in the Revenge plugin list instead of only the log, and the developer Debug page is gone from normal builds.',
		],
	},
	{
		version: '0.2.2',
		date: '2026-10-13',
		title: 'Discord 350.4',
		changes: [
			'Pop-up messages work on Discord 350.4. Before, showing one could crash Discord.',
		],
	},
	{
		version: '0.2.1',
		date: '2026-10-11',
		title: 'Pronouns load on their own',
		changes: [
			"Server pronouns now load without opening the person's profile.",
			'A badge that had to wait for its data no longer gets stuck without one, and a server pronoun replaces the profile one as soon as it arrives.',
			'A failed lookup is tried again instead of being treated as "no pronouns" for an hour.',
		],
	},
	{
		version: '0.2.0',
		date: '2026-10-11',
		title: 'Pick whose pronouns show',
		changes: [
			'Choose Everyone, Only people I pick, or Everyone except people I hide in settings.',
			'Long-press a message and choose Show their pronouns or Hide their pronouns to add someone; tap them in settings to remove them.',
			'Setting your own pronouns for someone now updates badges that were already showing.',
		],
	},
	{
		version: '0.1.1',
		date: '2026-10-11',
		title: 'Badges appear on their own',
		changes: [
			'Pronouns now show up without opening anyone’s profile first: the message cache and profile store are found on Discord 350.4, and fetched results redraw the waiting rows.',
		],
	},
	{
		version: '0.1.0',
		date: '2026-10-11',
		title: 'Pronouns in chat',
		changes: [
			"A person's pronouns show as a small tag next to their name in chat, from their Discord profile when they set them and from PronounDB otherwise.",
			'Long-press a message and choose Pronouns… to set your own for that person, or clear one.',
		],
	},
]
