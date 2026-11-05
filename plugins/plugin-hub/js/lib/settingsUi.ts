import * as settings from '@valenced/discord/modules/settings'

/** Makes Discord's settings list re-read its rows, e.g. after a row's `usePredicate` answer changed. */
export function refreshSettingsUI() {
	const S = settings as any
	if (typeof S.refreshSettings === 'function') {
		S.refreshSettings()
		return
	}
	S.refreshSettingsNavigator?.()
	S.refreshSettingsOverviewScreen?.()
}
