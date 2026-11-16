import * as finders from '@valenced/discord/utils/modules/finders'
import * as modulesFinders from '@valenced/modules/finders'
import * as filters from '@valenced/modules/finders/filters'
import * as metro from '@valenced/modules/metro'

const DEBUG: boolean = false

/**
 * A one-shot sweep of Metro's initialized modules, printed to the console.
 *
 * Four releases were spent guessing module names one per round, because the only channel back
 * from the device was a sentence in the settings page. `console.log` reaches `adb logcat` under
 * the `ReactNativeJS` tag, which is enough bandwidth to just *look*.
 *
 * Debug-only, off by default, and it never logs a value — only module ids and export key names.
 * Nothing here can print a username.
 *
 * ## One line per hit, on purpose
 *
 * The previous version batched hits twenty to a `console.log`. Only the *first* line of a
 * multi-line log carries the `ReactNativeJS` tag, so every continuation line is dropped by any
 * tag or prefix filter — the sweep appeared to find 79 candidate modules and print none of them.
 * That is coding rule 5's own warning, walked straight into by the tool written to satisfy it.
 * Every line below is its own call.
 */

/**
 * Metro ids are dense small integers. There is no "list all modules" call, so the sweep walks
 * the range and asks whether each id is initialized; uninitialized ids cost one call and are
 * skipped. Capped rather than unbounded because this runs on the JS thread.
 */
const MAX_ID = 30000

/** Export keys worth reporting: the vocabulary a name/title resolver is likely to use. */
const INTERESTING =
	/^(get|use|render|format)?(channel|recipient|dm|group|user|display|nick|global)?.*(name|title|label|tag)$/i

/** Keys that are certain noise at this scale. */
const BORING = /^(displayName|name|fileName|typeName|constructor)$/

/**
 * The resolvers `patches/displayName.ts` tries to hook. Device logs show only `useUserTag` ever
 * matching, so these get reported exactly — which module ids carry them, and whether the export
 * is callable — rather than being left to the `INTERESTING` heuristic.
 */
const WANTED = [
	'getName',
	'useName',
	'getNickname',
	'getGlobalName',
	'getFormattedName',
	'getUserTag',
	'useUserTag',
]

const log = (line: string) => {
	if (DEBUG) console.log(`[ScreenshotRedactor] ${line}`)
}

export function probeNameModules(): string {
	const { getInitializedModuleExports, isModuleInitialized } = metro as any

	const hits: string[] = []
	const exact: string[] = []
	let scanned = 0
	let initialized = 0

	for (let id = 0; id < MAX_ID; id++) {
		scanned++

		let exports: any
		try {
			if (!isModuleInitialized(id)) continue
			initialized++
			exports = getInitializedModuleExports(id)
		} catch {
			continue
		}

		if (!exports || typeof exports !== 'object') continue

		// The exact question first: who exports the resolvers we care about, and in what shape?
		// `typeof` is reported rather than filtered on, because "the key is there but is not a
		// function" and "the key is not there" are different bugs and the hook silently skips
		// both. Both the exports object and a `default` wrapper are checked — a resolver hiding
		// one level down would look identical to an absent one.
		try {
			for (const key of WANTED) {
				const direct = exports[key]
				const nested = exports.default?.[key]
				if (direct === undefined && nested === undefined) continue
				exact.push(
					`${id}.${key}: exports=${typeof direct}${nested !== undefined ? ` default.${key}=${typeof nested}` : ''}`,
				)
			}
		} catch {
			/* some namespaces throw on property access */
		}

		try {
			const keys: string[] = []
			for (const key of Object.keys(exports)) {
				if (BORING.test(key)) continue
				if (!INTERESTING.test(key)) continue
				if (typeof exports[key] !== 'function') continue
				keys.push(key)
			}
			if (keys.length) hits.push(`${id}: ${keys.join(', ')}`)
		} catch {}
	}

	log(
		`probe: ${initialized} initialized of ${scanned} scanned, ${hits.length} candidates, ${exact.length} exact`,
	)

	// The decisive question since 0.19.0, and the cheapest line in this file: are the two modules
	// the plugin actually targets reachable by their own source path? If these report an id, the
	// prop sweeps below are noise — they exist only for a build that has moved the files.
	for (const path of ['utils/UserUtils.tsx', 'utils/AvatarUtils.tsx']) {
		try {
			const { lookupModuleWithImportedPath } = finders
			const [exports, id] = lookupModuleWithImportedPath(path)
			log(
				id === undefined
					? `probe PATH ${path} -> not imported yet`
					: `probe PATH ${path} -> module ${id}, keys=${exports ? Object.keys(exports).length : 0}`,
			)
		} catch (error) {
			log(`probe PATH ${path} -> threw: ${String(error)}`)
		}
	}

	// The decisive list: every module carrying a resolver this plugin tries to hook.
	log(`probe EXACT (${exact.length}) — modules exporting a wanted resolver:`)
	for (const line of exact) log(`  exact ${line}`)

	// And what the finder itself sees, which is the actual open question: the sweep can find a
	// module by walking ids that `getModules(withProps(...))` never hands to the callback.
	for (const key of WANTED) {
		try {
			const { lookupModules } = modulesFinders as any
			const { withProps } = filters
			let found = 0
			for (const _result of lookupModules(withProps(key))) {
				found++
				if (found > 25) break
			}
			log(`probe FINDER withProps(${key}) -> ${found} module(s)`)
		} catch (error) {
			log(`probe FINDER withProps(${key}) -> threw: ${String(error)}`)
		}
	}

	log(`probe CANDIDATES (${hits.length}) — heuristic name/title exports:`)
	for (const line of hits) log(`  cand ${line}`)

	return `${hits.length} candidates, ${exact.length} exact — see adb logcat`
}
