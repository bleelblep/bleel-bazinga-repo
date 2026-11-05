import SettingsItemsPage from './SettingsItemsPage'
import SheetPage from './SheetPage'
import PlusMenuPage from './PlusMenuPage'
import GesturesPage from './GesturesPage'
import GesturePickerPage from './GesturePickerPage'
import * as modulesSettings from '@valenced/discord/modules/settings'

const PREFIX = 'bleelblep.ui-tweaks'

export const SHEET_ROUTE = `${PREFIX}.sheet`
export const SETTINGS_ROUTE = `${PREFIX}.settings`
// The id predates double-tap joining the page; kept so it stays the same route.
export const GESTURES_ROUTE = `${PREFIX}.swipe`
export const GESTURE_PICKER_ROUTE = `${PREFIX}.gesture`
export const PLUS_MENU_ROUTE = `${PREFIX}.plusMenu`

/** Whichever refresh this Valenced build has (see ai-core/js/ui/routes.tsx). */
function refreshSettingsUI() {
	const settings = modulesSettings as any
	if (typeof settings.refreshSettings === 'function') {
		settings.refreshSettings()
		return
	}
	settings.refreshSettingsNavigator?.()
	settings.refreshSettingsOverviewScreen?.()
}

/** The sub-pages, reached from the plugin's settings. Registered once settings modules load. */
export function registerPages(): () => void {
	const { registerSettingsItem, onSettingsModulesLoaded } = modulesSettings
	let unregister: Array<() => void> = []
	const unsubscribe = onSettingsModulesLoaded(() => {
		unregister = [
			registerSettingsItem(SHEET_ROUTE, {
				parent: null,
				type: 'route',
				useTitle: () => 'Long-press menu',
				screen: { route: SHEET_ROUTE, getComponent: () => SheetPage },
			} as any),
			registerSettingsItem(SETTINGS_ROUTE, {
				parent: null,
				type: 'route',
				useTitle: () => 'Discord settings',
				screen: { route: SETTINGS_ROUTE, getComponent: () => SettingsItemsPage },
			} as any),
			registerSettingsItem(GESTURES_ROUTE, {
				parent: null,
				type: 'route',
				useTitle: () => 'Gestures',
				screen: { route: GESTURES_ROUTE, getComponent: () => GesturesPage },
			} as any),
			registerSettingsItem(GESTURE_PICKER_ROUTE, {
				parent: null,
				type: 'route',
				useTitle: () => 'Gesture',
				screen: { route: GESTURE_PICKER_ROUTE, getComponent: () => GesturePickerPage },
			} as any),
			registerSettingsItem(PLUS_MENU_ROUTE, {
				parent: null,
				type: 'route',
				useTitle: () => 'Long-press +',
				screen: { route: PLUS_MENU_ROUTE, getComponent: () => PlusMenuPage },
			} as any),
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
