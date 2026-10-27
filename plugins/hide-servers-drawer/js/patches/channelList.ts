/**
 * Hides channels from a server's channel list, only on this device.
 *
 * Every channel list Discord draws (the classic one and channel_list_v2's redesign) reads
 * `ChannelListStore.getGuild`, which builds and caches its rows in
 * `modules/guild_sidebar/ChannelListState.tsx`. Each channel there is a record object whose
 * `updateChannel(record, context)` calls `this.computeState(context)` and keeps the result's
 * `renderLevel` (1 CannotShow = no permission, 2 DoNotShow, 3 WouldShowIfUncollapsed, 4 Show) and
 * `threadIds`; the categories then list only the channels whose level lets them show. DoNotShow is
 * what Discord itself gives a muted channel when "Hide muted channels" is on. (Read from the 350.2
 * bundle, 2026-10-17: #42036 updateChannel, #42040 computeState, the enum in the module factory.)
 *
 * So a hidden channel, or a channel inside a hidden category, gets DoNotShow and no threads from
 * `computeState`. On 351.3 records call `computeState` straight from their constructor and never go
 * through `updateChannel` (counted on device 2026-10-18: 70 computeState calls, 0 updateChannel), and
 * each record class (text, voice, thread...) has its own `computeState`, so every class met in a built
 * list gets wrapped. The classes aren't exported (only the module's `default` cache is, with
 * `getGuild` / `clearGuildId`), so they're found through the records `getGuild` builds, and wrapped by
 * hand: an `after` hook gets no `this`.
 *
 * A hide or unhide clears that server's cached rows (`clearGuildId`) and tells ChannelListStore to
 * emit, so the list rebuilds straight away. `CHANNEL_INFO` (whose only ChannelListStore handler is
 * `clearGuildId`) is the fallback if the store can't be reached directly.
 */

import { hiddenChannelIds, isChannelHidden, onChannelsChange } from "../lib/hidden"
import { getModuleByPath } from "../../../../shared/modules"
import { reportError } from "../../../../shared/report"
import * as commonFlux from "@valenced/discord/common/flux"
import { Stores } from "@valenced/discord/flux"

const TAG = "[HideServersDrawer:channels]"
const STATE_PATH = "modules/guild_sidebar/ChannelListState.tsx"
const DO_NOT_SHOW = 2

const channelStore = (): any => (Stores as any).ChannelStore
const channelListStore = (): any => (Stores as any).ChannelListStore

let cache: any
/** Each wrapped record class's prototype, with its own computeState. */
const wrapped = new Map<any, (...args: any[]) => any>()
/** Lists already scanned for record classes; getGuild returns the same list until it's rebuilt. */
let scanned = new WeakSet<object>()

function hiddenRecord(record: any): boolean {
	const channel = record?.record
	const id = channel?.id ?? record?.id
	if (typeof id !== "string") return false
	if (isChannelHidden(id)) return true
	return typeof channel?.parent_id === "string" && isChannelHidden(channel.parent_id)
}

/** Wraps `computeState` on the record's own class (and any above it that has one). New ones: true. */
function patchRecordClass(record: any): boolean {
	let added = false
	for (let proto = Object.getPrototypeOf(record); proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
		if (wrapped.has(proto) || !Object.prototype.hasOwnProperty.call(proto, "computeState")) continue
		const original = proto.computeState
		if (typeof original !== "function") continue
		proto.computeState = function (this: any, ...args: any[]) {
			const state = original.apply(this, args)
			try {
				if (hiddenRecord(this)) return { ...state, renderLevel: DO_NOT_SHOW, threadIds: [] }
			} catch (error) {
				reportError(`${TAG} hiding a channel failed:`, error)
			}
			return state
		}
		wrapped.set(proto, original)
		added = true
	}
	return added
}

const isRecord = (value: any) => value && typeof value === "object" && "renderLevel" in value && "record" in value

/**
 * The list records (objects with `renderLevel`), from what getGuild returned. On 351.3 that's
 * `{ guildChannels, guildChannelsVersion }` from the store, or the guild's channel list itself from
 * the cache; the records live in each category's `channels` (by id), while `forEachChannel` hands out
 * Discord's plain ChannelRecords (seen on device 2026-10-18).
 */
function allRecords(result: any): any[] {
	const list = result?.guildChannels ?? result
	const out: any[] = []
	try {
		const categories = [
			...Object.values(list?.categories ?? {}),
			list?.noParentCategory,
			list?.favoritesCategory,
			list?.recentsCategory,
			list?.voiceChannelsCategory,
		]
		for (const category of categories) {
			const channels = category?.channels
			const values = channels instanceof Map ? [...channels.values()] : Object.values(channels ?? {})
			for (const record of values) if (isRecord(record)) out.push(record)
		}
	} catch {
		/* shape changed; nothing to find */
	}
	return out
}

/** Rebuilds one server's channel list (or every cached one when no id is given). */
export function refreshChannels(guildId?: string) {
	try {
		if (guildId) cache?.clearGuildId?.(guildId)
		else cache?.clear?.()
		const store = channelListStore()
		if (cache && typeof store?.emitChange === "function") {
			store.emitChange()
			return
		}
	} catch (error) {
		reportError(`${TAG} refresh failed:`, error)
	}
	try {
		const dispatcher = (commonFlux as any)?.Dispatcher
		if (guildId) dispatcher?.dispatch?.({ type: "CHANNEL_INFO", guildId })
	} catch (error) {
		reportError(`${TAG} fallback refresh failed:`, error)
	}
}

export function guildOfChannel(channelId: string): string | undefined {
	try {
		const guildId = channelStore()?.getChannel?.(channelId)?.guild_id
		return typeof guildId === "string" ? guildId : undefined
	} catch {
		return undefined
	}
}

export default function patchChannelList(): () => void {
	const cleanups: Array<() => void> = []

	cleanups.push(
		getModuleByPath(
			STATE_PATH,
			null,
			(mod: any) => {
				// 350.2: `default` is the cache object. 351.3: it's the cache's class, getGuild on its
				// prototype, and ChannelListStore holds the instance (seen on device 2026-10-18).
				const exported = mod?.default
				const target = typeof exported === "function" && typeof exported.prototype?.getGuild === "function" ? exported.prototype : exported
				if (!target || typeof target.getGuild !== "function") throw new Error("ChannelListState has no getGuild")
				if (target === exported) cache = target
				const getGuild = target.getGuild
				target.getGuild = function (this: any, ...args: any[]) {
					// The instance in use, for clearGuildId when a channel is hidden.
					if (this && typeof this.clearGuildId === "function") cache = this
					const list = getGuild.apply(this, args)
					const built = list?.guildChannels ?? list
					if (hiddenChannelIds().length && built && typeof built === "object" && !scanned.has(built)) {
						scanned.add(built)
						let added = false
						for (const record of allRecords(list)) if (patchRecordClass(record)) added = true
						// Records built before their class was wrapped kept their levels: rebuild once.
						if (added) Promise.resolve().then(() => refreshChannels())
					}
					return list
				}
				cleanups.push(() => {
					if (target.getGuild !== getGuild) target.getGuild = getGuild
				})
			},
			TAG,
		),
	)

	cleanups.push(
		onChannelsChange(() => {
			// The first hide of a session may come before any list was patched: look now.
			if (!wrapped.size) {
				try {
					// Through the store, so getGuild gets Discord's own arguments; the wrap above patches.
					const ids = hiddenChannelIds()
					const guildId = ids.length ? guildOfChannel(ids[ids.length - 1]!) : undefined
					if (guildId) channelListStore()?.getGuild?.(guildId)
				} catch (error) {
					reportError(`${TAG} late patch failed:`, error)
				}
			}
			refreshChannels()
		}),
	)

	return () => {
		for (const cleanup of cleanups.reverse()) {
			try {
				cleanup()
			} catch {
				/* already gone */
			}
		}
		for (const [proto, original] of wrapped) proto.computeState = original
		wrapped.clear()
		scanned = new WeakSet()
		refreshChannels()
		cache = undefined
	}
}
