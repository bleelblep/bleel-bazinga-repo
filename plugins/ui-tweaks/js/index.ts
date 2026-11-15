import { setupChangelog } from '../../../shared/changelog'
import { CHANGELOG } from './changelog'
import { migrate } from './lib/migrate'
import { notify, setPlugin, setStorage } from './lib/state'
import { DEFAULTS, type UITweaksStorage } from './defaults'
import patchDoubleTap from './patches/doubleTap'
import patchGifPicker from './patches/gifPicker'
import patchMediaButtons from './patches/mediaButtons'
import patchMessageRequests from './patches/messageRequests'
import patchPickerTabs from './patches/pickerTabs'
import patchPlusMenu from './patches/plusMenu'
import patchQuests from './patches/quests'
import patchReactionBar from './patches/reactionBar'
import patchSettingsPage from './patches/settingsPage'
import patchSheetRows from './patches/sheetRows'
import patchSwipe from './patches/swipe'
import { registerPages } from './ui/routes'
import Settings from './ui/Settings'
import { reportError, setReporter } from '../../../shared/report'
import { isAndroid, stopUnlessAndroid } from '../../../shared/androidOnly'

const TAG = '[UITweaks]'

function attempt(cleanup: (fn: () => void) => void, what: string, install: () => () => void) {
	try {
		cleanup(install())
	} catch (error) {
		reportError(`${TAG} ${what} failed:`, error)
	}
}

export default plugin<{ jsonStorage: UITweaksStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},

	start(api) {
		// iOS: the native half never loads (shared/androidOnly.ts).
		if (stopUnlessAndroid(api.plugin, 'UI Tweaks')) return
		// Errors go to Valenced's plugin error list (shared/report.ts), not the log.
		setReporter(api.plugin)
		api.cleanup(() => setReporter(undefined))

		// Enabling a plugin mid-session leaves its hooks half-applied.
		if (api.plugin.startedLate) {
			api.plugin.requireReload()
			return
		}

		const { cleanup, jsonStorage } = api
		setStorage(jsonStorage)
		cleanup(() => setStorage(undefined))
		setPlugin(api.plugin)
		cleanup(() => setPlugin(undefined))

		attempt(cleanup, 'changelog', () => setupChangelog(api, CHANGELOG))
		attempt(cleanup, 'pages', registerPages)
		// After the storage has loaded: `load: true` starts the read without awaiting it.
		// notify(): eager readers (the picker tab order) re-sync with the loaded values.
		jsonStorage.get().then(
			() => {
				migrate()
				notify()
			},
			(error: unknown) => reportError(`${TAG} storage load failed:`, error),
		)

		// Not deferred: both must be in place before the chat screen and the picker first load
		// (the handlers instance is built once at mount; see each file). Both only wait on a module.
		attempt(cleanup, 'double tap', patchDoubleTap)
		attempt(cleanup, 'swipe actions', patchSwipe)
		attempt(cleanup, 'picker tabs', patchPickerTabs)
		attempt(cleanup, 'keep GIF picker open', patchGifPicker)

		// The chat surface patches are deferred one turn, the way staff-tags and ghost-log do:
		// Discord may still be completing Metro registration during this startup turn, and a
		// missing module must never take the host down.
		let cancelled = false
		const timer = setTimeout(() => {
			if (cancelled) return
			attempt(cleanup, 'sheet rows', patchSheetRows)
			attempt(cleanup, 'settings page', patchSettingsPage)
			attempt(cleanup, 'reaction bar', patchReactionBar)
			attempt(cleanup, 'message requests', patchMessageRequests)
			attempt(cleanup, 'quests', patchQuests)
			attempt(cleanup, '"+" menu', patchMediaButtons)
			attempt(cleanup, '"+" long-press menu', patchPlusMenu)
		}, 0)
		cleanup(() => {
			cancelled = true
			clearTimeout(timer)
		})
	},

	stop(api) {
		if (!isAndroid()) return
		api.plugin.requireReload()
	},

	SettingsComponent: Settings,
})
