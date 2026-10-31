import { init as initHidden } from "./lib/hidden"
import { initPrefs } from "./lib/prefs"
import { armDump, onDumpDone, probeDmNavigation, probeSortedGuildStore } from "./lib/probe"
import patchChannelList from "./patches/channelList"
import patchChannelSheet from "./patches/channelSheet"
import { patchCreateElement } from "./patches/createElementIntercept"
import patchGuildMenu from "./patches/guildMenu"
import patchEditMode from "./patches/editMode"
import patchGuildsBar from "./patches/guildsBar"
import patchSaveGuildFolders from "./patches/saveGuildFolders"
import patchSortedGuilds, { refresh } from "./patches/sortedGuilds"
import { registerPages } from "./ui/routes"
import Settings from "./ui/pages/Settings"
import { CHANGELOG } from "./changelog"
import { setupChangelog } from "../../../shared/changelog"
import { reportError, setReporter } from "../../../shared/report"

const DEBUG: boolean = false

export interface HideServersDrawerStorage {
	/**
	 * `true` for a hidden id; an explicit `false` is a tombstone marking a previously-hidden id
	 * as no longer hidden. `jsonStorage.set()` merges rather than replaces, so removing an id
	 * from this object entirely is silently a no-op -- an id that's merely absent from a write
	 * is indistinguishable from one nobody touched, and the stale `true` would keep coming back
	 * from storage. See the long comment on `persist()` in `lib/hidden.ts`.
	 */
	hidden?: Record<string, boolean>
	instant?: boolean
	staticIcons?: boolean
	/** The eye button in the server bar that opens edit mode; on when unset. */
	barButton?: boolean
	/**
	 * Dev-only crash-guard for the auto-probe: persisted before arming a stock-bar dump,
	 * cleared when the dump fires. If a launch finds this set, the armed stock render never
	 * completed -- the stock bar almost certainly took the app down -- so the probe is
	 * skipped that session instead of bootlooping.
	 */
	probeArmed?: boolean
	/**
	 * Show the most recent DM's avatar on the Home button instead of a static icon.
	 *
	 * This plugin originally did that unconditionally, on the belief that it was mimicking
	 * stock. It isn't what stock does here, so it is now off by default and opt-in.
	 */
	dmAvatarHome?: boolean
}

export default plugin<{ jsonStorage: HideServersDrawerStorage }>({
	jsonStorage: {
		load: true,
		default: {},
	},
	start({ cleanup, jsonStorage, plugin }) {
		// Errors go to Valenced's plugin error list (shared/report.ts), not the log.
		setReporter(plugin)
		cleanup(() => setReporter(undefined))

		// Enabling a plugin mid-session leaves its hooks half-applied -- Discord modules it patches
		// may already be initialized and its settings routes are registered too late for the
		// settings screen. Ask for a reload instead of running in a state we cannot verify.
		if (plugin.startedLate) {
			plugin.requireReload()
			return
		}

		// The changelog: clock icon on the settings page, "What's new" after an update.
		cleanup(setupChangelog({ plugin, jsonStorage }, CHANGELOG))

		initHidden(jsonStorage)
		initPrefs(jsonStorage)

		const apply = (name: string, patch: () => () => void) => {
			try {
				cleanup(patch())
			} catch (error) {
				reportError(`[HideServersDrawer] failed to apply ${name}:`, error)
			}
		}

		// Order doesn't matter for correctness (registerIntercept just writes to a map that
		// the patched React.createElement reads lazily), but enabling the intercept mechanism
		// before anything registers against it keeps the sequence readable.
		try {
			const patches: Array<() => void> = []
			patchCreateElement(patches)
			patches.forEach(unpatch => cleanup(unpatch))
		} catch (error) {
			reportError("[HideServersDrawer] failed to apply createElement intercept:", error)
		}

		// The Servers/Legacy/Debug settings sub-screens are their own navigator routes,
		// leaving the root page as a short index -- same split as screenshot-redactor-dev.
		try {
			cleanup(registerPages())
		} catch (error) {
			reportError("[HideServersDrawer] failed to register settings pages:", error)
		}

		// Two layers: the store filter keeps derived data consistent (and is what hides
		// servers in the untouched stock bar), and the guildsBar patch swaps in the legacy
		// non-virtualized bar when the user has opted into it. The store filter only ever
		// wraps RENDER-path getters -- the two getters Discord's order-persist path reads
		// are deliberately left unpatched (see the TARGETS comment in sortedGuilds.ts) --
		// and the saveGuildFolders guard is the checkgate that keeps it that way even if a
		// future Discord build reroutes a persist caller through a filtered getter.
		const installTimer = setTimeout(() => {
			apply("sortedGuilds", patchSortedGuilds)
			apply("saveGuildFolders", patchSaveGuildFolders)
			apply("guildsBar", patchGuildsBar)
			apply("editMode", patchEditMode)
			apply("channelList", patchChannelList)
			apply("channelSheet", patchChannelSheet)
			apply("guildMenu", () => patchGuildMenu(() => plugin.requireReload()))
			refresh()
		}, 0)
		cleanup(() => clearTimeout(installTimer))

		if (DEBUG) {
			// Dev auto-probe: a few seconds after start, dump the navigation actions and the
			// store's method list, then arm a one-shot stock-bar render + tree dump -- so a
			// device round needs no settings navigation at all. Crash-guard: `probeArmed` is
			// persisted before arming and cleared by onDumpDone when the dump fires; a launch
			// that finds it set means the armed stock render never completed (it took the app
			// down), so the probe skips itself instead of bootlooping.
			onDumpDone(() => {
				try {
					jsonStorage.set?.({ probeArmed: false })
				} catch {
					/* ignore */
				}
			})

			const autoProbe = setTimeout(() => {
				;(async () => {
					try {
						const state = (await jsonStorage.get?.()) as HideServersDrawerStorage | undefined
						if (state?.probeArmed) {
							if (DEBUG) console.log(
								"[HideServersDrawer] auto-probe SKIPPED: crash-guard tripped -- the armed stock render never finished, so the stock bar likely crashed. Clearing the guard; unhide everything before probing again.",
							)
							await jsonStorage.set?.({ probeArmed: false })
							return
						}

						if (DEBUG) console.log("[HideServersDrawer] auto-probe begin")
						probeDmNavigation()
						probeSortedGuildStore()
						await jsonStorage.set?.({ probeArmed: true })
						armDump()
						refresh()
						if (DEBUG) console.log("[HideServersDrawer] auto-probe armed -- stock bar dumps on next render")
					} catch (error) {
						reportError("[HideServersDrawer] auto-probe failed:", error)
					}
				})()
			}, 6000)
			cleanup(() => clearTimeout(autoProbe))
		}

		cleanup(() => refresh())
	},
	// Unpatching cannot put back everything a hook changed once Discord has rendered with it.
	stop(api) {
		api.plugin.requireReload()
	},
	SettingsComponent: Settings,
})
