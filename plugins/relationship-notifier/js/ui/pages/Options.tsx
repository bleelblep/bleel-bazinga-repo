import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as ReactNative from 'react-native'
import { rowIcon } from '../../../../../shared/ui/icon'
import { useBottomPadding } from '../../../../../shared/ui/safeArea'
import { DEFAULTS } from '../../defaults'
import { getStorage } from '../../lib/state'
import type { RelationshipNotifierStorage } from '../../types'

export default function Options() {
	// Read per-render, never at module scope (coding rule 1).
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, TableRowGroup, TableSwitchRow } = Design as any

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const set = (patch: Partial<RelationshipNotifierStorage>) =>
		storage?.set(patch)

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Watch for" hasIcons>
						<TableSwitchRow
							label="Friends"
							subLabel="Someone is no longer in your friends list."
							icon={rowIcon('UserMinusIcon')}
							value={!!s.watchFriends}
							onValueChange={(v: boolean) => set({ watchFriends: v })}
						/>
						<TableSwitchRow
							label="New friends"
							subLabel="Someone accepts your request, or you accept theirs."
							icon={rowIcon('HeartIcon')}
							value={!!s.watchNewFriends}
							onValueChange={(v: boolean) => set({ watchNewFriends: v })}
						/>
						<TableSwitchRow
							label="Friend requests"
							subLabel="A request to you is cancelled, or yours is turned down."
							icon={rowIcon('UserPlusIcon')}
							value={!!s.watchRequests}
							onValueChange={(v: boolean) => set({ watchRequests: v })}
						/>
						<TableSwitchRow
							label="Name changes"
							subLabel="A friend changes their display name or username."
							icon={rowIcon('PencilIcon')}
							value={!!s.watchNames}
							onValueChange={(v: boolean) => set({ watchNames: v })}
						/>
						<TableSwitchRow
							label="Avatar changes"
							subLabel="A friend changes their avatar. The old and new pictures are saved on this phone."
							icon={rowIcon('ImageIcon', 'UserCircleIcon')}
							value={!!s.watchAvatars}
							onValueChange={(v: boolean) => set({ watchAvatars: v })}
						/>
						<TableSwitchRow
							label="Servers"
							subLabel="You're no longer in a server."
							icon={rowIcon('ServerIcon')}
							value={!!s.watchGuilds}
							onValueChange={(v: boolean) => set({ watchGuilds: v })}
						/>
						<TableSwitchRow
							label="Group DMs"
							subLabel="You're no longer in a group DM."
							icon={rowIcon('GroupIcon')}
							value={!!s.watchGroupDms}
							onValueChange={(v: boolean) => set({ watchGroupDms: v })}
						/>
					</TableRowGroup>

					<TableRowGroup title="History and toasts" hasIcons>
						<TableSwitchRow
							label="Keep your own changes"
							subLabel="Things you remove or leave on this phone are kept, marked as yours. They never pop up."
							icon={rowIcon('UserCircleIcon')}
							value={!!s.includeMine}
							onValueChange={(v: boolean) => set({ includeMine: v })}
						/>
						<TableSwitchRow
							label="Toast when it happens"
							subLabel="Changes while Discord was closed show as one toast when it connects."
							icon={rowIcon('BellIcon')}
							value={!!s.toastOnEvent}
							onValueChange={(v: boolean) => set({ toastOnEvent: v })}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
