import { setupChangelog } from '../../../shared/changelog'
import { CHANGELOG } from './changelog'
import patchRowManager from './patches/rowManager'
import Settings from './ui/pages/Settings'

export interface ShowTagStorage {
	onlyUsername: boolean
	/** Show the username small and dim after the name, in the row's tag slot, instead of in brackets. */
	smallTag?: boolean
	/**
	 * With [smallTag]: mark the tag so the native half (Android) draws it on its own line under the
	 * name. On iOS it stays next to the name.
	 */
	below?: boolean
}

/** Also the fallback for every read: `load: true` starts the read without awaiting it. */
export const DEFAULTS: ShowTagStorage = {
	onlyUsername: false,
	smallTag: false,
	below: false,
}

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
