import * as finders from '@valenced/modules/finders'
import * as filters from '@valenced/modules/finders/filters'
import { before } from '@valenced/patcher'
import * as ReactNative from 'react-native'
import { reportError } from '../../../../shared/report'
import {
	applyBatch,
	isReplaying,
	noteCleared,
	setChatBridge,
} from '../lib/chatRows'
import { count, noteChatManagerPatch } from '../lib/diagnostics'
import { redactRows } from '../lib/rowSchema'
import { isEnabled, redactOptions } from '../lib/state'

const DEBUG: boolean = false

/**
 * Redaction at the JS/native boundary.
 *
 * `DCDChatManager.updateRows(tag, rowsJSON, isLoadingAtTop)` is the single point every message
 * that reaches the screen passes through — `com/discord/chat/ChatModule.java` exposes only it and
 * `clearRows`, and both are `@ReactMethod`s on the plain native module object. Redacting here
 * rather than at `RowManager.prototype.generate` has four consequences worth stating:
 *
 * 1. **It repaints.** The rows can be mirrored and pushed back (see `lib/chatRows.ts`), which is
 *    what makes the toggle take effect without switching channels.
 * 2. **It catches rows generated before we were listening.** A `generate` hook can only ever see
 *    rows made after it was installed.
 * 3. **It is downstream of every other plugin.** Show Tag appends the real `@handle` at
 *    `generate`; whatever it appends is still in this JSON, and gets overwritten here. That
 *    settles README open question 4 — the `HookPriority` guess on the `generate` hook no longer
 *    decides anything.
 * 4. **It is not `generate`.** No contention with custom-timestamps' `instead`, and no exposure
 *    to the two-`instead` recursion bug (coding rule 2), because nothing else in this repo
 *    patches a native module.
 *
 * `before`, not `instead`: the work is a rewrite of `args[1]` in place, and this plugin has never
 * used `instead`.
 */
/**
 * Finding the native module, which is NOT reliably there when `start()` runs.
 *
 * 0.18.0 looked it up once at start and logged `DCDChatManager.updateRows not found` on every
 * launch: `valenced.react.ReactNative` is an ESM live binding that can still be undefined that
 * early (coding rule 1 — the same trap as `getAssetIdByName` at module scope, one lifecycle
 * stage later). `lib/reload.ts` in hide-servers-drawer gets away with the identical access only
 * because it runs from a button press, long after start.
 *
 * So resolution is lazy and retried, and two RN-level fallbacks are tried before giving up:
 * `nativeModuleProxy` is the global RN exposes for exactly this, and works when the `ReactNative`
 * binding hasn't been filled in yet.
 */
function findChatManager(): any {
	const candidates = [
		() => (ReactNative as any)?.NativeModules?.DCDChatManager,
		() => (globalThis as any)?.nativeModuleProxy?.DCDChatManager,
		() => (globalThis as any)?.__turboModuleProxy?.('DCDChatManager'),
		// Newer builds expose the chat module through the codegen TurboModule registry
		// (`rtn-codegen/js/NativeChatModule.tsx`) rather than `NativeModules`. `get`
		// returns null for a missing module; `getEnforcing` throws -- both are handled.
		() => (ReactNative as any)?.TurboModuleRegistry?.get?.('DCDChatManager'),
		() =>
			(ReactNative as any)?.TurboModuleRegistry?.getEnforcing?.(
				'DCDChatManager',
			),
	]

	for (const get of candidates) {
		try {
			const manager = get()
			if (typeof manager?.updateRows === 'function') return manager
		} catch {
			/* try the next route */
		}
	}

	return undefined
}

/**
 * Metro is the route that actually works, and the direct ones above are only kept as a fast path.
 *
 * 0.18.1 retried `valenced.react.ReactNative.NativeModules` on every generated row and never once
 * resolved — the log said `DCDChatManager not ready at start` and then never said `hooked`. So it
 * is not a timing problem after all: that binding does not give a usable `NativeModules` here,
 * and neither RN global is present either.
 *
 * Discord's own call site is a plain `NativeModules.DCDChatManager` (see `customKeyboardWillHide`,
 * function 90472), so the object exists as an ordinary Metro module — which means the finder API
 * can hand it over, and is the documented way to wait for a module that may not be initialized
 * yet (coding rule 3). `getModules`, not `lookupModule`: a miss would be cached permanently.
 */
function subscribeForChatManager(): () => void {
	try {
		const { getModules } = finders
		const { withProps } = filters

		return getModules(
			withProps('DCDChatManager'),
			(mod: any) => {
				if (installed) return
				const manager = mod?.DCDChatManager
				if (typeof manager?.updateRows !== 'function') return

				installed = true
				install(manager)
			},
			{ max: 5 },
		)
	} catch (error) {
		reportError(
			'[ScreenshotRedactor] could not subscribe for DCDChatManager:',
			error,
		)
		return () => {}
	}
}

const cleanups: Array<() => void> = []
let installed = false

/**
 * The Fabric chat commands, which is where the row list actually lives on Discord 347+.
 *
 * `DCDChatManager` is not merely late here, it is gone: on 347.4 it reads as `null` through
 * `NativeModules`, `nativeModuleProxy` and `TurboModuleRegistry` alike, and `RN$Bridgeless` is
 * true. The list became a Fabric component, so what used to be a native module method is now a
 * codegen command taking the component's host instance:
 *
 *     updateRows(hostRef, { rows, isLoadingAtTop, scrollData, HACK_iOSForceAnimations,
 *                           forceReload, isAnimated })
 *     clearRows(hostRef)
 *
 * Two differences that matter. `rows` is a plain array, not a JSON string -- so the parse/
 * stringify either side of the old hook is not just unnecessary but wrong. And the list is
 * identified by `hostRef.__nativeTag` rather than a numeric tag argument, so the ref has to be
 * remembered per tag to push anything back.
 *
 * Confirmed on device by hooking it and reading one batch: 21 rows of the same
 * `{ type, message, changeType, index }` shape the old bridge carried, which is why
 * `lib/rowSchema.ts` needs no change at all.
 */
function asChatCommands(exports: any): any {
	// Valenced hands back the default export where there is one; older shapes put the commands
	// directly on the module.
	const commands = exports?.default ?? exports
	if (
		typeof commands?.updateRows !== 'function' ||
		typeof commands?.clearRows !== 'function'
	) {
		return undefined
	}

	// The legacy native module carries both names too. Arity tells them apart without calling
	// either: the Fabric command takes (ref, options), the old ReactMethod took
	// (tag, json, isLoadingAtTop).
	if (commands.clearRows.length !== 1) return undefined

	return commands
}

/**
 * Sweep what is already initialized, then wait for the rest.
 *
 * Deliberately NOT `lookupModule`: a miss is cached permanently, and at `start()` the chat
 * commands module is reliably not initialized yet -- one early lookup would poison it for the
 * session. This is the same sweep-then-subscribe shape `patches/avatar.ts` and
 * `patches/displayName.ts` already use, for the same reason (coding rule 3).
 */
function subscribeForChatCommands(): () => void {
	try {
		const { lookupModules, waitForModules } = finders
		const { withProps } = filters

		const accept = (exports: any) => {
			if (installed) return
			const commands = asChatCommands(exports)
			if (!commands) return
			installed = true
			installFabric(commands)
		}

		for (const [exports] of lookupModules(withProps('updateRows')))
			accept(exports)
		if (installed) return () => {}

		return waitForModules(withProps('updateRows'), accept)
	} catch (error) {
		reportError(
			'[ScreenshotRedactor] could not subscribe for Fabric chat commands:',
			error,
		)
		return () => {}
	}
}

/** The host ref and last options seen per list, so a repaint can address the right component. */
const hosts = new Map<number, { ref: any; options: any }>()

/**
 * Same limit as the row mirror (lib/chatRows.ts keeps 8 lists): through 0.27.15 this map kept a
 * ref to every chat list ever mounted for the whole session. Re-setting moves a list to the end, so
 * the oldest-touched one goes first.
 */
const HOST_LIMIT = 8

function rememberHost(tag: number, host: { ref: any; options: any }) {
	hosts.delete(tag)
	hosts.set(tag, host)
	while (hosts.size > HOST_LIMIT) {
		const oldest = hosts.keys().next().value
		if (oldest === undefined) break
		hosts.delete(oldest)
	}
}

function tagOf(ref: any): number | undefined {
	const tag = ref?.__nativeTag
	return typeof tag === 'number' ? tag : undefined
}

function installFabric(commands: any) {
	cleanups.push(
		before(commands, 'updateRows', (args: any[]) => {
			try {
				if (!isReplaying()) {
					const ref = args?.[0]
					const options = args?.[1]
					const tag = tagOf(ref)
					const rows = options?.rows

					if (tag !== undefined && Array.isArray(rows)) {
						rememberHost(tag, { ref, options })
						count('batchesSeen')

						// The rows here are live objects Discord still holds, unlike the old
						// bridge where `JSON.parse` already handed us a private copy. Both the
						// mirror and the redaction pass therefore have to work on clones, or we
						// would be rewriting the client's own state rather than the frame.
						// forceReload invalidates native views; it does not make a delta a full sync.
						applyBatch(tag, JSON.parse(JSON.stringify(rows)))

						if (isEnabled()) {
							const outgoing = JSON.parse(JSON.stringify(rows))
							const redacted = redactRows(outgoing, redactOptions())

							if (redacted > 0) count('rowsRedacted')
							args[1] = { ...options, rows: outgoing }
						}
					}
				}
			} catch (error) {
				// Same rule as the legacy hook: a failure here leaks a name, it never takes the
				// chat down. The untouched rows go through.
				reportError(
					'[ScreenshotRedactor] Fabric updateRows hook failed:',
					error,
				)
			}

			return args
		}),
	)

	cleanups.push(
		before(commands, 'clearRows', (args: any[]) => {
			try {
				const tag = tagOf(args?.[0])
				if (!isReplaying() && tag !== undefined) noteCleared(tag)
			} catch (error) {
				reportError('[ScreenshotRedactor] Fabric clearRows hook failed:', error)
			}

			return args
		}),
	)

	setChatBridge({
		clear(tag: number) {
			const host = hosts.get(tag)
			if (host) commands.clearRows(host.ref)
		},
		push(tag: number, rows: any[]) {
			const host = hosts.get(tag)
			if (!host) return false
			// Reuse the last options object seen for this list rather than hand-building one: it
			// came from a real call, so every field native expects is present and valid. Only the
			// rows and the reload flag are ours.
			commands.updateRows(host.ref, {
				...host.options,
				rows,
				forceReload: true,
				isAnimated: false,
			})
		},
	})

	cleanups.push(() => {
		hosts.clear()
		setChatBridge(undefined)
	})

	if (DEBUG) console.log('[ScreenshotRedactor] Fabric chat commands hooked')
	noteChatManagerPatch('patched (fabric)')
}

/**
 * Installs the hooks if they aren't already and the module can be found.
 *
 * Called from `start()` and again from the `generate` hook, which only fires once chat is
 * actually rendering — by which point React Native is unambiguously up. Cheap enough to call per
 * row: one boolean read on the hot path.
 */
/**
 * The per-row retry is throttled. On Fabric builds (347+) the legacy module is never there, so
 * without this every generated chat row ran five lookups, one of which throws, for the whole
 * session. The Metro subscription is what finds Fabric; this only covers the legacy module turning
 * up late, which a two-second spacing still catches.
 */
const RETRY_MS = 2000
let lastTry = 0

export function ensureChatManagerPatched(): boolean {
	if (installed) return true
	const now = Date.now()
	if (now - lastTry < RETRY_MS) return false
	lastTry = now

	// Legacy first: it is a plain property read, so on the builds that still have it there is no
	// reason to pay for a Metro lookup. On 347+ it misses instantly and we fall through.
	const manager = findChatManager()
	if (manager) {
		installed = true
		install(manager)
		return true
	}

	// No Fabric attempt here: this runs from the `generate` hook, i.e. once per row, and the
	// Fabric lookup is a Metro sweep. That path is driven by the subscription below instead.
	return false
}

export default function patchChatManager(): () => void {
	let unsubscribe: (() => void) | undefined

	if (!ensureChatManagerPatched()) {
		if (DEBUG)
			console.log(
				'[ScreenshotRedactor] no chat bridge yet (legacy module absent, Fabric commands not initialized); asking Metro for it',
			)
		noteChatManagerPatch('waiting on Metro')

		const unsubLegacy = subscribeForChatManager()
		const unsubFabric = subscribeForChatCommands()
		unsubscribe = () => {
			try {
				unsubLegacy()
			} catch {
				/* already gone */
			}
			try {
				unsubFabric()
			} catch {
				/* already gone */
			}
		}
	}

	return () => {
		installed = false
		lastTry = 0
		try {
			unsubscribe?.()
		} catch {
			/* already gone */
		}
		cleanups.forEach(unpatch => {
			try {
				unpatch()
			} catch {
				/* already gone */
			}
		})
		cleanups.length = 0
	}
}

function install(manager: any) {
	cleanups.push(
		before(manager, 'updateRows', (args: any[]) => {
			try {
				if (!isReplaying()) {
					const tag = args?.[0]
					const json = args?.[1]

					if (typeof tag === 'number' && typeof json === 'string') {
						const rows = JSON.parse(json)

						if (Array.isArray(rows)) {
							count('batchesSeen')

							// The mirror always takes the *unredacted* rows, whether or not
							// redaction is on right now — it is the "what this really says"
							// copy, and toggling off has to be able to restore from it.
							applyBatch(tag, rows)

							if (isEnabled()) {
								// A second parse rather than a clone of `rows`: the mirror keeps
								// the originals and this copy gets rewritten. Only paid while
								// redaction is armed.
								const outgoing = JSON.parse(json)
								const redacted = redactRows(outgoing, redactOptions())

								if (redacted > 0) count('rowsRedacted')
								args[1] = JSON.stringify(outgoing)
							}
						}
					}
				}
			} catch (error) {
				// Never let this take the chat down: on any failure the original JSON goes
				// through untouched, which is a leak rather than a broken client.
				reportError('[ScreenshotRedactor] updateRows hook failed:', error)
			}

			// A before-hook must return the args array, and outside the try so it survives a
			// throw above. See docs/coding-rules.md rule 2.
			return args
		}),
	)

	if (typeof manager.clearRows === 'function') {
		cleanups.push(
			before(manager, 'clearRows', (args: any[]) => {
				try {
					// Native sets `rows = null` here, so the next batch will be a full sync. The
					// mirror has to follow or it will start splicing into a stale list.
					if (!isReplaying() && typeof args?.[0] === 'number')
						noteCleared(args[0])
				} catch (error) {
					reportError('[ScreenshotRedactor] clearRows hook failed:', error)
				}

				return args
			}),
		)
	}

	setChatBridge({
		clear(tag: number) {
			manager.clearRows(tag)
		},
		push(tag: number, rows: any[]) {
			manager.updateRows(tag, JSON.stringify(rows), false)
		},
	})
	cleanups.push(() => setChatBridge(undefined))

	if (DEBUG) console.log('[ScreenshotRedactor] DCDChatManager hooked')
	noteChatManagerPatch('patched (legacy)')
}
