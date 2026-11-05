import { DEFAULTS } from '../../defaults'
import { aiRouteOf, listInstalled, MY_PREFIX, onPage } from '../../lib/installed'
import { CORN, isCornhub, playIntro, toggleCornhub } from '../../lib/cornhub'
import { orphansOf, useInstalledIds } from '../../lib/present'
import { getStorage } from '../../lib/state'
import AiInfo from '../components/AiInfo'
import { CollapsibleGroup, SectionHeader, isCollapsed, toggleCollapsed } from '../components/Collapsible'
import { Grid, GRID_GAP, Tile } from '../components/Tiles'
import { rowIcon } from '../icon'
import { AI_SETTINGS_ROUTE, MANAGE_ROUTE, SETTINGS_ROUTE } from '../routes'
import { useBottomPadding } from '../safeArea'
import type { Entry } from '../../types'
import type { TileState } from '../components/Tiles'
import { ReactNavigationNative } from '@valenced/externals/react-navigation'
import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as react from '@valenced/react'
import * as ReactNative from 'react-native'

/** The most each page shows as tiles. Four is a 2×2 block: big, and still one glance. */
export const MAX_FAVOURITES = 4

/**
 * A hub page: favourites as a 2×2 block of tiles, everything else as a list under it. The Hub
 * shows every pinned plugin that does not use AI Core; the AI Hub shows the ones that do. Both
 * pages look and behave the same, and each keeps its own favourites.
 *
 * Opening a plugin is `navigate(plugin id)`, because Valenced registers every running plugin's
 * settings page as a route named after the plugin (revenge-bundle-next,
 * `src/plugins/start/settings.plugins/plugins.tsx`). That works with or without Developer Mode;
 * Developer Mode only adds the ability to tell a plugin that is not running from one that is.
 *
 * The settings icon in the header opens that page's own settings (Hub settings or AI Hub settings).
 */
export default function Hub() {
	return <HubPage ai={false} />
}

export function AiHub() {
	return <HubPage ai />
}

/** Starred favourites first, in their chosen order; with none starred, the first four by name. */
export function favouritesFor(entries: Entry[], ai: boolean): Entry[] {
	const own = entries.filter(entry => onPage(entry, ai))
	const starred = own.filter(entry => entry.favourite)
	const pool = starred.length ? starred : byName(own)
	return pool.slice(0, MAX_FAVOURITES)
}

export const byName = (list: Entry[]) =>
	[...list].sort((a, b) => a.name.localeCompare(b.name))

function HubPage({ ai }: { ai: boolean }) {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { React } = react
	const { Page } = components
	const { ScrollView, View, Pressable } = ReactNative
	const { Stack, Text, TableRowGroup, TableRow } = Design
	const { useNavigation } = ReactNavigationNative

	const navigation = useNavigation() as {
		navigate: (route: string) => void
		setOptions?: (options: Record<string, unknown>) => void
	}
	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const all: Entry[] = s.entries ?? []
	const entries = all.filter(entry => onPage(entry, ai))

	// A settings icon at the top right, opening this page's own settings: Hub settings from the Hub,
	// AI Hub settings from the AI Hub.
	React.useLayoutEffect(() => {
		navigation.setOptions?.({
			headerRight: () => (
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={ai ? 'AI Hub settings' : 'Hub settings'}
					hitSlop={12}
					onPress={() => navigation.navigate(ai ? AI_SETTINGS_ROUTE : SETTINGS_ROUTE)}
					// The Cornhub easter egg (lib/cornhub.ts): hold for a second and a half.
					onLongPress={toggleCornhub}
					delayLongPress={1500}
					style={({ pressed }: { pressed: boolean }) => ({
						paddingHorizontal: 12,
						opacity: pressed ? 0.5 : 1,
					})}
				>
					{rowIcon('SettingsIcon', 'WrenchIcon')}
				</Pressable>
			),
		})
	}, [])

	// Cornhub's intro, each time a Hub page opens.
	React.useEffect(() => {
		if (isCornhub()) playIntro()
	}, [])

	// Only known when Developer Mode is on; undefined means "cannot tell", not "missing".
	const installed = listInstalled()
	const byId = new Map(installed?.map(plugin => [plugin.id, plugin]))
	// Which ids exist at all, known without Developer Mode too (see lib/present.ts).
	const ids = useInstalledIds()
	const orphans = orphansOf(entries, ids)

	const stateOf = (entry: Entry): TileState => {
		if (ids && !ids.has(entry.id)) return { openable: false, note: 'Not installed' }
		if (!installed) return { openable: true }
		const plugin = byId.get(entry.id)
		if (!plugin) return { openable: false, note: 'Not installed' }
		if (!plugin.enabled) return { openable: false, note: 'Switched off' }
		if (!plugin.hasSettings)
			return { openable: false, note: 'No settings page' }
		return { openable: true }
	}
	// On the AI Hub, a plugin that named its AI screen opens there; everything else opens its settings.
	const open = (entry: Entry) => () =>
		navigation.navigate((ai && aiRouteOf(entry.id)) || entry.id)
	// Entries saved before descriptions were stored get theirs from the live list when possible.
	const descriptionOf = (entry: Entry) =>
		entry.description ?? byId.get(entry.id)?.description

	const favourites = favouritesFor(all, ai)
	const favIds = new Set(favourites.map(entry => entry.id))

	// Everything that is not a favourite, alphabetically. The Hub splits bleelblep's from
	// everyone else's; the AI Hub is one list, since AI Core's plugins are all bleelblep's so far.
	const isMine = (entry: Entry) => entry.id.startsWith(MY_PREFIX)
	const rest = byName(entries.filter(entry => !favIds.has(entry.id)))
	const sections: Array<{ title?: string; entries: Entry[] }> = ai
		? [{ entries: rest }]
		: [
				{ title: 'bleelblep plugins', entries: rest.filter(isMine) },
				{ title: 'Other plugins', entries: rest.filter(entry => !isMine(entry)) },
			]

	const listRow = (entry: Entry) => {
		const state = stateOf(entry)
		return (
			<TableRow
				key={entry.id}
				label={entry.name}
				subLabel={state.note}
				icon={rowIcon(entry.icon ?? 'PuzzlePieceIcon', 'PuzzlePieceIcon')}
				arrow={state.openable}
				disabled={!state.openable}
				onPress={state.openable ? open(entry) : undefined}
			/>
		)
	}

	// AI Core's info card: on the AI Hub it sits under Favourites, above the plugin list.
	const aiInfo =
		ai && s.aiInfo !== false ? (
			<AiInfo
				showBalance={s.aiInfoBalance !== false}
				showPlugins={s.aiInfoPlugins !== false}
				onOpen={route => navigation.navigate(route)}
			/>
		) : null

	if (s.cornhub) {
		return (
			<CornLayout
				ai={ai}
				favourites={favourites}
				sections={sections}
				stateOf={stateOf}
				open={open}
				descriptionOf={descriptionOf}
				orphanCount={orphans.length}
				onManage={() => navigation.navigate(MANAGE_ROUTE)}
			/>
		)
	}

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					{orphans.length ? (
						<TableRowGroup hasIcons>
							<TableRow
								label={
									orphans.length === 1
										? `${orphans[0]!.name} is no longer installed`
										: `${orphans.length} plugins are no longer installed`
								}
								subLabel="Tap to clean up the hub"
								icon={rowIcon('TrashIcon')}
								arrow
								onPress={() => navigation.navigate(MANAGE_ROUTE)}
							/>
						</TableRowGroup>
					) : null}
					{entries.length ? (
						<>
							<View style={{ gap: 8 }}>
								<Text color="text-muted" variant="text-sm/semibold">
									Favourites
								</Text>
								{/* A favourite with no partner on its row -- the only one, or the last of
								    an odd number -- spans the row as a wide card instead of half of it. */}
								<Grid columns={2}>
									{width =>
										favourites.map((entry, index) => {
											const wide =
												favourites.length % 2 === 1 &&
												index === favourites.length - 1
											return (
												<Tile
													key={entry.id}
													entry={entry}
													state={stateOf(entry)}
													onPress={open(entry)}
													width={wide ? width * 2 + GRID_GAP : width}
													wide={wide}
													description={descriptionOf(entry)}
												/>
											)
										})
									}
								</Grid>
							</View>
							{aiInfo}
							{sections
								.filter(section => section.entries.length)
								.map(section =>
									// Titled sections fold away; the AI Hub's single untitled list does not.
									section.title ? (
										<CollapsibleGroup
											key={section.title}
											id={`${ai ? 'ai' : 'hub'}:${section.title}`}
											title={section.title}
											count={section.entries.length}
										>
											{section.entries.map(listRow)}
										</CollapsibleGroup>
									) : (
										<TableRowGroup key="all" hasIcons>
											{section.entries.map(listRow)}
										</TableRowGroup>
									),
								)}
						</>
					) : (
						<>
							{aiInfo}
							<Text color="text-muted" variant="text-sm/normal">
								{ai
									? 'No AI plugins here yet. Choose them and they will appear here, one tap from their settings.'
									: 'Nothing here yet. Choose the plugins you open most and they will appear here, one tap from their settings.'}
							</Text>
							<TableRowGroup hasIcons>
								<TableRow
									label="Choose plugins"
									icon={rowIcon('PlusSmallIcon', 'PlusLargeIcon')}
									arrow
									onPress={() => navigation.navigate(MANAGE_ROUTE)}
								/>
							</TableRowGroup>
						</>
					)}
				</Stack>
			</ScrollView>
		</Page>
	)
}

/**
 * The Hub in Cornhub colours (`lib/cornhub.ts`): black page, charcoal cards, white and grey text,
 * orange accents, and the logo at the top. Same content and behaviour as the normal page; Discord's
 * own rows can't take custom colours, so the list is drawn here.
 */
function CornLayout({
	ai,
	favourites,
	sections,
	stateOf,
	open,
	descriptionOf,
	orphanCount,
	onManage,
}: {
	ai: boolean
	favourites: Entry[]
	sections: Array<{ title?: string; entries: Entry[] }>
	stateOf: (entry: Entry) => TileState
	open: (entry: Entry) => () => void
	descriptionOf: (entry: Entry) => string | undefined
	orphanCount: number
	onManage: () => void
}) {
	const { ScrollView, View, Pressable, Text: RNText } = ReactNative
	const bottom = useBottomPadding()
	const heading = { color: CORN.orange, fontSize: 13, fontWeight: '700' as const, letterSpacing: 0.5 }

	const row = (entry: Entry, last: boolean) => {
		const state = stateOf(entry)
		return (
			<Pressable
				key={entry.id}
				disabled={!state.openable}
				onPress={open(entry)}
				style={({ pressed }: { pressed: boolean }) => ({
					flexDirection: 'row',
					alignItems: 'center',
					paddingVertical: 12,
					paddingHorizontal: 14,
					gap: 12,
					opacity: state.openable ? (pressed ? 0.6 : 1) : 0.4,
					borderBottomWidth: last ? 0 : 1,
					borderBottomColor: CORN.background,
				})}
			>
				{rowIcon(entry.icon ?? 'PuzzlePieceIcon', 'PuzzlePieceIcon')}
				<View style={{ flex: 1 }}>
					<RNText style={{ color: CORN.white, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>
						{entry.name}
					</RNText>
					{state.note ? (
						<RNText style={{ color: CORN.grey, fontSize: 13 }} numberOfLines={1}>
							{state.note}
						</RNText>
					) : null}
				</View>
				{state.openable ? (
					<RNText style={{ color: CORN.orange, fontSize: 22, fontWeight: '700' }}>›</RNText>
				) : null}
			</Pressable>
		)
	}

	const group = (title: string | undefined, list: Entry[]) => {
		const key = `${ai ? 'ai' : 'hub'}:${title}`
		const collapsed = !!title && isCollapsed(key)
		return (
			<View key={title ?? 'all'} style={{ gap: 8 }}>
				{title ? (
					<SectionHeader
						title={title.toUpperCase()}
						count={list.length}
						collapsed={collapsed}
						onPress={() => toggleCollapsed(key)}
						color={CORN.orange}
					/>
				) : null}
				{collapsed ? null : (
					<View style={{ backgroundColor: CORN.card, borderRadius: 16, overflow: 'hidden' }}>
						{list.map((entry, index) => row(entry, index === list.length - 1))}
					</View>
				)}
			</View>
		)
	}

	const card = (title: string, action: string) => (
		<Pressable onPress={onManage} style={{ backgroundColor: CORN.card, borderRadius: 16, padding: 14 }}>
			<RNText style={{ color: CORN.white, fontSize: 15, fontWeight: '600' }}>{title}</RNText>
			<RNText style={{ color: CORN.orange, fontSize: 13 }}>{action}</RNText>
		</Pressable>
	)

	return (
		<ScrollView
			style={{ flex: 1, backgroundColor: CORN.background }}
			contentContainerStyle={{ padding: 16, paddingBottom: bottom + 16, gap: 24 }}
		>
			<View
				style={{
					flexDirection: 'row',
					alignItems: 'center',
					justifyContent: 'center',
					paddingVertical: 12,
				}}
			>
				<RNText style={{ color: CORN.white, fontSize: 34, fontWeight: '900', letterSpacing: -1 }}>
					{ai ? 'AI Corn' : 'Corn'}
				</RNText>
				<View
					style={{ backgroundColor: CORN.orange, borderRadius: 6, paddingHorizontal: 6, marginLeft: 4 }}
				>
					<RNText style={{ color: '#000000', fontSize: 34, fontWeight: '900', letterSpacing: -1 }}>
						hub
					</RNText>
				</View>
			</View>

			{orphanCount
				? card(
						orphanCount === 1
							? '1 plugin is no longer installed'
							: `${orphanCount} plugins are no longer installed`,
						'Tap to clean up',
					)
				: null}

			{favourites.length ? (
				<View style={{ gap: 8 }}>
					<RNText style={heading}>HOT RIGHT NOW</RNText>
					<Grid columns={2}>
						{width =>
							favourites.map((entry, index) => {
								const wide = favourites.length % 2 === 1 && index === favourites.length - 1
								return (
									<Tile
										key={entry.id}
										entry={entry}
										state={stateOf(entry)}
										onPress={open(entry)}
										width={wide ? width * 2 + GRID_GAP : width}
										wide={wide}
										description={descriptionOf(entry)}
										palette={CORN}
									/>
								)
							})
						}
					</Grid>
				</View>
			) : (
				card('Nothing here yet', 'Choose plugins')
			)}

			{sections
				.filter(section => section.entries.length)
				.map(section => group(section.title, section.entries))}

			<RNText style={{ color: CORN.grey, fontSize: 12, textAlign: 'center' }}>
				Hold the settings button to leave Cornhub.
			</RNText>
		</ScrollView>
	)
}
