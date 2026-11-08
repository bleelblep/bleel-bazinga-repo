import { setupChangelog } from '../../../shared/changelog'
import { setReporter } from '../../../shared/report'
import { CHANGELOG } from './changelog'
import { DEFAULTS } from './defaults'
import { stop, tryInitialize } from './lib/manager'
import { watchAssetManager } from './lib/modules'
import { getSettings, setStorage } from './lib/state'
import { applySidebarSettings, registerPages } from './ui/pages/routes'
import Settings from './ui/pages/Settings'
import type { MultiScrobblerStorage } from './types'

export { DEFAULTS }
export type { MultiScrobblerStorage }

export default plugin<{ jsonStorage: MultiScrobblerStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start({ cleanup, jsonStorage, plugin }) {
		setReporter(plugin)
		cleanup(() => setReporter(undefined))
		setStorage(jsonStorage)

		// The changelog: clock icon on the settings page, "What's new" after an update.
		cleanup(setupChangelog({ plugin, jsonStorage }, CHANGELOG))

		// Initialize settings from shared storage
		getSettings()

		// Register settings pages (routes)
		const unregisterPages = registerPages()
		cleanup(unregisterPages)

		try {
			cleanup(applySidebarSettings())
		} catch {}

		// Discord's album-art helper loads late; catch it so covers don't need the fallback.
		cleanup(watchAssetManager())

		try {
			cleanup(() => stop())
			void tryInitialize()
		} catch {}
	},
	SettingsComponent: Settings,
})
