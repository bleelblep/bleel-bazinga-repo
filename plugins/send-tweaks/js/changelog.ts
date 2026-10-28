import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every public version gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '1.0.15',
		date: '2026-10-28',
		title: 'Live rules apply once',
		changes: ['A rule set to apply while typing no longer runs twice on send ("lol" to "lol 😂" sent "lol 😂 😂").'],
	},
	{
		version: '1.0.14',
		date: '2026-10-28',
		title: 'Bazinga Plugins',
		changes: ['Now published from the Bazinga Plugins repository.'],
	},
	{
		version: '1.0.13',
		date: '2026-10-27',
		title: 'One switch for live replace',
		changes: [
			'The Replace as you type switch in Settings is gone. A rule set to "Apply directly while typing" now works on its own.',
			'Replacement rules can always be opened, even with Replace text as you send off.',
		],
	},
	{
		version: '1.0.12',
		date: '2026-10-27',
		title: 'Instagram share links',
		changes: ["Instagram links lose the newer 'vrfl' share tag too."],
	},
	{
		version: '1.0.11',
		date: '2026-10-27',
		title: 'Restyle removed',
		changes: [
			'Restyle, switched off since 0.8.2, is gone for good. Styles you had saved are no longer used.',
			'Switching the plugin on from the plugin list no longer asks for a reload.',
		],
	},
	{
		version: '1.0.10',
		date: '2026-10-26',
		title: 'Valenced',
		changes: ["Ported to Valenced. Settings from Revenge don't carry over."],
	},
	{
		version: '1.0.9',
		date: '2026-10-22',
		title: 'Any Discord version',
		changes: [
			'No Discord version limit any more. On Discord 352.2 you still need Revenge 1.9.1 or newer.',
		],
	},
	{
		version: '1.0.8',
		date: '2026-10-22',
		title: 'Discord 352.2',
		changes: ['Also starts on Discord 352.2 (was 351.6 or older).'],
	},
	{
		version: '1.0.7',
		date: '2026-10-21',
		title: 'Discord version limit',
		changes: [
			"Only starts on Discord 351.6 or older, so a newer Discord build can't break it.",
		],
	},
	{
		version: '1.0.6',
		date: '2026-10-18',
		title: 'Easier rule import',
		changes: [
			'Rules with capitalised keys import now, like "Match" and "Replace".',
			'A regex pasted with single backslashes imports as written, like \\. in a link pattern, instead of failing as broken JSON.',
		],
	},
	{
		version: '1.0.5',
		date: '2026-10-18',
		title: 'Rules keep your capitals',
		changes: [
			'Fixed: capitals were lost. Polish wording capitalised a word, then a rule replaced it in lower case, so "Omw" became "on my way". Polish now runs after your rules.',
			'Rules with Match case off follow how you typed: "Omw" gives "On my way" and "OMW" gives "ON MY WAY". Replacements with emoji, links or markdown are left exactly as written.',
			'Ready-made link rules checked again; all still work. New: TikTok to tnktok, Instagram to oginstagram, Bluesky to bskx and pixiv to phixiv.',
		],
	},
	{
		version: '1.0.4',
		date: '2026-10-18',
		title: 'Round send button',
		changes: [
			'With Fuck Squares drawing the send button as a circle, the swipe capsule is round to match.',
		],
	},
	{
		version: '1.0.2',
		date: '2026-10-17',
		title: 'Rules for chosen servers',
		changes: [
			'New: Only in these servers. Pick servers in a rule and it only works there; with none picked it works everywhere.',
			'Removed different Replace with text per server.',
		],
	},
	{
		version: '1.0.1',
		date: '2026-10-14',
		title: 'Per-rule live replace, import and export',
		changes: [
			'Choose which rules replace while typing: each rule now has its own switch so you decide if it expands in the chat box right away or waits until you send.',
			'Added export option and moved import & export to its own dedicated page.',
			'Patched a few things which can make things feel choppy while typing and interacting in plugin settings.',
		],
	},
	{
		version: '0.9.2',
		date: '2026-10-13',
		title: 'Tidy-up',
		changes: [
			'Errors now show in the Revenge plugin list instead of only the log, and the developer Debug page is gone from normal builds.',
		],
	},
	{
		version: '0.9.1',
		date: '2026-10-13',
		title: 'Discord 350.4',
		changes: [
			'Pop-up messages work on Discord 350.4. Before, showing one could crash Discord.',
		],
	},
	{
		version: '0.9.0',
		date: '2026-10-11',
		title: 'Replace as you type',
		changes: [
			'New in Options: Replace as you type. Your text and link rules run on each word as you finish it, so you see the result in the message box before sending. Off until you turn it on.',
			'Rules with placeholders, random picks or ^ and $ still run when you send, as before.',
		],
	},
	{
		version: '0.8.5',
		date: '2026-10-09',
		title: 'Small improvements',
		changes: ['More small improvements to replacement rules.'],
	},
	{
		version: '0.8.4',
		date: '2026-10-09',
		title: 'Small improvements',
		changes: ['Small improvements to replacement rules.'],
	},
	{
		version: '0.8.3',
		date: '2026-10-09',
		title: 'Works on Discord 350.2',
		changes: [
			"Fixed hold-and-swipe, Preview and Tap send to preview doing nothing on Discord 350.2 alpha, which rebuilt the chat bar's buttons. Older Discord versions still work.",
		],
	},
	{
		version: '0.8.2',
		date: '2026-10-08',
		title: 'Preview without holding send',
		changes: [
			"New in Settings: Tap send to preview. Tapping send shows the preview first, for anyone who can't hold and swipe. Empty messages and / commands still send straight away.",
			"If your phone doesn't report the swipe, holding send now opens the preview right away instead of doing nothing.",
			'Restyle is switched off for now while the preview is fixed up.',
		],
	},
	{
		version: '0.8.1',
		date: '2026-10-07',
		title: 'Better styles, all off to start',
		changes: [
			'Every built-in style now has a fuller prompt with rules and an example, so uwu, Elmer Fudd and the rest come out more consistent.',
			'New built-in styles: Gen Z, Cowboy, Caveman, Overly dramatic, Corporate, Haiku, Knight and Cat.',
			'Built-in styles start switched off. Turn on the ones you want in Styles; only those, and your own, appear in Restyle.',
		],
	},
	{
		version: '0.8.0',
		date: '2026-10-07',
		title: 'Polish wording and Restyle',
		changes: [
			"Polish wording, in Settings: adds missing apostrophes (dont → don't), capitalises sentences and i, and can end messages with a full stop. Off until you turn it on; links, mentions and code are never touched.",
			'Restyle, in the swipe-up Preview: rewrite a message as uwu, Elmer Fudd, a pirate, Shakespeare, Yoda, very formal, shorter or with fixed grammar, through AI Core. You see the result before anything is sent.',
			'Pig Latin works on your phone, with no AI Core needed.',
			"A new Styles page to try every style, hide the ones you don't use, and write your own, with ideas to start from.",
		],
	},
	{
		version: '0.7.5',
		date: '2026-10-06',
		title: 'No more crashes from settings pages',
		changes: [
			"Fixed Discord closing when a Send Tweaks page couldn't load Discord's own row components. Text fields now fall back to a plainer look instead.",
			'If a Send Tweaks page fails to draw, it now says so and shows the error instead of closing Discord.',
		],
	},
	{
		version: '0.7.4',
		date: '2026-10-05',
		title: 'Release notes for the PR update',
		changes: [
			'Added the missing release notes and contributor credit for the 0.7.3 update.',
		],
	},
	{
		version: '0.7.3',
		date: '2026-10-05',
		title: 'Timestamps, rainbow text and rule imports',
		changes: [
			'Added timestamp expansion in outgoing messages and rainbow ANSI text formatting. Gradient is an alias for the same rainbow effect.',
			'Improved ANSI escape-code handling and recognition of pasted or embedded JSON rules in the rule creator.',
			"Added support for kmio's ToastsAPI when available, with a native toast fallback.",
			'Combined the PR changes with the existing editor tools and consolidated clipboard importing into one action.',
			'Thanks to @everestmcarthur (Rosie Val) for PR #9: https://github.com/bleelblep/revenge-next-plugins/pull/9.',
		],
	},
	{
		version: '0.7.2',
		date: '2026-10-05',
		title: 'A clearer editing flow',
		changes: [
			'Reorganized editor assistance around individual tasks, with shorter labels and examples.',
			'Added confirmation before deleting saved reusable text.',
		],
	},
	{
		version: '0.7.1',
		date: '2026-10-05',
		title: 'More room to edit',
		changes: [
			'Moved extended editor assistance out of a crowded dialog into focused screens.',
		],
	},
	{
		version: '0.7.0',
		date: '2026-10-05',
		title: 'Preview checks',
		changes: [
			'Added advisory checks for incomplete formatting and unavailable information in previews. Sending remains under your control.',
		],
	},
	{
		version: '0.6.2',
		date: '2026-10-05',
		title: 'Formatting consistency',
		changes: [
			'Expanded internal formatting support and added regression checks for generated date and time text.',
		],
	},
	{
		version: '0.6.1',
		date: '2026-10-05',
		title: 'Release notes cleanup',
		changes: [
			'Revised the editor help wording and kept release notes focused on general changes.',
		],
	},
	{
		version: '0.6.0',
		date: '2026-10-05',
		title: 'Preview continuity',
		changes: [
			'Improved how generated replacement text carries through from Preview to Send.',
		],
	},
	{
		version: '0.5.21',
		date: '2026-10-05',
		title: 'Local JSON rules in the rule creator',
		changes: [
			'The AI rule creator now accepts a JSON rule with find and replace fields locally, without an AI call.',
			'Thanks to @everestmcarthur (Rosie Val) for PR #8: https://github.com/bleelblep/revenge-next-plugins/pull/8.',
		],
	},
	{
		version: '0.5.20',
		date: '2026-10-05',
		title: 'Import rule JSON',
		changes: [
			'Use a multiline text area for rule imports and add Import from clipboard for complete JSON batches.',
			'Explain empty, missing, and incomplete JSON instead of reporting every incomplete block as no rule found.',
			'Credit to @everestmcarthur (Rosie Val) for the local JSON-rule handling contribution in PR #8: https://github.com/bleelblep/revenge-next-plugins/pull/8.',
		],
	},
	{
		version: '0.5.19',
		date: '2026-10-05',
		title: 'Markdown links and replacements',
		changes: [
			'Preserve closing markdown markers when removing tracking from a formatted link.',
			'Allow replacement rules to match text immediately after a markdown link.',
			'Keep balanced parentheses in URLs while separating surrounding punctuation.',
		],
	},
	{
		version: '0.5.18',
		date: '2026-10-05',
		title: 'Preview the live draft',
		changes: [
			'Preview now reads the current message box directly instead of a saved draft that can lag behind typing or pasting.',
		],
	},
	{
		version: '0.5.17',
		date: '2026-10-05',
		title: 'Swipe up on newer Discord builds',
		changes: [
			'Fixed holding send and swiping up doing nothing on Discord builds that strip component names.',
		],
	},
	{
		version: '0.5.16',
		date: '2026-10-04',
		title: 'Replace rules',
		changes: ['Small improvements to replace rules.'],
	},
	{
		version: '0.5.15',
		date: '2026-10-03',
		title: 'Line breaks in replace rules',
		changes: [
			'Find and Replace with now take more than one line: Enter adds a line, and what you type is sent exactly, line breaks and tabs included.',
			'In a regular expression rule, \\n in Replace with is a line break and \\t a tab, the same as in Find.',
			'The rules list shows a line break as ↵.',
		],
	},
	{
		version: '0.5.12',
		date: '2026-10-03',
		title: 'Simpler send button',
		changes: [
			'The send button menu is gone. Holding send is now only the swipe.',
			'Two switches in Settings: Message preview and Send unchanged. With one off, the other is at the top of the swipe.',
			'Changing either one asks to reload Discord, so it takes effect straight away.',
			'The clock icon at the top right of the settings shows what changed in every version.',
			'After an update, a short "What\'s new" dialog lists the changes the next time you open the settings.',
		],
	},
	{
		version: '0.5.7',
		date: '2026-10-03',
		title: 'Message preview',
		changes: [
			'Preview a message before sending it, with its formatting, in a popup that scrolls.',
			'Hold the send button and swipe up: halfway opens the preview, all the way sends unchanged.',
			'Preview is also in the long-press menu of the send button.',
		],
	},
	{
		version: '0.4.4',
		date: '2026-09-29',
		title: 'Silent sends and a send button menu',
		changes: [
			'Link tracking rules update themselves about once a week from ClearURLs.',
			'Redirect links (like Google or Facebook outbound links) are unwrapped to where they really go.',
			'Silent messages: send without notifying anyone.',
			'Long-press the send button for a menu of one-off options.',
		],
	},
	{
		version: '0.2.1',
		date: '2026-09-26',
		title: 'Link rules and AI-written rules',
		changes: [
			'Fixed editing a message failing alongside some other plugins.',
			'Link rules: rules that only run inside links, such as twitter.com to fxtwitter.com, with ready-made ones to pick from.',
			'Rules open on their own screen, and each ready-made list has its own screen.',
			'With AI Core installed, a rule can be written from a description and is tested before it is added.',
		],
	},
	{
		version: '0.1.5',
		date: '2026-09-25',
		title: 'Safer rules',
		changes: [
			'Rules can no longer break code, links, mentions, custom emoji or timestamps.',
			'Rules that match the start or end of a message work.',
			'Plain-text replacements are sent exactly as typed.',
			'Link cleaning keeps the parts of Reddit and Amazon links that change the page.',
		],
	},
	{
		version: '0.1.0',
		date: '2026-09-22',
		title: 'First release',
		changes: [
			'Removes tracking from links you send.',
			'Replies can start without pinging the person.',
			'Your own find-and-replace rules. Text in code blocks is never changed.',
		],
	},
]
