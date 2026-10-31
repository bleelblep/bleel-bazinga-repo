import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.4.13',
		date: '2026-10-30',
		title: 'Pages show again',
		changes: [
			'Pages load into the Web tab again instead of leaving it blank, after Valenced started installing as its own app.',
			'Needs Valenced 1.2.4 or newer: 1.2.3 never hands plugins the app screen, so the page has nowhere to go.',
		],
	},
	{
		version: '0.4.10',
		date: '2026-10-26',
		title: 'Valenced',
		changes: ["Ported to Valenced. Settings from Revenge don't carry over."],
	},
	{
		version: '0.4.9',
		date: '2026-10-22',
		title: 'Discord version limit removed',
		changes: [
			'Installs on any Discord version again. Newer Discord versions have not been tested yet.',
		],
	},
	{
		version: '0.4.8',
		date: '2026-10-22',
		title: 'Discord 352.2',
		changes: [
			"Page scripts (like background play) run on Discord 352.2 again. The plugin now carries its own copy of the WebView library.",
		],
	},
	{
		version: '0.4.7',
		date: '2026-10-21',
		title: 'Discord version limit',
		changes: ["Only starts on Discord 351.6 or older, so a newer Discord build can't break it."],
	},
	{
		version: '0.4.6',
		date: '2026-10-20',
		title: '⋮ menu in the half sheet, properly',
		changes: ['With the picker half open, the ⋮ menu opens above the button on the first tap, not only from the second.'],
	},
	{
		version: '0.4.5',
		date: '2026-10-20',
		title: 'Tidier ⋮ menu',
		changes: [
			'The ⋮ menu is the same width on every page; long page titles are shortened with "…".',
			'With the picker half open, the ⋮ menu opens above the button instead of being cut off.',
		],
	},
	{
		version: '0.4.4',
		date: '2026-10-19',
		title: 'Rounder page corners',
		changes: ["The page's top corners are rounded to match the address bar and tabs."],
	},
	{
		version: '0.4.2',
		date: '2026-10-19',
		title: 'A proper ⋮ menu',
		changes: ["The ⋮ button opens Discord's own menu right under it, with icons and sections, instead of a pop-up dialog in the middle of the screen."],
	},
	{
		version: '0.4.1',
		date: '2026-10-18',
		title: 'Sharing pictures to the chat',
		changes: ["Share to chat and Share image to chat work without opening the photo picker first, on any Discord version (\"Discord's upload functions weren't found\")."],
	},
	{
		version: '0.4.0',
		date: '2026-10-17',
		title: 'Hold menu, dark pages and fullscreen',
		changes: [
			'Hold a link or picture on a page for a menu: open it in a new or private tab, add it to your message, copy it, save the picture, or share it to the chat.',
			'Dark pages (Settings > Pages) draws light sites dark, and Text size makes page text bigger or smaller.',
			"Videos' fullscreen button works. Back leaves fullscreen.",
			"Android's Back goes back in the page (or closes History, Downloads and Find) instead of closing the picker.",
			'A page that fails to load, or crashes, shows an error page with Try again. A crashed page no longer takes Discord down with it.',
			'The ⋮ menu has a row of quick buttons (Bookmark, Share, Find, Copy link) above a shorter list.',
			'Site icons in the tab row and speed dial, saved on your phone instead of fetched from DuckDuckGo.',
			'History has a search box and is grouped by day.',
			'A padlock or warning in the address bar instead of the 🔒 emoji, and swiping between tabs says which tab you landed on.',
			"Clear cookies and site data no longer signs Vencord Tab out, and closing a private tab no longer empties every tab's cache.",
			'Pop-ups and location requests are mentioned once per page or site instead of every time.',
		],
	},
	{
		version: '0.3.11',
		date: '2026-10-13',
		title: 'Videos in the half-open picker',
		changes: ['A video keeps playing when you drop the picker to half height. While something plays, the page keeps its size and is cut off at the edge instead of shrinking, which made YouTube pause.'],
	},
	{
		version: '0.3.10',
		date: '2026-10-13',
		title: 'Smooth background play',
		changes: ['Background play no longer stutters: the page keeps its real size while it plays out of sight, so YouTube stops pausing every moment.'],
	},
	{
		version: '0.3.9',
		date: '2026-10-13',
		title: 'Diagnostics',
		changes: ['Records what video players do (play, pause, buffering) to track down pauses and stutter.'],
	},
	{
		version: '0.3.8',
		date: '2026-10-13',
		title: 'Half-open picker, take two',
		changes: ['Videos keep playing when Discord rearranges the half-open picker on its own, not just when Pocket Browser moves the page.'],
	},
	{
		version: '0.3.7',
		date: '2026-10-13',
		title: 'Videos keep playing in the half-open picker',
		changes: ['YouTube and other players no longer pause when the picker is half open: moving the page around inside the picker no longer looks like leaving it.'],
	},
	{
		version: '0.3.6',
		date: '2026-10-13',
		title: 'Diagnostics',
		changes: ['Keeps a short log of what the browser window does, to track down videos pausing in the half-open picker.'],
	},
	{
		version: '0.3.5',
		date: '2026-10-13',
		title: 'YouTube plays again',
		changes: ['YouTube no longer pauses itself straight away with Keep playing when closed on. Background play now only steps in once you leave the page.'],
	},
	{
		version: '0.3.4',
		date: '2026-10-13',
		title: 'Screenshots on Discord 351',
		changes: ['Share to chat with a screenshot works without opening the photo picker first on Discord 351.0.'],
	},
	{
		version: '0.3.3',
		date: '2026-10-13',
		title: 'YouTube pop-out, menu choices',
		changes: [
			'Popped-out YouTube videos play instead of showing a YouTube error. If a video still refuses to be embedded, the pop-out opens its YouTube page instead.',
			'Settings > Menu: choose which items the ⋮ menu shows.',
		],
	},
	{
		version: '0.3.2',
		date: '2026-10-13',
		title: 'Screenshots that send',
		changes: [
			'Share to chat with a screenshot now really adds it to your message, like picking a photo: it sends with the message, or remove it before sending.',
			'Screenshots no longer go to your gallery. They are kept privately and deleted automatically afterwards.',
		],
	},
	{
		version: '0.3.1',
		date: '2026-10-13',
		title: 'Screenshot fix',
		changes: ['Share to chat with a screenshot now attaches it to the chat you have open.'],
	},
	{
		version: '0.3.0',
		date: '2026-10-13',
		title: 'Pop-out player, find, downloads, share',
		changes: [
			'Pop Out Player is now part of Pocket Browser: the pop-out button in the media viewer, and ⋮ → Pop out video for the page you are on. Uninstall Pop Out Player.',
			'YouTube keeps playing in the background when Keep playing when closed is on.',
			'⋮ → Find in page, Downloads (open, copy or delete what you downloaded) and Share to chat (the link, a screenshot, or both).',
			'Swipe the toolbar to switch tabs, and a speed dial of site tiles for your bookmarks. Both can be turned off in settings.',
		],
	},
	{
		version: '0.2.0',
		date: '2026-10-13',
		title: 'Fewer tabs, background play',
		changes: [
			'New setting, Pages can open new tabs: turn it off and links a site opens in a new window load in the tab you are on instead.',
			'Keep playing when closed now actually keeps music and videos going after you close the picker or leave Discord.',
		],
	},
	{
		version: '0.1.9',
		date: '2026-10-13',
		title: 'Start page, bookmarks, private tabs',
		changes: [
			'New tabs open a start page with your bookmarks and recent pages. Bookmark a page from the ⋮ menu; hold a bookmark to rename or remove it.',
			'Private tabs (⋮ menu, or hold +): not saved to History and gone when you close them. Sign-ins are shared with your other tabs.',
			'Hold a tab to duplicate it, copy or bookmark its link, or close the others. Hold a History entry for more instead of deleting it.',
			'Upload buttons on websites now open the file picker, and sites can ask to use your camera or microphone.',
			'Downloads save straight to your Downloads folder, signed in, instead of opening another browser.',
			'Google and other sites that refuse in-app browsers now let you sign in more often.',
			'New setting: keep music and videos playing after you close the picker.',
			'Fixes: the picker kept expanding for the keyboard only until Discord rebuilt its screen; links opened in a new tab loaded twice; Back looked available on restored tabs; Android 10 and older thought the keyboard was always open; messages now use Discord toasts.',
		],
	},
	{
		version: '0.1.7',
		date: '2026-10-13',
		title: 'Tidy-up',
		changes: ['Errors now show in the Revenge plugin list instead of only the log, and the developer Debug page is gone from normal builds.'],
	},
	{
		version: '0.1.6',
		date: '2026-10-11',
		title: 'Expanding actually works',
		changes: ['The picker now really fills the screen when a page opens the keyboard. 0.1.5 never managed to on this Discord version.'],
	},
	{
		version: '0.1.5',
		date: '2026-10-11',
		title: 'The picker expands for the keyboard',
		changes: [
			'Typing in a page no longer hides the browser behind the keyboard: the picker fills the screen while it is open, and returns to its height after.',
		],
	},
	{
		version: '0.1.4',
		date: '2026-10-11',
		title: 'The page survives the keyboard',
		changes: ['Opening the keyboard in the half-open picker no longer makes the page disappear.'],
	},
	{
		version: '0.1.3',
		date: '2026-10-11',
		title: 'Links open on the Web tab',
		changes: ['A tapped link now opens the picker on the Web tab instead of Emoji.'],
	},
	{
		version: '0.1.2',
		date: '2026-10-11',
		title: 'Links from chats',
		changes: [
			"Open links here now works for links tapped in chat messages. Masked links still show Discord's own check before you leave.",
		],
	},
	{
		version: '0.1.0',
		date: '2026-10-11',
		title: 'First version',
		changes: [
			'A Web tab in the emoji, GIF and sticker picker: a browser with tabs, back and forward, and History.',
			'Pages keep running when you close the picker, and your tabs come back after closing Discord.',
			'Optional: open web links you tap in chats in the Web tab.',
		],
	},
]
