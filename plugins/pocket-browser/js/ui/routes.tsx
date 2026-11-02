import {
	onSettingsModulesLoaded,
	refreshSettings,
	registerSettingsItem,
} from '@valenced/discord/modules/settings'
import { HistoryPage, LinksPage, MenuPage, PagesPage, PickerPage, PopoutPage } from './settingsPages'
import type { ComponentType } from 'react'

const PREFIX = 'bleelblep.pocket-browser'

export const PICKER_ROUTE = `${PREFIX}.picker`
export const LINKS_ROUTE = `${PREFIX}.links`
export const PAGES_ROUTE = `${PREFIX}.pages`
export const MENU_ROUTE = `${PREFIX}.menu`
export const POPOUT_ROUTE = `${PREFIX}.popout`
export const HISTORY_ROUTE = `${PREFIX}.history`

/**
 * The settings sub-pages, registered with Discord's settings module as routes with no parent:
 * they're reached from the plugin's own settings page through `navigation.navigate(ROUTE)`.
 *
 * Registered inside `onSettingsModulesLoaded`, which fires at once when Discord's settings modules
 * are already loaded and waits when they aren't. Registering before they exist is how a page ends
 * up missing until the app is restarted.
 */
export function registerPages(): () => void {
	const page = (route: string, title: string, component: ComponentType) =>
		registerSettingsItem(route, {
			parent: null,
			type: 'route',
			useTitle: () => title,
			screen: { route, getComponent: () => component },
		})
	let unregister: Array<() => void> = []
	const unsubscribe = onSettingsModulesLoaded(() => {
		unregister = [
			page(PICKER_ROUTE, 'Tabs and picker', PickerPage),
			page(LINKS_ROUTE, 'Links', LinksPage),
			page(PAGES_ROUTE, 'Pages', PagesPage),
			page(MENU_ROUTE, 'Menu', MenuPage),
			page(POPOUT_ROUTE, 'Pop-out player', PopoutPage),
			page(HISTORY_ROUTE, 'History and data', HistoryPage),
		]
		refreshSettings()
	})
	return () => {
		unsubscribe()
		for (const remove of unregister) remove()
		unregister = []
		refreshSettings()
	}
}
