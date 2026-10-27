/*
 * The root page, on the shared base layout (docs/plugin-design-language.md 2.2): a neutral notice
 * card (reviews are public, and ReviewDB isn't Discord), a muted scope line, the account in its
 * own group, then the index. Settings from Vencord's reviewDB settings.tsx.
 * Copyright (c) 2023 Vendicated and contributors. GPL-3.0-or-later; see ../../../NOTICE.md.
 */

import { dangerIcon, rowIcon } from '../../../../../shared/ui/icon'
import { useBottomPadding } from '../../../../../shared/ui/safeArea'
import { authorize } from '../../lib/auth'
import { confirm } from '../../lib/discord'
import { currentUserId, logOut, useSettings } from '../../lib/state'
import { ABOUT_ROUTE, BLOCKED_ROUTE, OPTIONS_ROUTE } from '../routes'
import { useChangelog } from '../../../../../shared/changelog'
import { ReactNavigationNative } from '@valenced/externals/react-navigation'
import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as ReactNative from 'react-native'

export default function Settings() {
	// The changelog icon at the top right, and "What's new" once after an update.
	useChangelog()
	const { Page } = components
	const { ScrollView, View } = ReactNative
	const { Stack, Text, Card, TableRowGroup, TableRow } = Design as any
	const { useNavigation } = ReactNavigationNative
	const navigation = useNavigation() as { navigate: (route: string) => void }

	const s = useSettings()
	const me = currentUserId()
	const auth = (me && s.auth?.[me]) || {}
	const signedIn = !!auth.token

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<Card variant="secondary">
						<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
							<Text variant="text-md/semibold" style={{ textAlign: 'center' }}>
								Reviews are public
							</Text>
							<Text color="text-muted" variant="text-sm/normal" style={{ marginTop: 8 }}>
								ReviewDB is a community service, not part of Discord. Anything you write can be read by
								everyone who uses it, on any client, and reviews are moderated by ReviewDB, not Discord.
							</Text>
						</View>
					</Card>

					<Text color="text-muted" variant="text-sm/normal">
						Reviews show on the main tab of a profile, and under Server Reviews when you long-press a
						server. Reading them doesn't need an account.
					</Text>

					<TableRowGroup title="Account" hasIcons>
						{signedIn ? (
							<>
								<TableRow
									label="Signed in"
									subLabel={
										auth.user?.username
											? `As ${auth.user.username}. You can write reviews, vote, report and block.`
											: 'You can write reviews, vote, report and block.'
									}
									icon={rowIcon('CircleCheckIcon')}
								/>
								<TableRow
									label="Log out"
									subLabel="ReviewDB stays in Discord's Authorized Apps until you remove it there."
									variant="danger"
									icon={dangerIcon('DoorExitIcon')}
									onPress={() =>
										confirm({
											title: 'Log out of ReviewDB?',
											body: "You'll need to authorize again to write reviews or vote.",
											confirmText: 'Log out',
											destructive: true,
											onConfirm: logOut,
										})
									}
								/>
							</>
						) : (
							<TableRow
								label="Authorize with ReviewDB"
								subLabel="Needed to write reviews, vote, report and block. Shares your username and avatar."
								icon={rowIcon('KeyIcon', 'LockIcon')}
								arrow
								onPress={() => authorize()}
							/>
						)}
					</TableRowGroup>

					<TableRowGroup hasIcons>
						<TableRow
							label="Options"
							subLabel="Warning, timestamps, blocked users, notifications"
							icon={rowIcon('SettingsIcon', 'ic_settings')}
							arrow
							onPress={() => navigation.navigate(OPTIONS_ROUTE)}
						/>
						<TableRow
							label="Blocked users"
							subLabel="People who can't review your profile"
							icon={rowIcon('DenyIcon')}
							arrow
							onPress={() => navigation.navigate(BLOCKED_ROUTE)}
						/>
						<TableRow
							label="About"
							subLabel="ReviewDB's website and support server, licence"
							icon={rowIcon('CircleInformationIcon')}
							arrow
							onPress={() => navigation.navigate(ABOUT_ROUTE)}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
