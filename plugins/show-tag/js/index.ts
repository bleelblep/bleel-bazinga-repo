import { setupChangelog } from '../../../shared/changelog'
import { CHANGELOG } from './changelog'
import patchRowManager from './patches/rowManager'
import Settings from './ui/pages/Settings'

export interface ShowTagStorage {
	onlyUsername: boolean
}

/** Also the fallback for every read: `load: true` starts the read without awaiting it. */
export const DEFAULTS: ShowTagStorage = { onlyUsername: false }

export default plugin<{ jsonStorage: ShowTagStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start(api) {
		// The changelog: clock icon on the settings page, "What's new" after an update.
		api.cleanup(setupChangelog(api, CHANGELOG))

		patchRowManager(api)
	},
	SettingsComponent: Settings,
})
