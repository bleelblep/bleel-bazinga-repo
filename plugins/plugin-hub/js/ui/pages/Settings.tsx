import { DEFAULTS } from '../../defaults'
import { aiCoreRunning, onPage } from '../../lib/installed'
import { getOwnVersion, getStorage } from '../../lib/state'
import { rowIcon } from '../icon'
import { AI_SETTINGS_ROUTE, MANAGE_ROUTE, placement } from '../routes'
import { aiCoreInfo } from '../components/AiInfo'
import { useBottomPadding } from '../safeArea'
import { byName, MAX_FAVOURITES } from './Hub'
import type { Entry } from '../../types'
import { useChangelog } from '../../../../../shared/changelog'
import { ReactNavigationNative } from '@valenced/externals/react-navigation'
import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as ReactNative from 'react-native'

/**
 * Settings for one hub page: its favourites, their order, and which of its plugins get a shortcut
 * row in Discord's settings. Choosing *which* plugins are in the hub is its own screen (Choose
 * plugins), linked from the top.
 *
 * Hub and AI Hub each have their own, reached from the settings icon at the top right of that page.
 * Hub settings is also the plugin's own settings page from Valenced's Plugins list, and links on to
 * AI Hub settings when there is one.
 */
export default function HubSettings() {
	// The changelog icon at the top right, and "What's new" once after an update.
	useChangelog()
	return <SettingsPage ai={false} />
}

export function AiHubSettings() {
	return <SettingsPage ai />
}

function SettingsPage({ ai }: { ai: boolean }) {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { Page } = components
	const { ScrollView, View, Pressable } = ReactNative
	const { Stack, Text, TableRowGroup, TableRow, TableSwitchRow } = Design
	const { useNavigation } = ReactNavigationNative

	const navigation = useNavigation() as { navigate: (route: string) => void }
	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const entries: Entry[] = s.entries ?? []
	const own = entries.filter(entry => onPage(entry, ai))
	// From Hub settings, a way across to AI Hub settings whenever the AI Hub exists.
	const linkToAi = !ai && (aiCoreRunning() || entries.some(entry => onPage(entry, true)))
	const label = ai ? 'AI Hub' : 'Hub'

	// Every write replaces the whole list -- see the note on `entries` in `types.ts`.
	const write = (next: Entry[]) => storage?.set({ entries: next })
	const patch = (id: string, change: Partial<Entry>) =>
		write(entries.map(entry => (entry.id === id ? { ...entry, ...change } : entry)))

	/**
	 * Moves a favourite one place up or down among the favourites of the same page.
	 *
	 * Favourites are drawn in the order they sit in `entries`, so this swaps the two entries'
	 * positions in the whole list. Everything else is sorted by name, so only favourite neighbours
	 * on the same page are swapped.
	 */
	const moveFavourite = (id: string, direction: -1 | 1) => {
		const index = entries.findIndex(entry => entry.id === id)
		if (index < 0) return
		let other = index + direction
		while (
			other >= 0 &&
			other < entries.length &&
			!(entries[other].favourite && onPage(entries[other], ai))
		)
			other += direction
		if (other < 0 || other >= entries.length) return
		const next = [...entries]
		;[next[index], next[other]] = [next[other], next[index]]
		write(next)
	}

	/** Up and down buttons for a row's trailing slot. An end that cannot move greys out. */
	const orderButtons = (id: string, first: boolean, last: boolean) => {
		// `ArrowSmallUpIcon`/`ArrowSmallDownIcon` are the matched pair that exist as components on
		// 348.1; `ChevronSmallUpIcon` does not (checked live with devtools `lookup_modules`).
		const button = (icon: string, label: string, disabled: boolean, onPress: () => void) => (
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={label}
				disabled={disabled}
				hitSlop={8}
				onPress={onPress}
				style={{ padding: 6, opacity: disabled ? 0.3 : 1 }}
			>
				{rowIcon(icon)}
			</Pressable>
		)
		return (
			<View style={{ flexDirection: 'row', alignItems: 'center' }}>
				{button('ArrowSmallUpIcon', 'Move up', first, () => moveFavourite(id, -1))}
				{button('ArrowSmallDownIcon', 'Move down', last, () => moveFavourite(id, 1))}
			</View>
		)
	}

	/** Stars for one page, alphabetically. Past the limit, unstarred ones lock rather than no-op. */
	const favouritesGroup = (ai: boolean, title: string) => {
		const own = byName(entries.filter(entry => onPage(entry, ai)))
		if (!own.length) return null
		const starredCount = own.filter(entry => entry.favourite).length
		return (
			<View style={{ gap: 8 }}>
				<TableRowGroup title={title} hasIcons>
					{own.map(entry => {
						const starred = !!entry.favourite
						const full = !starred && starredCount >= MAX_FAVOURITES
						return (
							<TableSwitchRow
								key={entry.id}
								label={entry.name}
								subLabel={full ? `Up to ${MAX_FAVOURITES} — unstar one first` : undefined}
								icon={rowIcon(entry.icon ?? 'PuzzlePieceIcon', 'PuzzlePieceIcon')}
								disabled={full}
								value={starred}
								onValueChange={value => patch(entry.id, { favourite: value })}
							/>
						)
					})}
				</TableRowGroup>
				{starredCount ? null : (
					<Text color="text-muted" variant="text-sm/normal">
						None starred, so the first four by name are shown as favourites.
					</Text>
				)}
			</View>
		)
	}

	/** Starred favourites of one page, in display order, with buttons to rearrange them. */
	const orderGroup = (ai: boolean, title: string) => {
		const starred = entries.filter(entry => entry.favourite && onPage(entry, ai))
		if (starred.length < 2) return null
		return (
			<TableRowGroup title={title} hasIcons>
				{starred.map((entry, index) => (
					<TableRow
						key={entry.id}
						label={entry.name}
						subLabel={`Tile ${index + 1}`}
						icon={rowIcon(entry.icon ?? 'PuzzlePieceIcon', 'PuzzlePieceIcon')}
						trailing={orderButtons(entry.id, index === 0, index === starred.length - 1)}
					/>
				))}
			</TableRowGroup>
		)
	}

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup hasIcons>
						<TableRow
							label="Choose plugins"
							subLabel={`${own.length} on the ${label} · add or remove plugins`}
							icon={rowIcon('PlusSmallIcon', 'PlusLargeIcon')}
							arrow
							onPress={() => navigation.navigate(MANAGE_ROUTE)}
						/>
						{linkToAi ? (
							<TableRow
								label="AI Hub settings"
								subLabel="Favourites and shortcuts for AI Core and its plugins"
								icon={rowIcon('MagicWandIcon')}
								arrow
								onPress={() => navigation.navigate(AI_SETTINGS_ROUTE)}
							/>
						) : null}
					</TableRowGroup>

					{ai && aiCoreInfo() ? (
						<TableRowGroup title="AI Core info" hasIcons>
							<TableSwitchRow
								label="Show AI Core info"
								subLabel="Provider, model and today's calls at the top of the AI Hub"
								icon={rowIcon('ServerIcon', 'MagicWandIcon')}
								value={s.aiInfo !== false}
								onValueChange={value => storage?.set({ aiInfo: value })}
							/>
							{s.aiInfo !== false ? (
								<>
									<TableSwitchRow
										label="Balance"
										subLabel="Money left on the key, for DeepSeek and OpenRouter. OpenAI and Anthropic don't report it."
										icon={rowIcon('CreditCardIcon')}
										value={s.aiInfoBalance !== false}
										onValueChange={value => storage?.set({ aiInfoBalance: value })}
									/>
									<TableSwitchRow
										label="Used most today"
										subLabel="Which plugins made today's calls"
										icon={rowIcon('AnalyticsIcon', 'ListBulletsIcon')}
										value={s.aiInfoPlugins !== false}
										onValueChange={value => storage?.set({ aiInfoPlugins: value })}
									/>
								</>
							) : null}
						</TableRowGroup>
					) : null}

					{favouritesGroup(ai, 'Favourites')}
					{orderGroup(ai, 'Favourite order')}

					{own.length ? (
						<View style={{ gap: 8 }}>
							<TableRowGroup title="Shortcuts in Discord settings" hasIcons>
								{byName(own).map(entry => (
									<TableSwitchRow
										key={entry.id}
										label={entry.name}
										icon={rowIcon(entry.icon ?? 'PuzzlePieceIcon', 'PuzzlePieceIcon')}
										value={!!entry.inSettings}
										onValueChange={value => patch(entry.id, { inSettings: value })}
									/>
								))}
							</TableRowGroup>
							<Text color="text-muted" variant="text-sm/normal">
								Each one switched on gets its own row in a Shortcuts section of
								Discord's settings, just under Plugin Hub, that opens its settings in
								one tap.
							</Text>
						</View>
					) : (
						<Text color="text-muted" variant="text-sm/normal">
							Nothing on the {label} yet. Choose plugins to add some.
						</Text>
					)}

					{ai ? null : (
						<TableRowGroup title="About">
							<TableRow
								label="Plugin Hub version"
								subLabel={getOwnVersion()}
							/>
						</TableRowGroup>
					)}

					<Text color="text-muted" variant="text-sm/normal">
						The Hub rows are {placement.where}. AI Hub only appears while AI Core is
						running.
					</Text>
				</Stack>
			</ScrollView>
		</Page>
	)
}
