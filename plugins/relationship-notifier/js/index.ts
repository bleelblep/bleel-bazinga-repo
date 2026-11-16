/**
 * Relationship Notifier: tells you when you lose a friend, a friend request, a server or a group
 * DM, and when a friend changes their name.
 *
 * - lib/watch.ts keeps a list per account and compares Discord's stores against it after every
 *   connect and on every change, so changes while Discord was closed are caught too.
 * - lib/mine.ts notes what you remove or leave on this phone, so those are marked "by you".
 *
 * Read only towards Discord: it reads stores, watches three action creators without changing
 * them, and writes nothing but its own storage. No requests, no tokens (AS-01 to AS-05).
 */

import { setupChangelog } from '../../../shared/changelog'
import { reportError, setReporter } from '../../../shared/report'
import { CHANGELOG } from './changelog'
import { DEFAULTS } from './defaults'
import { watchMine } from './lib/mine'
import { setStorage } from './lib/state'
import { TAG } from './lib/tag'
import { watchRelationships } from './lib/watch'
import Settings from './ui/pages/Settings'
import { registerPages } from './ui/routes'
import type { RelationshipNotifierStorage } from './types'

export default plugin<{ jsonStorage: RelationshipNotifierStorage }>({
	jsonStorage: { load: true, default: DEFAULTS },
	start({ cleanup, jsonStorage, plugin }) {
		// Errors go to Valenced's plugin error list (shared/report.ts), not the log.
		setReporter(plugin)
		cleanup(() => setReporter(undefined))
		cleanup(setupChangelog({ plugin, jsonStorage }, CHANGELOG))

		setStorage(jsonStorage)
		cleanup(() => setStorage(undefined))

		try {
			cleanup(registerPages())
		} catch (error) {
			reportError(`${TAG} registering the settings pages failed:`, error)
		}

		try {
			cleanup(watchMine())
		} catch (error) {
			reportError(`${TAG} watching your own removals failed:`, error)
		}

		try {
			cleanup(watchRelationships(jsonStorage, !!(plugin as any).startedLate))
		} catch (error) {
			reportError(`${TAG} starting to watch failed:`, error)
		}
	},
	SettingsComponent: Settings,
})
