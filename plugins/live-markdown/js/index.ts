import { setupChangelog } from '../../../shared/changelog'
import { reportError, setReporter } from '../../../shared/report'
import { CHANGELOG } from './changelog'
import { DEFAULTS, setSettings } from './native'
import Settings from './ui/Settings'
import type { LiveMarkdownStorage } from './native'

export default plugin<{ jsonStorage: LiveMarkdownStorage }>({
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

		// JS owns the settings; native is told on start and after every write. Kept from subscribe,
		// not read off `cache`: the settings page can write through another handle on the same
		// file, whose writes this handle's cache never sees. subscribe hands over each patch.
		let current: LiveMarkdownStorage = {
			...DEFAULTS,
			...(jsonStorage.cache ?? {}),
		}
		const push = (patch?: Partial<LiveMarkdownStorage>) => {
			if (patch) current = { ...current, ...patch }
			setSettings(current).catch(error =>
				reportError('[LiveMarkdown] setSettings failed:', error),
			)
		}
		push()
		cleanup(
			jsonStorage.subscribe(patch =>
				push(patch as Partial<LiveMarkdownStorage>),
			),
		)
	},
	SettingsComponent: Settings,
})
