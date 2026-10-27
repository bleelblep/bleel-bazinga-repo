import { isEmpty, isFolderHidden, isHidden } from "../lib/hidden"
import { store as sortedGuildStore, unfiltered } from "./sortedGuilds"
import { getModuleWithImportedPath } from "@valenced/discord/utils/modules/finders"
import * as finders from "@valenced/modules/finders"
import * as filters from "@valenced/modules/finders/filters"
import { before } from "@valenced/patcher"
import { reportError } from "../../../../shared/report"

const DEBUG: boolean = false

// The checkgate for "this plugin must never shape what Discord persists".
//
// `saveGuildFolders(folders)` (actions/UserSettingsActionCreators.tsx) is the single choke
// point every server-order/folder-layout persist on mobile goes through: drag-to-reorder
// (persistAndAnnounce), the folder-drag variant, and folder edits (updateFolder) all funnel
// into it, and it writes the array verbatim into the account-synced user-settings proto
// ("guildFolders"). Its converter reads exactly `guildIds`, `folderId`, `folderColor` and
// `folderName` off each entry. Standalone guilds travel as pseudo-folders:
// `{ folderId: undefined, guildIds: [id] }`.
//
// As of 1.5.1 the two store getters those callers read (getCompatibleGuildFolders /
// getGuildFolders) are no longer filtered (see the TARGETS comment in sortedGuilds.ts), so the
// payload is already complete on 337.10. This patch is insurance for a future Discord build
// that reroutes a persist caller through a getter this plugin DOES still filter: before the
// array leaves the app, hidden entries that went missing are spliced back in at their
// reference positions, so an incomplete order can never reach the wire.
//
// Conservative by construction: the payload is rebuilt from the store's own complete,
// proto-compatible getCompatibleGuildFolders() snapshot read in the same tick, anything
// missing that is NOT currently hidden bails the whole repair (an unfamiliar, deliberately
// partial caller is left untouched), and any throw returns the original args.

const MODULE_PATH = "actions/UserSettingsActionCreators.tsx"

/**
 * Stable identity for one folder-list entry. Folder ids are numbers, guild ids are strings;
 * a standalone guild is a pseudo-folder carrying exactly one guildId and no folder id.
 * `id` is accepted as a fallback key because the getGuildFolders()-shaped entries that
 * updateFolder passes carry the folder id under that key instead of `folderId`.
 */
function keyOf(entry: any): string | null {
	if (!entry || typeof entry !== "object") return null
	const folderId = entry.folderId ?? entry.id
	if (typeof folderId === "number" || typeof folderId === "string") return `f:${folderId}`
	if (Array.isArray(entry.guildIds) && entry.guildIds.length === 1 && typeof entry.guildIds[0] === "string") {
		return `g:${entry.guildIds[0]}`
	}
	return null
}

function hiddenByKey(key: string): boolean {
	return key.startsWith("f:") ? isFolderHidden(key.slice(2)) : isHidden(key.slice(2))
}

/**
 * Return a repaired copy of `folders`, or the original array when nothing needs fixing or
 * the payload looks like something we don't understand. Never mutates the caller's array.
 */
function repair(folders: any[]): any[] {
	let reference: unknown
	try {
		// Read in the same tick the caller did: the reference is content-identical to what
		// an unfiltered persist saw, proto-compatible in shape, and complete.
		reference = unfiltered(() => sortedGuildStore()?.getCompatibleGuildFolders?.())
	} catch {
		return folders
	}
	if (!Array.isArray(reference)) return folders

	const payloadKeys = new Set<string>()
	for (const entry of folders) {
		const key = keyOf(entry)
		if (key) payloadKeys.add(key)
	}

	// Everything missing from the payload must be a hidden entry; a single non-hidden
	// absence means this caller intentionally passed a partial list -- not ours to repair.
	const missing = new Map<string, any>()
	for (const refEntry of reference) {
		const key = keyOf(refEntry)
		if (!key || payloadKeys.has(key)) continue
		if (!hiddenByKey(key)) return folders
		missing.set(key, refEntry)
	}

	// Order check: the entries that ARE present must appear in reference order. If a caller
	// passed a genuinely different arrangement, the store is mid-something we don't model --
	// leave the payload alone rather than snapping it to tree order.
	{
		let i = 0
		const presentInRefOrder = reference.filter(entry => {
			const key = keyOf(entry)
			return key != null && payloadKeys.has(key) && !missing.has(key)
		})
		for (const entry of folders) {
			const key = keyOf(entry)
			if (!key) continue
			if (i >= presentInRefOrder.length || keyOf(presentInRefOrder[i]) !== key) return folders
			i++
		}
		if (i !== presentInRefOrder.length) return folders
	}

	// Repair guild ids inside folders that are present: walk the reference folder's ids and
	// keep any id the payload has (payload order already equals reference order for those,
	// per the check above) plus any hidden id that went missing. Extra payload ids unknown to
	// the reference bail the folder -- dropping them would be data loss in the other direction.
	const repaired = folders.map(entry => {
		const key = keyOf(entry)
		if (!key?.startsWith("f:") || !Array.isArray(entry.guildIds)) return entry

		const refEntry = reference.find(candidate => keyOf(candidate) === key)
		if (!Array.isArray(refEntry?.guildIds)) return entry

		const present = new Set<string>(entry.guildIds)
		const refIds: unknown[] = refEntry.guildIds
		if (present.size > refIds.length) return entry
		if (refIds.some(id => typeof id !== "string")) return entry
		if (entry.guildIds.some((id: unknown) => typeof id !== "string" || !(refIds as string[]).includes(id as string))) {
			return entry
		}

		const merged = (refIds as string[]).filter(id => present.has(id) || isHidden(id))
		if (merged.length === entry.guildIds.length) return entry
		return { ...entry, guildIds: merged }
	})

	if (missing.size === 0) {
		// No top-level re-insertions needed; only within-folder repairs (if any) apply.
		const changed = repaired.some((entry, index) => entry !== folders[index])
		return changed ? repaired : folders
	}

	// Rebuild top-level order from the reference: present payload entries in reference
	// order, missing hidden entries re-inserted as clones of their reference entries (already
	// the exact proto-compatible shape), then any unkeyable payload entries preserved.
	const out: any[] = []
	const used = new Set<string>()
	for (const refEntry of reference) {
		const key = keyOf(refEntry)
		if (!key) continue
		const index = folders.findIndex(entry => keyOf(entry) === key)
		if (index >= 0) {
			out.push(repaired[index])
			used.add(key)
		} else if (missing.has(key)) {
			out.push(missing.get(key))
		}
	}
	for (let index = 0; index < folders.length; index++) {
		const key = keyOf(folders[index])
		if (!key || !used.has(key)) out.push(repaired[index])
	}
	return out
}

export default function patchSaveGuildFolders(): () => void {
	const cleanups: Array<() => void> = []
	const unsubscribes: Array<() => void> = []
	let patched = false

	const patchHost = (mod: any) => {
		if (patched) return
		const host = typeof mod?.saveGuildFolders === "function" ? mod : mod?.default
		if (typeof host?.saveGuildFolders !== "function") return

		patched = true
		try {
			cleanups.push(
				before(host, "saveGuildFolders", (args: any[]) => {
					try {
						if (!isEmpty() && Array.isArray(args?.[0])) {
							args[0] = repair(args[0])
						}
					} catch {
						/* never break the persist path */
					}
					// The before contract: the hook's return BECOMES the args. Return it
					// outside the try so a throw in repair can never blank the call.
					return args
				}),
			)
			if (DEBUG) console.log("[HideServersDrawer] saveGuildFolders guard installed")
		} catch (error) {
			reportError("[HideServersDrawer] failed to patch saveGuildFolders:", error)
		}
	}

	// Preferred: exact source path (docs/coding-rules.md rule 3 -- no filter, no cache,
	// no max counter, hands back the whole namespace; saveGuildFolders is a named export
	// on it, confirmed by 337.10 disassembly).
	try {
		unsubscribes.push(
			getModuleWithImportedPath(MODULE_PATH, (mod: any) => patchHost(mod)),
		)
	} catch (error) {
		reportError(`[HideServersDrawer] imported-path lookup for ${MODULE_PATH} failed:`, error)
	}

	// Fallback for a build that moved the file: a plain prop sweep, split into lookup +
	// wait so no shared `max` counter can swallow the subscription (rule 3).
	try {
		const { lookupModules, waitForModules } = finders
		const { withProps } = filters

		for (const [exports] of lookupModules(withProps("saveGuildFolders"))) patchHost(exports)
		unsubscribes.push(waitForModules(withProps("saveGuildFolders"), (exports: any) => patchHost(exports)))
	} catch (error) {
		reportError("[HideServersDrawer] saveGuildFolders sweep failed:", error)
	}

	return () => {
		unsubscribes.forEach(unsubscribe => {
			try {
				unsubscribe()
			} catch {
				/* already gone */
			}
		})
		cleanups.forEach(unpatch => {
			try {
				unpatch()
			} catch {
				/* already gone */
			}
		})
	}
}
