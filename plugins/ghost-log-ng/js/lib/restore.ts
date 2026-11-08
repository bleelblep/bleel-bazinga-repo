/**
 * Render-layer restore: rebuilding bulk-deleted (and post-reload) messages into the chat from the
 * log.
 *
 * We hook MessageStore.getMessages (the render data source) and merge real MessageRecord instances
 * (built by Discord's createMessageRecord) for our stored deletions into the returned _array.
 * Because they're genuine records, isNewMessageGroup doesn't crash; because getMessages re-reads
 * every draw and re-adds on reconcile, they persist.
 *
 * The old plugin paired a before/after hook with a LIFO stack to hand the channel id from before()
 * to after() (after() receives no args). A throwing original left a stale entry, and nested
 * getMessages calls could mis-pair. A single `instead` wrapper closes over its own args -- the
 * channel id comes from args[0] of the call being wrapped, no pairing state at all. One `instead`
 * per method, and nothing else in this repo patches getMessages, so the two-instead recursion trap
 * (coding rule 2) does not apply.
 */

import { getStore } from "@valenced/discord/flux";
import { instead } from "@valenced/patcher";
import { reportError } from "../../../../shared/report";
import type { GhostLogSettings } from "../types";
import type { DeletedMessage } from "../ui/state";
import { getCachedLog, getLogVersion, rehydrateChannel } from "../ui/state";

const TAG = "[GhostLogNG:restore]";

// The probe proved _array holds MessageRecord class instances (timestamp is a Date, author is a
// UserRecord, methods like isEdited/toJS). A hand-built plain object crashes the row builder. So we
// build injected messages with Discord's own createMessageRecord, captured by visuals.ts's finder
// (which already locates that module -- no second getModules call, avoiding the budget problem).
let createMessageRecord: ((...a: any[]) => any) | undefined;

export function setCreateMessageRecord(fn: any) {
	if (typeof fn === "function") createMessageRecord = fn;
}

// A captured deletion never changes once stored, so the MessageRecord built for it is reusable.
// It used to be rebuilt from scratch on every getMessages call -- and getMessages runs several
// times per frame, so the cost was (entries for this channel) x (calls per frame), all of it
// synchronous on the render path. Measured on-device at 341.8: ~15ms per call with 30 orphaned
// entries, scaling linearly, against a 16ms frame budget. Deleting messages in quick succession
// grows that set fast, which is what turned a burst of deletions into an unrecoverable freeze.
// Building each record once collapses the per-call cost to the presence scan below.
//
// Keyed by entry id, but each record also remembers which media URLs it was built with. Saved
// images are decrypted per channel AFTER the first draw (`rehydrateChannel`), which rewrites the
// entry's urls from the Discord CDN link to a local file:// copy and bumps the log version. The
// cache used to drop only entries that had left the log, so the record built on first sight -- with
// the CDN link, which Discord deletes along with the message -- was reused forever and the saved
// copy never reached the screen: "media doesn't restore at all".
const recordCache = new Map<string, { record: any; media: string }>();

/**
 * Whether an entry's media now points at saved copies. A deletion GLNG blocked (0.7.0 delete
 * model) stays in the store as Discord's own record, with the CDN links Discord deletes along with
 * the message: those rows are swapped for one built from the entry once its media is local, or
 * saved videos never play and saved images vanish when the image cache lets go.
 */
function hasLocalMedia(entry: DeletedMessage): boolean {
	return mediaKey(entry).includes("file://");
}

/** Every media URL an entry would render, as one comparable string. */
function mediaKey(entry: DeletedMessage): string {
	const urls: string[] = [];
	for (const attachment of entry.attachments ?? [])
		urls.push(
			String(attachment?.url ?? ""),
			String(attachment?.proxy_url ?? ""),
		);
	for (const embed of entry.embeds ?? []) {
		for (const part of [embed?.image, embed?.thumbnail, embed?.video])
			if (part) urls.push(String(part.url ?? ""), String(part.proxy_url ?? ""));
	}
	return urls.join("|");
}

// The log indexed by channel, rebuilt once per log version. getMessages used to filter the whole
// log on every call that missed the clone memo -- including every call for a channel with nothing
// logged, the normal case -- so with an unlimited log the render path paid O(log) several times a
// frame. Now a channel with nothing logged costs one Map lookup.
let byChannel = new Map<string, DeletedMessage[]>();
let indexVersion = -1;

// Entries whose record could not be built, with the media key they failed with. A bad entry used to
// throw (and report) on every getMessages call; now it is retried only when its media changes
// (rehydrate) or the plugin restarts.
const failedRecords = new Map<string, string>();

/**
 * Re-index the log by channel and drop memoized records for entries that have left it (trim, clear,
 * reload), once per log version. Takes the whole log, not one channel's slice -- pruning against a
 * slice would evict every other channel's records on each call and defeat the cache entirely.
 */
function syncIndex(allEntries: DeletedMessage[], version: number) {
	if (indexVersion === version) return;
	indexVersion = version;
	const next = new Map<string, DeletedMessage[]>();
	for (const entry of allEntries) {
		const list = next.get(entry.channelId);
		if (list) list.push(entry);
		else next.set(entry.channelId, [entry]);
	}
	byChannel = next;
	if (recordCache.size || failedRecords.size) {
		const live = new Set(allEntries.map((e) => e.id));
		for (const id of recordCache.keys())
			if (!live.has(id)) recordCache.delete(id);
		for (const id of failedRecords.keys())
			if (!live.has(id)) failedRecords.delete(id);
	}
}

/** Build once, reuse thereafter. Returns undefined if the record could not be built. */
function recordFor(entry: DeletedMessage, channelId: string): any {
	const media = mediaKey(entry);
	const hit = recordCache.get(entry.id);
	if (hit && hit.media === media) return hit.record;
	if (failedRecords.get(entry.id) === media) return undefined;
	try {
		const record = createMessageRecord!(buildRaw(entry, channelId));
		if (!record) {
			failedRecords.set(entry.id, media);
			return undefined;
		}
		record.__vml_deleted = true;
		recordCache.set(entry.id, { record, media });
		failedRecords.delete(entry.id);
		return record;
	} catch (error) {
		failedRecords.set(entry.id, media);
		reportError(
			`${TAG} createMessageRecord failed for a logged message:`,
			error,
		);
		return undefined;
	}
}

/** Numeric time of a store message regardless of how its timestamp field is represented. */
function timeOf(m: any): number {
	const t = m?.timestamp;
	if (t instanceof Date) return t.getTime();
	if (typeof t === "number") return t;
	if (typeof t === "string") {
		const n = Date.parse(t);
		return Number.isNaN(n) ? 0 : n;
	}
	return 0;
}

/**
 * _array is chronologically ordered, but direction isn't fixed -- some views (e.g. jump-to-message)
 * hand back newest-first. Detect direction from the array's own two ends rather than assuming
 * oldest-first, then splice into the matching sorted position instead of pushing onto the end.
 *
 * On a cold or partially-paginated load, `array` only holds a recent window. An entry older (in
 * insertion order) than everything currently loaded has no real neighbor yet -- Discord just hasn't
 * paginated back far enough to know what's actually next to it -- so inserting it at the edge shoves
 * it in front of messages it doesn't belong next to until more history streams in. This hook reruns
 * on every getMessages call against a fresh copy, so skipping here just means it self-corrects once
 * the loaded window actually reaches back past the entry's timestamp, rather than guessing wrong now.
 */
function mergeSorted(source: any[], records: any[]): any[] | undefined {
	if (!records.length) return undefined;

	// No ordering information to work from: preserve the old push-to-end behaviour.
	if (!source.length) return source.concat(records);

	const dir =
		source.length >= 2 && timeOf(source[0]) > timeOf(source[source.length - 1])
			? -1
			: 1;
	const edgeTs =
		dir === 1 ? timeOf(source[0]) : timeOf(source[source.length - 1]);

	const admitted: any[] = [];
	for (const record of records) {
		// Same rule as before: a record with no usable timestamp can only go on the end, and one
		// that falls outside the currently-loaded window is skipped rather than jammed against the
		// edge -- it self-corrects once pagination reaches back past it.
		if (!(record?.timestamp instanceof Date)) {
			admitted.push(record);
			continue;
		}
		const ts = timeOf(record);
		// `edgeTs` is the OLDEST loaded timestamp in both directions (source[0] when oldest-first,
		// source[last] when newest-first), so the skip test is `ts < edgeTs` either way. It used to
		// read `ts > edgeTs` for the newest-first case, which inverted the rule: it dropped every
		// record inside the loaded window and admitted only the ones that fall outside it. That made
		// jump-to-message views restore exactly the wrong set.
		if (ts < edgeTs) continue;
		admitted.push(record);
	}
	if (!admitted.length) return undefined;

	// Single linear merge instead of one splice per record: splicing inserted each record with an
	// O(loaded) scan plus an O(loaded) memmove, so a channel with many logged deletions cost
	// O(missing x loaded) on every getMessages call.
	admitted.sort((a, b) =>
		dir === 1 ? timeOf(a) - timeOf(b) : timeOf(b) - timeOf(a),
	);

	const out: any[] = [];
	let i = 0;
	let j = 0;
	while (i < source.length && j < admitted.length) {
		const st = timeOf(source[i]);
		const at = timeOf(admitted[j]);
		// `<=` keeps an existing message ahead of an injected one at an equal timestamp, matching
		// the old insert loop, which walked back only while the neighbour was strictly later.
		if (dir === 1 ? st <= at : st >= at) out.push(source[i++]);
		else out.push(admitted[j++]);
	}
	while (i < source.length) out.push(source[i++]);
	while (j < admitted.length) out.push(admitted[j++]);
	return out;
}

/** Raw snake_case message, same shape the store normalizes on LOAD_MESSAGES_SUCCESS. */
function buildRaw(entry: DeletedMessage, channelId: string): any {
	return {
		id: entry.id,
		channel_id: channelId,
		content: entry.content,
		author: {
			id: entry.authorId,
			username: entry.authorName,
			global_name: entry.authorName,
			avatar: entry.authorAvatar,
			discriminator: "0",
			public_flags: 0,
		},
		attachments: entry.attachments ?? [],
		embeds: entry.embeds ?? [],
		// These were hardcoded empty in the old plugin's first cut, which is why a bulk-deleted
		// message came back stripped: no mentions (they rendered as raw <@id> markup), no reply
		// context, no edited marker, and every message forced to type 0 regardless of what it
		// actually was.
		// Older entries stored record mentions (id strings) as { id: '' }: a user without an id
		// crashes Discord's user search, so only complete ones go back out.
		mentions: (entry.mentions ?? []).filter(
			(user: any) => user?.id && user?.username,
		),
		mention_roles: entry.mentionRoles ?? [],
		mention_everyone: entry.mentionEveryone ?? false,
		timestamp: new Date(entry.sentAt).toISOString(),
		edited_timestamp: entry.editedAt
			? new Date(entry.editedAt).toISOString()
			: null,
		pinned: entry.pinned ?? false,
		tts: entry.tts ?? false,
		flags: entry.flags ?? 0,
		type: entry.messageType ?? 0,
		state: "SENT",
		...(entry.referencedMessage
			? {
					message_reference: {
						channel_id: entry.referencedMessage.channelId,
						message_id: entry.referencedMessage.id,
						guild_id: entry.guildId,
					},
					referenced_message: {
						id: entry.referencedMessage.id,
						channel_id: entry.referencedMessage.channelId,
						content: entry.referencedMessage.content ?? "",
						author: entry.referencedMessage.author ?? {
							id: "0",
							username: "Unknown",
							discriminator: "0",
						},
						attachments: [],
						embeds: [],
						mentions: [],
						mention_roles: [],
						timestamp: new Date(entry.sentAt).toISOString(),
						type: 0,
					},
				}
			: {}),
	};
}

/**
 * Keep `last()` on the newest REAL message (coding rule 8: the clone goes to every getMessages
 * caller, not just the chat list).
 *
 * A bulk-deleted message newer than everything still in the channel sorts to the end of the merged
 * array, so the clone's `last()` would answer with a ghost. Callers read `last()` to decide what the
 * newest message is -- acking the channel, "jump to present", the edit-last-message shortcut -- and
 * any of those would send the dead id to the server (AS-05). The array keeps its order (the row
 * shows where it was), and only `last()` on this clone skips past injected records. When the store
 * has no real message at all there is nothing else to answer with, so it is left alone.
 */
function pinLastToReal(
	clone: any,
	merged: any[],
	injected: any[],
	hasReal: boolean,
) {
	if (!hasReal || !injected.length || typeof clone.last !== "function") return;
	const ghosts = new Set(injected);
	if (!ghosts.has(merged[merged.length - 1])) return;
	for (let i = merged.length - 1; i >= 0; i--) {
		const message = merged[i];
		if (!ghosts.has(message)) {
			clone.last = () => message;
			return;
		}
	}
}

/**
 * Installs the render-restore hook once MessageStore is available.
 *
 * Valenced stopped loading every Flux store eagerly at startup (revenge-bundle-next 458e545), so
 * MessageStore is often not loaded yet when this runs just after start(). Reading
 * `Stores.MessageStore` then returned undefined and render restore switched itself off for the
 * whole session. Wait for the store instead; getStore calls back at once if it is already there.
 */
export function patchRenderRestore(
	getSettings: () => GhostLogSettings,
): () => void {
	let cancelled = false;
	let uninstall: (() => void) | undefined;
	let unwait: (() => void) | undefined;
	try {
		unwait = getStore("MessageStore", (ms: any) => {
			if (cancelled || uninstall) return;
			try {
				uninstall = installRenderRestore(ms, getSettings);
			} catch (error) {
				reportError(`${TAG} render restore failed to install:`, error);
			}
		});
	} catch (error) {
		reportError(
			`${TAG} waiting for MessageStore failed; render restore disabled:`,
			error,
		);
	}
	return () => {
		cancelled = true;
		try {
			unwait?.();
		} catch (e) {
			/* ignore */
		}
		try {
			uninstall?.();
		} catch (e) {
			/* ignore */
		}
		uninstall = undefined;
	};
}

function installRenderRestore(
	ms: any,
	getSettings: () => GhostLogSettings,
): () => void {
	if (typeof ms?.getMessages !== "function") {
		reportError(`${TAG} getMessages not found; render restore disabled`);
		return () => {};
	}

	// One memoized clone per channel. getMessages runs several times per frame and, before this,
	// every one of those calls rebuilt the merged array AND allocated a fresh clone object -- pure
	// garbage on the render path. The store hands back the same collection object (and the same
	// backing array) until it actually mutates, so keying on the array identity, its length and the
	// log version reuses the previous clone for every repeat call within a frame.
	// Bounded, unlike before. Each entry holds a whole merged message array and the key is the
	// channel, so this grew by one full conversation for every channel with logged deletions the
	// user visited, and was freed only when the plugin stopped -- growth tied to exactly the
	// usage this plugin exists for. Oldest goes first; losing a memo costs one rebuild.
	const MAX_CACHED_CHANNELS = 8;
	// `clone: null` memoizes "nothing to inject here", so a channel whose logged deletions are all
	// still in the store (the usual case: a blocked single delete) costs O(1) per repeat call too.
	const cloneCache = new Map<
		string,
		{
			source: any[];
			length: number;
			head: string;
			tail: string;
			version: number;
			clone: any;
		}
	>();
	const remember = (
		channelId: string,
		memo: {
			source: any[];
			length: number;
			head: string;
			tail: string;
			version: number;
			clone: any;
		},
	) => {
		cloneCache.delete(channelId);
		cloneCache.set(channelId, memo);
		// Map iterates in insertion order, so the first key is the least recently cached.
		while (cloneCache.size > MAX_CACHED_CHANNELS) {
			const oldest = cloneCache.keys().next();
			if (oldest.done) break;
			cloneCache.delete(oldest.value);
		}
	};

	// The memo is only sound while the SET OF IDS in the store's array is unchanged. Array identity
	// plus length alone was not enough: the store mutates its backing array in place, so a removal
	// paired with an insertion in the same frame keeps both identity and length while changing which
	// messages are present, and the stale clone would then hide a real message or double an injected
	// one. Fingerprinting the ends as well catches that at O(1). (Content edits need no invalidation:
	// the merged array holds references to the store's own records, so an in-place edit is visible
	// through the clone already.)
	const edgeId = (array: any[], index: number) =>
		String(array[index]?.id ?? "");

	const unpatch = instead(
		ms,
		"getMessages",
		function (this: any, args: any[], original: any) {
			// A plain `function` + Reflect.apply(original, this, args): getMessages is a method and
			// needs its receiver; an arrow + original(...args) runs it with this === undefined (the
			// crash class seen on RowManager.generate in 0.1.2 -- see visuals.ts for the full note).
			if (typeof original !== "function") return undefined;
			// The original always runs: this is a filter on its result, and refusing to call it would
			// blank the channel. The channel id is the first argument of the wrapped call.
			const ret: any = Reflect.apply(original, this, args);
			const channelId = args?.[0] != null ? String(args[0]) : undefined;
			try {
				if (!channelId || !ret?._array || !Array.isArray(ret._array))
					return ret;
				if (typeof createMessageRecord !== "function") return ret;
				// "Off" means off. Restoring deleted messages into the chat while the user has the visual
				// style disabled put them back on screen through the other door.
				if (getSettings().deleteStyle === "off") return ret;

				const version = getLogVersion();
				const source: any[] = ret._array;
				const head = edgeId(source, 0);
				const tail = edgeId(source, source.length - 1);
				const cached = cloneCache.get(channelId);
				if (
					cached &&
					cached.source === source &&
					cached.length === source.length &&
					cached.head === head &&
					cached.tail === tail &&
					cached.version === version
				) {
					return cached.clone ?? ret;
				}

				syncIndex(getCachedLog(), version);
				const entries = byChannel.get(channelId);
				if (!entries?.length) return ret;
				const memo = {
					source,
					length: source.length,
					head,
					tail,
					version,
					clone: null as any,
				};

				// Saved images/videos for this channel are decrypted on first sight of the channel, not at
				// startup for the whole log. Fire-and-forget: it bumps the log version when it lands, which
				// invalidates both caches above and rebuilds the records with local URIs.
				rehydrateChannel(channelId);

				const present = new Set(ret._array.map((m: any) => String(m?.id)));
				const missing = entries.filter((e) => !present.has(e.id));
				// Still in the store (a blocked deletion) but with media saved locally: see hasLocalMedia.
				const localised = entries.filter(
					(e) => present.has(e.id) && hasLocalMedia(e),
				);
				if (!missing.length && !localised.length) {
					remember(channelId, memo);
					return ret;
				}

				const records: any[] = [];
				for (const entry of missing) {
					const record = recordFor(entry, channelId);
					if (record) records.push(record);
				}
				const swapped = new Map<string, any>();
				for (const entry of localised) {
					const record = recordFor(entry, channelId);
					if (record) swapped.set(entry.id, record);
				}
				// A copy with the swapped rows; the store's own array is never written (see below).
				const base: any[] = swapped.size
					? ret._array.map((m: any) => swapped.get(String(m?.id)) ?? m)
					: ret._array;

				// _array is the store's own live backing array, not a copy handed out per call -- splicing
				// into it directly desyncs whatever id/index bookkeeping the real MESSAGE_CREATE/UPDATE
				// reducers keep alongside it (this is what crashed active conversations: a real-time
				// dispatch landing on indices our splice had silently shifted). Build the merge on a
				// throwaway copy and hand back a shallow clone of the record instead, so the store's own
				// array is never touched.
				const merged =
					mergeSorted(base, records) ??
					(base !== ret._array ? base : undefined);
				if (merged) {
					// Deliberately not logged per call: this hook runs several times per frame, and during
					// a deletion burst the console bridge was itself a measurable share of the cost.
					const clone = Object.assign(
						Object.create(Object.getPrototypeOf(ret)),
						ret,
					);
					clone._array = merged;
					pinLastToReal(clone, merged, records, base.length > 0);
					// _map has to carry the injected records too. It is the collection's own id index, and
					// leaving it untouched produced a collection whose array contains ids that `get(id)` and
					// `has(id)` deny exist -- a caller that finds a row and then looks it up gets undefined.
					if (ret._map && typeof ret._map === "object") {
						const map: Record<string, any> = { ...ret._map };
						for (const record of records) map[String(record.id)] = record;
						for (const [id, record] of swapped) map[id] = record;
						clone._map = map;
					}
					memo.clone = clone;
					remember(channelId, memo);
					return clone;
				}
				remember(channelId, memo);
			} catch (error) {
				reportError(`${TAG} render restore hook failed:`, error);
			}
			return ret;
		},
	);

	return () => {
		cloneCache.clear();
		recordCache.clear();
		failedRecords.clear();
		byChannel = new Map();
		indexVersion = -1;
		try {
			unpatch();
		} catch (e) {
			/* ignore */
		}
	};
}

export function resetRestoreState() {
	recordCache.clear();
	failedRecords.clear();
	byChannel = new Map();
	indexVersion = -1;
	createMessageRecord = undefined;
}
