import { onBarChange } from "../lib/hidden"
import { hideEmoji } from "../lib/prefs"
import { reportError } from "../../../../shared/report"
import { unfiltered } from "./sortedGuilds"
import { Stores } from "@valenced/discord/flux"
import { lookupModules, waitForModules } from "@valenced/modules/finders"
import { withProps } from "@valenced/modules/finders/filters"
import { instead } from "@valenced/patcher"

const TAG = "[HideServersDrawer]"

// Hiding a server works by filtering SortedGuildStore's getters (patches/sortedGuilds.ts), and the
// emoji picker reads the same getters, so a hidden server's emoji went missing too. Traced in the
// 352.2 bundle with hermes-dec; all three names are also in 352.6:
//
// - EmojiStore.getDisambiguatedEmojiContext() builds an `EmojiDisambiguations`, the emoji index
//   behind the picker and `:` autocomplete. Its constructor walks getFlattenedGuildIds() to add
//   each server's emoji, so a hidden server's emoji were never indexed.
// - useEmojiCategories() (the picker's sections) reads getFlattenedGuildIds() inside a useMemo,
//   which runs during the hook call, so wrapping the hook covers it.
// - getSurpriseMeEmojiPool() reads it directly.
//
// Unless "Hide their emoji too" is on, these run with filtering paused, so they see every server.
// The server list itself is untouched. Each is exported by exactly one module in 352.2.
//
// Stickers had the same problem, reported 2026-11-10 ("stickers don't appear at all"): on 352.6
// the sticker picker's category hooks (useStickerPackCategories, useFilteredStickerPackCategories)
// live in a module that imports SortedGuildStore (read live with DevTools: module 10153 depends on
// 6699). The same switch covers them, and the settings row says so.
//
// The index is cached, and getDisambiguatedEmojiContext is only one way in. The store's own methods
// (searchWithoutFetchingLatest, getTopEmoji, getUsableCustomEmojiById and more) call
// `EmojiDisambiguations.get(guildId)` directly, which builds the index into `_lastInstance` and
// reuses it until the guild changes or `reset()` runs. Whichever ran first decided what got cached,
// so hidden servers' emoji went missing until a reload even with the switch off (Bazinga reports
// 2026-11-10 and 2026-11-11; read in the 352.2 disassembly, `_lastInstance` is in 352.6 too).
// So the class's static `get` runs unfiltered as well, and the cache is cleared on start, on stop
// and whenever the hidden list changes.

/** Runs the original with the full server list, unless the user wants hidden servers' emoji gone. */
function full(this: any, args: any[], original: any) {
	if (typeof original !== "function") return undefined
	if (hideEmoji()) return Reflect.apply(original, this, args)
	return unfiltered(() => Reflect.apply(original, this, args))
}

function patchExport(name: string, patches: Array<() => void>) {
	const done = new WeakSet<object>()
	const onModule = (exports: any) => {
		try {
			// Named export on the namespace, or on `default` (coding rule 3).
			const host = typeof exports?.[name] === "function" ? exports : exports?.default
			if (!host || typeof host[name] !== "function" || done.has(host)) return
			done.add(host)
			patches.push(instead(host, name, full))
		} catch (error) {
			reportError(`${TAG} could not patch ${name}:`, error)
		}
	}
	// lookupModules + waitForModules rather than getModules: the picker's modules load only when
	// it first opens, and getModules' shared `max` can end before it subscribes (coding rule 3).
	for (const [exports] of lookupModules(withProps(name))) onModule(exports)
	patches.push(waitForModules(withProps(name), exports => onModule(exports)))
}

/** Drops Discord's cached emoji index so the next read rebuilds it with the current filter. */
function resetIndex(cls: any) {
	try {
		if (typeof cls?.reset === "function") cls.reset()
	} catch (error) {
		reportError(`${TAG} could not reset the emoji index:`, error)
	}
}

function patchIndex(patches: Array<() => void>) {
	const done = new WeakSet<object>()
	let cls: any
	const onModule = (exports: any) => {
		try {
			const found = exports?.EmojiDisambiguations ?? exports?.default?.EmojiDisambiguations
			if (typeof found?.get !== "function" || done.has(found)) return
			done.add(found)
			cls = found
			patches.push(instead(found, "get", full))
			patches.push(() => resetIndex(found))
			resetIndex(found)
		} catch (error) {
			reportError(`${TAG} could not patch the emoji index:`, error)
		}
	}
	for (const [exports] of lookupModules(withProps("EmojiDisambiguations"))) onModule(exports)
	if (!cls) patches.push(waitForModules(withProps("EmojiDisambiguations"), exports => onModule(exports)))
	// Only matters with "Hide their emoji and stickers too" on, but a reset is cheap either way.
	patches.push(onBarChange(() => resetIndex(cls)))
}

export default function patchEmoji(): () => void {
	const patches: Array<() => void> = []

	patchIndex(patches)

	try {
		const store = (Stores as any).EmojiStore
		if (typeof store?.getDisambiguatedEmojiContext === "function")
			patches.push(instead(store, "getDisambiguatedEmojiContext", full))
		else reportError(`${TAG} EmojiStore.getDisambiguatedEmojiContext not found`)
	} catch (error) {
		reportError(`${TAG} could not patch the emoji store:`, error)
	}

	patchExport("useEmojiCategories", patches)
	patchExport("getSurpriseMeEmojiPool", patches)
	patchExport("useStickerPackCategories", patches)
	patchExport("useFilteredStickerPackCategories", patches)

	return () => {
		for (const unpatch of patches.splice(0)) unpatch()
	}
}
