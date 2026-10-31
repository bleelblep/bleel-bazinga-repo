import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import { ReactNavigationNative } from '@valenced/externals/react-navigation'
import * as ReactNative from 'react-native'
import { TAGS } from '../../lib/getTag'
import { CUSTOM_ICON, ICONS } from '../../lib/icons'
import { selectedTagId } from '../../lib/selection'
import { getStorage, overrideFor, setOverride } from '../../lib/state'
import { useBottomPadding } from '../safeArea'
import TagIcon from '../TagIcon'

/** One row per icon, each drawn in the tag's own colour so the choice is the preview. */
export default function IconPicker() {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { Page } = components
	const { ScrollView, View } = ReactNative
	const { Stack, Text, TableRowGroup, TableRow } = Design
	const { useNavigation } = ReactNavigationNative

	const navigation = useNavigation() as { goBack: () => void }
	getStorage()?.use()

	const id = selectedTagId()
	const def = TAGS.find(tag => tag.id === id)
	const custom = overrideFor(id)
	const colour =
		custom.useCustomColor && custom.color
			? custom.color
			: (def?.defaultColor ?? '#5865F2')

	const choose = (iconId: string) => {
		setOverride(id, { icon: iconId })
		navigation.goBack()
	}

	const swatch = (iconId: string) => (
		<View
			style={{
				width: 28,
				height: 28,
				borderRadius: 6,
				backgroundColor: colour,
				alignItems: 'center',
				justifyContent: 'center',
			}}
		>
			<TagIcon
				icon={iconId}
				customSvg={custom.customSvg}
				color="#FFFFFF"
				size={16}
			/>
		</View>
	)

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Icons" hasIcons>
						{ICONS.map(icon => (
							<TableRow
								key={icon.id}
								label={icon.name}
								subLabel={custom.icon === icon.id ? 'Selected' : undefined}
								icon={icon.id === 'none' ? undefined : swatch(icon.id)}
								onPress={() => choose(icon.id)}
							/>
						))}
					</TableRowGroup>

					<TableRowGroup title="Your own" hasIcons>
						<TableRow
							label="Custom SVG"
							subLabel={
								custom.icon === CUSTOM_ICON
									? 'Selected — paste the markup on the tag page'
									: 'Paste your own markup on the tag page'
							}
							icon={custom.customSvg ? swatch(CUSTOM_ICON) : undefined}
							onPress={() => choose(CUSTOM_ICON)}
						/>
					</TableRowGroup>

					<Text color="text-muted" variant="text-sm/normal">
						Icons show on profiles and member lists. Message rows are drawn by
						Discord's native code, which takes text only, so there the icon
						appears as its plain character.
					</Text>
				</Stack>
			</ScrollView>
		</Page>
	)
}
