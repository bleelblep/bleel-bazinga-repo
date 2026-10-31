import { setupChangelog } from '../../../shared/changelog'
import { setReporter } from '../../../shared/report'
import { CHANGELOG } from './changelog'
import { watchDiscord } from './lib/discord'
import { stop as stopPronounDB } from './lib/pronounDB'
import { watchChannelMessages } from './lib/redraw'
import { DEFAULTS, setStorage } from './lib/state'
import patchChat from './patches/chat'
import patchMessageSheet from './patches/messageSheet'
import Settings from './ui/pages/Settings'
import { registerPages } from './ui/routes'
import type { PronounsStorage } from './lib/state'

export default plugin<{ jsonStorage: PronounsStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},

	start(api) {
		const { cleanup, jsonStorage } = api

		// Errors go to Valenced's plugin error list (shared/report.ts), not the log.
		setReporter(api.plugin)
		cleanup(() => setReporter(undefined))

		setStorage(jsonStorage)
		cleanup(() => setStorage(undefined))

		// A late start (switched on from the plugin list) needs nothing special: every lookup
		// below answers at once for a module that is already loaded and waits otherwise.
		cleanup(
			registerPages(),
			setupChangelog(api, CHANGELOG),
			watchDiscord(),
			watchChannelMessages(),
		)
		patchChat(cleanup)
		patchMessageSheet(cleanup)
	},

	// Rows already drawn keep their badge; unpatching can't redraw them.
	stop(api) {
		stopPronounDB()
		api.plugin.requireReload()
	},

	SettingsComponent: Settings,
})
