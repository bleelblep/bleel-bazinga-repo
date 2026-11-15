/**
 * Sharp Corners: the opposite of Round Corners. Every corner sharp.
 *
 * Most of it is native (src/main/kotlin/.../Corners.kt): one React Native hook removes the corner
 * from every view and picture Discord's JS draws, and Android shape hooks cover the native chat.
 * JS sends the switches there and zeroes Discord's corner tokens for the few shapes drawn without a
 * view (Skia, SVG). Views read their corners when they're built, so a change asks for a reload.
 */

import { setupChangelog } from '../../../shared/changelog'
import { reportError, setReporter } from '../../../shared/report'
import { CHANGELOG } from './changelog'
import { sendOptions } from './lib/native'
import { DEFAULTS, setStorage, settings, type CirclesStorage } from './lib/settings'
import { squareCheckbox } from './lib/checkbox'
import { squareEmojiRow } from './lib/emojiRow'
import { squareStatus } from './lib/status'
import { squareStatusBubble } from './lib/statusBubble'
import { sharpenTokens } from './lib/tokens'
import Settings from './ui/Settings'
import { isAndroid, stopUnlessAndroid } from '../../../shared/androidOnly'

const TAG = '[Sharp Corners]'

export default plugin<{ jsonStorage: CirclesStorage }>({
	jsonStorage: { load: true, default: DEFAULTS },

	start(api) {
		// iOS: the native half never loads (shared/androidOnly.ts).
		if (stopUnlessAndroid(api.plugin, 'Sharp Corners')) return
		setReporter(api.plugin)
		api.cleanup(() => setReporter(undefined))
		// Tells Round Corners' settings this is on: the two undo each other.
		;(globalThis as any).__bleelblepSharp = true
		api.cleanup(() => {
			delete (globalThis as any).__bleelblepSharp
		})
		setStorage(api.jsonStorage)
		api.cleanup(() => setStorage(undefined))
		// The native half starts with its own saved copy of the switches. Sent again a moment later,
		// and retried while the bridge isn't answering, because a single early send could be lost and
		// leave "Circles too" on natively while it showed off here (0.1.18 on the phone, 2026-11-10).
		const push = (retries: number) => {
			void sendOptions(settings()).then(ok => {
				if (!ok && retries > 0) later(() => push(retries - 1), 1000)
			})
		}
		const timers: ReturnType<typeof setTimeout>[] = []
		const later = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms))
		api.cleanup(() => {
			for (const timer of timers) clearTimeout(timer)
		})
		push(5)
		later(() => push(5), 3000)
		for (const [what, install] of [
			['changelog', () => setupChangelog(api, CHANGELOG)],
			[
				'tokens',
				() =>
					sharpenTokens(
						() => settings().app,
						() => settings().ovals,
					).cleanup,
			],
			['emoji row', () => squareEmojiRow(() => settings().app)],
			// A round picture, not a shape, so it's swapped like the status dots.
			['checkboxes', () => squareCheckbox(() => settings().ovals)],
			// The bump joining the profile status bubble to the avatar is a half-circle SVG.
			['status bubble', () => squareStatusBubble(() => settings().ovals)],
			// Its round cut-out beside the avatar only clashes once the avatar is square.
			[
				'status dots',
				() =>
					squareStatus(
						() => settings().ovals,
						() => settings().app,
					),
			],
		] as const) {
			try {
				api.cleanup(install())
			} catch (error) {
				reportError(`${TAG} ${what} failed:`, error)
			}
		}
	},

	// Native hooks and built views keep their corners until Discord restarts.
	stop(api) {
		if (!isAndroid()) return
		void sendOptions({ app: false, native: false, ovals: false })
		api.plugin.requireReload()
	},

	SettingsComponent: Settings,
})
