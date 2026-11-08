import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.9.6',
		date: '2026-11-08',
		title: 'Fixes',
		changes: [
			'The long-press menu no longer shows some of its rows twice.',
			'Deleting with a swipe or double-tap really deletes the message now. Before, it only vanished on your phone and came back.',
		],
	},
	{
		version: '0.9.5',
		date: '2026-11-08',
		title: 'Rearrange the long-press menu and settings',
		changes: [
			'Edit menu works like Hide Servers: every row shows, hidden ones darkened. Tap a row to hide or show it, hold it and drag it anywhere in the menu, then tap Done.',
			"Discord's settings get the same: tap Edit at the bottom of the settings page, then tap items to hide or show them, hold and drag to move them, and tap Done.",
			'Rows can be dragged into another section too. The row you hold lifts out above everything with a short buzz, an outline and a shadow, and a line shows where it will land.',
			"Back to Discord's order, in UI Tweaks' settings, undoes the moving.",
		],
	},
	{
		version: '0.8.5',
		date: '2026-11-07',
		title: 'Delete tells you why',
		changes: ["If Discord refuses a swipe or double-tap delete, a message now says why instead of the message just staying."],
	},
	{
		version: '0.8.4',
		date: '2026-11-03',
		title: 'Credit',
		changes: ['A small credit line at the bottom of the settings.'],
	},
	{
		version: '0.8.3',
		date: '2026-11-03',
		title: 'Tidier wording',
		changes: ['A shorter plugin description, and "color" spelled the same way everywhere.'],
	},
	{
		version: '0.8.2',
		date: '2026-11-03',
		title: "Other plugins' rows are back",
		changes: ["Rows other plugins add to the long-press menu, like Ghost Log's Local edit, show again. 0.8.1 hid them by accident."],
	},
	{
		version: '0.8.1',
		date: '2026-11-03',
		title: 'Edit menu shows up',
		changes: ["The Edit menu row now appears in the long-press menu. 0.8.0 hooked a part of Discord that this version doesn't use."],
	},
	{
		version: '0.8.0',
		date: '2026-11-03',
		title: 'Edit the menu from the menu',
		changes: [
			'Long-press a message and tap Edit menu at the bottom: every row gets an eye, tap rows to hide or show them, then tap Done.',
			'The emoji row can be hidden from there too.',
			"Don't want the Edit menu row? Turn it off on the Long-press menu page.",
		],
	},
	{
		version: '0.7.1',
		date: '2026-11-03',
		title: 'Long-press +',
		changes: [
			'Hide items in the menu you get by long-pressing + in the message box, including ones other plugins add there, like WordArt and Sekai Stickers.',
		],
	},
	{
		version: '0.7.0',
		date: '2026-11-03',
		title: 'Quests, the + menu and GIFs',
		changes: [
			'Hide Quests: no quest bar, Quests button, quest embeds or Quests settings row. Quests you already started keep going.',
			'Hide any of the buttons in the + menu by the message box: Apps, Thread, Polls, Files or Photos.',
			'Keep the emoji picker open after sending a GIF, to send a few in a row.',
			"New gesture actions: copy the author's user ID, and copy their role color in that server.",
		],
	},
	{
		version: '0.6.1',
		date: '2026-10-31',
		title: 'New actions wired up',
		changes: ["Pin, delete, forward, open profile and new thread call the same functions as the long-press menu's own rows."],
	},
	{
		version: '0.6.0',
		date: '2026-10-31',
		title: 'More gestures, tidier settings',
		changes: [
			"Swipes are set separately for your own messages and everyone else's, like double-tap already was. Your old swipe choices apply to both.",
			'New actions: pin or unpin, forward, copy the link, open the profile, quote, new thread, delete your message (with a confirm), and a second React with its own emoji.',
			'The Gestures page is one row per gesture; tap it to pick what it does.',
			"Each swipe's icon follows the choice for other people's messages when the two differ: the list draws one icon for every row.",
		],
	},
	{
		version: '0.5.0',
		date: '2026-10-26',
		title: 'Double-tap, your way',
		changes: [
			"Double-tap can do anything a swipe can: reply, edit, react, copy, mention, open the menu or mark unread. Pick one for your own messages and one for everyone else's.",
			'Double-tap and swipes now share one Gestures page.',
			"If you had Double-tap to reply on, it carries over: edit your own messages, reply to others'.",
		],
	},
	{
		version: '0.4.12',
		date: '2026-10-26',
		title: 'Valenced',
		changes: ["Ported to Valenced. Settings from Revenge don't carry over."],
	},
	{
		version: '0.4.11',
		date: '2026-10-22',
		title: 'Hide reaction bar fix',
		changes: [
			'Fixed an error on start about MessageAccessibilityActions. Hide reaction bar works again.',
		],
	},
	{
		version: '0.4.10',
		date: '2026-10-22',
		title: 'Discord version limit removed',
		changes: [
			'Installs on any Discord version again. Newer Discord versions have not been tested yet.',
		],
	},
	{
		version: '0.4.9',
		date: '2026-10-22',
		title: 'Discord 352.2',
		changes: ['Also starts on Discord 352.2 (was 351.6 or older).'],
	},
	{
		version: '0.4.8',
		date: '2026-10-21',
		title: 'Discord version limit',
		changes: ["Only starts on Discord 351.6 or older, so a newer Discord build can't break it."],
	},
	{
		version: '0.4.7',
		date: '2026-10-18',
		title: 'One section per plugin',
		changes: [
			"Fixed: the long-press menu settings listed a plugin's rows again for every person, like Veil's \"Blur messages from …\" or Pronouns' show and hide. Each plugin now shows up once, under its name.",
			'Sections already saved the old way are merged the first time the page opens.',
		],
	},
	{
		version: '0.4.6',
		date: '2026-10-18',
		title: 'Swipe icons, natively',
		changes: [
			"The swipe icons follow your chosen actions at last. Discord's list draws them from Android's own icon files, which no JS can change, so UI Tweaks now has a small native part that swaps those icons.",
			"Changing a swipe's action asks for Revenge's reload, since rows already on screen keep their old icon.",
		],
	},
	{
		version: '0.4.3',
		date: '2026-10-17',
		title: 'Swipe icons, for real',
		changes: ['The swipe icons now change: the tweak never reached the part of Discord that builds message rows, because it loads after UI Tweaks starts.'],
	},
	{
		version: '0.4.2',
		date: '2026-10-17',
		title: 'Swipe icons',
		changes: ['The swipe icons match what each swipe does: a reaction, copy, @, menu or unread icon instead of Discord’s reply and pencil.'],
	},
	{
		version: '0.4.0',
		date: '2026-10-16',
		title: 'Swipe actions',
		changes: [
			'Choose what swiping a message does, for the short swipe and the further one: reply, edit, react, copy text, mention, open the menu or mark unread.',
			'Others’ messages can get the further swipe too.',
		],
	},
	{
		version: '0.3.5',
		date: '2026-10-13',
		title: 'Tidy-up',
		changes: ['Errors now show in the Revenge plugin list instead of only the log, and the developer Debug page is gone from normal builds.'],
	},
	{
		version: '0.3.4',
		date: '2026-10-11',
		title: 'Double-tap to reply works again',
		changes: [
			'Discord changed how the chat builds its tap handlers, so the double-tap hook never caught them. It now catches the handlers through a second route, proven on this build.',
		],
	},
	{
		version: '0.3.3',
		date: '2026-10-11',
		title: 'Tweaks that load later work',
		changes: [
			"Double-tap to reply, Hide Message Requests and the picker tabs now reach Discord's code even when it loads after the plugin starts. Before, those switches could silently do nothing.",
		],
	},
	{
		version: '0.3.2',
		date: '2026-10-11',
		title: 'Sections hide the right rows',
		changes: [
			'Hiding a section of the long-press menu (like the Copy Text one) now works on every message. Sections are recognised by their rows instead of their position, which changed on messages without a Reply section.',
			'Sections are now named after their first row, e.g. "Copy Text section".',
			'Long-press a message once to refill the list, then switch your sections off again; hidden rows are kept.',
		],
	},
	{
		version: '0.3.1',
		date: '2026-10-11',
		title: 'Back to the message menu',
		changes: [
			'Hiding in long-press menus is back to the message menu only, the way it worked in 0.2.1. The all-menus version broke it. Your message menu choices carry over.',
			'The GIFs and Stickers tab switches stay.',
		],
	},
	{
		version: '0.3.0',
		date: '2026-10-11',
		title: 'Every long-press menu, picker tabs, double-tap that works',
		changes: [
			'Long-press menus: not just messages. Any menu you long-press open (people, channels, servers, images…) shows up in the list with its own rows, sections and header to hide.',
			'Emoji picker: hide the GIFs tab and/or the Stickers tab.',
			"Double-tap to reply now actually does something: reply on others' messages, edit your own. Restart once after turning it on.",
			'Your Message menu choices from earlier versions carry over.',
		],
	},
	{
		version: '0.2.1',
		date: '2026-10-11',
		title: "Plugins' rows and sections too",
		changes: [
			'Sections that other plugins add to the long-press menu get their own switches, and rows plugins add can be hidden like any other.',
			'Rows whose text changes, such as "Pronouns: she/her", are matched by their name, so hiding one hides it for everyone.',
		],
	},
	{
		version: '0.2.0',
		date: '2026-10-11',
		title: 'Hide anything in the long-press menu and settings',
		changes: [
			'Long-press menu: turn off any row, a whole section, or the emoji row at the top. Rows show up in the list once you have long-pressed a message.',
			"Discord settings: turn off any section or item of Discord's settings page, including ones other plugins add. Revenge and Plugins always stay, so you can get back here.",
			'Hiding rows now actually works; before, nothing was ever hidden. Your old Forward and Mention switches carry over.',
			'Hide Message Requests now finds the button on this Discord version (takes effect after a restart).',
		],
	},
	{
		version: '0.1.1',
		date: '2026-10-11',
		title: 'Finds the modules on 350.4',
		changes: [
			'The module finder now asks Discord directly instead of waiting for a subscription that 350.4 never answers, and the double-tap tweak rides the renderer instead of a class that changed shape.',
		],
	},
	{
		version: '0.1.0',
		date: '2026-10-11',
		title: 'A quieter Discord',
		changes: [
			'Hide the Forward and Mention rows from the message long-press sheet, each on its own switch.',
			'Double-tap a message to reply — or to edit it when it is yours — instead of the default double-tap reaction.',
		],
	},
]
