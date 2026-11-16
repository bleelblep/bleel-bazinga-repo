import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import { ReactNavigationNative } from '@valenced/externals/react-navigation'
import * as ReactNative from 'react-native'
import { confirmDestructive } from '../../../../../shared/ui/confirm'
import { dangerIcon } from '../../../../../shared/ui/icon'
import { useBottomPadding } from '../../../../../shared/ui/safeArea'
import { DEFAULTS } from '../../defaults'
import { forget } from '../../lib/avatars'
import { getStorage } from '../../lib/state'
import { ago, detail } from '../../lib/text'
import Avatar from '../components/Avatar'
import { AVATAR_ROUTE } from '../routes'
import type { EventKind, RelationshipEvent } from '../../types'
import type { AvatarKind } from '../components/Avatar'

const HEADING: Record<EventKind, string> = {
	friend: 'Friends',
	incoming: 'Requests to you',
	outgoing: 'Your requests',
	name: 'Name changes',
	newfriend: 'New friends',
	avatar: 'Avatar changes',
	guild: 'Servers',
	groupdm: 'Group DMs',
}

const ORDER: EventKind[] = [
	'friend',
	'newfriend',
	'incoming',
	'outgoing',
	'name',
	'avatar',
	'guild',
	'groupdm',
]

function avatarKind(kind: EventKind): AvatarKind {
	return kind === 'guild' ? 'guild' : kind === 'groupdm' ? 'group' : 'user'
}

function label(e: RelationshipEvent): string {
	return e.kind === 'name' && e.field === 'username' ? `@${e.name}` : e.name
}

export default function History() {
	// Read per-render, never at module scope (coding rule 1).
	const { Page } = components
	const { ScrollView, View } = ReactNative
	const { Stack, TableRowGroup, TableRow } = Design as any
	const { useNavigation } = ReactNavigationNative
	const navigation = useNavigation() as {
		navigate: (route: string, params?: object) => void
	}

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const entries = s.log ?? []
	const bottomPadding = useBottomPadding()

	if (!entries.length) {
		return (
			<Page>
				<ScrollView contentContainerStyle={{ paddingBottom: bottomPadding }}>
					<TableRowGroup title="Nothing yet">
						<TableRow
							label="No changes recorded"
							subLabel="Lost and new friends, requests, servers, group DMs, and friends' new names and avatars appear here."
						/>
					</TableRowGroup>
				</ScrollView>
			</Page>
		)
	}

	// Grouped by kind: losing a friend and leaving a server are different things, and mixing
	// them by time makes the list harder to read. Newest first inside each group.
	const grouped = ORDER.map(
		kind => [kind, entries.filter(e => e.kind === kind)] as const,
	).filter(([, items]) => items.length)

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: bottomPadding }}>
				<Stack spacing={24}>
					{grouped.map(([kind, items]) => (
						<TableRowGroup
							key={kind}
							title={`${HEADING[kind]} (${items.length})`}
						>
							{items.map(e => (
								<TableRow
									key={e.id}
									icon={
										<Avatar
											kind={avatarKind(e.kind)}
											id={e.targetId}
											hash={e.iconHash}
											name={e.name}
											file={e.kind === 'avatar' ? e.newFile : undefined}
											fixed={e.kind === 'avatar'}
										/>
									}
									// An avatar change shows the old picture at the end, and opens both large.
									{...(e.kind === 'avatar'
										? {
												trailing: (
													<View style={{ opacity: 0.7 }}>
														<Avatar
															kind="user"
															id={e.targetId}
															hash={e.oldIconHash}
															file={e.oldFile}
															name={e.name}
															size={28}
															fixed
														/>
													</View>
												),
												arrow: true,
												onPress: () =>
													navigation.navigate(AVATAR_ROUTE, { id: e.id }),
											}
										: {})}
									label={label(e)}
									subLabel={[
										detail(e),
										e.away ? 'while you were away' : undefined,
										ago(e.at),
									]
										.filter(Boolean)
										.join(' · ')}
								/>
							))}
						</TableRowGroup>
					))}

					<TableRowGroup title="Manage" hasIcons>
						<TableRow
							variant="danger"
							label="Clear history"
							subLabel={`Removes all ${entries.length} entries. Your saved friends and servers stay.`}
							icon={dangerIcon('TrashIcon', 'ic_trash')}
							onPress={() =>
								confirmDestructive({
									title: 'Clear history?',
									body: `All ${entries.length} entries will be removed.`,
									action: 'Clear',
									onConfirm: () => {
										forget(entries.flatMap(e => [e.oldFile, e.newFile]))
										storage?.set({ log: [] })
									},
								})
							}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
