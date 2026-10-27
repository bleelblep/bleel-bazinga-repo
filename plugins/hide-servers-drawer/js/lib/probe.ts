/**
 * Dev-only, session-only diagnostics for closing the gap between the custom bar and stock.
 *
 * Three questions, one device round:
 *
 *   1. What props does Discord hand GuildsBar? If the server tree arrives via props, the
 *      store patch was never the only lever -- filtering props and rendering the untouched
 *      stock bar would give exact parity for free.
 *   2. What does the stock bar actually render? Which list component (FlashList or
 *      something else), with which scroll props, and how are the Home button and unread-DM
 *      rows composed? This replaces the guesswork the custom bar was built on.
 *   3. Which actions can open DMs? `selectPrivateChannel(null)` taps are unreliable; dump
 *      every candidate action module's export names so the Home button can call whatever
 *      stock calls.
 *
 * `console.log` reaches `adb logcat` under the `ReactNativeJS` tag. ONE LINE PER CALL --
 * continuation lines of a multi-line log are dropped by tag filters (see
 * screenshot-redactor's probe, which learned this the hard way). Nothing below logs a
 * value that could contain user data: numbers, booleans, function-presence, array lengths,
 * and export/style key names only. The single exception is a small whitelist of enum-typed
 * RN props (overScrollMode etc.) whose values are fixed strings from RN's own source.
 */

import { Stores } from '@valenced/discord/flux'
import * as finders from '@valenced/modules/finders'
import * as filters from '@valenced/modules/finders/filters'

const DEBUG: boolean = false

const log = (line: string) => { if (DEBUG) console.log(`[HideServersDrawer] ${line}`) }

// ---------------------------------------------------------------------------
// Session flags

let stockBarFlag = false
let dumpArmedFlag = false

/** Render the untouched stock bar even while servers are hidden (store filter still applies). */
export const stockBar = () => stockBarFlag
export const setStockBar = (value: boolean) => {
	stockBarFlag = value
}

/**
 * Arm a one-shot dump: the next time the patched GuildsBar renders, call the original,
 * dump its incoming props and rendered tree, disarm, and return the stock tree (so the
 * stock bar flashes on screen for that render). Independent of stockBarFlag.
 */
export const armDump = () => {
	dumpArmedFlag = true
}

/** Returns true once per arm; the caller is expected to dump when this returns true. */
export const consumeDumpArmed = () => {
	const armed = dumpArmedFlag
	dumpArmedFlag = false
	return armed
}

/** Set from the plugin entry point; runs after a dump completes (used to clear the crash-guard). */
let dumpDoneCallback: (() => void) | undefined
export const onDumpDone = (fn: () => void) => {
	dumpDoneCallback = fn
}
export const notifyDumpDone = () => {
	try {
		dumpDoneCallback?.()
	} catch {
		/* ignore */
	}
}

// ---------------------------------------------------------------------------
// Hook branch logging

let lastBranch: string | undefined

/**
 * Log when the patched GuildsBar switches between stock and custom output (and why), once
 * per change. Runs on the render path, so this does nothing but a string compare per call.
 */
export const noteBranch = (branch: string) => {
	if (branch === lastBranch) return
	lastBranch = branch
	log(`hook -> ${branch}`)
}

// ---------------------------------------------------------------------------
// Element-tree dump

/** Resolve a component name through memo/forwardRef wrappers -- docs/coding-rules.md rule 3. */
function typeName(type: any): string {
	if (typeof type === "string") return type
	if (!type) return "?"
	return (
		type.displayName ??
		type.name ??
		type.type?.displayName ??
		type.type?.name ??
		type.render?.displayName ??
		type.render?.name ??
		"Anonymous"
	)
}

/** Props whose string values are safe to print: fixed enums from RN/FlashList source. */
const ENUM_PROPS = new Set(["overScrollMode", "decelerationRate", "snapToAlignment"])

/** Everything a list's feel and composition lives in. Presence is logged for functions. */
const WATCH_PROPS = [
	"data",
	"renderItem",
	"keyExtractor",
	"estimatedItemSize",
	"getItemType",
	"ListHeaderComponent",
	"ListFooterComponent",
	"ItemSeparatorComponent",
	"CellRendererComponent",
	"contentContainerStyle",
	"style",
	"showsVerticalScrollIndicator",
	"scrollEventThrottle",
	"removeClippedSubviews",
	"windowSize",
	"initialNumToRender",
	"maxToRenderPerBatch",
	"maintainVisibleContentPosition",
	"snapToInterval",
	"disableIntervalMomentum",
	"numColumns",
	"horizontal",
	"inverted",
	"pagingEnabled",
	"bounces",
	"fadingEdgeLength",
	"nestedScrollEnabled",
	"drawDistance",
	"stickyHeaderIndices",
	"onPress",
	"onLongPress",
]

function summarizeStyle(style: any): string {
	// RN styles arrive as a plain object, a registered-style number, or an array of those.
	// Only numbers/booleans inside plain objects are printed -- never strings.
	if (typeof style === "number") return `reg(${style})`
	if (Array.isArray(style)) return `[${style.map(summarizeStyle).join(",")}]`
	if (style && typeof style === "object") {
		const entries = Object.entries(style)
			.filter(([, v]) => typeof v === "number" || typeof v === "boolean")
			.map(([k, v]) => `${k}:${String(v)}`)
		return `{${entries.join(",")}}`
	}
	return typeof style
}

function summarizeProp(key: string, value: any): string {
	if (value == null) return ""
	if (ENUM_PROPS.has(key) && typeof value === "string") return ` ${key}="${value}"`
	if (typeof value === "function") return ` ${key}=fn`
	if (typeof value === "number" || typeof value === "boolean") return ` ${key}=${String(value)}`
	if (Array.isArray(value)) return ` ${key}=[${value.length}]`
	if (key === "style" || key === "contentContainerStyle") return ` ${key}=${summarizeStyle(value)}`
	if (typeof value === "object") {
		// Component slots (ListHeaderComponent etc.) arrive as elements or component types.
		const name = value.type ? typeName(value.type) : typeName(value)
		return ` ${key}=<${name}>`
	}
	return ` ${key}=${typeof value}`
}

function summarizeProps(props: any): string {
	if (!props || typeof props !== "object") return ""
	let out = ""
	for (const key of WATCH_PROPS) {
		try {
			out += summarizeProp(key, props[key])
		} catch {
			/* a getter throwing is not worth the round */
		}
	}
	return out
}

const MAX_NODES = 160
const MAX_DEPTH = 10
const MAX_CHILDREN = 25

/** Walk a rendered element tree, one log line per node. Never calls any function prop. */
export function dumpElementTree(root: any): void {
	let nodes = 0

	const walk = (node: any, depth: number): void => {
		if (nodes >= MAX_NODES || depth > MAX_DEPTH || node == null || typeof node !== "object") return
		if (Array.isArray(node)) {
			for (const child of node.slice(0, MAX_CHILDREN)) walk(child, depth)
			return
		}

		const props = node.props
		if (!node.type) {
			// Not an element (portal, text node container): still descend into children.
			walk(props?.children, depth)
			return
		}

		nodes++
		const indent = "  ".repeat(depth)
		log(`${indent}<${typeName(node.type)}${summarizeProps(props)}>`)

		const children = props?.children
		if (typeof children === "function") {
			log(`${indent}  children=fn`)
			return
		}
		walk(children, depth + 1)
	}

	log("dump: stock GuildsBar tree (capped at " + MAX_NODES + " nodes)")
	try {
		walk(root, 0)
	} catch (error) {
		log(`dump: walk threw: ${String(error)}`)
	}
	log(`dump: ${nodes} node(s)`)
}

/** Key names and value shapes of the props Discord passes into GuildsBar. */
export function dumpIncomingProps(props: any): void {
	if (!props || typeof props !== "object") {
		log(`dump: GuildsBar received props of type ${typeof props}`)
		return
	}
	try {
		const keys = Object.keys(props).map(key => {
			const value = props[key]
			if (typeof value === "function") return `${key}:fn`
			if (Array.isArray(value)) return `${key}:[${value.length}]`
			if (value && typeof value === "object") return `${key}:obj`
			return `${key}:${typeof value}`
		})
		log(`dump: incoming props (${keys.length}): ${keys.join(", ")}`)
	} catch (error) {
		log(`dump: incoming props threw: ${String(error)}`)
	}
}

// ---------------------------------------------------------------------------
// DM navigation probe

const ACTION_PROPS = ["selectPrivateChannel", "transitionToGuild", "transitionTo", "selectChannel", "navigate"]

/**
 * Dump the export names of every module carrying a known navigation-ish export. Export
 * names are code identifiers -- never user data. Capped hard; this runs on the JS thread.
 */
export function probeDmNavigation(): string {
	const { lookupModules } = finders as any
	const { withProps } = filters

	let total = 0
	for (const prop of ACTION_PROPS) {
		let found = 0
		try {
			for (const result of lookupModules(withProps(prop))) {
				found++
				total++
				if (found > 5) break

				// lookupModules yields [exports, moduleId] tuples -- 1.4.1 logged the tuple's
				// own keys ("0, 1") instead of the export names.
				const [exports, id] = Array.isArray(result) ? result : [result, undefined]

				let keys: string[] = []
				try {
					keys = Object.keys(exports ?? {}).slice(0, 60)
				} catch {
					keys = ["<enumeration threw>"]
				}
				log(`probe nav withProps(${prop}) #${found} (module ${id}): ${keys.join(", ")}`)

				if (exports?.default && typeof exports.default === "object") {
					try {
						log(`probe nav withProps(${prop}) #${found} default: ${Object.keys(exports.default).slice(0, 60).join(", ")}`)
					} catch {
						/* skip */
					}
				}
			}
			log(`probe nav withProps(${prop}) -> ${found} module(s)`)
		} catch (error) {
			log(`probe nav withProps(${prop}) -> threw: ${String(error)}`)
		}
	}

	return `${total} navigation module(s) — see adb logcat`
}

/** Method names SortedGuildStore actually exposes, for the same reason as above. */
export function probeSortedGuildStore(): string {
	const store = (Stores as any).SortedGuildStore
	if (!store) return "SortedGuildStore not found"

	const names = new Set<string>()
	try {
		for (const key of Object.keys(store)) names.add(key)
		let proto = Object.getPrototypeOf(store)
		while (proto && proto !== Object.prototype) {
			for (const key of Object.getOwnPropertyNames(proto)) names.add(key)
			proto = Object.getPrototypeOf(proto)
		}
	} catch {
		/* best effort */
	}

	log(`probe store SortedGuildStore (${names.size}): ${[...names].sort().join(", ")}`)
	return `${names.size} store member(s) — see adb logcat`
}
