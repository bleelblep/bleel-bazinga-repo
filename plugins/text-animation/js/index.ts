import { DEFAULTS, type NativeState, type TextAnimationStorage, callNative } from './native'
import Settings from './ui/Settings'
import { setCursorSupported, setStorage } from './ui/state'
import { CHANGELOG } from './changelog'
import { setupChangelog } from '../../../shared/changelog'
import { reportError, setReporter } from '../../../shared/report'

export default plugin<{ jsonStorage: TextAnimationStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start({ jsonStorage, cleanup, plugin }) {
		// Errors go to Valenced's plugin error list (shared/report.ts), not the log.
		setReporter(plugin)
		cleanup(() => setReporter(undefined))

		// The changelog: clock icon on the settings page, "What's new" after an update.
		cleanup(setupChangelog({ plugin, jsonStorage }, CHANGELOG))
		setStorage(jsonStorage)
		// Native owns the values (it draws before JS is up); bring the mirror in line.
		callNative('getSettings')
			.then((state: NativeState) => {
				if (!state || typeof state.duration !== 'number') return
				const { cursorSupported, ...stored } = state
				setCursorSupported(cursorSupported)
				jsonStorage.set({ ...stored })
			})
			.catch(error => reportError('[TextAnimation] getSettings failed:', error))
	},
	stop() {
		callNative('setPreview', [false]).catch(() => {})
	},
	SettingsComponent: Settings,
})
