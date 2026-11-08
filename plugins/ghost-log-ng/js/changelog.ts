import type { ChangelogEntry } from "../../../shared/changelog";

/** Newest first. Every public version gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: "0.3.1",
		date: "2026-11-08",
		title: "Fixes",
		changes: [
			"Threads and forum posts whose first message was deleted work again: reacting, replying and editing inside them were blocked as if the whole thread was deleted.",
			"Opening a chat with lots of saved videos no longer runs Discord out of memory. Saved media now opens two at a time.",
			"With Log deletions off, deleted messages no longer stay in chat.",
			"The log stays within your log size after a mass delete, instead of growing until you open Ghost Log.",
		],
	},
	{
		version: "0.3.0",
		date: "2026-11-08",
		title: "Real encryption, new log screens",
		changes: [
			"Your log is locked with a key made for this phone and kept in Android's secure key storage. Set a recovery password once, and backups and bundles open on another phone or after reinstalling Discord.",
			"Deleted messages and Edited messages are rebuilt: switch between Recent (newest first, grouped by day) and Conversations (one box per server and one for DMs). Tap a deleted message for Jump, Copy and Remove; long-press or Select to remove several.",
			"Logs read like chat: mentions, channels and emoji show their names, and formatting marks are gone.",
			"New in Logging: a log size choice, Remove from chat menu (long-press a logged message in chat), and Tap the notice to jump.",
			"With Count own messages on, messages you delete stay in chat marked as deleted. Replying, reacting, editing and other actions are blocked on deleted messages kept in chat, so nothing is sent for them.",
			"The log is saved in a way that survives Discord being closed mid-save. A locked or damaged log is never written over or replaced with an empty one.",
			"Export bundle saves into your Download/GhostLogNG folder. Import from Revenge Next also finds Ghost Log Native Beta and older Ghost Log NG logs.",
			"After updating, don't go back to 0.2.x: it can't read the new files.",
		],
	},
	{
		version: "0.2.20",
		date: "2026-10-26",
		title: "Restore finds your backup",
		changes: [
			"Restoring a backup or bundle from the default path now also looks in the app's own folder (Android/data/…/files) and in Download/, so it works on a fresh install.",
			"Turning on encrypted auto backup no longer fails when the log already has entries.",
		],
	},
	{
		version: "0.2.19",
		date: "2026-10-26",
		title: "Valenced",
		changes: ["Ported to Valenced. Settings from Revenge don't carry over."],
	},
	{
		version: "0.2.18",
		date: "2026-10-22",
		title: "Discord version limit removed",
		changes: ["Installs on any Discord version again."],
	},
	{
		version: "0.2.17",
		date: "2026-10-22",
		title: "Chat crash fix",
		changes: [
			'Fixed a crash on the chat screen ("Maximum call stack size exceeded") when Custom Timestamps is on too.',
		],
	},
	{
		version: "0.2.16",
		date: "2026-10-22",
		title: "Log your own deletes",
		changes: [
			"New in Options: Include my own deleted messages. It used to be only on the Debug page, which normal builds don't have.",
		],
	},
	{
		version: "0.2.15",
		date: "2026-10-22",
		title: "Discord 352.2",
		changes: [
			"Saved videos play again on Discord 352.2, whose code is scrambled. Needs Revenge 1.9.1 or newer on 352.2.",
		],
	},
	{
		version: "0.2.14",
		date: "2026-10-21",
		title: "Discord version limit",
		changes: [
			"Only starts on Discord 351.6 or older, so a newer Discord build can't break it.",
		],
	},
	{
		version: "0.2.13",
		date: "2026-10-19",
		title: "Import from Ghost Log Native Beta",
		changes: [
			"Backup > Import from Ghost Log Native Beta copies the old plugin's deleted messages, edit history, embeds and saved media straight from its app storage. No export or shared storage needed, and the old plugin's files are left alone.",
		],
	},
	{
		version: "0.2.6",
		date: "2026-10-13",
		title: "Tidy-up",
		changes: [
			"Errors now show in the Revenge plugin list instead of only the log, and the developer Debug page is gone from normal builds.",
		],
	},
	{
		version: "0.2.5",
		date: "2026-10-13",
		title: "Discord 350.4",
		changes: [
			"Pop-up messages work on Discord 350.4. Before, showing one could crash Discord.",
		],
	},
	{
		version: "0.2.4",
		date: "2026-10-11",
		title: "Saved videos play in chat",
		changes: [
			"A deleted message that stays in the chat now shows its saved images and videos instead of Discord's links, which stop working once the message is deleted. Videos in those messages play again.",
		],
	},
	{
		version: "0.2.3",
		date: "2026-10-11",
		title: "Video playback check",
		changes: [
			"Debug > Video playback shows whether saved videos can reach the player, and what it last tried to open. For tracking down videos that will not play.",
		],
	},
	{
		version: "0.2.2",
		date: "2026-10-11",
		title: "Ghost Log Next Gen",
		changes: [
			"Now shown as Ghost Log Next Gen, with a quieter card on the settings page that says what the plugin keeps and where the log lives.",
		],
	},
	{
		version: "0.2.1",
		date: "2026-10-11",
		title: "Clean shutdown",
		changes: [
			"Turning the plugin off now clears every bit of session state, including the media caches, so nothing leaks across a reload.",
		],
	},
	{
		version: "0.2.0",
		date: "2026-10-11",
		title: "Every page",
		changes: [
			"Deleted messages page: chat-style rows grouped by channel, with search and filters.",
			"Edited messages page with older-version history, and a Deleted media grid.",
			"Logging options, Visual style, Backup (encrypted backup + portable bundle), Licence and a full Debug page.",
			"Long-press a message to jump to it, copy it, view the author, or remove it from the log.",
			"Tap saved media to open it in Discord’s viewer; videos play from the saved copy.",
		],
	},
	{
		version: "0.1.4",
		date: "2026-10-11",
		title: "Edit history, testable",
		changes: [
			"Edit history was working, but only for other people's edits -- your own edits are off by default, like Ghost Log. A Debug-page switch turns them on for testing until the Logging page arrives.",
		],
	},
	{
		version: "0.1.3",
		date: "2026-10-11",
		title: "Fixed the chat crash",
		changes: [
			"Opening a channel no longer crashes: the row-styling hook now keeps the receiver its method needs, the same pattern the other plugins sharing that hook use.",
		],
	},
	{
		version: "0.1.2",
		date: "2026-10-11",
		title: "Fixed the chat markers",
		changes: [
			"The deleted-message overlay and the edit history lines now actually show: the row styling hook is found the proven way, and rows are patched like the proven build.",
		],
	},
	{
		version: "0.1.1",
		date: "2026-10-11",
		title: "Kept messages and edit history",
		changes: [
			'Deleted messages stay in chat with the red overlay (or the "deleted" tag), like Ghost Log Native Beta.',
			"Bulk-deleted messages come back after a reload, with mentions, replies and saved media.",
			"Replying or reacting to a deleted message is refused; removing a reaction still works.",
			"Edited messages keep their earlier versions, shown above the message in chat.",
			"Saved images and videos are downloaded encrypted and shown from the saved copy.",
		],
	},
	{
		version: "0.1.0",
		date: "2026-10-11",
		title: "Ground-up rewrite",
		changes: [
			"Ghost Log rebuilt from scratch as Ghost Log NG, with the same encrypted log format: backups and bundles made by Ghost Log Native Beta import unchanged.",
			"Deleted messages are caught and encrypted on this device; the full feature set returns over the next versions.",
		],
	},
];
