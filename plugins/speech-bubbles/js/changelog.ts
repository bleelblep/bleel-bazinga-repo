import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.7.27',
		date: '2026-11-12',
		title: 'Role colours, subtext, your GIFs',
		changes: [
			'New "From their role colour" under Colour per person: in servers, each person\'s bubbles take the colour of their name.',
			'Fixed: small grey text (-# subtext) was hard to read on bubbles. It now reads clearly while staying dimmer than the rest of the message.',
			'Fixed: a GIF you sent as a link (Giphy and the like) sat on the left instead of on your side.',
			'New "Time before my name" on the Times page (on by default): with Time next to names and Show my name on, your time goes left of your name, so a long time no longer pushes your name away from your bubbles.',
		],
	},
	{
		version: '0.7.24',
		date: '2026-11-12',
		title: 'Your name on wide screens',
		changes: ['Fixed: with "Show my name" on, a long time or tag beside your name could throw it to the far left, mostly on tablets and wide screens. It now lines up above your bubbles on the right.'],
	},
	{
		version: '0.7.23',
		date: '2026-11-10',
		title: 'Your name on tablets, again',
		changes: ['Fixed: on tablets your name could still sit on the far left with "Show my name" on. It now moves above your bubbles every time the message is drawn.'],
	},
	{
		version: '0.7.22',
		date: '2026-11-10',
		title: 'Your name on tablets',
		changes: ['Fixed: with "Show my name" on, your name could land on the far left on tablets instead of above your bubbles on the right.', 'On iPhone it now says it needs Android and turns itself off, instead of showing a red error.'],
	},
	{
		version: '0.7.21',
		date: '2026-11-08',
		title: 'Times next to names',
		changes: [
			'New "Time next to names" on the Times page: Discord’s time stays beside the name above the first bubble of each run, no tap needed. With "Show my name" on, yours shows too.',
		],
	},
	{
		version: '0.7.20',
		date: '2026-11-08',
		title: 'Works with Material Expressive',
		changes: [
			'With Material Expressive on, its shapes win: pictures, GIFs, link cards and avatars take its corners instead of the bubble corners, and bubbles keep their own corners (joined ones too) instead of being rounded twice.',
		],
	},
	{
		version: '0.7.19',
		date: '2026-11-08',
		title: 'GIFs and stickers on your side',
		changes: [
			'Your stickers and GIFs (Tenor, Giphy) now sit on the right with your bubbles, instead of staying on the left.',
			"GIFs get the same rounded corners as your bubbles and pictures.",
		],
	},
	{
		version: '0.7.18',
		date: '2026-11-08',
		title: 'Bubbles for bots',
		changes: ["A bot's answers to commands are in bubbles too, so bots in DMs look like everyone else."],
	},
	{
		version: '0.7.17',
		date: '2026-11-07',
		title: 'Your name, and avatars to match',
		changes: [
			'New "Show my name" in Visual style: your name, tags and badges on the right, above the first of your messages in a row.',
			'New "Avatars match bubbles": profile pictures in chat get the same corner roundness as your bubbles, so square bubbles get square avatars. Restart Discord after turning it on so pictures already loaded change too.',
		],
	},
	{
		version: '0.7.16',
		date: '2026-11-07',
		title: 'Quiet with Do Not Disturb',
		changes: ['Sounds and haptics stay off while Do Not Disturb is on or your phone is on silent. On vibrate you still get the haptics.'],
	},
	{
		version: '0.7.15',
		date: '2026-11-07',
		title: 'Tidy up',
		changes: ['Behind the scenes: removed the extra checks used to fix joined corners.'],
	},
	{
		version: '0.7.14',
		date: '2026-11-07',
		title: 'Joined corners, rebuilt',
		changes: [
			'Rebuilt how bubbles join: two bubbles of the same person join when they sit right on top of each other on screen. A name, reply, reactions, a picture or a time between them keeps them apart.',
			'Corners now stay right while you scroll, send and receive.',
		],
	},
	{
		version: '0.7.13',
		date: '2026-11-07',
		title: 'Their runs join too',
		changes: [
			"Fixed: with Hide names on, the first and second message of someone's run didn't join (round corners under the first, small ones on top of the second).",
		],
	},
	{
		version: '0.7.12',
		date: '2026-11-07',
		title: 'Your messages make one run',
		changes: [
			'Your messages one after another join into one run even when Discord starts a new group after a pause (not with Show my profile picture on).',
			'Fixed: bubbles you scrolled back to kept their old corners until the chat reloaded them.',
		],
	},
	{
		version: '0.7.11',
		date: '2026-11-07',
		title: 'Bubbles in a row join properly',
		changes: [
			'Fixed: a bubble in the middle of a run sometimes kept full round corners while the bubbles above and below it joined to it.',
			'Where the bubble above or below is as wide or wider, the corners on the other side join too, so a run of long messages has no notches.',
		],
	},
	{
		version: '0.7.10',
		date: '2026-11-07',
		title: 'Checking joined corners',
		changes: ['Behind the scenes: a closer look at why bubbles in a row keep their round corners.'],
	},
	{
		version: '0.7.9',
		date: '2026-11-07',
		title: 'Joined corners, normal link previews',
		changes: [
			"iMessage link previews are gone for now: link previews look like Discord's again.",
			'Fixed: your messages in a row often kept full round corners on the right instead of joining, mostly right after sending.',
		],
	},
	{
		version: '0.7.8',
		date: '2026-11-07',
		title: 'Still checking link previews',
		changes: ['Behind the scenes: a closer look at link previews on screen.'],
	},
	{
		version: '0.7.7',
		date: '2026-11-06',
		title: 'Checking link previews',
		changes: ["Behind the scenes: more detail for tracking down link previews that keep Discord's look."],
	},
	{
		version: '0.7.6',
		date: '2026-11-06',
		title: 'Previews show the new switches',
		changes: [
			'The preview at the top of Visual style now has a link preview, an edited message and your profile picture, and changes with their switches.',
			'Every preview shows Colour shifts as you scroll: bubbles higher up are lighter, lower down deeper.',
		],
	},
	{
		version: '0.7.5',
		date: '2026-11-06',
		title: 'Room for your picture',
		changes: [
			'Fixed: with Show my profile picture on, your picture covered the corner of wide pictures and link previews you sent. They now move left to make room.',
		],
	},
	{
		version: '0.7.4',
		date: '2026-11-06',
		title: 'Your picture, if you want it',
		changes: [
			'New: Show my profile picture, under Visual style. Your picture sits on the right, beside the first of your messages in a row.',
		],
	},
	{
		version: '0.7.3',
		date: '2026-11-06',
		title: 'Colour shift for everyone',
		changes: [
			"Colour shifts as you scroll now works on everyone's bubbles, not only yours. Each bubble shifts from its own colour.",
			'The 0.7.2 changes to it are undone.',
		],
	},
	{
		version: '0.7.2',
		date: '2026-11-06',
		title: 'Colour that follows the scroll',
		changes: [
			'Fixed: with "Colour shifts as you scroll", short bubbles kept the colour they first had. Every bubble now changes colour as it moves up or down the screen.',
			'The difference between the top and the bottom of the screen is stronger.',
		],
	},
	{
		version: '0.7.1',
		date: '2026-11-06',
		title: 'Sounds and haptics fixed',
		changes: [
			"Fixed: haptics did nothing. They now use the phone's own click.",
			'Fixed: sounds could stay silent until a chat had been opened. They now use your notification volume.',
			"The Try rows play even with the switches off, and a Working line says why the last one didn't play.",
		],
	},
	{
		version: '0.7.0',
		date: '2026-11-06',
		title: 'More like iMessage',
		changes: [
			"New: your bubbles' colour shifts as you scroll, lighter near the top of the screen and deeper near the bottom. Under Colours.",
			'New: link previews look like iMessage: the picture on top, then the title and the website.',
			'New: "Edited" under an edited message, instead of "(edited)" in its text.',
			'Pictures get the same rounded corners as the bubbles.',
			'New: Sounds and haptics. A whoosh when you send, a pop when a message comes in, a tick when you react. The sounds are off until you turn them on.',
		],
	},
	{
		version: '0.6.2',
		date: '2026-11-06',
		title: 'Colours that stay, and more choices',
		changes: [
			'Fixed: your own bubble colours went back to the theme colours every time Discord restarted.',
			'Reactions are back under the message.',
			'Colour per person takes its colours from your theme: colours next to its own, never your accent, and people talking next to each other never get look-alike colours. Or pick soft shades, or each person\'s profile picture. There is also a "Dark colours only" option, and text turns white or black to stay readable on each colour.',
			'New: Hide names, under Visual style. With Two-finger swipe on, the swipe can show the names instead.',
			"Their replies' curved line hooks onto the bubble again when avatars are hidden.",
			'With names hidden, the space between people is smaller, since there is no name to make room for. Names in the swipe show in full.',
			'Send animation has a preview: tap it to play the animation again.',
			'New: Bubble opacity, under Visual style. Turn it down to see the chat background through the bubbles and reactions.',
		],
	},
	{
		version: '0.5.31',
		date: '2026-11-05',
		title: 'Two more marked buggy',
		changes: [
			'Send animation and Two-finger swipe are labelled "(buggy)" and ask before turning on, like Typing bubble and Invisible ink.',
			'Two-finger swipe is now off by default.',
		],
	},
	{
		version: '0.5.30',
		date: '2026-11-05',
		title: 'Corner reactions on top',
		changes: [
			'A reaction on the corner of a bubble is no longer hidden under the bubble above it when several messages are in a row.',
		],
	},
	{
		version: '0.5.29',
		date: '2026-11-05',
		title: 'Reactions in the other colour',
		changes: [
			"Reactions are in the other bubble colour from the message they're on (theirs on your bubbles, yours on theirs), dots included, so they stand out.",
		],
	},
	{
		version: '0.5.28',
		date: '2026-11-05',
		title: 'Reaction dots point down',
		changes: [
			"The little dots on reactions trail down and away from the bubble, in the other bubble colour so they stand out.",
		],
	},
	{
		version: '0.5.27',
		date: '2026-11-05',
		title: 'Typing bubble and invisible ink marked buggy',
		changes: [
			'Typing bubble and Invisible ink are marked buggy and start off. Turning either on asks you to confirm first.',
		],
	},
	{
		version: '0.5.26',
		date: '2026-11-05',
		title: 'Reactions on the corner, dots pointing out',
		changes: [
			"Reactions sit on the bubble's top corner again, with their little dots trailing up and away from the bubble. Tapping one works as before. Turn it off with \"Reactions on the corner\" in Visual style to keep them under the message.",
		],
	},
	{
		version: '0.5.25',
		date: '2026-11-05',
		title: 'Swipe moves the bubble you touched too',
		changes: [
			'The bubble under your first finger no longer lags behind the rest when you start a two-finger swipe on it.',
		],
	},
	{
		version: '0.5.24',
		date: '2026-11-04',
		title: 'Swipe keeps every bubble together',
		changes: [
			'During the two-finger swipe, bubbles no longer lag behind the rest when a message loads, changes or scrolls in.',
		],
	},
	{
		version: '0.5.23',
		date: '2026-11-04',
		title: 'Corner roundness',
		changes: [
			'New "Corner roundness" slider in Visual style: from square corners to pills. 18 is the iMessage look.',
		],
	},
	{
		version: '0.5.20',
		date: '2026-11-04',
		title: 'Two fingers up or down are left alone',
		changes: [
			'The two-finger swipe only starts when your fingers move left, so two-finger gestures going up or down (like opening Quick Toggles) work again.',
		],
	},
	{
		version: '0.5.19',
		date: '2026-11-03',
		title: 'Reactions back under the message',
		changes: [
			'Reactions are back under the message, as iMessage-style badges.',
		],
	},
	{
		version: '0.5.18',
		date: '2026-11-03',
		title: 'Tapbacks on the corner',
		changes: [
			"Reactions sit on the bubble's top corner, like iMessage, with no gap left under the message. Tapping one works as before. Turn it off in Visual style to keep them under the message.",
		],
	},
	{
		version: '0.5.17',
		date: '2026-11-03',
		title: 'Right colour for your reactions',
		changes: [
			'Only reactions you added are in your colour. Some were before because they were animated, not because they were yours.',
		],
	},
	{
		version: '0.5.16',
		date: '2026-11-03',
		title: 'Settings preview matches',
		changes: [
			'The settings preview no longer shows a time beside the name either.',
		],
	},
	{
		version: '0.5.15',
		date: '2026-11-03',
		title: 'Hidden really hides times',
		changes: [
			"With message times set to Hidden, the time beside someone's name is hidden too.",
		],
	},
	{
		version: '0.5.14',
		date: '2026-11-03',
		title: 'Tidier add-reaction button',
		changes: [
			'The smiley button for adding a reaction is a plain round badge, without the box around it.',
		],
	},
	{
		version: '0.5.13',
		date: '2026-11-03',
		title: 'Small fixes',
		changes: ['Small internal changes.'],
	},
	{
		version: '0.5.12',
		date: '2026-11-03',
		title: 'iMessage tapback badges',
		changes: [
			'Reactions look like iMessage tapbacks: a round badge with two little dots trailing towards the message, ringed in the chat colour. They stay under the message and work as before.',
		],
	},
	{
		version: '0.5.11',
		date: '2026-11-03',
		title: 'Cleaner spoilers and reactions',
		changes: [
			'An opened spoiler shows plain on the bubble, without the dark box behind it.',
			'The + button next to reactions is a flat pill that matches them. The dots on reactions are gone.',
		],
	},
	{
		version: '0.5.10',
		date: '2026-11-03',
		title: 'Reaction dots',
		changes: [
			'The reaction nearest the bubble gets two little iMessage-style dots trailing up towards the message.',
		],
	},
	{
		version: '0.5.9',
		date: '2026-11-03',
		title: 'iOS-style reactions, and spoilers open again',
		changes: [
			'Tapping a spoiler shows it again. The specks were still covering it after Discord revealed it.',
			"Reactions are round, in the bubble colours: yours in your colour, everyone else's in theirs. They stay under the message and work as before. Turn it off in Visual style.",
		],
	},
	{
		version: '0.5.8',
		date: '2026-11-03',
		title: 'Small fixes',
		changes: ['Small internal changes.'],
	},
	{
		version: '0.5.7',
		date: '2026-11-03',
		title: 'Reactions back under the message',
		changes: [
			'Reactions are back under the message, where Discord puts them, with the + button.',
		],
	},
	{
		version: '0.5.6',
		date: '2026-11-03',
		title: 'Fixes for spoilers, times and tapbacks',
		changes: [
			'Tapping a spoiler reveals it again. The specks go away once it shows.',
			'No more empty space under a message where its reactions used to be.',
			"Times like 16 minutes ago now show the same way on every message, yours and other people's.",
			'The two-finger swipe moves every bubble far enough that its time never sits on top of one.',
		],
	},
	{
		version: '0.5.5',
		date: '2026-11-03',
		title: 'Small fixes',
		changes: ['Small internal changes.'],
	},
	{
		version: '0.5.4',
		date: '2026-11-03',
		title: 'Invisible ink and swipe for times',
		changes: [
			"Spoilers shimmer as moving specks, like iMessage. Tap one, or rub it, to read it. Works on anyone's spoilers.",
			'Drag the chat left with two fingers to see when every message was sent. One finger still replies.',
			'Both can be turned off: Invisible ink in Visual style, Two-finger swipe in Message times.',
		],
	},
	{
		version: '0.5.3',
		date: '2026-11-03',
		title: 'Tapbacks',
		changes: [
			"Reactions sit on the bubble's top corner, like iMessage's Tapbacks. Tapping one works as before. Turn it off in Visual style.",
		],
	},
	{
		version: '0.5.2',
		date: '2026-11-03',
		title: 'Small fixes',
		changes: ['Small internal changes.'],
	},
	{
		version: '0.5.1',
		date: '2026-11-03',
		title: 'Pictures send smoothly',
		changes: [
			'Pictures and files now rise into the chat from behind the message box, and the picture can load while it moves. Before, a blank box flew in and the picture popped in after it.',
		],
	},
	{
		version: '0.5.0',
		date: '2026-11-03',
		title: 'Send animation',
		changes: [
			'New: Send animation. Turn it on in settings and your message lifts out of the message box into the chat, like iMessage, or pops up in place.',
			'Long messages rise out of the box whole instead of squeezing out of it.',
			"It used to be its own plugin, Send Animation. Remove that one so your messages don't animate twice.",
		],
	},
	{
		version: '0.4.3',
		date: '2026-11-03',
		title: 'Small fixes',
		changes: ['Small internal changes.'],
	},
	{
		version: '0.4.2',
		date: '2026-11-01',
		title: 'No picture beside your own bubbles',
		changes: [
			'Your profile picture no longer sometimes shows on the left of a message you just sent.',
		],
	},
	{
		version: '0.4.1',
		date: '2026-11-01',
		title: 'A preview for each page',
		changes: [
			'Each settings page has its own small preview showing only what that page changes. Tap a bubble on Message times to try it.',
		],
	},
	{
		version: '0.4.0',
		date: '2026-11-01',
		title: 'New settings',
		changes: [
			'Settings are split into Visual style, Colours and Message times, each with a live preview of your chat. Tap a bubble in the preview to try your message times.',
			'Bubble colours are one choice now: from your theme, from your theme swapped, or your own. Your old choice carries over.',
			"With your own colours, either side can go back to the theme's colour, and Reset puts both back.",
		],
	},
	{
		version: '0.3.5',
		date: '2026-10-30',
		title: 'Corners that fit, again',
		changes: [
			"Bubbles in the middle of a run get their joined corners on top again, and the last bubble before someone's name shows again gets full round corners.",
		],
	},
	{
		version: '0.3.4',
		date: '2026-10-30',
		title: 'Corners that fit',
		changes: [
			'Several messages in a row from one person only get the smaller, joined corners where two bubbles really touch. A picture, link card, reactions, a reply quote, a time break or the time under a bubble in between now gives both bubbles their full round corners, and the tail.',
		],
	},
	{
		version: '0.3.3',
		date: '2026-10-30',
		title: 'Clearer time breaks',
		changes: [
			'Time breaks have more room around them, read a little larger and brighter, and get a thin line on each side.',
		],
	},
	{
		version: '0.3.2',
		date: '2026-10-30',
		title: 'Time breaks',
		changes: [
			'A small centred time shows above the first message after an hour\'s quiet, so you rarely need to tap for one. Turn it off with "Time breaks".',
		],
	},
	{
		version: '0.3.1',
		date: '2026-10-30',
		title: 'Readable colours',
		changes: [
			"Their bubbles use the theme's highest surface colour and are lifted away from the chat background when the two are close (Galaxy).",
			'With "Use my own colours", text stays white on mid-tone colours; only pale colours get dark text.',
		],
	},
	{
		version: '0.3.0',
		date: '2026-10-30',
		title: 'Your side, all of it',
		changes: [
			'Your pictures, GIFs, stickers, link cards and reactions sit on the right under your bubbles, not on the left.',
			"Link and embed cards get the same rounded corners as the bubbles, on everyone's messages.",
		],
	},
	{
		version: '0.2.21',
		date: '2026-10-30',
		title: 'Reply lines in place',
		changes: [
			'The line and quote above your replies no longer land short of the bubble, or over each other, on some rows.',
		],
	},
	{
		version: '0.2.20',
		date: '2026-10-30',
		title: 'Pictures in place',
		changes: [
			'Profile pictures are lined up after each row has fully laid out, so they no longer jump or land beside the wrong message.',
		],
	},
	{
		version: '0.2.19',
		date: '2026-10-30',
		title: 'Steadier pictures, colours from the start',
		changes: [
			'Profile pictures line up with the first thing in the message, picture or bubble, and stay put while you scroll.',
			'Colour per person works as soon as you open a group chat, not only after a second person has shown up.',
		],
	},
	{
		version: '0.2.18',
		date: '2026-10-30',
		title: 'Colour per person',
		changes: [
			'In group chats each person\'s bubbles get their own colour (on by default; turn it off with "Colour per person").',
		],
	},
	{
		version: '0.2.17',
		date: '2026-10-30',
		title: 'Steady pictures',
		changes: ['Profile pictures no longer jump around while you scroll.'],
	},
	{
		version: '0.2.16',
		date: '2026-10-30',
		title: 'Picture checks',
		changes: [
			'Status shows how the profile picture was lined up, to find out why it might not move.',
		],
	},
	{
		version: '0.2.15',
		date: '2026-10-30',
		title: 'Pictures beside the bubble',
		changes: [
			"Other people's profile picture lines up with their first bubble instead of floating beside their name.",
		],
	},
	{
		version: '0.2.14',
		date: '2026-10-30',
		title: 'Pictures on the first message',
		changes: [
			"Other people's profile picture stays beside the first message of their run, next to their name, instead of moving to the last one.",
		],
	},
	{
		version: '0.2.13',
		date: '2026-10-30',
		title: 'Your replies on your side',
		changes: [
			'When you reply, the quoted message sits on the right above your bubble, with its line hooking down onto it, instead of on the left.',
		],
	},
	{
		version: '0.2.12',
		date: '2026-10-30',
		title: 'Timezones under every bubble',
		changes: [
			"The time under a bubble includes Timezones' local time, on later messages in a run too, also when the first one shows a date.",
		],
	},
	{
		version: '0.2.11',
		date: '2026-10-30',
		title: 'Times under the bubble show',
		changes: [
			'Tapping a bubble now really shows its time under it; before, the room for it was never made.',
		],
	},
	{
		version: '0.2.10',
		date: '2026-10-30',
		title: 'Time checks',
		changes: [
			'Status shows more about times under bubbles, to find out why one might not show.',
		],
	},
	{
		version: '0.2.9',
		date: '2026-10-30',
		title: 'Times under the bubble',
		changes: [
			'Tapping a bubble shows its time under it instead of beside it, so wide bubbles no longer lose room for it.',
		],
	},
	{
		version: '0.2.8',
		date: '2026-10-28',
		title: 'Same look for every time',
		changes: [
			'Later messages in a run show their time the same way as the first one, local time included.',
		],
	},
	{
		version: '0.2.7',
		date: '2026-10-28',
		title: 'Short times',
		changes: [
			"The time pop-up shows the short time (with Timezones' local time when it's there), not the full date.",
		],
	},
	{
		version: '0.2.6',
		date: '2026-10-28',
		title: 'Pop-up colours',
		changes: ['The time pop-up takes the colour of the bubble you tapped.'],
	},
	{
		version: '0.2.5',
		date: '2026-10-28',
		title: 'Time pop-up',
		changes: [
			'The third time option is a little pop-up above the bubble that fades after 3 seconds (it replaces the Discord toast).',
		],
	},
	{
		version: '0.2.4',
		date: '2026-10-28',
		title: 'Two kinds of times',
		changes: [
			'Message times can show beside the bubble (default) or as a Discord toast.',
		],
	},
	{
		version: '0.2.3',
		date: '2026-10-28',
		title: 'Times as toasts',
		changes: [
			'Tapping a bubble shows its time as a Discord toast, so it never gets cut off.',
		],
	},
	{
		version: '0.2.2',
		date: '2026-10-28',
		title: 'Tidier typing bubble',
		changes: [
			'The typing bubble fits above the message box and lines up with the chat.',
			'With avatars hidden, pictures and embeds move left with the bubbles.',
		],
	},
	{
		version: '0.2.1',
		date: '2026-10-28',
		title: 'Hide avatars',
		changes: [
			`"Hide avatars" hides other people's pictures beside their bubbles and in the typing bubble. Their bubbles and names move left into the space.`,
		],
	},
	{
		version: '0.2.0',
		date: '2026-10-28',
		title: 'Typing bubble',
		changes: [
			'When someone is typing, a bubble with three bouncing dots shows above the message box instead of the "…is typing" line. Group chats show who is typing. Turn it off with "Typing bubble" in settings.',
			'Wide bubbles leave room for the time beside them.',
			"A little more space between someone's name and their first bubble.",
		],
	},
	{
		version: '0.1.17',
		date: '2026-10-28',
		title: 'Tap for the time',
		changes: [
			'Tapping a bubble shows its time beside it: left of your bubbles, right of theirs. Tap again to hide it.',
		],
	},
	{
		version: '0.1.13',
		date: '2026-10-28',
		title: 'Tap for every time',
		changes: [
			'With "Show on tap", Discord\'s own time next to other people\'s names is hidden too, so every time shows only when you tap its bubble.',
		],
	},
	{
		version: '0.1.12',
		date: '2026-10-28',
		title: 'Times show',
		changes: [
			'Tapping a bubble now shows its time on every message, not an empty space on the later ones in a group.',
		],
	},
	{
		version: '0.1.11',
		date: '2026-10-28',
		title: 'Tap for the time',
		changes: ['Tapping a bubble shows its time.'],
	},
	{
		version: '0.1.10',
		date: '2026-10-28',
		title: 'Readable links',
		changes: ['Links inside bubbles are readable again.'],
	},
	{
		version: '0.1.9',
		date: '2026-10-28',
		title: 'Your colours, your tails',
		changes: [
			'"Use my own colours" lets you pick the colour of your bubbles and theirs. The text turns white or black, whichever is easier to read.',
			'"Tails" turns the little tail on the last bubble off or on.',
			'The settings page shows a small preview of both bubbles.',
			'"Times on your messages" is now "Message times": with "Show on tap", tapping anyone\'s bubble shows its time, not just yours.',
		],
	},
	{
		version: '0.1.8',
		date: '2026-10-28',
		title: 'Two new settings',
		changes: [
			'"Colour their messages instead" gives other people\'s bubbles your accent colour and turns yours grey.',
			'"Times on your messages": choose "Show on tap", then tap one of your bubbles to see when you sent it. Tap again to hide it.',
			"Other people's avatar now shows beside the last bubble of their run, not just the first.",
		],
	},
	{
		version: '0.1.7',
		date: '2026-10-28',
		title: 'Tails',
		changes: [
			'The last bubble in a row of messages gets a small tail, and bubbles in the same row of messages sit snugly together.',
			"Other people's picture moves down beside their last bubble.",
		],
	},
	{
		version: '0.1.6',
		date: '2026-10-28',
		title: 'Solid bubbles',
		changes: [
			"Other people's bubbles are solid, in the same colour as your message box, instead of see-through.",
		],
	},
	{
		version: '0.1.5',
		date: '2026-10-28',
		title: 'Everyone gets bubbles',
		changes: [
			"Other people's messages show as grey bubbles on the left.",
			'Bubble colours follow your theme.',
			'New "Show everywhere" switch puts bubbles in servers too. It is off at first, so bubbles only show in DMs and group DMs.',
		],
	},
	{
		version: '0.1.4',
		date: '2026-10-28',
		title: 'Replies',
		changes: [
			'The "replying to" preview above a reply is no longer drawn as a bubble.',
		],
	},
	{
		version: '0.1.3',
		date: '2026-10-28',
		title: 'No more flicker',
		changes: [
			'Bubbles are sized as Discord lays out each message, so long messages fit and nothing jumps.',
		],
	},
	{
		version: '0.1.2',
		date: '2026-10-28',
		title: 'Long messages fit',
		changes: [
			'Long messages and messages with several paragraphs are no longer cut off inside their bubble.',
		],
	},
	{
		version: '0.1.1',
		date: '2026-10-28',
		title: 'Finds the messages',
		changes: [
			'Fixes "not found on this Discord version": the bubbles couldn\'t find Discord\'s message view.',
		],
	},
	{
		version: '0.1.0',
		date: '2026-10-28',
		title: 'First test',
		changes: ['First test: your own messages as bubbles on the right in DMs.'],
	},
]
