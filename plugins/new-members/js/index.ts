import { setupChangelog } from '../../../shared/changelog'
import { CHANGELOG } from './changelog'
import patchChat from './patches/chat'
import { DEFAULTS, setStorage, type NewMembersStorage } from './state'
import Settings from './ui/Settings'
import { reportError, setReporter } from '../../../shared/report'

export default plugin<{ jsonStorage: NewMembersStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start(api) {
		// Errors go to Valenced's plugin error list (shared/report.ts), not the log.
		setReporter(api.plugin)
		api.cleanup(() => setReporter(undefined))

		// Before the late-start check, so the settings page works either way.
		api.cleanup(setStorage(api.jsonStorage))
		api.cleanup(setupChangelog(api, CHANGELOG))

		// Enabling a plugin mid-session leaves its hooks half-applied (see ghost-log-native-beta).
		if (api.plugin.startedLate) {
			api.plugin.requireReload()
			return
		}

		try {
			api.cleanup(patchChat())
		} catch (error) {
			reportError('[NewMembers] chat patch failed:', error)
		}
	},

	stop(api) {
		api.plugin.requireReload()
	},

	SettingsComponent: Settings,
})
