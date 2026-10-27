import { isEmpty, isFolderHidden, isHidden } from "../lib/hidden"
import { Stores } from "@valenced/discord/flux"
import { after } from "@valenced/patcher"

// Flux stores are looked up by name directly through the Stores proxy, not a module finder
// filter -- there is no `withStoreName` under modules.finders.filters.
// Read per call, never at module scope: the Stores proxy resolves via one-shot `lookupModule`,
// and at preInit that caches a permanent miss on a key shared app-wide.
// See docs/coding-rules.md rule 1.
const sortedGuildStore = (): any => (Stores as any).SortedGuildStore

// No server-list component resolves reliably by name across builds, so filter at the
// source instead: everything that draws the list reads it from this store, so removing
// hidden guilds here hides them everywhere without locating a single component.

/**
 * Shallow-clone preserving the prototype.
 *
 * These store values are class instances, not plain objects. Object spread copies only own
 * enumerable properties and drops the prototype, which can crash methods like
 * getGuildBarNeighbors with "undefined is not a function". Never spread them.
 */
function clone<T extends object>(value: T): T {
	const out = Object.create(Object.getPrototypeOf(value))
	Object.assign(out, value)
	return out
}

/**
 * Guild ids sitting inside a hidden folder. getFlattenedGuildIds/getFlattenedGuilds/
 * getGuildIds have no folder context of their own -- they're just id arrays -- so hiding a
 * folder has to be cross-referenced against the tree to know which flattened ids it covers.
 * Built fresh per filter call from the *unfiltered* tree so a folder that's itself hidden
 * doesn't disappear from this lookup before it's been consulted.
 */
function hiddenFolderGuildIds(): Set<string> {
	const out = new Set<string>()

	try {
		const tree = unfiltered(() => sortedGuildStore()?.getGuildsTree?.())
		const children = tree?.root?.children
		if (!Array.isArray(children)) return out

		for (const node of children) {
			if (node?.type !== "folder" || node.id == null || !isFolderHidden(node.id)) continue
			for (const child of node.children ?? []) {
				if (child?.id != null) out.add(String(child.id))
			}
		}
	} catch {
		/* best effort -- getFlattenedGuildIds/getGuildFolders just won't reflect it */
	}

	return out
}

/** Never mutate what the store returns -- other consumers share these objects. */
function filterIds(ids: unknown): unknown {
	if (!Array.isArray(ids)) return ids
	const hiddenInFolders = hiddenFolderGuildIds()
	return ids.filter(id => typeof id !== "string" || (!isHidden(id) && !hiddenInFolders.has(id)))
}

// getGuildsTree() returns:
//   { root: { type: "root", children: [...] },
//     nodes: { [id]: { type: "guild" | "folder", id, children: [...] } },
//     version: number }
//
// `nodes` is an object map keyed by id, not an array, and folder ids are numbers while
// guild ids are strings.
const isHiddenNode = (node: any) =>
	(node?.type === "guild" && node.id != null && isHidden(String(node.id))) ||
	(node?.type === "folder" && node.id != null && isFolderHidden(node.id))

function filterChildren(children: any[]): any[] {
	const out: any[] = []

	for (const child of children) {
		if (isHiddenNode(child)) continue

		if (Array.isArray(child?.children) && child.children.length) {
			const kids = filterChildren(child.children)

			// Keep folders even when emptied. Dropping them left dangling parentId
			// references and crashed the row component.
			if (kids.length === child.children.length) {
				out.push(child)
			} else {
				const next = clone(child)
				next.children = kids
				out.push(next)
			}
		} else {
			out.push(child)
		}
	}

	return out
}

/**
 * Only `root.children` decides what renders. `nodes` is a lookup table keyed by id, so
 * entries are left in place deliberately -- deleting them can make the row component
 * resolve a node to undefined and crash the whole server list. Extra unreferenced entries
 * are inert.
 */
function filterTree(tree: any): any {
	if (!tree || typeof tree !== "object") return tree
	if (!Array.isArray(tree.root?.children)) return tree

	const children = filterChildren(tree.root.children)
	if (children.length === tree.root.children.length) return tree

	const root = clone(tree.root)
	root.children = children

	const out = clone(tree)
	out.root = root
	return out
}

/**
 * Tolerant filter for the flat list shapes the newer store methods return. Confirmed
 * on-device (1.4.1 probe) to exist and be unpatched while the stock bar kept showing hidden
 * servers: the bar does not read getGuildsTree, it reads these.
 *
 * Entry shapes are inferred, not confirmed, so this accepts several: bare string ids,
 * tree-ish nodes ({type, id} -- folder ids are numbers, guild ids strings), and folder-ish
 * rows ({folderId, guildIds}). Emptied folders are dropped outright -- unlike the tree's
 * `nodes` map, flat lists carry no dangling parentId references, so the emptied-folder shell
 * that filterChildren has to keep would just be an empty row here.
 */
/**
 * Recursive core of filterGeneric: one pass over a list of bar entries, dropping hidden
 * guilds/folders and cleaning hidden ids out of any guildIds/children arrays an entry
 * carries.
 *
 * Folders that end up empty are deliberately KEPT as shells, same as filterChildren's
 * policy for the tree: dropping them crashed consumers (dangling references in the tree,
 * and on-device in 1.4.3 an emptied-drop keyed on `children: []` wiped every guild entry
 * that merely carried an empty children array -- the whole bar rendered empty and the app
 * died on the next stock render). An empty folder renders as an empty folder; that's the
 * user's cue to hide the folder itself.
 */
function filterListEntries(entries: any[]): any[] {
	const hiddenInFolders = hiddenFolderGuildIds()
	const guildGone = (id: unknown) => typeof id === "string" && (isHidden(id) || hiddenInFolders.has(id))
	const folderGone = (id: unknown) => id != null && isFolderHidden(id as any)

	const out: any[] = []
	for (const entry of entries) {
		if (typeof entry === "string") {
			if (!guildGone(entry)) out.push(entry)
			continue
		}
		if (!entry || typeof entry !== "object") {
			out.push(entry)
			continue
		}

		if (folderGone(entry.folderId)) continue
		if (entry.type === "folder" && folderGone(entry.id)) continue
		if (entry.type === "guild" && guildGone(String(entry.id))) continue
		if (entry.type == null) {
			// No type tag: string id = guild, number id = folder (folder ids are numbers).
			if (typeof entry.id === "string" && guildGone(entry.id)) continue
			if (entry.id != null && entry.guildIds == null && entry.children == null && folderGone(entry.id)) continue
		}

		let next = entry
		if (Array.isArray(entry.guildIds)) {
			const kept = entry.guildIds.filter((id: string) => !guildGone(id))
			if (kept.length !== entry.guildIds.length) {
				next = clone(entry)
				next.guildIds = kept
			}
		}
		if (Array.isArray(entry.children)) {
			const kept = filterListEntries(entry.children)
			if (kept.length !== entry.children.length) {
				if (next === entry) next = clone(entry)
				next.children = kept
			}
		}

		out.push(next)
	}
	return out
}

function filterGeneric(value: unknown): unknown {
	if (!Array.isArray(value)) return value
	return filterListEntries(value as any[])
}

/**
 * A single folder object (getGuildFolderById): filter its contents in place (on a clone),
 * never dropping the folder itself regardless of how empty it ends up -- callers
 * dereference the result. If every server inside ends up hidden the folder renders empty;
 * that's the user's cue to hide the folder instead.
 */
function filterSingleFolder(value: unknown): unknown {
	if (!value || typeof value !== "object") return value
	const entry = value as any
	if (!Array.isArray(entry.guildIds) && !Array.isArray(entry.children)) return value

	const hiddenInFolders = hiddenFolderGuildIds()
	const guildGone = (id: unknown) => typeof id === "string" && (isHidden(id) || hiddenInFolders.has(id))

	let next = entry
	if (Array.isArray(entry.guildIds)) {
		const kept = entry.guildIds.filter((id: string) => !guildGone(id))
		if (kept.length !== entry.guildIds.length) {
			next = clone(entry)
			next.guildIds = kept
		}
	}
	if (Array.isArray(entry.children)) {
		const kept = filterListEntries(entry.children)
		if (kept.length !== entry.children.length) {
			if (next === entry) next = clone(entry)
			next.children = kept
		}
	}
	return next
}

// `getGuildFolders` and `getCompatibleGuildFolders` are deliberately NOT patched. They were
// until 1.5.1, and that was the cause of "reordering servers scrambles the order account-wide":
// neither getter feeds the bar's render path (useGuildsBarProps reads getFastListGuildFolders
// + getGuildsTree only), but BOTH feed Discord's *persist* path. On drop, performMove dispatches
// GUILD_MOVE_BY_ID (id-based, mutates the store's complete internal tree -- safe), then
// persistAndAnnounce snapshots getCompatibleGuildFolders() and hands it to saveGuildFolders,
// which writes it into the synced user-settings proto ("guildFolders") via
// PreloadedUserSettingsActionCreators.updateAsync. updateFolder (rename/recolor) does the same
// through getGuildFolders().map(...). With those getters filtered, the persisted snapshot was
// missing every hidden guild/folder, so hidden servers fell out of the proto's ordering and
// were re-inserted as unsorted on every client -- desktop and web included.
// (All traced by disassembly of Discord 337.10; see patches/saveGuildFolders.ts, which adds a
// guard on the saveGuildFolders choke point itself.)
const TARGETS: Array<[string, (value: unknown) => unknown]> = [
	["getFlattenedGuildIds", filterIds],
	["getGuildsTree", filterTree],
	// Confirmed present on-device (1.4.1 store probe) -- these are what the stock bar
	// actually reads (337.10 disassembly: useGuildsBarProps' selector), which is why
	// filtering only getGuildsTree changed nothing in the bar.
	["getFastListGuildFolders", filterGeneric],
	["getFlattenedGuildFolderList", filterGeneric],
	// What an expanded folder row resolves its own contents through.
	["getGuildFolderById", filterSingleFolder],
	// Present on some builds; patched only if they exist.
	["getFlattenedGuilds", filterIds],
	["getGuildIds", filterIds],
]

// These filters run on the server-list render path, where a throw takes down the whole
// server list. If anything goes wrong, stop filtering for the rest of the session rather
// than crashing repeatedly.
let disabled = false

/**
 * Run `fn` with filtering suspended.
 *
 * The settings page needs the *unfiltered* tree -- otherwise hidden servers disappear from
 * it too and there is no way to unhide them.
 */
export function unfiltered<T>(fn: () => T): T {
	const previous = disabled
	disabled = true
	try {
		return fn()
	} finally {
		disabled = previous
	}
}

/** The store, for callers that need to read it directly. */
export function store() {
	return sortedGuildStore()
}

/**
 * Install one patch.
 *
 * Must stay a standalone function rather than a loop body: some downlevel transforms turn
 * `const` in `for...of` into `var`, which would make closures created inside the loop share
 * the final iteration's `method`/`filter`. Function parameters bind per call instead.
 */
function install(method: string, filter: (value: unknown) => unknown): (() => void) | undefined {
	if (typeof sortedGuildStore()[method] !== "function") return undefined

	try {
		// after's hook receives only the return value (confirmed from revenge-bundle-next's
		// own patcher source) -- this patch only ever needed the result anyway, so no
		// conversion to instead is needed here (unlike the other .after( fixes elsewhere).
		return after(sortedGuildStore(), method, (ret: unknown) => {
			// Skip the work entirely when nothing is hidden.
			if (disabled || isEmpty()) return ret

			try {
				return filter(ret)
			} catch {
				disabled = true
				return ret
			}
		})
	} catch {
		return undefined
	}
}

export default function patchSortedGuilds() {
	const patches: Array<() => void> = []

	if (!sortedGuildStore()) return () => {}

	for (const target of TARGETS) {
		const unpatch = install(target[0], target[1])
		if (unpatch) patches.push(unpatch)
	}

	return () => patches.forEach(unpatch => { try { unpatch() } catch { /* already gone */ } })
}

/**
 * Nudge the UI after the hidden set changes.
 *
 * Tries both `doEmitChanges` (the classic-Revenge-confirmed name for this store) and the
 * more common `emitChange`, in case Valenced exposes it differently.
 */
export function refresh() {
	for (const method of ["doEmitChanges", "emitChange"]) {
		try {
			if (typeof sortedGuildStore()?.[method] === "function") {
				sortedGuildStore()[method]()
				return method
			}
		} catch {
			/* try the next one */
		}
	}

	return undefined
}

/** Names the store actually exposes, for diagnostics. */
export function emitterInfo() {
	const has = (m: string) => {
		try {
			return typeof sortedGuildStore()?.[m] === "function"
		} catch {
			return false
		}
	}
	return { doEmitChanges: has("doEmitChanges"), emitChange: has("emitChange") }
}
