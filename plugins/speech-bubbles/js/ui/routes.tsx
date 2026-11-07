import * as modulesSettings from '@valenced/discord/modules/settings'
import Colours from './pages/Colours'
import Debug from './pages/Debug'
import SendAnimation from './pages/SendAnimation'
import Sounds from './pages/Sounds'
import Times from './pages/Times'
import VisualStyle from './pages/VisualStyle'

const DEBUG: boolean = false

const PREFIX = 'bleelblep.speech-bubbles'

export const VISUAL_ROUTE = `${PREFIX}.visual`
export const COLOURS_ROUTE = `${PREFIX}.colours`
export const TIMES_ROUTE = `${PREFIX}.times`
export const SEND_ROUTE = `${PREFIX}.send`
export const SOUNDS_ROUTE = `${PREFIX}.sounds`
export const DEBUG_ROUTE = `${PREFIX}.debug`

/** `refreshSettings` replaced the two older calls upstream; call whichever this bundle has. */
function refreshSettingsUI() {
	const settings = modulesSettings as any
	if (typeof settings.refreshSettings === 'function') {
		settings.refreshSettings()
		return
	}
	settings.refreshSettingsNavigator?.()
	settings.refreshSettingsOverviewScreen?.()
}

/** The sub-pages. Titles match the rows that open them (settings design guide §8). */
export function registerPages(): () => void {
	const { registerSettingsItem, onSettingsModulesLoaded } = modulesSettings

	// Inside `onSettingsModulesLoaded`: registering before Discord's settings modules exist leaves
	// the pages missing until a restart.
	let unregister: Array<() => void> = []
	const page = (route: string, title: string, component: () => any) =>
		registerSettingsItem(route, {
			parent: null,
			type: 'route',
			useTitle: () => title,
			screen: { route, getComponent: () => component },
		})
	const unsubscribe = onSettingsModulesLoaded(() => {
		unregister = [
			page(VISUAL_ROUTE, 'Visual style', VisualStyle),
			page(COLOURS_ROUTE, 'Colours', Colours),
			page(TIMES_ROUTE, 'Message times', Times),
			page(SEND_ROUTE, 'Send animation', SendAnimation),
			page(SOUNDS_ROUTE, 'Sounds and haptics', Sounds),
			...(DEBUG ? [page(DEBUG_ROUTE, 'Debug', Debug)] : []),
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
