/**
 * The plugin's settings pages, registered with Discord's settings module as routes.
 *
 * Every page has `parent: null`: none of them sits in a settings list. They are reached from the
 * plugin's own root page (`pages/Settings.tsx`, the `SettingsComponent` Valenced opens from the
 * plugin list) and from each other, through `navigation.navigate(ROUTE)`.
 *
 * Registered inside `onSettingsModulesLoaded`, which fires at once when Discord's settings modules
 * are already loaded and waits when they are not. Registering before they exist is how a page ends
 * up missing until the app is restarted.
 */

import {
	onSettingsModulesLoaded,
	refreshSettings,
	registerSettingsItems,
} from '@valenced/discord/modules/settings'
import { getAi } from '../lib/state'
import AiRules from './pages/AiRules'
import Debug from './pages/Debug'
import EditRule from './pages/EditRule'
import { ImportExportLinks, ImportExportText } from './pages/ImportExport'
import Options from './pages/Options'
import { ReadyMadeLinks, ReadyMadeText } from './pages/ReadyMade'
import { LinkRules, TextRules } from './pages/Rules'
import Templates, {
	TemplateFormats,
	TemplateGuide,
	TemplateHelper,
	TemplatePlayground,
	TemplateSnippets,
} from './pages/Templates'
import TryIt from './pages/TryIt'
import WagonServers, {
	WagonAddServer,
	WagonPlaceholderPage,
	WagonServerPage,
} from './pages/WagonServers'
import { safePage } from './safePage'
import type { SettingsItem } from '@valenced/discord/modules/settings'
import type { ComponentType } from 'react'

const DEBUG: boolean = false

const PREFIX = 'bleelblep.send-tweaks'

export const OPTIONS_ROUTE = `${PREFIX}.options`
export const RULES_ROUTE = `${PREFIX}.rules`
export const LINK_RULES_ROUTE = `${PREFIX}.link-rules`
export const EDIT_RULE_ROUTE = `${PREFIX}.edit-rule`
/** The AI screen. Registered only while AI Core is installed. */
export const AI_ROUTE = `${PREFIX}.ai`
export const READY_LINKS_ROUTE = `${PREFIX}.ready-made-links`
export const READY_TEXT_ROUTE = `${PREFIX}.ready-made-text`
export const IMPORT_EXPORT_LINKS_ROUTE = `${PREFIX}.import-export-links`
export const IMPORT_EXPORT_TEXT_ROUTE = `${PREFIX}.import-export-text`
export const TRY_ROUTE = `${PREFIX}.try`
export const DEBUG_ROUTE = `${PREFIX}.debug`
export const TEMPLATE_ROUTE = `${PREFIX}.templates`
export const TEMPLATE_HELPER_ROUTE = `${PREFIX}.template-helper`
export const TEMPLATE_GUIDE_ROUTE = `${PREFIX}.template-guide`
export const TEMPLATE_PLAY_ROUTE = `${PREFIX}.template-playground`
export const TEMPLATE_SNIPPETS_ROUTE = `${PREFIX}.template-snippets`
export const TEMPLATE_FORMATS_ROUTE = `${PREFIX}.template-formats`
/** Welcome Wagon per-server settings (pages/WagonServers.tsx). */
export const WAGON_SERVERS_ROUTE = `${PREFIX}.wagon-servers`
export const WAGON_SERVER_ROUTE = `${PREFIX}.wagon-server`
export const WAGON_ADD_SERVER_ROUTE = `${PREFIX}.wagon-add-server`
export const WAGON_PLACEHOLDER_ROUTE = `${PREFIX}.wagon-placeholder`

/** One route entry for `registerSettingsItems`, keyed by its route name. */
function route(
	key: string,
	title: string,
	component: ComponentType,
): [string, SettingsItem] {
	return [
		key,
		{
			parent: null,
			type: 'route',
			useTitle: () => title,
			screen: { route: key, getComponent: () => safePage(component, title) },
		},
	]
}

export function registerPages(): () => void {
	let unregister: (() => void) | undefined

	const unsubscribe = onSettingsModulesLoaded(() => {
		unregister = registerSettingsItems(
			Object.fromEntries([
				route(OPTIONS_ROUTE, 'Settings', Options),
				route(RULES_ROUTE, 'Replacement rules', TextRules),
				route(LINK_RULES_ROUTE, 'Link rules', LinkRules),
				route(EDIT_RULE_ROUTE, 'Edit rule', EditRule),
				route(READY_LINKS_ROUTE, 'Ready-made link rules', ReadyMadeLinks),
				route(READY_TEXT_ROUTE, 'Ready-made rules', ReadyMadeText),
				route(
					IMPORT_EXPORT_LINKS_ROUTE,
					'Import & export link rules',
					ImportExportLinks,
				),
				route(
					IMPORT_EXPORT_TEXT_ROUTE,
					'Import & export rules',
					ImportExportText,
				),
				route(TRY_ROUTE, 'Try a message', TryIt),
				...(DEBUG ? [route(DEBUG_ROUTE, 'Debug', Debug)] : []),
				route(TEMPLATE_ROUTE, 'Template helpers', Templates),
				route(TEMPLATE_HELPER_ROUTE, 'Insert helper', TemplateHelper),
				route(TEMPLATE_GUIDE_ROUTE, 'Placeholders', TemplateGuide),
				route(TEMPLATE_PLAY_ROUTE, 'Try a template', TemplatePlayground),
				route(TEMPLATE_SNIPPETS_ROUTE, 'Snippets', TemplateSnippets),
				route(TEMPLATE_FORMATS_ROUTE, 'Date & time', TemplateFormats),
				route(WAGON_SERVERS_ROUTE, 'Servers', WagonServers),
				route(WAGON_SERVER_ROUTE, 'Server', WagonServerPage),
				route(WAGON_ADD_SERVER_ROUTE, 'Add a server', WagonAddServer),
				route(WAGON_PLACEHOLDER_ROUTE, 'Placeholder', WagonPlaceholderPage),
				// Only with AI Core installed: without it there is nothing to show and nothing links here.
				...(getAi() ? [route(AI_ROUTE, 'Write a rule with AI', AiRules)] : []),
			]),
		)
		refreshSettings()
	})

	return () => {
		unsubscribe()
		unregister?.()
		unregister = undefined
		refreshSettings()
	}
}
