/**
 * The "Hub" and "AI Hub" rows, and the routes behind them.
 *
 * ## Where they go
 *
 * A "Plugin Hub" section of its own in Discord's settings, holding Hub then AI Hub. Not added
 * to Valenced's `VALENCED` section: on Discord 348 that call started succeeding and quietly folded
 * the rows in under Valenced's Plugins, which is not where people look for them.
 *
 * `index: 1` puts the section directly below Valenced's. Valenced splices each registered section
 * into Discord's list at its `index`, and `unshift`s any without one -- in registration order, so
 * an unindexed section registered after Valenced's ends up *above* it (revenge-bundle-next,
 * `src/plugins/start/settings/index.ts`). Index 0 would not work either: it is falsy there.
 *
 * ## AI Hub
 *
 * AI Core and the plugins that use it are listed on their own page, as plain rows, rather than
 * on the Hub. The row is always registered but its `usePredicate` hides it unless AI Core is running
 * (`aiCoreRunning` in `lib/installed.ts`), so installing or removing AI Core needs no restart of
 * this plugin -- only a fresh look at the settings screen.
 *
 * ## The rows themselves
 *
 * Same shape as Valenced's Plugins row -- `parent: null`, `IconComponent`, `useTitle`,
 * `useTrailing` -- so they sit in the list looking like they belong there.
 */

import { afterValencedSection } from '../../../../shared/afterValencedSection'
import { hubName, isCornhub, sectionName } from '../lib/cornhub'
import { aiCoreRunning, onPage } from '../lib/installed'
import { refreshSettingsUI } from '../lib/settingsUi'
import { getStorage, settings } from '../lib/state'
import { rowIcon } from './icon'
import { AiHub, default as Hub } from './pages/Hub'
import Manage from './pages/Manage'
import HubSettings, { AiHubSettings } from './pages/Settings'
import {
	AI_HUB_ROUTE,
	AI_SETTINGS_ROUTE,
	HUB_ROUTE,
	MANAGE_ROUTE,
	placement,
	SETTINGS_ROUTE,
} from './routes'
import type { Entry } from '../types'
import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as S from '@valenced/discord/modules/settings'
import * as react from '@valenced/react'
import * as ReactNative from 'react-native'
import { reportError } from '../../../../shared/report'

const DEBUG: boolean = false

const SECTION = 'BLEELBLEP_HUB'
const SHORTCUTS_SECTION = 'BLEELBLEP_HUB_SHORTCUTS'

/**
 * Some other plugins' settings sections (a theming one, a backup one) go directly under
 * Valenced's, then this one. Valenced splices sections in registration order, which between
 * plugins is chance, so each of those sets a flag while its section is being placed and these
 * indexes move down one per flag.
 */
const placedAbove = () =>
	((globalThis as any).__bleelblepThemingPlaced ? 1 : 0) +
	((globalThis as any).__bleelblepCloudBackupPlaced ? 1 : 0)

function countOf(ai: boolean) {
	const count = settings().entries.filter(entry => onPage(entry, ai)).length
	return count ? `${count}` : undefined
}

/** Route and settings key for one plugin's shortcut row. Distinct from the plugin's own route. */
const shortcutKey = (id: string) => `BleelblepHubPin.${id}`

/**
 * The screen behind a shortcut row: it hands straight over to the plugin's own settings page.
 *
 * Why not list the plugin's own settings item in our section instead: Valenced registers every
 * running plugin's settings page as an item keyed by its id (revenge-bundle-next,
 * `src/plugins/start/settings.plugins/plugins.tsx`), but only while that plugin runs, and a
 * section naming a key that is not registered is spliced into Discord's list as-is -- there is no
 * public way to check first. Registering the same route name twice is no better: React Navigation
 * refuses duplicate screen names. So each shortcut is a route of our own whose screen `replace`s
 * itself with the plugin's route, and back goes straight to Settings.
 *
 * A plugin that is not running has no route to go to; the screen says so instead of going blank.
 */
function shortcutScreen(entry: Entry) {
	return function PluginHubShortcut({ navigation }: { navigation: any }) {
		const { React } = react
		const { Page } = components
		const { View } = ReactNative
		const { Text } = Design

		const routeNames: string[] | undefined = navigation?.getState?.()?.routeNames
		// Unknown route list (an unexpected navigator): try anyway rather than refuse.
		const available = !Array.isArray(routeNames) || routeNames.includes(entry.id)

		React.useLayoutEffect(() => {
			if (!available) return
			try {
				if (typeof navigation.replace === 'function') navigation.replace(entry.id)
				else navigation.navigate(entry.id)
			} catch (error) {
				reportError(`[PluginHub] could not open ${entry.id}:`, error)
			}
		}, [])

		if (available) return null
		return (
			<Page>
				<View style={{ padding: 16 }}>
					<Text color="text-default" variant="text-md/semibold">
						{entry.name} is not running
					</Text>
					<Text color="text-muted" variant="text-sm/normal" style={{ marginTop: 8 }}>
						Its settings only exist while it runs. Turn it on under Valenced › Plugins, or
						remove this shortcut under Hub › Choose plugins.
					</Text>
				</View>
			</Page>
		)
	}
}

export function registerHub(): () => void {
	const cleanups: Array<() => void> = []

	/** The shortcut rows and the section that lists them, rebuilt whenever the choice changes. */
	let shortcutCleanups: Array<() => void> = []
	let shownKeys = ''
	let installedOnce = false

	const installSection = () => {
		const shortcuts = settings().entries.filter(entry => entry.inSettings)
		// Only rebuild when the set or order of rows changed, not on every storage write.
		const signature = shortcuts.map(entry => `${entry.id}:${entry.name}:${entry.icon ?? ''}`).join('|')
		if (installedOnce && signature === shownKeys) return
		installedOnce = true
		shownKeys = signature

		for (const cleanup of shortcutCleanups.reverse()) {
			try {
				cleanup()
			} catch {
				/* already gone */
			}
		}
		shortcutCleanups = []

		const byName = [...shortcuts].sort((a, b) => a.name.localeCompare(b.name))
		for (const entry of byName) {
			const Screen = shortcutScreen(entry)
			shortcutCleanups.push(
				S.registerSettingsItem(shortcutKey(entry.id), {
					parent: null,
					type: 'route',
					IconComponent: () => rowIcon(entry.icon ?? 'PuzzlePieceIcon', 'PuzzlePieceIcon') ?? null,
					useTitle: () => entry.name,
					screen: { route: shortcutKey(entry.id), getComponent: () => Screen },
				} as any),
			)
		}

		// A section of its own, directly under Plugin Hub. Valenced splices indexed sections into
		// Discord's list in registration order, so index 2 registered after Plugin Hub's index 1
		// lands immediately below it -- and re-registering this one later keeps it there, since
		// Plugin Hub's own section is registered once and never moves. No section at all when
		// nothing is chosen, rather than an empty heading.
		if (byName.length) {
			shortcutCleanups.push(
				S.registerSettingsSection(SHORTCUTS_SECTION, {
					label: 'Shortcuts',
					settings: byName.map(entry => shortcutKey(entry.id)),
					get index() {
						return 2 + placedAbove()
					},
				} as any),
			)
		}
		refreshSettingsUI()
	}

	const install = () => {
		cleanups.push(
			S.registerSettingsItem(HUB_ROUTE, {
				parent: null,
				type: 'route',
				IconComponent: () => rowIcon('AppsIcon', 'GridSquareIcon') ?? null,
				useTitle: () => hubName(false),
				useTrailing: () => countOf(false),
				screen: { route: HUB_ROUTE, getComponent: () => Hub },
			} as any),
			S.registerSettingsItem(AI_HUB_ROUTE, {
				parent: null,
				type: 'route',
				IconComponent: () => rowIcon('MagicWandIcon') ?? null,
				useTitle: () => hubName(true),
				useTrailing: () => countOf(true),
				usePredicate: () => aiCoreRunning(),
				screen: { route: AI_HUB_ROUTE, getComponent: () => AiHub },
			} as any),
			S.registerSettingsItem(MANAGE_ROUTE, {
				parent: null,
				type: 'route',
				useTitle: () => 'Choose plugins',
				screen: { route: MANAGE_ROUTE, getComponent: () => Manage },
			} as any),
			// Opened from the settings icon at the top right of each page; in no section.
			S.registerSettingsItem(SETTINGS_ROUTE, {
				parent: null,
				type: 'route',
				useTitle: () => `${hubName(false)} settings`,
				screen: { route: SETTINGS_ROUTE, getComponent: () => HubSettings },
			} as any),
			S.registerSettingsItem(AI_SETTINGS_ROUTE, {
				parent: null,
				type: 'route',
				useTitle: () => `${hubName(true)} settings`,
				screen: { route: AI_SETTINGS_ROUTE, getComponent: () => AiHubSettings },
			} as any),
		)

		// The section's label is fixed at registration, so it is registered again whenever Cornhub is
		// switched, under the same key and index -- the rows stay exactly where they were.
		let removeSection: (() => void) | undefined
		let sectionCornhub: boolean | undefined
		const installHubSection = () => {
			const corn = isCornhub()
			if (corn === sectionCornhub) return
			sectionCornhub = corn
			try {
				removeSection?.()
			} catch {
				/* already gone */
			}
			removeSection = S.registerSettingsSection(SECTION, {
				label: sectionName(),
				settings: [HUB_ROUTE, AI_HUB_ROUTE],
				get index() {
					return 1 + placedAbove()
				},
			} as any)
			refreshSettingsUI()
		}
		cleanups.push(() => {
			removeSection?.()
			removeSection = undefined
			sectionCornhub = undefined
		})

		// The Shortcuts section under it: a row for each plugin chosen to appear there. Rebuilt when
		// the choice changes, so switching one on under Choose plugins shows up without a restart.
		// Both wait for Valenced's own section: registered before it, they're placed under Discord's
		// Account Settings instead of under Valenced (shared/afterValencedSection.ts).
		let sectionsReady = false
		cleanups.push(
			afterValencedSection(() => {
				sectionsReady = true
				installHubSection()
				installSection()
			}),
		)
		const storage = getStorage()
		if (storage)
			cleanups.push(
				storage.subscribe(() => {
					if (!sectionsReady) return
					installHubSection()
					installSection()
				}),
			)
		cleanups.push(() => {
			for (const cleanup of shortcutCleanups.reverse()) {
				try {
					cleanup()
				} catch {
					/* already gone */
				}
			}
			shortcutCleanups = []
			shownKeys = ''
			installedOnce = false
		})
		placement.where = 'in the Plugin Hub section'

		if (DEBUG) console.log(`[PluginHub] Hub rows registered ${placement.where}`)
		refreshSettingsUI()
	}

	// Registered once Discord's settings modules exist, the documented moment for it.
	cleanups.push(S.onSettingsModulesLoaded(install))

	return () => {
		for (const cleanup of cleanups.reverse()) {
			try {
				cleanup()
			} catch {
				/* already gone */
			}
		}
		placement.where = 'not yet registered'
		refreshSettingsUI()
	}
}
