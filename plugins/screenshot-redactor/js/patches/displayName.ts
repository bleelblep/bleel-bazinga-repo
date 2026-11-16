import { Stores } from '@valenced/discord/flux'
import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import * as finders from '@valenced/modules/finders'
import * as filters from '@valenced/modules/finders/filters'
import { reportError } from '../../../../shared/report'
import { redactedName } from '../lib/alias'
import { noteNamePatch, noteResolverSkipped } from '../lib/diagnostics'
import {
	patchResolver,
	ResolverSlots,
	resolverHosts,
} from '../lib/resolverHooks'
import { isEnabled, settings } from '../lib/state'
import { findUserObject } from '../lib/userArgs'

const DEBUG: boolean = false

/**
 * Redacting names *wherever the client resolves them* — inline `@mentions`, the member list, the
 * profile sheet, the mention autocomplete — rather than one patch per surface.
 *
 * All of those go through one module, and after five releases of guessing we now know which one
 * by name rather than by shape.
 *
 * ## The module is `utils/UserUtils.tsx`
 *
 * Read out of the shipped Hermes bundle (coding rule 5), not probed for. Its factory ends with a
 * `fileFinishedImporting('utils/UserUtils.tsx')` followed by the export assignments:
 *
 * ```
 * PutById exports, 'nameFromUser'      PutById exports, 'getUserTag'
 * PutById exports, 'getName'           PutById exports, 'useUserTag'
 * PutById exports, 'useName'           PutById exports, 'getGlobalName'
 * PutById exports, 'getFormattedName'
 * ```
 *
 * Two things follow, and between them they explain why 0.3.0–0.18.5 hooked exactly one resolver:
 *
 * 1. **There is one module that matters and it has a stable name.** `withProps('getName')`
 *    matches 26 modules on device because `getName` is an unremarkable export name; 25 of them
 *    are unrelated, and on most of those it isn't even a function. Filtering by property name was
 *    always going to be a lottery.
 * 2. **`getNickname` is not in it.** It never was — it is a Flux store method, which is what
 *    `patches/dmHeader.ts` exists to handle. The old candidate list mixed the two families
 *    together and reported "resolver not found" for something that was never a module export.
 *
 * ## Why `getModuleWithImportedPath` and not `getModules`
 *
 * `valenced.discord.utils.modules.finders.getModuleWithImportedPath` looks the module up in the import
 * tracker's `Map<path, id>` and, failing that, subscribes to `fileFinishedImporting`. No filter,
 * no result cache, no `max`, and it unsubscribes itself once the path resolves — imported paths
 * are unique, so there is nothing to disambiguate.
 *
 * That last point is the actual fix. `getModules(filter, cb, { max: 25 })` shares one `max`
 * counter between its lookup half and its wait half: the lookup runs first over every
 * already-initialized module and decrements `max` per match, and the counter it then hands to
 * `waitForModules` is whatever is left — zero, if 25 unrelated modules matched first.
 * `withProps('getName')` matches 26. So the subscription that was meant to catch
 * `utils/UserUtils.tsx` when the chat screen initialized it had already been spent on modules
 * whose `getName` isn't a function, and the callback returned silently on each. That is the
 * "`getModules` and `lookupModules` do not agree" entry in docs/coding-rules.md: they agree
 * fine, the subscription just never survived the lookup.
 *
 * `useUserTag` only ever landed because it is a rare enough export name that the 25 slots were
 * not exhausted before the real module turned up.
 */

/** Discord's own source path for the module. Read from the bundle, not guessed. */
const MODULE_PATH = 'utils/UserUtils.tsx'

/**
 * The exports worth hooking.
 *
 * `nameFromUser` is the primitive the rest are built on, but hooking it does **not** cover them:
 * `getName` calls it through a closure binding rather than through the exports object, so a patch
 * on the export is invisible to it. Every resolver reached from outside the module therefore has
 * to be hooked individually; `nameFromUser` is listed for the callers that use it directly.
 *
 * `getNickname` is deliberately absent — see the note above.
 */
const RESOLVERS = [
	'getName',
	'useName',
	'nameFromUser',
	'getGlobalName',
	'getFormattedName',
	'getUserTag',
	'useUserTag',
]

/**
 * Whether the `getName` hook actually registered this session.
 *
 * `patches/dmHeader.ts` reads this to decide whether its "answer even when there is no nickname"
 * workaround is still needed. Recording the *outcome* rather than the attempt is the lesson of
 * the last five releases: the Diagnostics page reported seven resolvers as patched throughout the
 * period when one was.
 */
let getNameHooked = false

export function isGetNameHooked(): boolean {
	return getNameHooked
}

/**
 * Hooks one resolver on one namespace.
 *
 * `before` + `after` rather than `instead`: `after` alone can't see which user a returned string
 * belongs to, and `instead` is rationed repo-wide (coding rule 2). These resolvers are
 * synchronous and not re-entrant, so one slot between the two is safe.
 */
function patchOne(
	namespace: any,
	key: string,
	label: string,
	cleanups: Array<() => void>,
) {
	cleanups.push(
		patchResolver(
			namespace,
			key,
			args => findUserObject(args)?.id as string | undefined,
			(ret, userId) => {
				try {
					if (!isEnabled()) return ret
					// Every resolver in this family returns a plain string -- `getUserTag` and
					// `useUserTag` both end in `presentUserTag`, which returns `username`,
					// `username#0001` or `@name`. Anything else belongs to some other overload.
					if (typeof ret !== 'string' || !userId) return ret

					const { style, redactSelf, redactResolvedNames } = settings()
					if (!redactResolvedNames) return ret

					if (!redactSelf) {
						const { UserStore } = Stores as any
						if (UserStore?.getCurrentUser?.()?.id === userId) return ret
					}

					return redactedName(userId, style)
				} catch (error) {
					reportError('[ScreenshotRedactor] name hook failed:', error)
				}

				return ret
			},
		),
	)

	if (key === 'getName') getNameHooked = true

	if (DEBUG) console.log(`[ScreenshotRedactor] hooked name resolver: ${label}`)
	noteNamePatch(label)
}

/**
 * Hooks every resolver present on a namespace, trying the exports object and then `default`.
 *
 * The `.default` fallback stays because it is load-bearing for the prop-sweep path below
 * (coding rule 3), even though the module reached by path exports its resolvers on the namespace
 * directly.
 *
 * @returns how many hooks were installed.
 */
function patchNamespace(
	mod: any,
	where: string,
	seen: ResolverSlots,
	cleanups: Array<() => void>,
	only?: string,
): number {
	let hooked = 0

	for (const key of RESOLVERS) {
		if (only && key !== only) continue

		try {
			for (const host of resolverHosts(mod, key)) {
				if (seen.has(host, key)) continue
				patchOne(
					host,
					key,
					`${key} (${where}, ${host === mod ? 'exports' : 'default'})`,
					cleanups,
				)
				seen.add(host, key)
				hooked++
			}
		} catch (error) {
			reportError(`[ScreenshotRedactor] failed to patch ${key}:`, error)
		}
	}

	return hooked
}

/** UserUtils exports all seven resolvers; a module with fewer than this is some other `getName`. */
const MIN_RESOLVERS_FOR_SWEEP = 3

function resolverCount(mod: any): number {
	let count = 0
	for (const key of RESOLVERS) {
		try {
			if (
				typeof mod?.[key] === 'function' ||
				typeof mod?.default?.[key] === 'function'
			)
				count++
		} catch {
			/* an export that throws on read is not one of ours */
		}
	}
	return count
}

/**
 * The fallback, for a build where the source path has moved.
 *
 * Split into `lookupModules` (what is initialized now) plus `waitForModules` (what initializes
 * later) rather than `getModules`, which is those two things sharing a `max` counter the first
 * half can exhaust — the bug described at the top of this file. Neither half is capped here, and
 * neither can poison the finder cache: `withProps` is scoped to initialized modules, so
 * `lookupModules` takes the `mInitialized` branch and never reaches the `cacheFilterNotFound`
 * call, which only runs for full-scope lookups.
 *
 * Every miss is counted. "The callback fired and found nothing callable" and "the callback never
 * fired" look identical from a settings page, and telling them apart is what took five releases.
 */
function sweepFor(
	key: string,
	seen: ResolverSlots,
	cleanups: Array<() => void>,
): () => void {
	const { lookupModules, waitForModules } = finders
	const { withProps } = filters

	const onModule = (mod: any, id: unknown) => {
		// `getName` and `useName` are ordinary export names; on 348 a second module (4988) carries
		// both and got hooked as though it were UserUtils. Only a module shaped like UserUtils --
		// several of its resolvers at once -- is taken.
		if (resolverCount(mod) < MIN_RESOLVERS_FOR_SWEEP) {
			noteResolverSkipped(key)
			return
		}
		if (
			patchNamespace(
				mod,
				`props, module ${String(id)}`,
				seen,
				cleanups,
				key,
			) === 0
		) {
			noteResolverSkipped(key)
		}
	}

	try {
		for (const [exports, id] of lookupModules(withProps(key)))
			onModule(exports, id)
	} catch (error) {
		reportError(`[ScreenshotRedactor] lookup sweep for ${key} failed:`, error)
	}

	try {
		return waitForModules(withProps(key), onModule)
	} catch (error) {
		reportError(`[ScreenshotRedactor] wait sweep for ${key} failed:`, error)
		return () => {}
	}
}

export default function patchDisplayName(): () => void {
	const cleanups: Array<() => void> = []
	const unsubscribes: Array<() => void> = []
	// Two paths can reach the same function. Patching it twice would install two hook pairs whose
	// `before` halves clobber each other's pending slot, so the function itself is the key.
	const seen = new ResolverSlots()

	// The sweeps are only for a build where the path has moved. Once the path has answered they
	// are pointless at best, and at worst hook some other module's `getName`.
	let pathHooked = false
	const sweeps: Array<() => void> = []
	const stopSweeps = () => {
		for (const stop of sweeps.splice(0)) {
			try {
				stop()
			} catch {
				/* already gone */
			}
		}
	}

	// The module by its own source path. Self-unsubscribing, uncapped, unambiguous, and on a
	// current build it answers synchronously.
	try {
		unsubscribes.push(
			getModuleWithImportedPath(MODULE_PATH, (mod: any, id: unknown) => {
				// On 348.1 the path answers *after* the sweep has already hooked every resolver on this
				// same module, so nothing new to hook is success. Only a module without them is a miss.
				if (
					patchNamespace(mod, `path, module ${String(id)}`, seen, cleanups) ===
						0 &&
					resolverCount(mod) === 0
				) {
					reportError(
						`[ScreenshotRedactor] ${MODULE_PATH} found but carries no resolver`,
					)
					noteResolverSkipped(MODULE_PATH)
					return
				}
				pathHooked = true
				stopSweeps()
			}),
		)
	} catch (error) {
		reportError(
			`[ScreenshotRedactor] imported-path lookup for ${MODULE_PATH} failed:`,
			error,
		)
	}

	// Only when the path has not answered yet: a moved file, or a module not initialized yet. If
	// the path answers later, it stops these.
	if (!pathHooked) {
		for (const key of RESOLVERS) sweeps.push(sweepFor(key, seen, cleanups))
	}
	unsubscribes.push(stopSweeps)
	// Reaction rows call this distinct resolver with (guildId, channelId, user). A guild
	// nickname can bypass UserUtils entirely; the user is the subject, not either id argument.
	try {
		unsubscribes.push(
			getModuleWithImportedPath('utils/NicknameUtils.tsx', (mod: any) => {
				for (const host of resolverHosts(mod, 'getNickname')) {
					if (seen.has(host, 'getNickname')) continue
					patchOne(host, 'getNickname', 'NicknameUtils.getNickname', cleanups)
					seen.add(host, 'getNickname')
				}
			}),
		)
	} catch (error) {
		reportError('[ScreenshotRedactor] NicknameUtils discovery failed:', error)
	}

	return () => {
		getNameHooked = false
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
