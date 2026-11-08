/**
 * Refusing every action that would send a request for a message that no longer exists.
 *
 * ## Why they were ever possible
 *
 * A kept deletion is still an ordinary `state: 'SENT'` message to the rest of the client: the delete
 * was blocked (index.ts), so the message never left `MessageStore`. Messages restored after a reload
 * (`lib/restore.ts`) look the same. Reply, react, edit, delete, pin, forward, create thread and mark
 * unread are therefore offered exactly as they are on a live message, and each one goes out to an
 * id the server has already deleted (account-safety AS-05: no requests to ids the server rejected).
 *
 * ## Why this hooks the action creators and not the sheet
 *
 * The long-press sheet is only one of the ways in. Swipe-to-reply and double-tap-to-react never
 * open a sheet at all, and hiding rows would leave those working. Every route ends at the same small
 * set of action creators, so blocking there covers all of them at once and cannot be bypassed by a
 * gesture we did not think of. Paths and exports are from the 352.2 bundle (hermes-dec); each one is
 * optional, and a module or method that is missing just leaves that action unguarded.
 *
 * ## Refusing without breaking the caller
 *
 * A refused call sends nothing and returns a resolved promise, never `undefined`: several of these
 * creators are async, and their callers `.then` the result. A promise is harmless to the sync ones.
 *
 * ## Plain wrappers, not the patcher's `instead`
 *
 * Send Tweaks hooks the reply creators and `editMessage`, Second Thoughts and Fake Nitro put
 * `instead` hooks on `MessageActionCreators`, and two `instead` hooks on one method can recurse
 * forever (coding rule 2). `shared/wrapMethod.ts` is a plain function, safe in any start order, and
 * keeps the receiver.
 *
 * ## Conservative by construction
 *
 * A hook only refuses when an argument is positively a known deletion (`isDeletedId`: kept this
 * session, or in the log). Anything else is passed straight through: the cost of a miss is the old
 * wrong behaviour on one message, while the cost of a false positive is a real action the user
 * cannot take, which is much worse. Snowflakes are unique across users, emoji and messages, with
 * one exception: a thread or forum post has the same id as the message it was started from. So a
 * channel id is skipped when it's the channel argument (a channel followed by another id), and a
 * channel object is never read as a message. Otherwise deleting a thread's starter message would
 * block every action inside that thread.
 */

import * as filters from "@valenced/modules/finders/filters";
import { getModuleByPath } from "../../../../shared/modules";
import { reportError } from "../../../../shared/report";
import { showToast } from "../../../../shared/toast";
import { wrapMethod } from "../../../../shared/wrapMethod";
import { isDeletedId, isDeletedMessage, noteUserDelete } from "../lib/keep";
import { getStores } from "../lib/stores";

const DEBUG: boolean = false;

const TAG = "[GhostLogNG:block]";

/** Discord snowflakes, used to spot id arguments without knowing the parameter order. */
const SNOWFLAKE = /^\d{17,20}$/;

function toast(content: string) {
	showToast(content, "GhostLogNgDeletedMessageToast");
}

/**
 * Whether a call targets a deleted message, deduced from the arguments alone.
 *
 * Deliberately shape-driven rather than positional: these creators have been resorted between
 * Discord versions before, and a hook that silently stops matching is worse than one that reads
 * a little loosely. Objects are checked directly and one level in (`{ message }`, `{ messageId }`);
 * loose snowflakes are checked as message ids.
 *
 * It no longer asks `MessageStore.getMessage`: a message restored after a reload is not in the store,
 * so that lookup found nothing and reactions went out to deleted ids.
 */
export function targetsDeletedMessage(args: any[]): boolean {
	const list = args ?? [];
	// The first loose id, when it's a channel and another loose id follows: the channel argument of
	// (channelId, messageId, ...). Inside a thread that id is also the starter message's.
	const ids = list.filter((a) => typeof a === "string" && SNOWFLAKE.test(a));
	const channelArg = ids.length > 1 && isChannelId(ids[0]) ? ids[0] : undefined;
	let skipped = false;
	for (const arg of list) {
		if (typeof arg === "string") {
			if (!skipped && arg === channelArg) {
				skipped = true;
				continue;
			}
			if (SNOWFLAKE.test(arg) && isDeletedId(arg)) return true;
			continue;
		}
		if (!arg || typeof arg !== "object") continue;
		if (
			(looksLikeMessage(arg) && isDeletedMessage(arg)) ||
			isDeletedMessage(arg.message)
		)
			return true;
		const messageId = arg.messageId ?? arg.message_id;
		if (typeof messageId === "string" && isDeletedId(messageId)) return true;
	}
	return false;
}

function isChannelId(id: string): boolean {
	try {
		return !!getStores()?.ChannelStore?.getChannel?.(id);
	} catch {
		return false;
	}
}

/**
 * A message, not a channel (a thread's channel object has its starter message's id). Our kept
 * messages are marked; Discord's have an author and a channel_id, which channels don't.
 */
function looksLikeMessage(arg: any): boolean {
	return (
		arg.__vml_deleted === true ||
		arg.author != null ||
		typeof arg.channel_id === "string"
	);
}

/** `deleteMessage(channelId, messageId, ...)`: the id the user just asked Discord to delete. */
function deletedIdOf(args: any[]): string | undefined {
	const [, messageId] = args ?? [];
	if (typeof messageId === "string" && SNOWFLAKE.test(messageId))
		return messageId;
	return undefined;
}

interface Target {
	/** Imported path (352.2), tried first. */
	path: string;
	/** Structural fallback for a build where the path moved. Several props, so it can't match a stranger. */
	props: string[];
	methods: string[];
	/** When the module's default export may be this creator itself rather than an object holding it. */
	defaultIs?: string;
	notice: string;
}

const DELETED = "That message was deleted";

const TARGETS: Target[] = [
	{
		path: "modules/replies/PendingReplyActionCreators.tsx",
		props: ["createPendingReply", "createShallowPendingReply"],
		// Both entry points for a reply draft; the shallow one is what the swipe gesture uses.
		methods: ["createPendingReply", "createShallowPendingReply"],
		notice: `${DELETED} — you can't reply to it.`,
	},
	{
		path: "modules/reactions/ReactionActionCreators.tsx",
		props: ["addReaction", "removeReaction"],
		// Removing too: every one of these is a request for the dead id, which the server refuses.
		methods: [
			"addReaction",
			"removeReaction",
			"removeAllReactions",
			"removeEmojiReactions",
		],
		notice: `${DELETED} — you can't react to it.`,
	},
	{
		path: "actions/MessageActionCreators.tsx",
		props: ["deleteMessage", "editMessage", "startEditMessage"],
		methods: [
			"deleteMessage",
			"startEditMessage",
			"startEditMessageRecord",
			"editMessage",
			"suppressEmbeds",
			"crosspostMessage",
		],
		notice: `${DELETED} — there's nothing left to change.`,
	},
	{
		path: "actions/ChannelPinActionCreators.tsx",
		props: ["pinMessage", "unpinMessage"],
		methods: ["pinMessage", "unpinMessage"],
		notice: `${DELETED} — you can't pin it.`,
	},
	{
		path: "modules/messages/markUnread.tsx",
		props: ["markUnread"],
		methods: ["markUnread"],
		defaultIs: "markUnread",
		notice: `${DELETED} — you can't mark it unread.`,
	},
	{
		path: "modules/forwarding/native/ForwardModalUtils.tsx",
		props: ["openForwardModal", "closeForwardModal"],
		methods: ["openForwardModal"],
		notice: `${DELETED} — you can't forward it.`,
	},
	{
		// The long-press rows' own handlers. Calls inside that module bypass its exports, so the
		// creators these end in are guarded too (startEditMessageRecord above, thread creation below).
		path: "modules/messages/native/long_press/LongPressMessageActionSheetUtils.tsx",
		props: ["handleCreateThread", "handleCopyMessageLink"],
		methods: ["handleCreateThread", "handleEdit"],
		notice: `${DELETED} — you can't do that to it.`,
	},
	{
		path: "modules/threads/ThreadActionCreators.tsx",
		props: ["openThreadCreationForMobile", "archiveThread"],
		methods: ["openThreadCreationForMobile"],
		notice: `${DELETED} — you can't start a thread from it.`,
	},
];

/** Wraps host[key] with the guard, once. `wrappers` holds our own wrappers so none is wrapped again. */
function guard(
	host: any,
	key: string,
	method: string,
	target: Target,
	wrappers: Set<any>,
	cleanups: Array<() => void>,
) {
	const current = host?.[key];
	if (typeof current !== "function" || wrappers.has(current)) return;
	const isDelete = method === "deleteMessage";

	// Inside a try: a read-only export (a getter) throws on assignment in strict code, and that must
	// cost this one method's guard, not the rest of the module's.
	try {
		const unwrap = wrapMethod(host, key, function (this: any, args, original) {
			try {
				if (targetsDeletedMessage(args)) {
					toast(target.notice);
					return Promise.resolve();
				}
				// A delete the user started on a live message: it must not be kept as a ghost when the
				// gateway confirms it (keep.ts shouldKeep).
				if (isDelete) {
					const id = deletedIdOf(args);
					if (id) noteUserDelete(id);
				}
			} catch (error) {
				// Never let the guard itself break a real action.
				reportError(`${TAG} ${method} guard failed:`, error);
			}
			return Reflect.apply(original, this, args);
		});
		if (host[key] !== current) wrappers.add(host[key]);
		cleanups.push(unwrap);
	} catch (error) {
		reportError(`${TAG} could not guard ${method}:`, error);
		return;
	}
	if (DEBUG) console.log(`${TAG} guarded ${method}`);
}

function install(
	module: any,
	target: Target,
	wrappers: Set<any>,
	cleanups: Array<() => void>,
) {
	// Named exports and the default object both, when present: Discord calls some creators through
	// one and some through the other. The same function on both is wrapped on both (each wrapper calls
	// the real function, so they never chain).
	const hosts = new Set<any>();
	for (const host of [module, module?.default])
		if (host && typeof host === "object") hosts.add(host);
	for (const host of hosts)
		for (const method of target.methods)
			guard(host, method, method, target, wrappers, cleanups);
	// A module whose default export is the creator itself (markUnread on some builds).
	if (target.defaultIs && typeof module?.default === "function") {
		guard(module, "default", target.defaultIs, target, wrappers, cleanups);
	}
}

/**
 * Path first (survives minification), structural fallback second. Not `lookupModule`: its misses
 * are cached for the session and its budget is shared across every caller in the app.
 */
export default function patchBlockGhostActions(): () => void {
	const cleanups: Array<() => void> = [];
	const unsubscribes: Array<() => void> = [];
	let stopped = false;

	try {
		const { withProps } = filters;
		for (const target of TARGETS) {
			const wrappers = new Set<any>();
			try {
				unsubscribes.push(
					getModuleByPath(
						target.path,
						(withProps as any)(...target.props),
						(mod: any) => {
							// A finder can call back after teardown; a wrapper installed then would stay live.
							if (stopped) return;
							install(mod, target, wrappers, cleanups);
						},
						TAG,
					),
				);
			} catch (error) {
				reportError(`${TAG} could not guard ${target.path}:`, error);
			}
		}
	} catch (error) {
		reportError(`${TAG} action guards unavailable:`, error);
	}

	return () => {
		stopped = true;
		for (const unsubscribe of unsubscribes) {
			try {
				unsubscribe();
			} catch {
				/* already gone */
			}
		}
		for (const unwrap of cleanups) {
			try {
				unwrap();
			} catch {
				/* already gone */
			}
		}
		cleanups.length = 0;
		unsubscribes.length = 0;
	};
}
