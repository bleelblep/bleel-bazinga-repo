/**
 * Send Tweaks -- small fixes applied to a message just before it leaves.
 *
 * Three of the most requested plugins that had no Revenge Next port, bundled because they all
 * live at the same moment: link cleaning (the most wanted unported plugin by a wide margin), replies
 * that do not ping by default, and your own find-and-replace rules. One hook on sending instead of
 * three plugins fighting over it.
 *
 * Nothing here touches anything but the text of an outgoing message, and nothing ever runs on
 * text inside a code block. A message this plugin has nothing to say about is sent exactly as it
 * would have been without it.
 *
 * AI Core is an **optional** dependency: with it installed, the Ready-made screens can write a rule
 * from a description (`lib/aiRule.ts`). Without it, `api.ai` is undefined and nothing AI-related shows.
 */

import { setupChangelog } from '../../../shared/changelog'
import { reportError, setReporter } from '../../../shared/report'
import { CHANGELOG } from './changelog'
import { DEFAULTS } from './defaults'
import { refreshClearUrlsIfStale } from './lib/clearurls'
import { patchComposer } from './lib/composer'
import { setAi, setRequireReload, setStorage } from './lib/state'
import patchOutgoing from './patches/outgoing'
import patchReplyMention from './patches/replyMention'
import patchSendButton from './patches/sendButton'
import Settings from './ui/pages/Settings'
import { AI_ROUTE, registerPages } from './ui/routes'
import { safePage } from './ui/safePage'
import type { AiHandle, SendTweaksStorage } from './types'

export { DEFAULTS }
export type { SendTweaksStorage }

export default plugin<{ jsonStorage: SendTweaksStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},

	start(api) {
		const { cleanup, jsonStorage, plugin } = api

		// Errors go to Valenced's plugin error list (shared/report.ts), not the log.
		setReporter(plugin)
		cleanup(() => setReporter(undefined))

		setStorage(jsonStorage)
		setRequireReload(() => plugin.requireReload())
		cleanup(() => setRequireReload(undefined))

		// Attached by AI Core's `decorate` when it is installed; undefined otherwise. Plugins are
		// separate bundles, so its shape is declared here (`AiHandle` in types.ts), not imported.
		const { ai } = api as typeof api & { ai?: AiHandle }
		setAi(ai)
		// The one AI screen: where AI Core's settings and Plugin Hub's AI Hub send people.
		try {
			ai?.setSettingsRoute?.(AI_ROUTE)
		} catch (error) {
			reportError(
				'[SendTweaks] could not register a settings route with AI Core:',
				error,
			)
		}
		cleanup(() => setAi(undefined))

		// Applied independently -- one moved Discord module should cost one tweak, not all three.
		// A late start (switched on from the plugin list rather than at boot) needs nothing special:
		// every hook looks its module up as well as waiting for it, and `registerPages` refreshes
		// the settings screen once its routes exist.
		const apply = (name: string, patch: () => () => void) => {
			try {
				cleanup(patch())
			} catch (error) {
				reportError(`[SendTweaks] failed to apply ${name}:`, error)
			}
		}

		apply('settings pages', registerPages)
		apply('changelog', () => setupChangelog(api, CHANGELOG))
		apply('outgoing messages', patchOutgoing)
		apply('reply mentions', patchReplyMention)
		apply('live composer', patchComposer)
		apply('send button', patchSendButton)

		// The ClearURLs rules refresh themselves about weekly. Checked a little after start: storage is
		// read without being awaited (`load: true`), and until it lands the defaults say "never
		// downloaded", which would fetch on every launch.
		const refresh = setTimeout(() => {
			try {
				refreshClearUrlsIfStale()
			} catch (error) {
				reportError('[SendTweaks] ClearURLs refresh failed:', error)
			}
		}, 8000)
		cleanup(() => clearTimeout(refresh))
	},

	// Unpatching cannot put back a component Discord has already rendered with a hook in place.
	stop(api) {
		api.plugin.requireReload()
	},

	SettingsComponent: safePage(Settings, 'Settings'),
})
