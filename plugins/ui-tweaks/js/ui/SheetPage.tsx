import { rowIcon } from '../../../../shared/ui/icon'
import { useBottomPadding } from '../../../../shared/ui/safeArea'
import { arrange, sheetLayout, sheetOrder } from '../lib/layout'
import { settings, update, useSettings } from '../lib/state'
import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as ReactNative from 'react-native'

/** A section is named after its first row, e.g. "Copy Text section". */
function sectionName(labels: string[]): string {
	return labels.length ? `${labels[0]} section` : 'Section'
}

export default function SheetPage() {
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, TableRowGroup, TableRow, TableSwitchRow } = Design as any
	const s = useSettings()
	const layout = sheetLayout(s.sheetLayout)
	const order = sheetOrder(s.sheetOrder)

	const setRow = (label: string, shown: boolean) =>
		update({ hiddenSheetRows: { ...settings().hiddenSheetRows, [label]: shown ? null : true } })
	const setGroup = (id: number | string, shown: boolean) =>
		update({ hiddenSheetGroups: { ...settings().hiddenSheetGroups, [String(id)]: shown ? null : true } })
	const plugins = Object.entries(layout.plugins)

	/** One section: a "Show" switch for the whole of it, then its rows while it's shown. */
	const section = (id: number | string, title: string, labels: string[]) => {
		const groupShown = s.hiddenSheetGroups?.[String(id)] !== true
		// In the order the menu shows them (rows are moved in the menu's Edit mode).
		labels = arrange(labels, label => label, order.rows)
		return (
			<TableRowGroup key={id} title={title}>
				<TableSwitchRow
					label="Show this section"
					subLabel={labels.join(', ')}
					value={groupShown}
					onValueChange={(shown: boolean) => setGroup(id, shown)}
				/>
				{groupShown &&
					labels.map(label => (
						<TableSwitchRow
							key={label}
							label={label}
							value={s.hiddenSheetRows?.[label] !== true}
							onValueChange={(shown: boolean) => setRow(label, shown)}
						/>
					))}
			</TableRowGroup>
		)
	}

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="In the menu" hasIcons>
						<TableSwitchRow
							label="Edit menu row"
							subLabel="An Edit menu row at the bottom of the long-press menu: tap rows to hide or show them, hold and drag to move them."
							icon={rowIcon('PencilIcon', 'CompassIcon')}
							value={s.sheetEditRow}
							onValueChange={(sheetEditRow: boolean) => update({ sheetEditRow })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Top of the menu" description="Turn something off to hide it. Changes show the next time you long-press." hasIcons>
						<TableSwitchRow
							label="Emoji row"
							subLabel="The quick reactions above the rows."
							icon={rowIcon('ReactionIcon', 'CompassIcon')}
							value={!s.hideSheetEmojiRow}
							onValueChange={(shown: boolean) => update({ hideSheetEmojiRow: !shown })}
						/>
					</TableRowGroup>

					{layout.sections.length === 0 && plugins.length === 0 ? (
						<TableRowGroup title="Rows">
							<TableRow label="Nothing seen yet" subLabel="Long-press any message once and its rows show up here." />
						</TableRowGroup>
					) : (
						layout.sections.map((labels, index) => section(index + 1, sectionName(labels), labels))
					)}

					{plugins.map(([key, labels]) => section(key, `Added by a plugin: ${key.replace(/^plugin:/, '')}`, labels))}

					<TableRowGroup>
						<TableRow
							label="Back to Discord's order"
							subLabel="Undo moving rows in the menu."
							icon={rowIcon('RetryIcon', 'RefreshIcon')}
							disabled={!s.sheetOrder}
							onPress={() => update({ sheetOrder: '' })}
						/>
						<TableRow
							label="Show everything again"
							icon={rowIcon('RetryIcon', 'RefreshIcon')}
							onPress={() => update({ hideSheetEmojiRow: false, hiddenSheetRows: nulls(settings().hiddenSheetRows), hiddenSheetGroups: nulls(settings().hiddenSheetGroups) })}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}

/** Every key tombstoned: jsonStorage merges, so clearing a map means nulling its keys. */
export function nulls(map: Record<string, true | null> | undefined): Record<string, null> {
	return Object.fromEntries(Object.keys(map ?? {}).map(key => [key, null]))
}
