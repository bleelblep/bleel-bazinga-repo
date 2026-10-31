import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { setupChangelog } from '../../../shared/changelog'
import { reportError, setReporter } from '../../../shared/report'
import { CHANGELOG } from './changelog'
import { clearDiscordModules, setTagModule } from './lib/discord'
import { watchPermissionHelper } from './lib/permissions'
import { DEFAULTS, setStorage } from './lib/state'
import patchChat from './patches/chat'
import patchDetails from './patches/details'
import patchName from './patches/name'
import patchTag from './patches/tag'
import Settings from './ui/pages/Settings'
import { registerPages } from './ui/routes'
import type { TagModule } from './lib/discord'
import type { StaffTagsStorage } from './types'

export { DEFAULTS }
export type { StaffTagsStorage }

export default plugin<{ jsonStorage: StaffTagsStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start({ cleanup, jsonStorage, plugin }) {
		// Errors go to Valenced's plugin error list (shared/report.ts), not the log.
		setReporter(plugin)
		setStorage(jsonStorage)
		cleanup(() => {
			setReporter(undefined)
			setStorage(undefined)
			clearDiscordModules()
		})

		// The changelog: clock icon on the settings page, "What's new" after an update.
		cleanup(setupChangelog({ plugin, jsonStorage }, CHANGELOG), registerPages())

		// Every lookup below also waits for its module, so this works the same at boot and when the
		// plugin is switched on later, and a module that loads after the first chat render still
		// arrives. The callbacks run as bare engine jobs for an already-loaded module, so each is
		// guarded.
		cleanup(
			// Discord's tag component and `getBotLabel`: one lookup shared by every surface.
			getModules(withProps<TagModule>('getBotLabel'), module => {
				try {
					if (typeof module?.default !== 'function') return
					setTagModule(module)
					cleanup(patchTag(module))
				} catch (error) {
					reportError('[StaffTags] could not patch the tag component:', error)
				}
			}),
		)
		watchPermissionHelper(cleanup)

		patchChat(cleanup)
		patchName(cleanup)
		patchDetails(cleanup)
	},
	// Unpatching cannot put back everything a hook changed once Discord has rendered with it.
	stop({ plugin }) {
		plugin.requireReload()
	},
	SettingsComponent: Settings,
})
