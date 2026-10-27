/*
 * Ported from Vencord's reviewDB plugin (src/plugins/reviewDB/components/BlockedUserModal.tsx).
 * Copyright (c) 2023 Vendicated and contributors. GPL-3.0-or-later; see ../../NOTICE.md.
 *
 * ReviewDB's own block list (who can't review your profile), not Discord's. A settings-stack
 * route (ui/routes.tsx), so the header is Discord's.
 */

import { useBottomPadding } from '../../../../shared/ui/safeArea'
import { fetchBlocks, unblockUser } from '../lib/api'
import { defaultAvatar, TAG } from '../lib/discord'
import type { ReviewDBUser } from '../lib/entities'
import { getToken } from '../lib/state'
import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as React from 'react'
import * as ReactNative from 'react-native'
import { reportError } from '../../../../shared/report'

export default function BlockedUsers() {
	const { Page } = components
	const { ScrollView, Image, ActivityIndicator } = ReactNative
	const { Stack, Text, TableRowGroup, TableRow, Button } = Design as any
	const bottom = useBottomPadding()
	const [blocks, setBlocks] = React.useState<ReviewDBUser[] | null>(null)
	const [error, setError] = React.useState<string | null>(null)
	const [busy, setBusy] = React.useState(false)
	const signedIn = !!getToken()

	React.useEffect(() => {
		if (!signedIn) return
		fetchBlocks()
			.then(setBlocks)
			.catch((e: any) => {
				reportError(`${TAG} failed to fetch blocks:`, e)
				setError(String(e?.message ?? e))
			})
	}, [])

	let body: any
	if (!signedIn) body = <Text color="text-muted">You are not logged into ReviewDB!</Text>
	else if (error) body = <Text color="text-muted">Failed to fetch blocks: {error}</Text>
	else if (!blocks) body = <ActivityIndicator />
	else if (!blocks.length) body = <Text color="text-muted">No blocked users.</Text>
	else
		body = (
			<TableRowGroup hasIcons>
				{blocks.map(user => (
					<TableRow
						key={user.discordID}
						label={user.username}
						icon={
							<Image
								source={{ uri: user.profilePhoto || defaultAvatar(user.discordID) }}
								style={{ width: 32, height: 32, borderRadius: 16 }}
							/>
						}
						trailing={
							<Button
								size="sm"
								variant="secondary"
								text="Unblock"
								disabled={busy}
								onPress={async () => {
									setBusy(true)
									try {
										if (await unblockUser(user.discordID))
											setBlocks((list: ReviewDBUser[] | null) =>
												(list ?? []).filter(u => u.discordID !== user.discordID),
											)
									} finally {
										setBusy(false)
									}
								}}
							/>
						}
					/>
				))}
			</TableRowGroup>
		)

	return (
		<Page>
			<ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottom }}>
				<Stack spacing={12}>
					<Text variant="text-sm/medium" color="text-muted">
						People on this list can't leave reviews on your profile.
					</Text>
					{body}
				</Stack>
			</ScrollView>
		</Page>
	)
}
