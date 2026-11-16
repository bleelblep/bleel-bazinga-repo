import * as modulesSettings from '@valenced/discord/modules/settings'
import Debug from './pages/Debug'
import Visuals from './pages/Visuals'

const DEBUG: boolean = false

const PREFIX = 'bleelblep.screenshot-redactor'

export const VISUALS_ROUTE = `${PREFIX}.visuals`
export const DEBUG_ROUTE = `${PREFIX}.debug`

/**
 * Upstream commit 10371ff merged `refreshSettingsNavigator` + `refreshSettingsOverviewScreen`
 * into `refreshSettings`. The vendored types still describe the older pair, and which exists
 * depends on the bundle the user is running, so call whichever is actually there.
 */
function refreshSettingsUI() {
	const settings = modulesSettings as any
	if (typeof settings.refreshSettings === 'function') {
		settings.refreshSettings()
		return
	}
	settings.refreshSettingsNavigator?.()
	settings.refreshSettingsOverviewScreen?.()
}

/**
 * The visual options and the debug tools each live on their own navigator route, leaving the
 * root page as the toggle, the warnings and a two-row index. Inline, the diagnostics wall of
 * text swamped everything else on the page. Same split as anti-ghost-ping.
 */
export function registerPages(): () => void {
	const { registerSettingsItem, onSettingsModulesLoaded } = modulesSettings

	// Registered inside `onSettingsModulesLoaded`: it fires immediately when Discord's
	// settings modules are already loaded, and waits when they are not. Registering
	// before they exist is how a page ends up missing until the app is restarted.
	let unregister: Array<() => void> = []
	const unsubscribe = onSettingsModulesLoaded(() => {
		unregister = [
			registerSettingsItem(VISUALS_ROUTE, {
				parent: null,
				type: 'route',
				useTitle: () => 'Visual style',
				screen: { route: VISUALS_ROUTE, getComponent: () => Visuals },
			}),
			...(DEBUG
				? [
						registerSettingsItem(DEBUG_ROUTE, {
							parent: null,
							type: 'route',
							useTitle: () => 'Debug',
							screen: { route: DEBUG_ROUTE, getComponent: () => Debug },
						}),
					]
				: []),
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
