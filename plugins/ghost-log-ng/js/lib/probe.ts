import * as flux from "@valenced/discord/flux";
import { Stores } from "@valenced/discord/flux";
import * as finders from "@valenced/modules/finders";
import * as filters from "@valenced/modules/finders/filters";
import * as metro from "@valenced/modules/metro";
import * as patcher from "@valenced/patcher";
import { reportError } from "../../../../shared/report";

const DEBUG: boolean = false;

const TAG = "[GhostLogNG]";

function stores() {
	return Stores as any;
}

/**
 * Registry for the long-lived Debug-page probes.
 *
 * These used to be plain module-scope variables inside the Debug page, so nothing tore them down
 * when the plugin was disabled: "Watch getMessages" left a second before/after pair installed on
 * MessageStore.getMessages -- the hottest read on the render path -- for the rest of the app's life.
 * index.ts registers stopAllProbes with the plugin's cleanup instead.
 */
export type ProbeKey = "messageLoad" | "getMessages";
const activeProbes = new Map<ProbeKey, () => void>();

export function isProbeRunning(key: ProbeKey): boolean {
	return activeProbes.has(key);
}

/** Turn one probe on or off. Returns whether it is running afterwards. */
export function setProbeRunning(key: ProbeKey, on: boolean): boolean {
	const existing = activeProbes.get(key);
	if (on && !existing) {
		try {
			activeProbes.set(
				key,
				key === "messageLoad" ? startMessageLoadProbe() : watchGetMessages(),
			);
		} catch (error) {
			reportError(`${TAG} failed to start probe ${key}:`, error);
		}
	} else if (!on && existing) {
		try {
			existing();
		} catch (e) {
			/* ignore */
		}
		activeProbes.delete(key);
	}
	return activeProbes.has(key);
}

export function stopAllProbes(): void {
	for (const stop of activeProbes.values()) {
		try {
			stop();
		} catch (e) {
			/* ignore */
		}
	}
	activeProbes.clear();
}

function describeChannelMessages(channelId: string | undefined) {
	if (!channelId) return { channel: null };
	const s = stores();
	const cm = s.MessageStore?._channelMessages?.[channelId];
	const first = cm?._array?.[0];
	return {
		channel: channelId,
		cmPresent: !!cm,
		cmKeys: cm ? Object.keys(cm) : null,
		arrayLen: cm?._array?.length ?? null,
		mapType: cm?._map ? typeof cm._map : null,
		sampleMsgKeys: first ? Object.keys(first).slice(0, 24) : null,
		sampleMsgFlags: first
			? {
					id: first.id,
					hasDeleted: !!first.__vml_deleted,
					type: first.type,
					state: first.state,
				}
			: null,
	};
}

/** Log the current channel's MessageStore structure immediately. */
export function inspectCurrentChannel(): string {
	const s = stores();
	const channelId = s.SelectedChannelStore?.getChannelId?.();
	const info = describeChannelMessages(channelId);
	if (DEBUG) console.log(`${TAG} inspect`, JSON.stringify(info));
	return info.cmPresent
		? `channel ${channelId}: ${info.arrayLen} cached msgs`
		: `no channel messages cached for ${channelId ?? "none"}`;
}

/** Log every method/property name on MessageStore, like the SortedGuildStore probe. */
export function dumpMessageStore(): string {
	const ms = stores().MessageStore;
	if (!ms) return "no MessageStore";
	const keys = new Set<string>();
	let o: any = ms;
	while (o && o !== Object.prototype) {
		for (const k of Object.getOwnPropertyNames(o)) keys.add(k);
		o = Object.getPrototypeOf(o);
	}
	const list = [...keys].sort();
	if (DEBUG)
		console.log(
			`${TAG} MessageStore props (${list.length})`,
			JSON.stringify(list),
		);
	return `MessageStore: ${list.length} props (see logcat)`;
}

/**
 * Hooks MessageStore.getMessages to confirm it is the render data source and to inspect the shape
 * of the object it returns (constructor, keys, _array length, first-row keys). Logs a capped number
 * of calls. Shapes only — never content.
 */
export function watchGetMessages(): () => void {
	const ms = stores().MessageStore;
	if (typeof ms?.getMessages !== "function") {
		if (DEBUG) console.log(`${TAG} getMessages NOT FOUND on MessageStore`);
		return () => {};
	}

	let pendingChannel: any;
	let logged = 0;
	const MAX = 20;
	const before = patcher.before(ms, "getMessages", (args: any[]) => {
		pendingChannel = args?.[0];
		return args;
	});
	const after = patcher.after(ms, "getMessages", (ret: any) => {
		const channelId = pendingChannel;
		pendingChannel = undefined;
		try {
			if (logged < MAX && ret) {
				logged++;
				const first = ret?._array?.[0];
				if (DEBUG)
					console.log(
						`${TAG} getMessages(${channelId}) ->`,
						JSON.stringify({
							ctor: ret?.constructor?.name,
							keys: Object.keys(ret).slice(0, 24),
							arrayLen: ret?._array?.length ?? null,
							firstMsgKeys: first ? Object.keys(first).slice(0, 24) : null,
							firstFlags: first
								? { id: first.id, type: first.type, state: first.state }
								: null,
						}),
					);
			}
		} catch (e) {
			reportError(`${TAG} getMessages probe failed:`, e);
		}
		return ret;
	});

	return () => {
		try {
			before();
		} catch (e) {
			/* ignore */
		}
		try {
			after();
		} catch (e) {
			/* ignore */
		}
	};
}

/**
 * Inspect one real _array message instance deeply: constructor, field types (timestamp format),
 * author shape, and every method it exposes (own + prototype). This is what buildRenderMessage must
 * match for the injected message to survive isNewMessageGroup without crashing. Shapes/types only.
 */
export function inspectMessageInstance(): string {
	const s = stores();
	const ms = s.MessageStore;
	const channelId = s.SelectedChannelStore?.getChannelId?.();
	const cm = channelId ? ms?.getMessages?.(channelId) : null;
	const arr = cm?._array;
	if (!Array.isArray(arr) || !arr.length)
		return "no messages in current channel";

	const m = arr.find((x: any) => x && x.type === 0 && x.content) ?? arr[0];
	const funcsOf = (obj: any) => {
		const out: string[] = [];
		if (!obj) return out;
		for (const k of Object.getOwnPropertyNames(obj)) {
			try {
				if (typeof obj[k] === "function") out.push(k);
			} catch {
				/* ignore */
			}
		}
		return out;
	};
	const proto = m ? Object.getPrototypeOf(m) : null;
	const info = m
		? {
				ctor: m.constructor?.name ?? "plain",
				timestampType:
					m.timestamp == null
						? String(m.timestamp)
						: m.timestamp instanceof Date
							? "Date"
							: typeof m.timestamp,
				editedTimestampType:
					m.editedTimestamp == null
						? String(m.editedTimestamp)
						: m.editedTimestamp instanceof Date
							? "Date"
							: typeof m.editedTimestamp,
				authorCtor: m.author?.constructor?.name ?? typeof m.author,
				authorKeys: m.author ? Object.keys(m.author).slice(0, 24) : null,
				ownFuncs: funcsOf(m),
				protoCtor: proto?.constructor?.name ?? null,
				protoFuncs: proto && proto !== Object.prototype ? funcsOf(proto) : [],
			}
		: null;
	if (DEBUG) console.log(`${TAG} messageInstance`, JSON.stringify(info));
	if (!info) return "no usable message";
	return `${info.ctor} ts=${info.timestampType} methods=${info.ownFuncs.length + info.protoFuncs.length}`;
}

/**
 * Sweep for a module that can jump to / open a specific message. `jumpToDeletedMessage`
 * (`lib/navigate.ts`) guessed `withProps('openUrl')`, mirroring an unshipped sibling plugin
 * (jump-to-top) that was never confirmed working -- on-device it finds nothing. Same shape as
 * screenshot-redactor's probe.ts: walk every initialized module id and report both an exact-key
 * hit list and a heuristic candidate list, one line per hit so no continuation line gets dropped
 * by a tag filter (porting-rules.md rule 5).
 */
const NAV_MAX_ID = 30000;
const NAV_WANTED = [
	"openUrl",
	"openURL",
	"openDeeplink",
	"handleClick",
	"jumpToMessage",
	"transitionToGuild",
	"transitionTo",
	"navigateToConnections",
];
const NAV_INTERESTING =
	/^(open|jump|navigate|transition|goto|handle).*(url|link|message|channel|guild|deeplink|click)$/i;

export function probeNavigationModules(): string {
	const { getInitializedModuleExports, isModuleInitialized } = metro as any;

	const exact: string[] = [];
	const hits: string[] = [];
	let scanned = 0;
	let initialized = 0;

	for (let id = 0; id < NAV_MAX_ID; id++) {
		scanned++;
		let exports: any;
		try {
			if (!isModuleInitialized(id)) continue;
			initialized++;
			exports = getInitializedModuleExports(id);
		} catch {
			continue;
		}
		if (!exports || typeof exports !== "object") continue;

		try {
			for (const key of NAV_WANTED) {
				const direct = exports[key];
				const nested = exports.default?.[key];
				if (direct === undefined && nested === undefined) continue;
				exact.push(
					`${id}.${key}: exports=${typeof direct}${nested !== undefined ? ` default.${key}=${typeof nested}` : ""}`,
				);
			}
		} catch {
			/* some namespaces throw on property access */
		}

		try {
			const keys: string[] = [];
			for (const key of Object.keys(exports)) {
				if (typeof exports[key] !== "function") continue;
				if (!NAV_INTERESTING.test(key)) continue;
				keys.push(key);
			}
			if (keys.length) hits.push(`${id}: ${keys.join(", ")}`);
		} catch {}
	}

	if (DEBUG)
		console.log(
			`${TAG} navProbe: ${initialized} initialized of ${scanned} scanned, ${hits.length} candidates, ${exact.length} exact`,
		);
	if (DEBUG) console.log(`${TAG} navProbe EXACT (${exact.length}):`);
	for (const line of exact) {
		if (DEBUG) console.log(`${TAG}   exact ${line}`);
	}
	if (DEBUG) console.log(`${TAG} navProbe CANDIDATES (${hits.length}):`);
	for (const line of hits) {
		if (DEBUG) console.log(`${TAG}   cand ${line}`);
	}

	return `${hits.length} candidates, ${exact.length} exact — see adb logcat`;
}

/**
 * Dump the full key list (and each value's type) of the module carrying `transitionToGuild` and
 * of the module carrying `selectPrivateChannel` -- the two navigation primitives
 * `hide-servers-drawer` already ships successfully (`GuildRow.tsx` / `UnreadDmRow.tsx`). Neither
 * of those callers needs a *specific channel within a guild*, only "the guild" / "this DM" --
 * this dump is to find whatever sibling function on the same module handles that, and
 * `jumpToMessage`'s exact expected argument shape, before guessing another on-device round.
 */
export function dumpRoutingModules(): string {
	const { lookupModule } = finders as any;
	const { withProps } = filters;

	const describe = (label: string, prop: string) => {
		try {
			const mod = lookupModule(withProps(prop))?.[0];
			if (!mod) {
				if (DEBUG) console.log(`${TAG} routing ${label}(${prop}): not found`);
				return;
			}
			const keys = Object.keys(mod)
				.map((k) => `${k}:${typeof mod[k]}`)
				.join(", ");
			if (DEBUG)
				console.log(`${TAG} routing ${label}(${prop}) own keys: ${keys}`);
			if (mod.default && typeof mod.default === "object") {
				const defKeys = Object.keys(mod.default)
					.map((k) => `${k}:${typeof mod.default[k]}`)
					.join(", ");
				if (DEBUG)
					console.log(
						`${TAG} routing ${label}(${prop}).default keys: ${defKeys}`,
					);
			}
		} catch (error) {
			reportError(`${TAG} routing ${label}(${prop}) threw:`, error);
		}
	};

	describe("transitionToGuild", "transitionToGuild");
	describe("selectPrivateChannel", "selectPrivateChannel");
	describe("jumpToMessage", "jumpToMessage");
	describe("selectChannel", "selectChannel");

	return "see adb logcat";
}

/**
 * Watches flux traffic for message/channel-load events and, on the first occurrence of each type,
 * logs the payload keys plus the current channel's MessageStore shape. This is how we find the
 * injection point for persistent restore. Shapes and counts only — never message content.
 */
export function startMessageLoadProbe(): () => void {
	const { onAnyFluxEventDispatched } = flux;
	const interesting = /MESSAGE|MESSAGES|LOAD|CHANNEL|GUILD/i;
	const seen = new Set<string>();

	const unsub = onAnyFluxEventDispatched((payload: any) => {
		try {
			const type = payload?.type;
			if (typeof type !== "string" || !interesting.test(type)) return payload;
			if (seen.has(type)) return payload;
			seen.add(type);

			const s = stores();
			const channelId =
				payload?.channelId ??
				payload?.channel_id ??
				s.SelectedChannelStore?.getChannelId?.();
			const info = describeChannelMessages(channelId);
			if (DEBUG)
				console.log(
					`${TAG} probe ${type}`,
					JSON.stringify({
						payloadKeys: Object.keys(payload ?? {}).slice(0, 14),
						...info,
					}),
				);
		} catch (error) {
			reportError(`${TAG} probe handler failed:`, error);
		}
		return payload;
	});

	return unsub;
}
