import { DEFAULTS, type TimestampStorage } from "./lib/renderTimestamp"
import patchRowManager from "./patches/rowManager"
import Settings from "./ui/pages/Settings"
import { CHANGELOG } from "./changelog"
import { setupChangelog } from "../../../shared/changelog"
import { reportError, setReporter } from "../../../shared/report"

export default plugin<{ jsonStorage: TimestampStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
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

		const installTimer = setTimeout(() => {
			try {
				cleanup(patchRowManager(jsonStorage))
			} catch (error) {
				reportError("[CustomTimestamps] failed to patch RowManager:", error)
			}
		}, 0)
		cleanup(() => clearTimeout(installTimer))
	},
	// Unpatching cannot put back everything a hook changed once Discord has rendered with it.
	stop(api) {
		api.plugin.requireReload()
	},
	SettingsComponent: Settings,
})
