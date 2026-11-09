import * as native from '@valenced/modules/native'
import { setupChangelog } from '../../../shared/changelog'
import { setReporter } from '../../../shared/report'
import { CHANGELOG } from './changelog'
import { DEFAULTS } from './defaults'
import { checkNow, stop, tryInitialize } from './lib/manager'
import { watchAssetManager } from './lib/modules'
import { getSettings, setStorage } from './lib/state'
import { applySidebarSettings, registerPages } from './ui/pages/routes'
import Settings from './ui/pages/Settings'
import type { MultiScrobblerStorage } from './types'

export { DEFAULTS }

// Music Bridge's native half calls this on each song change (src/main). There's no way to
// unregister a JS method, so it's registered once and only acts while the plugin runs.
let running = false
let wakeRegistered = false

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

		running = true
		cleanup(() => {
			running = false
		})
		if (!wakeRegistered) {
			try {
				;(native as any).registerJSMethod(
					'bleelblep.multi-scrobbler.bridge.changed',
					() => {
						if (running) checkNow()
						return null
					},
				)
				wakeRegistered = true
			} catch {
				// Then "This phone" only updates on the check timer, as before 1.3.12.
			}
		}

		try {
			cleanup(() => stop())
			void tryInitialize()
		} catch {}
	},
	SettingsComponent: Settings,
})
