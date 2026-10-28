import { setupChangelog } from '../../../shared/changelog'
import { CHANGELOG } from './changelog'
import { watchChannelMessages } from './lib/redraw'
import { startEquicord, stopEquicord } from './lib/equicord'
import { startShared, stopShared } from './lib/shared'
import { DEFAULTS, setStorage, type TimezonesStorage } from './lib/state'
import patchChat from './patches/chat'
import patchMessageSheet from './patches/messageSheet'
import Settings from './ui/Settings'
import { reportError, setReporter } from '../../../shared/report'

const TAG = '[Timezones]'

function attempt(cleanup: (fn: () => void) => void, what: string, install: () => () => void) {
	try {
		cleanup(install())
	} catch (error) {
		reportError(`${TAG} ${what} failed:`, error)
	}
}

export default plugin<{ jsonStorage: TimezonesStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},

	start(api) {
		// Errors go to Valenced's plugin error list (shared/report.ts), not the log.
		setReporter(api.plugin)
		api.cleanup(() => setReporter(undefined))

		// Enabling a plugin mid-session leaves its hooks half-applied (see ghost-log-native-beta).
		if (api.plugin.startedLate) {
			api.plugin.requireReload()
			return
		}

		const { cleanup, jsonStorage } = api
		setStorage(jsonStorage)
		cleanup(() => setStorage(undefined))
		startShared()
		cleanup(stopShared)
		startEquicord()
		cleanup(stopEquicord)

		attempt(cleanup, 'changelog', () => setupChangelog(api, CHANGELOG))
		attempt(cleanup, 'message cache', watchChannelMessages)
		attempt(cleanup, 'chat timestamp', patchChat)
		attempt(cleanup, 'message sheet', patchMessageSheet)
	},

	stop(api) {
		stopShared()
		stopEquicord()
		api.plugin.requireReload()
	},

	SettingsComponent: Settings,
})
