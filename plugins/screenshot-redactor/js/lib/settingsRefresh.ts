import { refreshChat } from './chatRows'
import { cancelScheduledRefresh, scheduleRefresh } from './refreshSignal'
import { onEnabledChanged, settings } from './state'
import type { ScreenshotRedactorStorage } from '../types'

const PRESENTATION_KEYS = [
	'enabled',
	'style',
	'redactAvatars',
	'redactBadges',
	'redactSelf',
	'redactResolvedNames',
	'redactBodyDetails',
] as const

/** One subscription covers UI controls, disk reloads and settings changed from DevTools. */
export function watchRedactionSettings(
	storage: ValencedJsonStorageApi<ScreenshotRedactorStorage>,
): () => void {
	let previous = settings()
	const unsubscribe = storage.subscribe(() => {
		const next = settings()
		const changed = PRESENTATION_KEYS.some(key => previous[key] !== next[key])
		if (previous.enabled !== next.enabled) onEnabledChanged(next.enabled)
		previous = next
		// Coalesce a multi-setting update. Explicit refresh buttons cancel this scheduled pass.
		if (changed) scheduleRefresh(refreshChat)
	})
	return () => {
		unsubscribe()
		cancelScheduledRefresh()
	}
}
