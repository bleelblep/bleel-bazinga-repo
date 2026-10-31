import {
	onSettingsModulesLoaded,
	refreshSettings,
	registerSettingsItems,
} from '@valenced/discord/modules/settings'
import IconPicker from './pages/IconPicker'
import TagEditor from './pages/TagEditor'
import type { SettingsItem } from '@valenced/discord/modules/settings'
import type { ComponentType } from 'react'

const PREFIX = 'bleelblep.staff-tags'

export const TAG_ROUTE = `${PREFIX}.tag`
export const ICONS_ROUTE = `${PREFIX}.icons`

/** A page reached from the plugin's own settings, not listed in Discord's settings. */
function page(
	route: string,
	title: string,
	component: ComponentType,
): SettingsItem {
	return {
		parent: null,
		type: 'route',
		useTitle: () => title,
		screen: { route, getComponent: () => component },
	}
}

/**
 * Registered inside `onSettingsModulesLoaded`, which fires at once when Discord's settings modules
 * are already loaded and waits when they are not. Registering before they exist is how a page ends
 * up missing until the app is restarted.
 */
export function registerPages(): () => void {
	let unregister: (() => void) | undefined
	const unsubscribe = onSettingsModulesLoaded(() => {
		unregister = registerSettingsItems({
			[TAG_ROUTE]: page(TAG_ROUTE, 'Tag', TagEditor),
			[ICONS_ROUTE]: page(ICONS_ROUTE, 'Icon', IconPicker),
		})
		refreshSettings()
	})

	return () => {
		unsubscribe()
		unregister?.()
		unregister = undefined
		refreshSettings()
	}
}
