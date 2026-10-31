import { ToastActionCreators } from '@valenced/discord/actions'

/**
 * A short toast. The plugin needs Discord 350.4 or newer (manifest), where `open(key, toast)` is
 * the only toast entry point, so there is no older signature to pick between.
 */
export function showToast(text: string, key = 'PronounsToast') {
	try {
		ToastActionCreators.open(key, { text })
	} catch {
		/* a missing toast must never take the app down */
	}
}
