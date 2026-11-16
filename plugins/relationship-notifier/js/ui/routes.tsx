import * as modulesSettings from '@valenced/discord/modules/settings'
import AvatarChange from './pages/AvatarChange'
import History from './pages/History'
import Options from './pages/Options'

const PREFIX = 'bleelblep.relationship-notifier'

export const HISTORY_ROUTE = `${PREFIX}.history`
export const OPTIONS_ROUTE = `${PREFIX}.options`
export const AVATAR_ROUTE = `${PREFIX}.avatar`

/** Whichever refresh this Valenced build has (see Hide Servers' routes.tsx). */
function refreshSettingsUI() {
	const settings = modulesSettings as any
	if (typeof settings.refreshSettings === 'function') {
		settings.refreshSettings()
		return
	}
	settings.refreshSettingsNavigator?.()
	settings.refreshSettingsOverviewScreen?.()
}

export function registerPages(): () => void {
	const { registerSettingsItem, onSettingsModulesLoaded } = modulesSettings

	// Inside onSettingsModulesLoaded: registering before Discord's settings modules exist is how a
	// page goes missing until a restart.
	let unregister: Array<() => void> = []
	const unsubscribe = onSettingsModulesLoaded(() => {
		unregister = [
			registerSettingsItem(HISTORY_ROUTE, {
				parent: null,
				type: 'route',
				useTitle: () => 'History',
				screen: { route: HISTORY_ROUTE, getComponent: () => History },
			}),
			registerSettingsItem(OPTIONS_ROUTE, {
				parent: null,
				type: 'route',
				useTitle: () => 'What to watch',
				screen: { route: OPTIONS_ROUTE, getComponent: () => Options },
			}),
			registerSettingsItem(AVATAR_ROUTE, {
				parent: null,
				type: 'route',
				useTitle: () => 'Avatar change',
				screen: { route: AVATAR_ROUTE, getComponent: () => AvatarChange },
			}),
		]
		refreshSettingsUI()
	})

	return () => {
		unsubscribe()
		for (const remove of unregister) remove()
		unregister = []
		refreshSettingsUI()
	}
}
