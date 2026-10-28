/*
 * ReviewDB: a Valenced port of Vencord's reviewDB plugin (src/plugins/reviewDB).
 * Copyright (c) 2023 Vendicated and contributors. GPL-3.0-or-later; see ../NOTICE.md.
 *
 * - patches/profileCard.tsx: the "User Reviews" card on profiles
 * - patches/guildSheet.tsx: "Server Reviews" in the server long-press sheet
 * - ui/routes.tsx + ui/ReviewsScreen.tsx: the list (a settings-stack page), voting, report / block / delete, the composer, paging
 * - lib/startup.tsx: new-review toast and ReviewDB notices, a few seconds after launch
 */

import { TAG } from './lib/discord'
import { refreshUser } from './lib/startup'
import { DEFAULTS, type ReviewDBStorage, setStorage } from './lib/state'
import patchGuildSheet from './patches/guildSheet'
import patchProfileCard from './patches/profileCard'
import Settings from './ui/pages/Settings'
import { registerPages } from './ui/routes'
import { CHANGELOG } from './changelog'
import { setupChangelog } from '../../../shared/changelog'
import { reportError, setReporter } from '../../../shared/report'

export default plugin<{ jsonStorage: ReviewDBStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start({ cleanup, jsonStorage, plugin }) {
		// Errors go to Valenced's plugin error list (shared/report.ts), not the log.
		setReporter(plugin)
		cleanup(() => setReporter(undefined))

		// Before the late-start check, so the settings page saves either way. After it, a plugin
		// turned on mid-session showed settings that reverted on reload.
		setStorage(jsonStorage)
		cleanup(() => setStorage(undefined))

		// Hooks on modules Discord already rendered with can't be verified mid-session.
		if (plugin.startedLate) {
			plugin.requireReload()
			return
		}

		// The changelog: clock icon on the settings page, "What's new" after an update.
		cleanup(setupChangelog({ plugin, jsonStorage }, CHANGELOG))

		for (const [name, install] of [
			['profile card', patchProfileCard],
			['server sheet', patchGuildSheet],
			['review pages', registerPages],
		] as const) {
			try {
				cleanup(install())
			} catch (error) {
				reportError(`${TAG} failed to install the ${name}:`, error)
			}
		}

		// Desktop waits 4 seconds after start too: the current user has to be known, and the
		// notice dialog shouldn't land on the splash screen.
		const timer = setTimeout(() => {
			refreshUser({ notify: true }).catch(error => reportError(`${TAG} startup refresh failed:`, error))
		}, 4000)
		cleanup(() => clearTimeout(timer))
	},
	stop(api) {
		api.plugin.requireReload()
	},
	SettingsComponent: Settings,
})
