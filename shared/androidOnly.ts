import { Platform } from 'react-native'
import { showToast } from './toast'

/**
 * For plugins whose work is done by their native Android half (`dist.android`).
 *
 * Valenced has no manifest field for "Android only": on iOS it skips the native half and still
 * runs the JavaScript, so every `callNativeMethod` fails with "Method not implemented" and the
 * plugin shows a red error badge (Speech Bubbles, 2026-11-10). React Native's `Platform.OS` says
 * which one this is, so the plugin can stop before touching native code.
 *
 * Plugins that only use native code optionally (Multi Scrobbler's Music Bridge) don't use this.
 */

/** Whether this is Android, where the native half runs. Assumes Android if it can't tell. */
export function isAndroid(): boolean {
	try {
		return Platform.OS !== 'ios'
	} catch {
		return true
	}
}

/**
 * Call first thing in `start`, and return when it says true. On iOS it explains with a toast and
 * turns the plugin off, so it stays off after the next restart instead of failing again.
 */
export function stopUnlessAndroid(
	plugin: { disable(): Promise<void> },
	name: string,
): boolean {
	if (isAndroid()) return false
	showToast(`${name} needs Android, so it's been turned off.`, `AndroidOnly:${name}`)
	// After start returns: disabling a plugin that's still starting would stop it mid-lifecycle.
	setTimeout(() => {
		plugin.disable().catch(() => {
			/* stays on but does nothing; the toast already said why */
		})
	}, 0)
	return true
}
