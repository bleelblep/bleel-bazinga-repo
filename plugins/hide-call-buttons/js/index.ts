import { setupChangelog } from '../../../shared/changelog'
import { setReporter } from '../../../shared/report'
import { CHANGELOG } from './changelog'
import patchCallButtons from './patches/callButtons'
import { DEFAULTS } from './settings'
import Settings from './ui/pages/Settings'
import type { HideCallButtonsStorage } from './settings'

export { DEFAULTS }
export type { HideCallButtonsStorage }

export default plugin<{ jsonStorage: HideCallButtonsStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start({ cleanup, jsonStorage, plugin }) {
		// Errors go to Valenced's plugin error list (shared/report.ts), not the log.
		setReporter(plugin)
		cleanup(() => setReporter(undefined))

		// The changelog: clock icon on the settings page, "What's new" after an update.
		cleanup(setupChangelog({ plugin, jsonStorage }, CHANGELOG))

		// Every surface looks its module up as well as waiting for it, so this works the same
		// at boot and when the plugin is switched on later.
		patchCallButtons(cleanup, jsonStorage)
	},
	// Unpatching cannot put back everything a hook changed once Discord has rendered with it.
	stop({ plugin }) {
		plugin.requireReload()
	},
	SettingsComponent: Settings,
})
