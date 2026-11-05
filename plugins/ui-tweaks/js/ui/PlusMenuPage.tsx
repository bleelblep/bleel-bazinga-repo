import { rowIcon } from '../../../../shared/ui/icon'
import { useBottomPadding } from '../../../../shared/ui/safeArea'
import { plusMenuLabels } from '../patches/plusMenu'
import { settings, update, useSettings } from '../lib/state'
import { nulls } from './SheetPage'
import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as ReactNative from 'react-native'

/** The items of the menu you get by long-pressing + in the message box. */
export default function PlusMenuPage() {
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, TableRowGroup, TableRow, TableSwitchRow } = Design as any
	const s = useSettings()
	const labels = plusMenuLabels(s.plusMenuLayout)

	const setItem = (label: string, shown: boolean) =>
		update({ hiddenPlusMenuItems: { ...settings().hiddenPlusMenuItems, [label]: shown ? null : true } })

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup
						title="Items"
						description="Turn something off to hide it. Changes show the next time you long-press +."
					>
						{labels.length === 0 ? (
							<TableRow label="Nothing seen yet" subLabel="Long-press + in the message box once and its items show up here." />
						) : (
							labels.map(label => (
								<TableSwitchRow
									key={label}
									label={label}
									value={s.hiddenPlusMenuItems?.[label] !== true}
									onValueChange={(shown: boolean) => setItem(label, shown)}
								/>
							))
						)}
					</TableRowGroup>

					<TableRowGroup>
						<TableRow
							label="Show everything again"
							icon={rowIcon('RetryIcon', 'RefreshIcon')}
							onPress={() => update({ hiddenPlusMenuItems: nulls(settings().hiddenPlusMenuItems) })}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
