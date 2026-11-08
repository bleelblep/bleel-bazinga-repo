/**
 * The deletion capture pipeline: flux payload -> entry -> native log. Moved out of index.ts so the
 * entry point holds lifecycle only and a capture bug is fixed here, in one file.
 *
 * Kept deliberately free of the chat-behaviour half: the keep-on-screen decision lives in keep.ts,
 * in-chat rendering in visuals.ts/restore.ts, and edit capture in edits.ts. A failure in any one
 * part cannot take the others with it.
 */

import { reportError } from "../../../../shared/report";
import { showToast } from "../../../../shared/toast";
import { DEFAULT_BACKUP_PATH } from "../defaults";
import { getSettings, setSettings } from "../settings";
import type { GhostLogSettings } from "../types";
import {
	addToCache,
	getStorageStatus,
	refreshStorageStatus,
	settleCapture,
	updateCachedMedia,
} from "../ui/state";
import { native } from "./bridge";
import { showJumpBanner } from "./jumpBanner";
import { isOwnUserDelete } from "./keep";
import { richContentForCapture } from "./richContent";
import {
	clip,
	epochMs,
	isEphemeral,
	mentionUsers,
	plainUser,
} from "./sanitize";
import { getStores } from "./stores";

const DEBUG: boolean = false;

const TAG = "[GhostLogNG:capture]";

/** Longest text kept for a deleted message (Discord's own limit with Nitro). */
const MAX_CONTENT = 4000;

/** Channel/guild/author names for one message, read from the stores at capture time. */
function describe(message: any, channelId: string) {
	const s = getStores();
	const channel = s.ChannelStore?.getChannel?.(channelId);
	const guild = channel?.guild_id
		? s.GuildStore?.getGuild?.(channel.guild_id)
		: undefined;

	return {
		channelName: channel?.name ? `#${channel.name}` : "Direct message",
		guildId: channel?.guild_id as string | undefined,
		guildName: guild?.name as string | undefined,
		guildIcon: guild?.icon as string | undefined,
		authorName:
			message.author?.globalName ??
			message.author?.global_name ??
			message.author?.username ??
			"Unknown",
	};
}

interface JumpTarget {
	id: string;
	channelId: string;
	guildId?: string;
}

// Catch notices, coalesced per channel. A purge used to show one toast (or banner) per message, so
// a 50-message bulk delete queued 50 notices that kept the screen covered for minutes. Now a burst
// in one channel waits a moment and shows one "N messages deleted in #channel"; a single delete
// still reads "Message deleted by <name> in #channel".
const NOTICE_SETTLE_MS = 400;
const NOTICE_MAX_WAIT_MS = 1500;

interface PendingNotice {
	count: number;
	authorName: string;
	channelName: string;
	/** The newest catch: tapping the notice jumps there. */
	target: JumpTarget;
	timer: ReturnType<typeof setTimeout>;
	firstAt: number;
}

const pendingNotices = new Map<string, PendingNotice>();

function showNotice(notice: PendingNotice) {
	const text =
		notice.count === 1
			? `Message deleted by ${notice.authorName} in ${notice.channelName}`
			: `${notice.count} messages deleted in ${notice.channelName}`;
	if (getSettings().tapToJump && showJumpBanner(text, notice.target)) return;
	// One toast key per channel, so a later burst replaces this one rather than queueing behind it.
	showToast(text, `bleelblep.ghost-log-ng:${notice.target.channelId}`);
}

function flushNotice(channelId: string) {
	const notice = pendingNotices.get(channelId);
	if (!notice) return;
	pendingNotices.delete(channelId);
	clearTimeout(notice.timer);
	try {
		showNotice(notice);
	} catch (error) {
		reportError(`${TAG} catch notice failed:`, error);
	}
}

/** The catch notice: Ghost Log's tappable one when that's on and can be drawn, else Discord's toast. */
function notifyCaught(
	entry: Record<string, unknown>,
	authorName: string,
	channelName: string,
) {
	const channelId = String(entry.channelId);
	const target: JumpTarget = {
		id: String(entry.id),
		channelId,
		guildId: typeof entry.guildId === "string" ? entry.guildId : undefined,
	};
	const now = Date.now();
	const pending = pendingNotices.get(channelId);
	if (pending) {
		clearTimeout(pending.timer);
		pending.count++;
		pending.target = target;
		pending.authorName = authorName;
		// Trailing, but never held back longer than NOTICE_MAX_WAIT_MS from the first catch.
		const wait = Math.max(
			0,
			Math.min(NOTICE_SETTLE_MS, pending.firstAt + NOTICE_MAX_WAIT_MS - now),
		);
		pending.timer = setTimeout(() => flushNotice(channelId), wait);
		return;
	}
	pendingNotices.set(channelId, {
		count: 1,
		authorName,
		channelName,
		target,
		firstAt: now,
		timer: setTimeout(() => flushNotice(channelId), NOTICE_SETTLE_MS),
	});
}

async function capture(
	entry: Record<string, unknown>,
	toast: boolean,
	authorName: string,
	channelName: string,
) {
	const id = String(entry.id);
	// Into the cache first, in the same complete shape a reload gets from the rich-content sidecar.
	// It used to wait for the native call, which downloads the message's media before it returns
	// (up to two minutes for a video, four at a time) -- and a bulk-deleted message is shown only
	// from this cache, so it stayed gone from the chat for that whole wait.
	addToCache({ ...entry, ...((entry as any).richContent ?? {}) } as any);
	// Right away, not after native returns: that waits for the message's media to download.
	if (toast) notifyCaught(entry, authorName, channelName);
	try {
		const result = await native.captureDeleted(entry);
		// Native answers with the rich content it saved, each media object now carrying `localFile`.
		// Without this the entry keeps only CDN links until the next reload, and those die with the
		// message.
		if (typeof result === "string" && result) {
			try {
				const saved = JSON.parse(result);
				updateCachedMedia(id, saved.attachments, saved.embeds);
			} catch (error) {
				reportError(`${TAG} saved media reply unreadable:`, error);
			}
		}
		const cfg = getSettings();
		if (cfg.autoBackupEnabled) scheduleBackup(cfg);
	} catch (error) {
		reportError(`${TAG} capture bridge failed:`, error);
	} finally {
		// Native has it now (or never will): a log refresh may stop carrying it over (ui/state.ts).
		settleCapture(id);
	}
}

// Auto-backup once per burst, not once per catch: previously every captured deletion fired a
// full-log encrypt+write to the backup file, so N rapid deletions meant 2N full rewrites
// (capture + backup each) serialized through the native mutex. Under a purge that I/O storm
// is the only work that scales with delete rate. Trailing-debounce it instead.
let backupTimer: ReturnType<typeof setTimeout> | undefined;
/** Auto-backup once per burst, trailing-debounced. Exported for edits.ts (an edit refreshes the
 *  backup the same way a catch does) and ui/state.ts (a clear or remove rewrites it, or Restore
 *  would bring the removed messages back). */
export function scheduleBackup(cfg: GhostLogSettings) {
	if (backupTimer !== undefined) return;
	backupTimer = setTimeout(() => {
		backupTimer = undefined;
		// Native refuses while the folder is locked (it would overwrite the old log's other copy);
		// the Backup page already says why, so don't report a failure per catch.
		const status = getStorageStatus();
		if (status?.locked || status?.unreadable) return;
		const path = cfg.backupFilePath || DEFAULT_BACKUP_PATH;
		// Native returns null when the write fails -- it does not reject -- so the result has to be
		// checked. Logging success unconditionally is how every auto-backup failing went unnoticed.
		// No paths in the text (AS-08): the Backup page shows where it is.
		native
			.exportBackup(path)
			.then((result) => {
				if (result) {
					// Backup's "Last backup" row reads this; only manual backups used to set it.
					void setSettings({ lastBackupAt: Date.now() });
					if (DEBUG)
						console.log(`${TAG} auto backup written (${result.count} entries)`);
				} else
					reportError(
						`${TAG} auto backup failed: could not write the backup file (see Backup > storage status)`,
					);
				// The storage row on the Backup page reads lastWriteError; refresh it either way.
				void refreshStorageStatus();
			})
			.catch((error) => reportError(`${TAG} auto backup failed:`, error));
	}, 2000);
}

/** Clears a pending auto-backup; registered with api.cleanup so a stop cannot fire one late. */
export function cancelBackupTimer() {
	if (backupTimer !== undefined) {
		clearTimeout(backupTimer);
		backupTimer = undefined;
	}
}

// Deletions captured in the last few seconds, by message id. Up to 0.6.x a single delete reached
// the handler twice (a dispatcher hook and the subscriber), and the two downloads of the same
// media damaged the saved file. There is one path now, but a delete the gateway repeats still lands
// twice, so the guard stays (native downloadMedia is locked per file as well).
//
// A Map iterates in insertion order and every insert is "now", so the oldest are always at the
// front: expiry stops at the first live one. It used to walk the whole map on every delete, which
// made a purge quadratic.
const recentCaptures = new Map<string, number>();
const RECENT_CAPTURE_MS = 10_000;
const RECENT_CAPTURE_MAX = 5000;

function alreadyCaptured(messageId: string): boolean {
	const now = Date.now();
	for (const [id, at] of recentCaptures) {
		if (
			now - at > RECENT_CAPTURE_MS ||
			recentCaptures.size > RECENT_CAPTURE_MAX
		)
			recentCaptures.delete(id);
		else break;
	}
	if (recentCaptures.has(messageId)) return true;
	recentCaptures.set(messageId, now);
	return false;
}

/**
 * One deletion: read the message from MessageStore before it is removed, apply the capture
 * filters, and hand a snake_case entry to native. Nothing here throws out of a flux handler --
 * callers wrap it, and any failure means the message simply is not logged.
 */
export function handleDelete(channelId: string, messageId: string) {
	if (alreadyCaptured(String(messageId))) return;
	const s = getStores();
	const message = s.MessageStore?.getMessage?.(channelId, messageId);
	if (!message) return;
	// A dismissed ephemeral message, not a deletion. See isEphemeral.
	if (isEphemeral(message)) return;
	// Your own message that never reached the server, being retried or cancelled: not a deletion.
	if (message.state === "SENDING" || message.state === "SEND_FAILED") return;
	const cfg = getSettings();
	// Your own delete, started here (keep.ts isOwnUserDelete): labelled "Deleted by you" in the log.
	const byYou = isOwnUserDelete(message);
	if (!cfg.countOwnMessages) {
		const me = s.UserStore?.getCurrentUser?.()?.id;
		if (me && message.author?.id === me) return;
	}
	if (cfg.ignoreBots && message.author?.bot) return;
	if (!cfg.logDeletions) return;

	const meta = describe(message, channelId);
	const deletedAt = Date.now();
	const richContent = richContentForCapture(message, cfg);
	const content = String(message.content ?? "");
	void capture(
		{
			id: String(messageId),
			channelId: String(channelId),
			guildId: meta.guildId,
			authorId: String(message.author?.id ?? ""),
			authorName: meta.authorName,
			channelName: meta.channelName,
			guildName: meta.guildName,
			authorAvatar: message.author?.avatar,
			guildIcon: meta.guildIcon,
			content: clip(content, MAX_CONTENT),
			byYou: byYou ? true : undefined,
			// Everything below is what a bulk-deleted message needs to come back looking like itself.
			// A single delete never leaves the store, so it keeps its real record; a bulk delete is a
			// real removal and is rebuilt entirely from this entry.
			mentions: Array.isArray(message.mentions)
				? mentionUsers(message.mentions).map(plainUser).slice(0, 64)
				: undefined,
			mentionRoles: Array.isArray(message.mention_roles)
				? message.mention_roles.map(String).slice(0, 64)
				: undefined,
			mentionEveryone: !!message.mention_everyone,
			editedAt: message.edited_timestamp
				? epochMs(message.edited_timestamp, deletedAt)
				: undefined,
			messageType: typeof message.type === "number" ? message.type : 0,
			flags: typeof message.flags === "number" ? message.flags : 0,
			pinned: !!message.pinned,
			tts: !!message.tts,
			referencedMessage: message.referenced_message
				? {
						id: String(message.referenced_message.id ?? ""),
						channelId: String(
							message.referenced_message.channel_id ?? channelId,
						),
						author: plainUser(message.referenced_message.author),
						content: clip(message.referenced_message.content, 500),
					}
				: undefined,
			// Rich content only. The per-capture `backupPath` / `richContentPerFile` are gone: native no
			// longer switches its base directory from a capture (that is setBaseDir's job, in start()).
			...(richContent ? { richContent } : {}),
			sentAt: epochMs(message.timestamp, deletedAt),
			deletedAt,
		},
		cfg.toastOnCatch,
		meta.authorName,
		meta.channelName,
	);
}

/** Module-scope state reset for stop() (keep the session state out of a reload). */
export function resetCaptureState() {
	recentCaptures.clear();
	cancelBackupTimer();
	for (const notice of pendingNotices.values()) clearTimeout(notice.timer);
	pendingNotices.clear();
}
