import {
	onSettingsModulesLoaded,
	refreshSettings,
	registerSettingsItem,
} from '@valenced/discord/modules/settings'
import BadgeColor from './pages/BadgeColor'
import People from './pages/People'
import Sources from './pages/Sources'
import type { ComponentType } from 'react'

const PREFIX = 'bleelblep.pronouns'

export const PEOPLE_ROUTE = `${PREFIX}.people`
export const SOURCES_ROUTE = `${PREFIX}.sources`
export const BADGE_COLOR_ROUTE = `${PREFIX}.badge-color`

export function registerPages(): () => void {
	const page = (route: string, title: string, component: ComponentType) =>
		registerSettingsItem(route, {
			parent: null,
			type: 'route',
			useTitle: () => title,
			screen: { route, getComponent: () => component },
		})

	// Registered inside `onSettingsModulesLoaded`: it fires immediately when Discord's
	// settings modules are already loaded, and waits when they are not. Registering
	// before they exist is how a page ends up missing until the app is restarted.
	let unregister: Array<() => void> = []
	const unsubscribe = onSettingsModulesLoaded(() => {
		unregister = [
			page(PEOPLE_ROUTE, 'People', People),
			page(SOURCES_ROUTE, 'Pronoun sources', Sources),
			page(BADGE_COLOR_ROUTE, 'Badge colour', BadgeColor),
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
