import type { ScreenshotRedactorStorage } from './types'

/**
 * Also the fallback for every read: `load: true` starts the storage read without awaiting it,
 * so `jsonStorage.cache` is genuinely undefined for a short window after start.
 *
 * `enabled` defaults to false on purpose. A plugin that silently rewrote every name in the app
 * the moment it installed would be indistinguishable from a bug.
 */
export const DEFAULTS: ScreenshotRedactorStorage = {
	enabled: false,
	style: 'pseudonym',
	redactAvatars: true,
	// Off, as types.ts and the README say: this family broke the client in 0.16.0. Through 0.27.15 it
	// was on here, contradicting both.
	redactBadges: false,
	redactSelf: true,
	resetNumberingOnEnable: true,
	showSheetToggle: true,
	redactResolvedNames: true,
	// On: free, local, and the obvious complement to redacting names.
	redactBodyDetails: true,
	verboseLogging: false,
}
