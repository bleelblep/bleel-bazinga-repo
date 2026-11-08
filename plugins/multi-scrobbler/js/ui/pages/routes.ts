import Debug from './Debug'
import DisplaySettingsPage from './pages/DisplaySettingsPage'
import IgnoreListSettingsPage from './pages/IgnoreListSettingsPage'
import LastFmSettingsPage from './pages/LastFmSettingsPage'
import LibreFmSettingsPage from './pages/LibreFmSettingsPage'
import ListenBrainzSettingsPage from './pages/ListenBrainzSettingsPage'
import RPCCustomizationSettingsPage from './pages/RPCCustomizationSettingsPage'

const PREFIX = 'kmmiio99o.multi-scrobbler'

export const LASTFM_ROUTE = `${PREFIX}.lastfm`
export const LIBREFM_ROUTE = `${PREFIX}.librefm`
export const LISTENBRAINZ_ROUTE = `${PREFIX}.listenbrainz`
export const DISPLAY_ROUTE = `${PREFIX}.display`
export const RPC_ROUTE = `${PREFIX}.rpc`
export const IGNORE_LIST_ROUTE = `${PREFIX}.ignore-list`
export const DEBUG_ROUTE = `${PREFIX}.debug`

function refreshSettingsUI() {
	const settings = valenced.discord.modules.settings as any
	if (typeof settings.refreshSettings === 'function') {
		settings.refreshSettings()
		return
	}
	settings.refreshSettingsNavigator?.()
	settings.refreshSettingsOverviewScreen?.()
}

export function registerPages(): () => void {
	const { registerSettingsItem } = valenced.discord.modules.settings

	const unregister = [
		registerSettingsItem(LASTFM_ROUTE, {
			parent: null,
			type: 'route',
			useTitle: () => 'Last.fm',
			screen: { route: LASTFM_ROUTE, getComponent: () => LastFmSettingsPage },
		}),
		registerSettingsItem(LIBREFM_ROUTE, {
			parent: null,
			type: 'route',
			useTitle: () => 'Libre.fm',
			screen: { route: LIBREFM_ROUTE, getComponent: () => LibreFmSettingsPage },
		}),
		registerSettingsItem(LISTENBRAINZ_ROUTE, {
			parent: null,
			type: 'route',
			useTitle: () => 'ListenBrainz',
			screen: {
				route: LISTENBRAINZ_ROUTE,
				getComponent: () => ListenBrainzSettingsPage,
			},
		}),
		registerSettingsItem(DISPLAY_ROUTE, {
			parent: null,
			type: 'route',
			useTitle: () => 'Display',
			screen: { route: DISPLAY_ROUTE, getComponent: () => DisplaySettingsPage },
		}),
		registerSettingsItem(RPC_ROUTE, {
			parent: null,
			type: 'route',
			useTitle: () => 'Status details',
			screen: {
				route: RPC_ROUTE,
				getComponent: () => RPCCustomizationSettingsPage,
			},
		}),
		registerSettingsItem(IGNORE_LIST_ROUTE, {
			parent: null,
			type: 'route',
			useTitle: () => 'Hide for other apps',
			screen: {
				route: IGNORE_LIST_ROUTE,
				getComponent: () => IgnoreListSettingsPage,
			},
		}),
		registerSettingsItem(DEBUG_ROUTE, {
			parent: null,
			type: 'route',
			useTitle: () => 'Debug',
			screen: { route: DEBUG_ROUTE, getComponent: () => Debug },
		}),
	]

	refreshSettingsUI()

	return () => {
		for (const remove of unregister) remove()
		refreshSettingsUI()
	}
}

let unregister: (() => void) | null = null

export function applySidebarSettings(): () => void {
	return () => {
		if (unregister) {
			unregister()
			unregister = null
		}
	}
}
