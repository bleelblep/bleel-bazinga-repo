import { getModuleByPath } from "../../../../shared/modules"
import { isEmpty, instant } from "../lib/hidden"
import { consumeDumpArmed, dumpElementTree, dumpIncomingProps, noteBranch, notifyDumpDone, stockBar } from "../lib/probe"
import CustomGuildsBar from "../ui/components/CustomGuildsBar"
import { registerIntercept, unregisterIntercept } from "./createElementIntercept"
import { getModules } from "@valenced/modules/finders"
import { withName } from "@valenced/modules/finders/filters"
import { instead } from "@valenced/patcher"
import { createElement } from "react"

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
					// Dev probes (lib/probe.ts): stockBar() leaves the stock bar alone even
					// while servers are hidden, and an armed dump renders stock once while
					// capturing its props and element tree.
					const dump = consumeDumpArmed()
					const useStock = isEmpty() || !instant() || stockBar() || dump
					noteBranch(dump ? "dump" : useStock ? `stock (empty=${isEmpty()} instant=${instant()} probe=${stockBar()})` : "custom")
					if (useStock) {
						// Confirmed on-device crash elsewhere (staff-tags): "undefined is not
						// a function" when a captured original wasn't actually a function yet
						// at patch time. Never assume it's callable.
						if (typeof callOriginal !== "function") return null
						const out = callOriginal.apply(bar, args)
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
					return createElement(CustomGuildsBar, null)
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
				const fallback = (props: any) =>
					isEmpty() || !instant() || stockBar()
						? createElement(original, props)
						: createElement(CustomGuildsBar, null)

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
