import { useChangelog } from '../../../../shared/changelog'
import { Credit } from '../../../../shared/ui/credit'
import { rowIcon } from '../../../../shared/ui/icon'
import { useBottomPadding } from '../../../../shared/ui/safeArea'
import { hasColorPicker, openColorPicker } from '../lib/colorPicker'
import { ORIGINAL_ICON_URL, tintedIconUrl } from '../lib/newUserIcon'
import { DEFAULT_COLOR, update, useSettings, type BadgeStyle, type RoleIconMode } from '../state'
import ColorInput from './ColorInput'
import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as ReactNative from 'react-native'

/**
 * One page (settings design guide §2.1): the badge, its colour while Recoloured is picked, then
 * what happens when a role icon is already there. Each option's icon is its example (§3.11).
 */
export default function Settings() {
	useChangelog()
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { Page } = components
	const { ScrollView, Image, View } = ReactNative
	const { Stack, Text, TableRow, TableRowGroup, TableRadioGroup, TableRadioRow } = Design as any
	const s = useSettings()

	const icon = (uri: string) => <Image source={{ uri }} style={{ width: 20, height: 20 }} />
	const preview = (style: BadgeStyle) =>
		style === 'emoji' ? (
			<Text variant="text-md/normal">🌱</Text>
		) : (
			icon(style === 'icon' ? ORIGINAL_ICON_URL : tintedIconUrl(s.color))
		)

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRadioGroup
						key={`style-${s.style}`}
						title="Badge"
						description="Next to the name of someone who joined in the last week. Shows on messages loaded after the change."
						defaultValue={s.style}
						onChange={(style: BadgeStyle) => update({ style })}
					>
						<TableRadioRow label="Emoji" subLabel="🌱, like desktop" value="emoji" icon={preview('emoji')} />
						<TableRadioRow
							label="Discord's icon"
							subLabel="Discord's own new-member icon, in white"
							value="icon"
							icon={preview('icon')}
						/>
						<TableRadioRow
							label="Recoloured icon"
							subLabel="Discord's icon, in a colour you pick"
							value="recolor"
							icon={preview('recolor')}
						/>
					</TableRadioGroup>
					{s.style === 'recolor' ? (
						<TableRowGroup title="Colour" hasIcons>
							{hasColorPicker() ? (
								<TableRow
									label="Icon colour"
									subLabel={s.color}
									icon={preview('recolor')}
									trailing={
										<View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: s.color }} />
									}
									arrow
									onPress={() => openColorPicker(s.color, color => update({ color }))}
								/>
							) : (
								// Discord's picker wasn't found on this build: type it instead.
								<ColorInput
									label="Icon colour"
									value={s.color === DEFAULT_COLOR ? '' : s.color}
									placeholder={DEFAULT_COLOR}
									onChange={color => update({ color: color || DEFAULT_COLOR })}
								/>
							)}
							{s.color !== DEFAULT_COLOR ? (
								<TableRow
									label="Back to green"
									icon={rowIcon('RefreshIcon', 'ic_refresh')}
									onPress={() => update({ color: DEFAULT_COLOR })}
								/>
							) : null}
						</TableRowGroup>
					) : null}
					<TableRadioGroup
						key={`roleIcon-${s.roleIcon}`}
						title="If their role has an icon"
						description="A name has room for one icon."
						defaultValue={s.roleIcon}
						onChange={(roleIcon: RoleIconMode) => update({ roleIcon })}
					>
						<TableRadioRow
							label="Show the badge instead"
							subLabel="Their role icon comes back after their first week"
							value="replace"
							icon={preview(s.style)}
						/>
						<TableRadioRow
							label="Keep their role icon"
							subLabel="🌱 goes after their name instead, whatever badge is picked"
							value="keep"
							icon={<Text variant="text-md/normal">🌱</Text>}
						/>
					</TableRadioGroup>
					<Credit />
				</Stack>
			</ScrollView>
		</Page>
	)
}
