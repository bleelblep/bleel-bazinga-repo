import Channels from "./pages/Channels"
import Debug from "./pages/Debug"
import Servers from "./pages/Servers"
import * as modulesSettings from "@valenced/discord/modules/settings"

const DEBUG: boolean = false

const PREFIX = "bleelblep.hide-servers-drawer"

export const SERVERS_ROUTE = `${PREFIX}.servers`
export const CHANNELS_ROUTE = `${PREFIX}.channels`
export const DEBUG_ROUTE = `${PREFIX}.debug`

/**
 * Upstream commit 10371ff merged `refreshSettingsNavigator` + `refreshSettingsOverviewScreen`
 * into `refreshSettings`. The vendored types still describe the older pair, and which exists
 * depends on the bundle the user is running, so call whichever is actually there.
 */
function refreshSettingsUI() {
	const settings = modulesSettings as any
	if (typeof settings.refreshSettings === "function") {
		settings.refreshSettings()
		return
	}
	settings.refreshSettingsNavigator?.()
	settings.refreshSettingsOverviewScreen?.()
}

/**
 * The server list and the debug tools (which include the legacy custom bar) each live on
 * their own navigator route, leaving the root page as a short index -- same split as
 * screenshot-redactor-dev and anti-ghost-ping.
 */
export function registerPages(): () => void {
	const { registerSettingsItem, onSettingsModulesLoaded } = modulesSettings

	// Registered inside `onSettingsModulesLoaded`: it fires immediately when Discord's
	// settings modules are already loaded, and waits when they are not. Registering
	// before they exist is how a page ends up missing until the app is restarted.
	let unregister: Array<() => void> = []
	const unsubscribe = onSettingsModulesLoaded(() => {
		unregister = [
			registerSettingsItem(SERVERS_ROUTE, {
				parent: null,
				type: "route",
				useTitle: () => "Servers",
				screen: { route: SERVERS_ROUTE, getComponent: () => Servers },
			}),
			registerSettingsItem(CHANNELS_ROUTE, {
				parent: null,
				type: "route",
				useTitle: () => "Hidden channels",
				screen: { route: CHANNELS_ROUTE, getComponent: () => Channels },
			}),
			...(DEBUG ? [registerSettingsItem(DEBUG_ROUTE, {
				parent: null,
				type: "route",
				useTitle: () => "Debug",
				screen: { route: DEBUG_ROUTE, getComponent: () => Debug },
			})] : []),
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
