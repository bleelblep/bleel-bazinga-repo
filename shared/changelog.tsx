/**
 * One changelog for every plugin, in the same place in each: a clock icon at the top right of the
 * plugin's main settings page, opening a page with every version (newest first, the installed one
 * marked). After an update, the first visit to that settings page shows a "What's new" dialog with
 * what changed since the version the user last saw. Nothing pops up at app start.
 *
 * Each plugin keeps its entries in `js/changelog.ts`, calls `setupChangelog(api, CHANGELOG)` from
 * `start()`, and calls `useChangelog()` at the top of its root settings page. A root page that sets
 * its own `headerRight` renders `<ChangelogButton />` in it instead and calls
 * `useChangelog({ header: false })`. A plugin whose popup should show only the newest entry (not
 * every version the user skipped) passes `{ latestOnly: true }` to `setupChangelog`.
 *
 * The last-seen version is kept in the plugin's own `jsonStorage` under `changelogSeenVersion`, so
 * a plugin needs `jsonStorage` (an empty default is enough). With nothing stored yet the plugin is
 * treated as freshly installed: the version is recorded and no dialog shows. The seen version only
 * moves once the dialog has actually been shown.
 *
 * Basic controls are Discord's own (`AlertModal`, `AlertActionButton`, `TableRow`, `Text`); the
 * header icon and the bullet list are hand-built.
 *
 * `valenced.*` is only read inside functions and renders (docs/coding-rules.md rule 1).
 */
import { rowIcon } from './ui/icon'
import { useBottomPadding } from './ui/safeArea'
import { ReactNavigationNative } from '@valenced/externals/react-navigation'
import * as components from '@valenced/components'
import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import * as modulesSettings from '@valenced/discord/modules/settings'
import * as react from '@valenced/react'
import * as ReactNative from 'react-native'
import { reportError } from './report'

const DEBUG: boolean = false

export interface ChangelogEntry {
	/** Exactly as in manifest.json. */
	version: string
	/** `YYYY-MM-DD`. */
	date?: string
	/** A few words: what this version is about. */
	title?: string
	/** One sentence each, written for users. */
	changes: string[]
}

interface Registered {
	id: string
	name: string
	current: string
	entries: ChangelogEntry[]
	storage: any
	/** Popup shows only the newest unseen entry instead of everything since the last-seen one. */
	latestOnly?: boolean
	/** Versions newer than the last-seen one, waiting for the settings page to open. */
	pending?: ChangelogEntry[]
}

interface ChangelogOptions {
	latestOnly?: boolean
}

/** This bundle's plugin. Plain data, so module scope is fine. */
let registered: Registered | undefined

const SEEN_KEY = 'changelogSeenVersion'
/** Versions in the dialog; the rest are a tap away on the Changelog page. */
const DIALOG_VERSIONS = 3

export const changelogRoute = (id: string) => `${id}.changelog`

// ---------------------------------------------------------------------------------------------
// Versions

/**
 * The manifest version as a string. At runtime `api.plugin.manifest.version` is already parsed into
 * `{ nums, label }` (`label` is only the pre-release part, like `beta21`), not the manifest string;
 * rendering that object crashed the Changelog page.
 */
function versionString(version: any): string {
	if (typeof version === 'string') return version
	if (version && Array.isArray(version.nums)) {
		return version.nums.join('.') + (version.label ? `-${version.label}` : '')
	}
	return String(version ?? '')
}

function parse(version: string): { nums: number[]; pre: string | undefined } {
	const [main, pre] = String(version).split('-', 2)
	return { nums: main.split('.').map(n => Number.parseInt(n, 10) || 0), pre }
}

/** Semver order, with `1.0.0-beta2` before `1.0.0` and `beta10` after `beta9`. */
export function compareVersions(a: string, b: string): number {
	const x = parse(a)
	const y = parse(b)
	for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i++) {
		const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0)
		if (d) return d
	}
	if (x.pre === y.pre) return 0
	if (x.pre === undefined) return 1
	if (y.pre === undefined) return -1
	return x.pre.localeCompare(y.pre, undefined, { numeric: true })
}

// ---------------------------------------------------------------------------------------------
// Setup

/**
 * Registers the Changelog page and works out whether there is anything new to show. Returns a
 * cleanup; pass it to `api.cleanup`.
 */
export function setupChangelog(api: any, entries: ChangelogEntry[], options: ChangelogOptions = {}): () => void {
	const manifest = api.plugin.manifest
	const plugin: Registered = {
		id: manifest.id,
		name: manifest.name ?? manifest.id,
		current: versionString(manifest.version),
		entries: [...entries].sort((a, b) => compareVersions(b.version, a.version)),
		storage: api.jsonStorage,
		latestOnly: options.latestOnly,
	}
	registered = plugin

	const unregisterPage = registerPage(plugin)
	checkForUpdate(plugin).catch(error => reportError(`[${plugin.name}] changelog check failed:`, error))

	return () => {
		if (registered === plugin) registered = undefined
		unregisterPage()
	}
}

async function checkForUpdate(plugin: Registered) {
	if (!plugin.storage) {
		if (DEBUG) console.warn(`[${plugin.name}] no jsonStorage, so the changelog can't tell when it updated`)
		return
	}
	const data = await plugin.storage.get()
	// Through versionString: a test build stored the parsed `{ nums, label }` object here.
	const seen: string | undefined = data?.[SEEN_KEY] ? versionString(data[SEEN_KEY]) : undefined
	if (seen === plugin.current) return
	// Nothing stored is a fresh install; a downgrade has nothing new. Either way, say nothing.
	if (!seen || compareVersions(plugin.current, seen) < 0) {
		await plugin.storage.set({ [SEEN_KEY]: plugin.current })
		return
	}
	const fresh = plugin.entries.filter(
		e => compareVersions(e.version, seen) > 0 && compareVersions(e.version, plugin.current) <= 0,
	)
	if (fresh.length) plugin.pending = plugin.latestOnly ? fresh.slice(0, 1) : fresh
	else await plugin.storage.set({ [SEEN_KEY]: plugin.current })
}

// ---------------------------------------------------------------------------------------------
// The root page hook and header button

/**
 * Call at the top of the plugin's root settings page, like any hook. Puts the changelog icon at
 * the top right (unless `header: false`) and, after an update, shows "What's new" once.
 */
export function useChangelog(options: { header?: boolean } = {}) {
	const { React } = react
	const { useNavigation } = ReactNavigationNative
	const navigation = useNavigation() as {
		navigate: (route: string) => void
		setOptions?: (options: Record<string, unknown>) => void
	}
	const header = options.header !== false

	React.useLayoutEffect(() => {
		if (header && registered) navigation.setOptions?.({ headerRight: () => <ChangelogButton /> })
	}, [header])

	React.useEffect(() => {
		const plugin = registered
		if (!plugin?.pending?.length) return
		const entries = plugin.pending
		plugin.pending = undefined
		showWhatsNew(plugin, entries, () => navigation.navigate(changelogRoute(plugin.id)))
		plugin.storage
			?.set({ [SEEN_KEY]: plugin.current })
			.catch((error: unknown) => reportError(`[${plugin.name}] could not save the seen version:`, error))
	}, [])
}

/** The clock icon that opens the Changelog page. For a header the plugin draws itself. */
export function ChangelogButton() {
	const { Pressable } = ReactNative
	const { useNavigation } = ReactNavigationNative
	const navigation = useNavigation() as { navigate: (route: string) => void }
	const plugin = registered
	if (!plugin) return null
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel="Changelog"
			hitSlop={12}
			onPress={() => navigation.navigate(changelogRoute(plugin.id))}
			style={({ pressed }: { pressed: boolean }) => ({ paddingHorizontal: 12, opacity: pressed ? 0.5 : 1 })}
		>
			{rowIcon('ClockIcon', 'ic_clock')}
		</Pressable>
	)
}

// ---------------------------------------------------------------------------------------------
// The dialog

function Bullets({ changes }: { changes: string[] }) {
	const { View } = ReactNative
	const { Text } = Design as any
	return (
		<View style={{ gap: 4 }}>
			{changes.map((change, i) => (
				<View key={i} style={{ flexDirection: 'row' }}>
					<Text variant="text-sm/normal" color="text-muted" style={{ width: 14 }}>
						•
					</Text>
					<Text variant="text-sm/normal" color="text-muted" style={{ flex: 1 }}>
						{change}
					</Text>
				</View>
			))}
		</View>
	)
}

function versionHeading(entry: ChangelogEntry): string {
	return entry.title ? `${entry.version} · ${entry.title}` : entry.version
}

function showWhatsNew(plugin: Registered, entries: ChangelogEntry[], openChangelog: () => void) {
	const { ScrollView, View, Dimensions } = ReactNative
	const { AlertModal, AlertActionButton, Text } = Design as any
	const alerts = AlertActionCreators as any
	const key = `bleelblep-whats-new-${plugin.id}`
	const close = () => alerts.dismissAlert(key)
	const shown = entries.slice(0, DIALOG_VERSIONS)
	const more = entries.length - shown.length

	const content = (
		<ScrollView
			style={{ maxHeight: Math.round(Dimensions.get('window').height * 0.5) }}
			// Inside the alert, the scroll view has to claim the drag or the dialog eats it.
			nestedScrollEnabled
		>
			<View style={{ gap: 12 }}>
				{shown.map(entry => (
					<View key={entry.version} style={{ gap: 4 }}>
						<Text variant="text-sm/semibold" color="text-default">
							{versionHeading(entry)}
						</Text>
						<Bullets changes={entry.changes} />
					</View>
				))}
				{more > 0 ? (
					<Text variant="text-sm/normal" color="text-muted">
						And {more} more version{more === 1 ? '' : 's'} in the full changelog.
					</Text>
				) : null}
			</View>
		</ScrollView>
	)

	try {
		alerts.openAlert(
			key,
			<AlertModal
				title={`What's new in ${plugin.name} ${plugin.current}`}
				extraContent={content}
				actions={
					<>
						<AlertActionButton
							text="Full changelog"
							variant="primary"
							onPress={() => {
								close()
								openChangelog()
							}}
						/>
						<AlertActionButton text="Close" variant="secondary" onPress={close} />
					</>
				}
			/>,
		)
	} catch (error) {
		reportError(`[${plugin.name}] couldn't show what's new:`, error)
	}
}

// ---------------------------------------------------------------------------------------------
// The page

function refreshSettingsUI() {
	const settings = modulesSettings as any
	if (typeof settings.refreshSettings === 'function') {
		settings.refreshSettings()
		return
	}
	settings.refreshSettingsNavigator?.()
	settings.refreshSettingsOverviewScreen?.()
}

function registerPage(plugin: Registered): () => void {
	const { registerSettingsItem, onSettingsModulesLoaded } = modulesSettings
	const route = changelogRoute(plugin.id)
	let unregister: (() => void) | undefined
	// Inside `onSettingsModulesLoaded`: registering before Discord's settings modules exist leaves
	// the page missing until a restart.
	const unsubscribe = onSettingsModulesLoaded(() => {
		unregister = registerSettingsItem(route, {
			parent: null,
			type: 'route',
			useTitle: () => 'Changelog',
			screen: { route, getComponent: () => ChangelogPage },
		} as any)
		refreshSettingsUI()
	})
	return () => {
		unsubscribe()
		unregister?.()
		unregister = undefined
		refreshSettingsUI()
	}
}

function ChangelogPage() {
	const { Page } = components as any
	const { ScrollView, View } = ReactNative
	const { Stack, Text, TableRowGroup, TableRow } = Design as any
	const bottom = useBottomPadding()
	const plugin = registered
	if (!plugin) return null

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: bottom }}>
				<Stack spacing={24}>
					<Text color="text-muted" variant="text-sm/normal">
						Every version of {plugin.name}, newest first. You have {plugin.current}.
					</Text>
					{plugin.entries.map(entry => {
						const tag = entry.version === plugin.current ? ' · installed' : ''
						return (
							<TableRowGroup
								key={entry.version}
								title={`${entry.version}${tag}${entry.date ? ` · ${entry.date}` : ''}`}
							>
								<TableRow
									label={entry.title ?? `Version ${entry.version}`}
									subLabel={
										<View style={{ marginTop: 6 }}>
											<Bullets changes={entry.changes} />
										</View>
									}
								/>
							</TableRowGroup>
						)
					})}
				</Stack>
			</ScrollView>
		</Page>
	)
}
