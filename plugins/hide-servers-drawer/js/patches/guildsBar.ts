import { getModuleByPath } from "../../../../shared/modules"
import { reportError } from "../../../../shared/report"
import { isEditing, isEmpty, instant, onBarChange } from "../lib/hidden"
import { consumeDumpArmed, dumpElementTree, dumpIncomingProps, noteBranch, notifyDumpDone, stockBar } from "../lib/probe"
import CustomGuildsBar from "../ui/components/CustomGuildsBar"
import { registerIntercept, unregisterIntercept } from "./createElementIntercept"
import { getModules } from "@valenced/modules/finders"
import { withName } from "@valenced/modules/finders/filters"
import { instead } from "@valenced/patcher"
import { createElement, useEffect, useReducer } from "react"

const DEBUG: boolean = false

// Nulling individual guild-bar rows leaves the row in the virtualized list's geometry -- the
// bar keeps a phantom slot and tapping a server jumps the scroll position, because a
// virtualized list still reserves layout for every entry in its data array, blank or not.
// There is no prop or override that removes an item from that geometry short of it never
// being in the array the list sees.
//
// So this patches the bar itself, not its rows: when anything is hidden, swap GuildsBar for
// a plain, non-virtualized render (see ui/components/CustomGuildsBar) built from
// SortedGuildStore.getGuildsTree(), which patches/sortedGuilds.ts already filters. A hidden
// guild is simply absent from that array -- nothing reserves a slot for it, so there is no
// gap and no scroll jump. When nothing is hidden, the real GuildsBar renders untouched.
/**
 * A raw custom filter, built by hand instead of via `filters.withName` etc: matches a module
 * whose exports (or default export) is a `React.memo()` wrapper around a function named
 * `name` -- i.e. checks `exports.type.name`, not `exports.name`. Confirmed on-device
 * (staff-tags plugin, an identical "UserRow" lookup) that `withName` alone finds nothing for
 * a memo-wrapped component: `React.memo(function GuildsBar(){...})` returns a plain
 * `{ $$typeof, type, compare }` object with no `.name` of its own, which `withName` (checks
 * `.name` only) can never match -- but `.type.name` (the wrapped function's own name) still
 * is "GuildsBar". Shaped like `filters.withProps` et al. (a predicate function with
 * `.key`/`.flags`/`.scopes`) since `valenced.modules.finders` doesn't expose a generic
 * custom-predicate filter constructor to external plugins.
 *
 * IMPORTANT: `getModules`/`lookupModule` call `filter.scope(...)` as a *method*, not a
 * property read (confirmed from revenge-bundle-next's own source) -- a filter missing this
 * method throws immediately when passed to getModules. The first version of this filter only
 * set a `.scopes` property and had no `.scope()` method at all, so (caught silently by the
 * try/catch below) it never actually ran once.
 */
function withMemoName(name: string) {
	const filter: any = (_id: number, exports: any) => exports?.type?.name === name
	filter.key = `revenge-next-plugins.memoName(${name})`
	filter.flags = 1 // FilterFlag.RequiresExports
	filter.scopes = 4 // FilterScopes.Initialized
	// Minimal stand-in for the real Helpers prototype (unexposed to external plugins):
	// getModules/lookupModule only ever call `.scope(...)`, never `.and()`/`.or()`/etc, for
	// filters passed in from here, so only that needs implementing.
	filter.scope = (...scopes: number[]) => {
		const scoped: any = (id: number, exports: any) => filter(id, exports)
		scoped.key = filter.key
		scoped.flags = filter.flags
		scoped.scopes = scopes.reduce((a, b) => a | b, 0)
		scoped.scope = filter.scope
		return scoped
	}
	return filter
}

interface BarProps {
	args: any[]
	render: (...args: any[]) => any
}

/**
 * Picks which bar to draw: the stock bar or the legacy custom bar. Edit mode works in both
 * (stock rows get their overlay from patches/editMode.tsx).
 *
 * Each is its own component rather than a branch inside the patched render, so switching
 * between them mounts and unmounts cleanly instead of changing the bar's hook order (the stock
 * body and CustomGuildsBar call different hooks).
 */
function BarSwitch({ args, render }: BarProps) {
	const [, bump] = useReducer((n: number) => n + 1, 0)
	useEffect(() => onBarChange(bump), [])

	// Dev probes (lib/probe.ts): stockBar() leaves the stock bar alone even while servers are
	// hidden, and an armed dump renders stock once while capturing its props and element tree.
	const dump = consumeDumpArmed()
	const useStock = isEmpty() || !instant() || stockBar() || dump
	noteBranch(dump ? "dump" : useStock ? `stock (empty=${isEmpty()} instant=${instant()} probe=${stockBar()})` : "custom")
	const editing = isEditing()
	if (!useStock) return createElement(CustomGuildsBar, { editing })
	// Not remounted on edit-mode changes: that reset the scroll to the top. The stock bar picks
	// up the new list itself through the tree version (withBarVersion in sortedGuilds.ts).
	return createElement(StockBar, { args, render, dump })
}

/**
 * The stock bar's FastList ref (a useRef object, stable for the bar's life), taken from the
 * element GuildsBar renders with `nativeID: "guilds-bar-fast-list"` (352.6 bundle).
 */
let listRef: { current?: any } | undefined
/** The bar's `scrollPosValue` (a Reanimated shared value), in case `scrollPos` is stale. */
let scrollValue: any

function sharedValue(value: any): number | undefined {
	try {
		const v = typeof value?.get === "function" ? value.get() : value?.value
		return typeof v === "number" ? v : undefined
	} catch {
		return undefined
	}
}

function findListRef(node: any, depth: number): { current?: any } | undefined {
	if (!node || typeof node !== "object" || depth > 8) return undefined
	if (Array.isArray(node)) {
		for (const child of node) {
			const found = findListRef(child, depth + 1)
			if (found) return found
		}
		return undefined
	}
	const props = node.props
	if (!props) return undefined
	if (props.nativeID === "guilds-bar-fast-list") {
		if (props.scrollPosValue) scrollValue = props.scrollPosValue
		const ref = node.ref ?? props.ref
		return ref && typeof ref === "object" ? ref : undefined
	}
	return findListRef(props.children, depth + 1)
}

interface Anchor {
	id: unknown
	/** How far the saved scroll position was below this row's top. */
	offset: number
}

/**
 * The rows at or below the top of the view, as anchor ids from the bar's own
 * `getAnchorIdFromIndex(section, item)` (each server or folder is its own section, "GUILDS:<id>";
 * servers in an open folder are items). Several, so leaving edit mode still finds one when the
 * top row was just hidden.
 */
function anchorsAt(list: any, y: number): Anchor[] {
	const toId = list?.props?.getAnchorIdFromIndex
	const entries = list?.state?.fastListComputer?.items
	if (typeof toId !== "function" || !entries) return []
	const out: Anchor[] = []
	for (const entry of Array.from(entries as Iterable<any>)) {
		if (out.length >= 12) break
		if (typeof entry?.section !== "number" || typeof entry.layoutStart !== "number") continue
		if (entry.layoutStart + (entry.layoutSize ?? 0) <= y) continue
		const id = toId(entry.section, typeof entry.item === "number" ? entry.item : undefined)
		if (id != null) out.push({ id, offset: y - entry.layoutStart })
	}
	return out
}

/** Where `anchors[0]` (or the first one still listed) now puts the saved position. */
function targetFor(list: any, anchors: Anchor[]): number | undefined {
	const toIndex = list?.props?.getAnchorIndexFromId
	if (typeof toIndex !== "function" || typeof list.computeScrollPosition !== "function") return undefined
	for (const anchor of anchors) {
		const index = toIndex(anchor.id)
		if (typeof index?.section !== "number") continue
		const pos = list.computeScrollPosition(index.section, index.item)
		if (typeof pos?.scrollPosition === "number") return pos.scrollPosition + anchor.offset
	}
	return undefined
}

let reportedNoList = false

/** Within about a row of the end counts as "at the end". */
const NEAR_END = 64

/** The furthest the bar can scroll: content size minus the visible height. */
function maxScroll(list: any): number | undefined {
	const size = list?.state?.fastListComputer?.getSize?.()
	if (typeof size !== "number" || typeof list.containerSize !== "number") return undefined
	return Math.max(0, size - list.containerSize)
}

/**
 * Runs `change` and keeps the server bar on the same servers.
 *
 * Turning edit mode on or off changes the list the bar draws (hidden servers come and go), and
 * FastList's own anchoring doesn't hold: it only anchors on items, and here every server and
 * folder is a section (352.6 bundle, FastList findOrUpdateAnchor). Restoring the pixel offset
 * isn't enough either, since rows above it appear or vanish. So this notes which servers are at
 * the top, then scrolls so the first one still listed sits where it did.
 *
 * Near the end of the bar it keeps the end in place instead: the eye and tick live in the footer
 * there, and hidden servers usually show up just above it, so anchoring on the top rows pushed
 * the button you'd just tapped a long way off screen. Run over a few frames,
 * since the list recomputes after the next render; `scrollTo(y, animated)` only moves if `y`
 * fits the content, so the target is clamped.
 */
export function keepBarScroll(change: () => void) {
	let y: number | undefined
	let anchors: Anchor[] = []
	/** Set when the bar was scrolled to (near) its end: how far above the end it was. */
	let fromEnd: number | undefined
	try {
		const list = listRef?.current
		const own = list?.scrollPos
		const pos = typeof own === "number" ? own : sharedValue(scrollValue)
		if (typeof pos === "number" && pos > 0) {
			y = pos
			anchors = anchorsAt(list, pos)
			const max = maxScroll(list)
			if (max !== undefined && max - pos <= NEAR_END) fromEnd = Math.max(0, max - pos)
		}
	} catch {
		/* no saved position, just make the change */
	}
	change()
	if (!listRef && !reportedNoList) {
		reportedNoList = true
		reportError("[HideServersDrawer] couldn't find the server bar's list, so its scroll can't be kept")
	}
	if (y === undefined) return

	const restore = () => {
		try {
			const list = listRef?.current
			if (!list || typeof list.scrollTo !== "function") return
			const max = maxScroll(list)
			let target = (fromEnd !== undefined && max !== undefined ? max - fromEnd : undefined) ?? targetFor(list, anchors) ?? (y as number)
			if (max !== undefined) target = Math.max(0, Math.min(target, max))
			const now = typeof list.scrollPos === "number" ? list.scrollPos : sharedValue(scrollValue)
			if (now !== undefined && Math.abs(now - target) < 1) return
			list.scrollTo(target, false)
		} catch (error) {
			if (DEBUG) console.warn("[HideServersDrawer] restoring the bar scroll failed:", error)
		}
	}
	requestAnimationFrame(() => requestAnimationFrame(restore))
	setTimeout(restore, 120)
	setTimeout(restore, 300)
}

/** Discord's own bar body, rendered as a child so BarSwitch can swap it out. */
function StockBar({ args, render, dump }: BarProps & { dump: boolean }) {
	const out = render(...args)
	try {
		const ref = findListRef(out, 0)
		if (ref) listRef = ref
	} catch {
		/* scroll keeping just won't work */
	}
	if (dump) {
		try {
			dumpIncomingProps(args?.[0])
		} catch {
			/* ignore */
		}
		try {
			dumpElementTree(out)
		} catch {
			/* ignore */
		}
		notifyDumpDone()
	}
	return out
}

export default function patchGuildsBar(): () => void {
	const patches: Array<() => void> = []
	const patchedAlready = new Set<any>()

	function patchBar(bar: any) {
		if (!bar || patchedAlready.has(bar)) return
		patchedAlready.add(bar)

		const original = bar.type

		try {
			patches.push(
				instead(bar, "type", (args: any[], callOriginal: any) => {
					// Confirmed on-device crash elsewhere (staff-tags): "undefined is not a
					// function" when a captured original wasn't actually a function yet at patch
					// time. Never assume it's callable.
					if (typeof callOriginal !== "function") return null
					return createElement(BarSwitch, { args, render: callOriginal })
				}),
			)
		} catch {
			return
		}

		// Belt-and-suspenders: if a closure captured `original` before this patch applied and
		// constructs it directly via React.createElement, catch it there too. See
		// createElementIntercept.ts for why `instead` alone isn't guaranteed to cover that.
		if (typeof original === "function") {
			try {
				const fallback = (props: any) => createElement(BarSwitch, { args: [props], render: original })

				registerIntercept(original, fallback)
				patches.push(() => unregisterIntercept(original))
			} catch {
				/* the instead() patch above still covers the common path */
			}
		}
	}

	// getModules, not lookupModules: confirmed on-device (staff-tags plugin) that a
	// chat/guild-UI-related module can still be unloaded even from inside start() on a cold
	// app restart. lookupModules gives up immediately and permanently caches that as "not
	// found"; getModules subscribes and calls back whenever a match actually loads. Tries
	// both withName (a plain named export) and withMemoName (a React.memo() wrapper, which
	// was confirmed on-device to be the actual shape of an equivalent "UserRow" component in
	// the staff-tags plugin) since it's unconfirmed which shape GuildsBar itself has. max: 5
	// since there's no confirmed equivalent of classic Revenge's findByTypeNameAll (which
	// scanned rendered React element types, not metro modules) -- these are the closest
	// available primitives and may match zero or several "GuildsBar" closures.
	// Discord 349.5 minifies function names, so neither name filter below matches there; the
	// module path (identical in 348.5) does. patchBar skips a bar it already patched, so
	// running all three is safe.
	const unsubscribePath = getModuleByPath(
		"modules/guilds_bar/native/GuildsBar.tsx",
		null,
		(mod: any) => {
			if (mod?.default?.type) patchBar(mod.default)
			else { if (DEBUG) console.warn("[HideServersDrawer] GuildsBar.tsx default is not a memo wrapper:", typeof mod?.default) }
		},
		"[HideServersDrawer]",
	)
	let unsubscribeNamed = () => {}
	let unsubscribeMemo = () => {}
	try {
		unsubscribeNamed = getModules(
			withName("GuildsBar"),
			patchBar,
			{ max: 5 },
		)
		unsubscribeMemo = getModules(withMemoName("GuildsBar"), patchBar, { max: 5 })
	} catch {
		/* leave the bar unpatched */
	}

	return () => {
		listRef = undefined
		scrollValue = undefined
		unsubscribePath()
		unsubscribeNamed()
		unsubscribeMemo()
		patches.forEach(unpatch => {
			try {
				unpatch()
			} catch {
				/* already gone */
			}
		})
	}
}
