import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import { ReactNavigationNative } from '@valenced/externals/react-navigation'
import * as ReactNative from 'react-native'
import { useChangelog } from '../../../../../shared/changelog'
import { Credit } from '../../../../../shared/ui/credit'
import { rowIcon } from '../../../../../shared/ui/icon'
import { useBottomPadding } from '../../../../../shared/ui/safeArea'
import { DEFAULTS } from '../../defaults'
import { HISTORY_ROUTE, OPTIONS_ROUTE } from '../routes'
import type { RelationshipNotifierStorage } from '../../types'

/**
 * The index page (docs/settings-design-guide.md §2.2): a neutral note on what it can't tell, the
 * scope line, the history in its own group, then the settings row and the credit.
 */
export default function Settings({
	api,
}: {
	api: ValencedPluginStartApi<RelationshipNotifierStorage>
}) {
	useChangelog()
	// Read per-render, never at module scope (coding rule 1).
	const { Page } = components
	const { ScrollView, View } = ReactNative
	const { Stack, Text, Card, TableRowGroup, TableRow } = Design as any
	const { useNavigation } = ReactNavigationNative

	const navigation = useNavigation() as { navigate: (route: string) => void }
	const s = { ...DEFAULTS, ...(api.jsonStorage.use() ?? {}) }
	const count = s.log?.length ?? 0

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<Card variant="secondary" border="none">
						<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
							<Text variant="text-md/semibold" style={{ textAlign: 'center' }}>
								What it can't tell
							</Text>
							<Text
								color="text-muted"
								variant="text-sm/normal"
								style={{ marginTop: 8 }}
							>
								Discord doesn't say why. Being blocked looks the same as being
								unfriended, and being kicked or banned looks the same as a
								server being deleted. What you do on this phone is marked "by
								you"; what you do on another device isn't.
							</Text>
						</View>
					</Card>

					<Text color="text-muted" variant="text-sm/normal">
						It keeps the names and pictures of your friends, requests, servers
						and group DMs on this phone to compare against, and never sends them
						anywhere. Changes while Discord was closed show up when it next
						connects.
					</Text>

					<TableRowGroup hasIcons>
						<TableRow
							label="History"
							subLabel={count ? `${count} recorded` : 'Nothing yet'}
							icon={rowIcon('ClockIcon')}
							arrow
							onPress={() => navigation.navigate(HISTORY_ROUTE)}
						/>
					</TableRowGroup>

					<TableRowGroup hasIcons>
						<TableRow
							label="What to watch"
							subLabel="Friends, requests, names, avatars, servers, group DMs, toasts"
							icon={rowIcon('SettingsIcon', 'ic_settings')}
							arrow
							onPress={() => navigation.navigate(OPTIONS_ROUTE)}
						/>
					</TableRowGroup>

					<Credit />
				</Stack>
			</ScrollView>
		</Page>
	)
}
