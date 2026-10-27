/*
 * Every switch, on its own route so the root page stays an index. The four switches are desktop's
 * (Vencord reviewDB settings.tsx). Copyright (c) 2023 Vendicated and contributors.
 * GPL-3.0-or-later; see ../../../NOTICE.md.
 */

import { rowIcon } from '../../../../../shared/ui/icon'
import { useBottomPadding } from '../../../../../shared/ui/safeArea'
import { setSetting, useSettings } from '../../lib/state'
import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as ReactNative from 'react-native'

export default function Options() {
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, TableRowGroup, TableSwitchRow } = Design as any
	const s = useSettings()

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Reviews list" hasIcons>
						<TableSwitchRow
							label="Show warning"
							subLabel="ReviewDB's reminder to be respectful, at the top of every list."
							icon={rowIcon('WarningIcon', 'CircleWarningIcon')}
							value={!!s.showWarning}
							onValueChange={(v: boolean) => setSetting('showWarning', v)}
						/>
						<TableSwitchRow
							label="Hide timestamps"
							subLabel="Leave the date off each review."
							icon={rowIcon('ClockIcon')}
							value={!!s.hideTimestamps}
							onValueChange={(v: boolean) => setSetting('hideTimestamps', v)}
						/>
						<TableSwitchRow
							label="Hide blocked users"
							subLabel="Skip reviews from people you've blocked on Discord."
							icon={rowIcon('DenyIcon')}
							value={!!s.hideBlockedUsers}
							onValueChange={(v: boolean) => setSetting('hideBlockedUsers', v)}
						/>
					</TableRowGroup>

					<TableRowGroup title="Notifications" hasIcons>
						<TableSwitchRow
							label="New reviews"
							subLabel="A toast at startup when someone has reviewed your profile. Needs you to be signed in."
							icon={rowIcon('BellIcon')}
							value={!!s.notifyReviews}
							onValueChange={(v: boolean) => setSetting('notifyReviews', v)}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
