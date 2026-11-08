/**
 * Which messages are deleted, and getting a kept one redrawn.
 *
 * ## How a deleted message stays on screen
 *
 * `MESSAGE_DELETE` is blocked before any store sees it (see the flux handler in index.ts), so the
 * message simply never leaves `MessageStore`. Its id goes into `kept`, and everything that styles
 * or guards a deleted message asks `isDeletedMessage`, which answers from that set and the log.
 *
 * Up to GLNB 0.6.x the delete was rewritten into a fake `MESSAGE_UPDATE` carrying a
 * `__vml_deleted` property. That fake had to match a real update closely enough for Discord's
 * native code, which crashed the app when it didn't (mentions as id strings), and the property
 * lived only on that one record, so any later rebuild of the message dropped the styling and the
 * reply/react guard with it. Blocking is what kmmiio's Message Tweaks does, and it is the mobile
 * equivalent of Vencord's MessageLogger, which leaves the deleted message in the store with a flag.
 *
 * `__vml_deleted` is still honoured: render-restore sets it on the records it builds.
 */

import { Stores } from "@valenced/discord/flux";
import * as filters from "@valenced/modules/finders/filters";
import { reportError } from "../../../../shared/report";
import { getSettings } from "../settings";
import type { GhostLogSettings } from "../types";
import { isLoggedId } from "../ui/state";
import { safeLookup } from "./finders";
import { isEphemeral } from "./sanitize";
import { getStores } from "./stores";

const TAG = "[GhostLogNG:keep]";

/** Messages kept on screen this session. Ids only; a snowflake is unique across channels. */
const kept = new Set<string>();

export function markKept(messageId: string) {
	kept.add(messageId);
}

/** Whether this message id is a known deletion: kept this session, or in the log. */
export function isDeletedId(messageId: string): boolean {
	return kept.has(messageId) || isLoggedId(messageId);
}

export function isDeletedMessage(message: any): boolean {
	if (!message || typeof message !== "object") return false;
	if (message.__vml_deleted === true) return true;
	return typeof message.id === "string" && isDeletedId(message.id);
}

// Discord's per-channel message cache (`lib/ChannelMessages.tsx`). Path first: Discord 349.5
// minifies names, and module paths survived it.
let channelMessages: any;

export function watchChannelMessages(): () => void {
	const { withProps } = filters;
	return safeLookup({
		tag: TAG,
		path: "lib/ChannelMessages.tsx",
		filter: withProps("getOrCreate", "commit"),
		install: (mod: any) => {
			const cache = typeof mod?.getOrCreate === "function" ? mod : mod?.default;
			if (
				typeof cache?.getOrCreate === "function" &&
				typeof cache?.commit === "function"
			) {
				channelMessages = cache;
				return true;
			}
		},
	});
}

/**
 * The redraw marker: an own property whose value changes on every redraw.
 *
 * The row diff is `determineChangeType` in `modules/messages/native/renderer/ChatManager.tsx` (352.2
 * bundle): UPDATE when the row is forced or its id is listed, otherwise it runs the `deep-equal`
 * package (module 1357) over the old and new record and answers NOOP when they match. deep-equal
 * walks own enumerable keys, so a copy whose marker differs is a change while its `content` stays
 * exactly what Discord stored.
 *
 * This replaced a zero-width space toggled onto the end of `content` (Message Tweaks' technique).
 * That character lived in the store: the next real MESSAGE_UPDATE compared against it and logged a
 * fake edit (edits.ts), it went out in your own edit PATCH when you edited a redrawn message, and
 * Copy Text copied it.
 */
const REDRAW_KEY = "__glng_redraw";
let redrawCount = 0;

/** Swap one record for a same-prototype copy with `mark` applied, commit it, and repaint. */
function redrawRecord(
	channelId: string,
	messageId: string,
	mark: (copy: any) => void,
	label: string,
): boolean {
	try {
		const cache = channelMessages;
		if (!cache) return false;
		const collection = cache.getOrCreate(channelId);
		if (typeof collection?.has !== "function" || !collection.has(messageId))
			return false;
		if (typeof collection.update !== "function") return false;
		// update() is immutable: it returns a new collection, which has to be committed.
		const updated = collection.update(messageId, (message: any) => {
			try {
				if (message?.id !== messageId) return message;
				// A same-prototype copy with the same fields. Records built through merge() or the
				// constructor come back missing array fields and crash the row builder.
				const copy = Object.create(Object.getPrototypeOf(message));
				Object.defineProperties(
					copy,
					Object.getOwnPropertyDescriptors(message),
				);
				mark(copy);
				// A fresh value every time, so a second redraw of the same row is still a change.
				Object.defineProperty(copy, REDRAW_KEY, {
					value: ++redrawCount,
					enumerable: true,
					writable: true,
					configurable: true,
				});
				return copy;
			} catch {
				return message;
			}
		});
		cache.commit(updated);
		// After the current dispatch finishes: emitting from inside it re-enters React mid-render.
		queueMicrotask(() => {
			try {
				(Stores as any).MessageStore?.emitChange?.();
			} catch (error) {
				reportError(`${TAG} ${label} emit failed:`, error);
			}
		});
		return true;
	} catch (error) {
		reportError(`${TAG} ${label} failed:`, error);
		return false;
	}
}

/**
 * Redraw one kept message so its row picks up the deleted styling.
 *
 * Blocking the delete changes nothing in the store, so Discord has no reason to redraw the row. The
 * record is swapped for a copy carrying `__vml_deleted` and a fresh redraw marker (see REDRAW_KEY).
 *
 * Best effort. If any of it is missing the message is still kept, and the styling appears the next
 * time Discord redraws the row (reopening the channel, for one).
 */
export function redrawKept(channelId: string, messageId: string): boolean {
	return redrawRecord(
		channelId,
		messageId,
		(copy) => {
			copy.__vml_deleted = true;
		},
		"redraw",
	);
}

/**
 * Force one message's row to redraw WITHOUT marking it deleted. Same record copy as redrawKept, but
 * it leaves `__vml_deleted` alone. Used by the local-edit feature to make the RowManager hook re-run
 * and pick up (or drop) a session content override, and after Remove from Ghost Log. The stored
 * `content` is never touched.
 */
export function redrawMessage(channelId: string, messageId: string): boolean {
	return redrawRecord(channelId, messageId, () => {}, "redrawMessage");
}

// Messages the user asked Discord to delete (patches/blockGhostActions.ts sees the deleteMessage
// call), by id, for a short while. When the gateway confirms that delete it is not kept on screen:
// keeping your own deliberate delete as a ghost made it look like the delete had failed.
const userDeletes = new Map<string, number>();
const USER_DELETE_MS = 60_000;
const USER_DELETE_MAX = 200;

export function noteUserDelete(messageId: string) {
	const now = Date.now();
	userDeletes.set(messageId, now);
	// Bounded (AS-07): expired ones go first, then the oldest.
	if (userDeletes.size > USER_DELETE_MAX) {
		for (const [id, at] of userDeletes) {
			if (now - at > USER_DELETE_MS || userDeletes.size > USER_DELETE_MAX)
				userDeletes.delete(id);
			else break;
		}
	}
}

/** Whether this delete is one the user started in the last minute. */
export function isUserDelete(messageId: string): boolean {
	const at = userDeletes.get(messageId);
	if (at === undefined) return false;
	if (Date.now() - at > USER_DELETE_MS) {
		userDeletes.delete(messageId);
		return false;
	}
	return true;
}

/** A delete of your own message that you started here; capture.ts labels it "Deleted by you". */
export function isOwnUserDelete(message: any): boolean {
	if (typeof message?.id !== "string" || !isUserDelete(message.id))
		return false;
	const me = getStores().UserStore?.getCurrentUser?.()?.id;
	return !!me && message.author?.id === me;
}

/**
 * Whether a message being deleted stays on screen. Ephemeral messages are dismissed, not deleted;
 * a SEND_FAILED or SENDING message being removed is the user's own retry or cancel.
 */
export function shouldKeep(message: any, cfg: GhostLogSettings): boolean {
	if (!message || cfg.deleteStyle === "off") return false;
	// Log deletions off: nothing is logged, so nothing stays either. A kept message that isn't in
	// the log would vanish on the next reload and couldn't be removed from Ghost Log.
	if (!cfg.logDeletions) return false;
	if (message.state === "SEND_FAILED" || message.state === "SENDING")
		return false;
	if (isEphemeral(message)) return false;
	// Your own messages, deleted by you or anyone, stay only with "count own messages" on. A kept one
	// can't be deleted (or edited, pinned...) again: blockGhostActions refuses every action on it.
	if (!cfg.countOwnMessages) {
		const me = getStores().UserStore?.getCurrentUser?.()?.id;
		if (me && message.author?.id === me) return false;
	}
	if (cfg.ignoreBots && message.author?.bot) return false;
	return true;
}

/**
 * The MESSAGE_DELETE swallow decision, isolated behind one function with a payload shape-check.
 * Blocking a delete by having the flux handler return undefined is framework behaviour the whole
 * keep feature rests on; pre-0.7.0 the plugin instead rewrote deletes into fake MESSAGE_UPDATEs,
 * which crashed native code whenever the fake didn't match a real update. The handler keeps a
 * try/catch around this, so anything unexpected lets the delete through -- the worst case is
 * Discord's normal behaviour.
 *
 * Returns true when the delete was swallowed (the flux handler must return undefined).
 */
export function tryKeepOnScreen(payload: any, message: any): boolean {
	const channelId = String(payload?.channelId ?? payload?.channel_id ?? "");
	const messageId = String(payload?.id ?? "");
	if (!channelId || !messageId) return false;
	if (!shouldKeep(message, getSettings())) return false;
	markKept(messageId);
	redrawKept(channelId, messageId);
	return true;
}

export function resetKeepState() {
	kept.clear();
	userDeletes.clear();
	redrawCount = 0;
	channelMessages = undefined;
}
