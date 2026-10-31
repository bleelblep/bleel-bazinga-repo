import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import { ReactNavigationNative } from '@valenced/externals/react-navigation'
import * as ReactNative from 'react-native'
import { useChangelog } from '../../../../../shared/changelog'
import { rowIcon } from '../../../../../shared/ui/icon'
import { useBottomPadding } from '../../../../../shared/ui/safeArea'
import { entries } from '../../lib/filter'
import { update, useSettings } from '../../lib/state'
import { BADGE_COLOR_ROUTE, PEOPLE_ROUTE, SOURCES_ROUTE } from '../routes'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { PronounsStorage } from '../../lib/state'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: PronounsStorage }>
>

export default function Settings(_props: Props) {
	useChangelog()
	const s = useSettings()
	const { Page } = components
	const { ScrollView, View } = ReactNative
	const { Stack, Card, Text, TableRowGroup, TableRow, TableSwitchRow } = Design
	const navigation = ReactNavigationNative.useNavigation() as {
		navigate(route: string): void
	}
	const people =
		s.filterMode === 'only'
			? `Only people you pick (${entries('showList').length})`
			: s.filterMode === 'except'
				? `Everyone except hidden people (${entries('hideList').length})`
				: 'Everyone'
	const sources = !s.pronounDbEnabled
		? 'Discord profiles only'
		: s.discordFirst
			? 'Discord first, then PronounDB'
			: 'PronounDB first, then Discord'
	const colours =
		s.colorMode === 'global'
			? 'One colour for everyone'
			: 'Per-person colours with a default'
	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<Card variant="secondary" border="none">
						<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
							<Text color="text-default" variant="text-md/semibold">
								Pronouns beside names
							</Text>
							<Text
								color="text-muted"
								variant="text-sm/normal"
								style={{ marginTop: 8 }}
							>
								Show pronouns on messages, choose whose badges appear, and set
								their colours.
							</Text>
						</View>
					</Card>
					<Text color="text-muted" variant="text-sm/normal">
						Your overrides and badge colours only change what you see.
					</Text>
					<TableRowGroup hasIcons>
						<TableSwitchRow
							label="Show in chat"
							subLabel="Show a pronoun badge beside message authors."
							icon={rowIcon('UserIcon', 'ic_profile_24px')}
							value={s.showInChat}
							onValueChange={showInChat => update({ showInChat })}
						/>
					</TableRowGroup>
					<TableRowGroup title="Settings" hasIcons>
						<TableRow
							label="People"
							subLabel={people}
							icon={rowIcon('GroupIcon', 'ic_profile_24px')}
							arrow
							onPress={() => navigation.navigate(PEOPLE_ROUTE)}
						/>
						<TableRow
							label="Pronoun sources"
							subLabel={sources}
							icon={rowIcon('GlobeEarthIcon', 'ic_link')}
							arrow
							onPress={() => navigation.navigate(SOURCES_ROUTE)}
						/>
						<TableRow
							label="Badge colour"
							subLabel={
								s.useRoleColor ? `Role colour first · ${colours}` : colours
							}
							icon={rowIcon('PaintPaletteIcon', 'ic_theme_24px')}
							arrow
							onPress={() => navigation.navigate(BADGE_COLOR_ROUTE)}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
