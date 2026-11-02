import * as assets from '@valenced/assets'
import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import * as ReactNative from 'react-native'
import { SORT_MODES, setSortMode } from '../../lib/ruleSort'
import type { RuleKind } from '../../lib/ruleStore'
import type { SortMode } from '../../lib/ruleSort'

/** `valenced.*` can be mid-load or missing a key; a miss costs that part, not the screen. */
function safe<T>(read: () => T): T | undefined {
	try {
		return read()
	} catch {
		return undefined
	}
}

/**
 * The search box and sort button over a rule list. The box is bare, as a search box at the top of a
 * list should be (settings design guide §3.6); the sort button opens Discord's own context menu,
 * with a tick on the current choice.
 */
export default function RuleSearch({
	kind,
	search,
	onSearch,
	mode,
}: {
	kind: RuleKind
	search: string
	onSearch: (value: string) => void
	mode: SortMode
}) {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { View } = ReactNative
	const { ContextMenu, IconButton, TextInput } = Design as any
	const SearchInput = safe(() => (components as any).SearchInput) ?? TextInput
	const tick = safe(() => lookupGeneratedIconComponent('CheckmarkLargeIcon'))
	const sortIcon = safe(
		() =>
			assets.getAssetIdByName('FiltersHorizontalIcon') ??
			assets.getAssetIdByName('ic_filter'),
	)

	const items = SORT_MODES.map(option => ({
		label: option.label,
		IconComponent: option.value === mode ? tick : undefined,
		action: () => setSortMode(kind, option.value),
	}))

	return (
		<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
			<View style={{ flex: 1 }}>
				<SearchInput
					placeholder={kind === 'links' ? 'Search link rules…' : 'Search rules…'}
					value={search}
					onChange={onSearch}
					isClearable
					size="md"
					returnKeyType="search"
				/>
			</View>
			{ContextMenu && IconButton && sortIcon ? (
				<ContextMenu title="Sort rules" items={items} align="below">
					{(props: object) => (
						<IconButton
							{...props}
							icon={sortIcon}
							accessibilityLabel="Sort rules"
							size="md"
							variant="secondary"
						/>
					)}
				</ContextMenu>
			) : null}
		</View>
	)
}
