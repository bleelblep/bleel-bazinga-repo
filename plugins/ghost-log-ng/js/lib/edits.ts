/**
 * Edit history: one record per edited message, newest first, each holding the versions it had
 * before its current text. The native encrypted store is the source of truth; this mirrors it for
 * the render path, which runs per row per frame and needs an O(1) lookup by message id.
 *
 * `handleEdit` is the MESSAGE_UPDATE half of the capture pipeline, kept here with the rest of the
 * edit machinery so one edit bug is fixed in one file.
 */

import * as react from "@valenced/react";
import { reportError } from "../../../../shared/report";
import { getSettings } from "../settings";
import { native } from "./bridge";
import { scheduleBackup } from "./capture";
import { isDeletedMessage } from "./keep";
import { epochMs } from "./sanitize";
import { getStores } from "./stores";

const TAG = "[GhostLogNG:edits]";

/** One earlier version of a message: its text, and when an edit replaced it. */
export interface EditVersion {
	content: string;
	editedAt: number;
}

/** Everything known about one edited message. Mirrors the native record exactly. */
export interface EditRecord {
	id: string;
	channelId: string;
	guildId?: string;
	authorId: string;
	authorName: string;
	channelName: string;
	guildName?: string;
	authorAvatar?: string;
	guildIcon?: string;
	sentAt?: number;
	/** Oldest first. The current text is not in here -- see `current`. */
	versions: EditVersion[];
	current: string;
	/** When the latest edit happened. */
	editedAt: number;
}

/** What JS hands native for one edit; native merges it into the message's record. */
export interface EditCapture {
	id: string;
	channelId: string;
	guildId?: string;
	authorId: string;
	authorName: string;
	channelName: string;
	guildName?: string;
	authorAvatar?: string;
	guildIcon?: string;
	sentAt?: number;
	previous: string;
	current: string;
	editedAt: number;
}

const byId = new Map<string, EditRecord>();
let ordered: EditRecord[] = [];
let loading = false;
const listeners = new Set<() => void>();

function rebuildOrder() {
	ordered = [...byId.values()].sort((a, b) => b.editedAt - a.editedAt);
}

function notify() {
	for (const fn of listeners) fn();
}

export function subscribeEdits(fn: () => void): () => void {
	listeners.add(fn);
	return () => listeners.delete(fn);
}

/** The record for one message, or undefined. Cheap enough for the row renderer. */
export function getEditRecord(messageId: string): EditRecord | undefined {
	return byId.get(messageId);
}

export function getEdits(): EditRecord[] {
	return ordered;
}

// What changed while a refresh was reading native (see ui/state.ts refreshLog for the full story):
// the snapshot is merged with these instead of replacing the in-session copy. Only recorded while a
// refresh is in flight, except `unsettled`, which is bounded by captureEdit calls native has not
// answered.
const editedDuringLoad = new Set<string>();
const removedDuringLoad = new Set<string>();
let clearedDuringLoad = false;
const unsettled = new Set<string>();

/** Reload from native, merged with edits caught while it was reading. A failed read keeps the cache. */
export async function refreshEdits(): Promise<EditRecord[]> {
	if (loading) return ordered;
	loading = true;
	editedDuringLoad.clear();
	removedDuringLoad.clear();
	clearedDuringLoad = false;
	try {
		const raw = await native.getEdits();
		const records = raw ? (JSON.parse(raw) as EditRecord[]) : [];
		if (!Array.isArray(records))
			throw new Error("getEdits returned something other than a list");
		const next = new Map<string, EditRecord>();
		if (!clearedDuringLoad) {
			for (const record of records)
				if (record?.id && !removedDuringLoad.has(record.id))
					next.set(record.id, record);
		}
		// The in-session copy wins for edits native had not merged when the read started, or that
		// arrived during it.
		for (const [id, record] of byId) {
			if (
				(unsettled.has(id) || editedDuringLoad.has(id)) &&
				!removedDuringLoad.has(id)
			)
				next.set(id, record);
		}
		byId.clear();
		for (const [id, record] of next) byId.set(id, record);
		rebuildOrder();
		notify();
	} catch (error) {
		reportError(`${TAG} getEdits failed; keeping the cached history:`, error);
	} finally {
		loading = false;
		editedDuringLoad.clear();
		removedDuringLoad.clear();
		clearedDuringLoad = false;
	}
	return ordered;
}

/**
 * Records one edit. The JS copy is updated at once, the same way native will merge it, so the row
 * Discord redraws for this very update already shows the earlier version. Native's merged record
 * then replaces the guess.
 */
export function captureEdit(edit: EditCapture) {
	const existing = byId.get(edit.id);
	const versions = [...(existing?.versions ?? [])];
	const last = versions[versions.length - 1]?.content;
	if (edit.previous !== last && edit.previous !== edit.current) {
		versions.push({ content: edit.previous, editedAt: edit.editedAt });
	}
	const { previous: _previous, current, ...meta } = edit;
	byId.set(edit.id, {
		...meta,
		...(existing ?? {}),
		versions: versions.slice(-20),
		current,
		editedAt: edit.editedAt,
	});
	rebuildOrder();
	notify();
	unsettled.add(edit.id);
	if (loading) editedDuringLoad.add(edit.id);
	removedDuringLoad.delete(edit.id);

	native
		.captureEdit(edit as unknown as Record<string, unknown>)
		.then((raw) => {
			if (!raw) return;
			const merged = JSON.parse(raw) as EditRecord;
			// Removed or cleared while native was merging it: don't bring it back.
			if (merged?.id && byId.has(merged.id)) {
				byId.set(merged.id, merged);
				rebuildOrder();
				notify();
			}
		})
		.catch((error) => reportError(`${TAG} captureEdit failed:`, error))
		.finally(() => unsettled.delete(edit.id));
}

/**
 * After a clear or remove native confirmed: rewrite the backup too, or Restore brings the history
 * back (ui/state.ts backupAfterRemoval has the same rule).
 */
function backupAfterRemoval() {
	try {
		const cfg = getSettings();
		if (cfg.autoBackupEnabled || cfg.lastBackupAt) scheduleBackup(cfg);
	} catch (error) {
		reportError(`${TAG} could not schedule the backup rewrite:`, error);
	}
}

function dropRecords(ids: Iterable<string>) {
	for (const id of ids) {
		byId.delete(id);
		unsettled.delete(id);
		editedDuringLoad.delete(id);
		if (loading) removedDuringLoad.add(id);
	}
	rebuildOrder();
	notify();
}

/**
 * Takes one message's edit history out of the log, here and in native. True only when native
 * confirmed it; otherwise the cache is reloaded from native and the failure reported.
 */
export async function removeEditRecord(messageId: string): Promise<boolean> {
	let ok = false;
	try {
		ok = (await native.removeEdit(messageId)) === true;
	} catch (error) {
		reportError(`${TAG} removeEdit failed:`, error);
		void refreshEdits();
		return false;
	}
	if (!ok) {
		reportError(`${TAG} removeEdit: native did not have that record`);
		void refreshEdits();
		return false;
	}
	dropRecords([messageId]);
	backupAfterRemoval();
	return true;
}

/**
 * Takes several messages' edit history out in one native write (Select mode, remove from chat). True
 * when native removed every one; fewer reloads the cache from native and answers false.
 */
export async function removeEditRecords(
	messageIds: string[],
): Promise<boolean> {
	const unique = new Set(messageIds);
	if (!unique.size) return true;
	let removed = -1;
	try {
		const result = await native.removeEdits([...unique]);
		removed = typeof result === "number" ? result : -1;
	} catch (error) {
		reportError(`${TAG} removeEdits failed:`, error);
		void refreshEdits();
		return false;
	}
	if (removed < unique.size) {
		reportError(
			`${TAG} removeEdits removed ${Math.max(removed, 0)} of ${unique.size}`,
		);
		if (removed > 0) backupAfterRemoval();
		void refreshEdits();
		return false;
	}
	dropRecords(unique);
	backupAfterRemoval();
	return true;
}

/** Empties the edit history. True only when native confirmed it; otherwise nothing changes here. */
export async function clearEdits(): Promise<boolean> {
	let ok = false;
	try {
		ok = (await native.clearEdits()) === true;
	} catch (error) {
		reportError(`${TAG} clearEdits failed:`, error);
		void refreshEdits();
		return false;
	}
	if (!ok) {
		reportError(`${TAG} clearEdits refused`);
		void refreshEdits();
		return false;
	}
	byId.clear();
	ordered = [];
	unsettled.clear();
	editedDuringLoad.clear();
	if (loading) clearedDuringLoad = true;
	notify();
	backupAfterRemoval();
	return true;
}

/** React hook: the edit list, loaded on first mount and kept current. */
export function useEdits(): EditRecord[] {
	const { React } = react;
	const [records, setRecords] = React.useState<EditRecord[]>(getEdits());

	React.useEffect(() => {
		const unsub = subscribeEdits(() => setRecords(getEdits()));
		void refreshEdits();
		return unsub;
	}, []);

	return records;
}

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

/**
 * One edit, caught from MESSAGE_UPDATE before the store applies it -- so the store still holds the
 * text as it was, which is the version worth keeping.
 *
 * Plenty of MESSAGE_UPDATEs are not edits: an embed unfurling, a reaction count, a pin. Those carry
 * no `content`, or the same content, and are skipped. So are updates to a message already deleted.
 */
export function handleEdit(payload: any) {
	const incoming = payload?.message;
	if (!incoming) return;
	if (typeof incoming.content !== "string") return;
	const channelId = String(incoming.channel_id ?? incoming.channelId ?? "");
	const messageId = String(incoming.id ?? "");
	if (!channelId || !messageId) return;

	const cfg = getSettings();
	const s = getStores();
	const message = s.MessageStore?.getMessage?.(channelId, messageId);
	if (!message || isDeletedMessage(message)) return;
	const before = String(message.content ?? "");
	if (before === incoming.content) return;
	if (!cfg.logEdits) return;

	if (!cfg.logOwnEdits) {
		const me = s.UserStore?.getCurrentUser?.()?.id;
		if (me && message.author?.id === me) return;
	}
	if (cfg.ignoreBots && message.author?.bot) return;

	const meta = describe(message, channelId);
	const now = Date.now();
	captureEdit({
		id: messageId,
		channelId,
		guildId: meta.guildId,
		authorId: String(message.author?.id ?? ""),
		authorName: meta.authorName,
		channelName: meta.channelName,
		guildName: meta.guildName,
		authorAvatar: message.author?.avatar,
		guildIcon: meta.guildIcon,
		sentAt: epochMs(message.timestamp, now),
		previous: before.slice(0, 2000),
		current: incoming.content.slice(0, 2000),
		editedAt: epochMs(incoming.edited_timestamp, now),
	});
	// The encrypted backup carries edit history too, so an edit refreshes it like a catch does.
	if (cfg.autoBackupEnabled) scheduleBackup(cfg);
}

export function resetEditsState() {
	byId.clear();
	ordered = [];
	loading = false;
	editedDuringLoad.clear();
	removedDuringLoad.clear();
	clearedDuringLoad = false;
	unsettled.clear();
	listeners.clear();
}
