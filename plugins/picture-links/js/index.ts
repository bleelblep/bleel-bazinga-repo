/*
 * Picture Links: a Revenge Next port of redstonekasi's Picture Links (BSD-3-Clause), as updated
 * by Rico040 (CC0-1.0). See ../NOTICE.md.
 *
 * - patches/viewerOptions.ts: Discord's own avatar viewer, at full size with save and share on
 * - patches/avatar.ts: long-press a server avatar for the main one
 * - patches/banner.tsx: tap a banner to view it (long-press for animated banners)
 */

import { setupChangelog } from '../../../shared/changelog'
import { CHANGELOG } from './changelog'
import { TAG } from './lib/media'
import patchAvatar from './patches/avatar'
import patchBanner from './patches/banner'
import patchViewerOptions from './patches/viewerOptions'
import Settings from './ui/Settings'
import { reportError, setReporter } from '../../../shared/report'

export default plugin({
	// Only for the changelog's last-seen version (shared/changelog.tsx).
	jsonStorage: { load: true, default: {} },
	start({ cleanup, jsonStorage, plugin }) {
		// Errors go to Valenced's plugin error list (shared/report.ts), not the log.
		setReporter(plugin)
		cleanup(() => setReporter(undefined))

		cleanup(setupChangelog({ plugin, jsonStorage }, CHANGELOG))
		if (plugin.startedLate) {
			plugin.requireReload()
			return
		}
		for (const [name, install] of [
			['viewer options', patchViewerOptions],
			['avatar', patchAvatar],
			['banner', patchBanner],
		] as const) {
			try {
				cleanup(install())
			} catch (error) {
				reportError(`${TAG} failed to install the ${name}:`, error)
			}
		}
	},
	stop(api) {
		api.plugin.requireReload()
	},
	SettingsComponent: Settings,
})
