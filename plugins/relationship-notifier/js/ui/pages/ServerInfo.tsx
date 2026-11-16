import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as clipboardModule from '@valenced/externals/react-native-clipboard'
import { ReactNavigationNative } from '@valenced/externals/react-navigation'
import * as ReactNative from 'react-native'
import { showToast } from '../../../../../shared/toast'
import { useBottomPadding } from '../../../../../shared/ui/safeArea'
import { DEFAULTS } from '../../defaults'
import { getStorage } from '../../lib/state'
import { ago, detail } from '../../lib/text'
import Avatar from '../components/Avatar'

function copy(text: string) {
	try {
		// Valenced's bundled clipboard first: React Native's own Clipboard left core long ago.
		const Clipboard =
			(clipboardModule as any)?.Clipboard ?? (ReactNative as any)?.Clipboard
		if (typeof Clipboard?.setString !== 'function') throw new Error('no clipboard')
		Clipboard.setString(text)
		showToast('Copied', 'RelationshipNotifierCopy')
	} catch {
		showToast("Couldn't copy", 'RelationshipNotifierCopy')
	}
}

/** A server you're no longer in: its ID, a way back in if one was known, and its owner. */
export default function ServerInfo() {
	// Read per-render, never at module scope (coding rule 1).
	const { Page } = components
	const { ScrollView, View } = ReactNative
	const { Stack, Text, TableRowGroup, TableRow } = Design as any
	const { useRoute } = ReactNavigationNative as any

	const route = useRoute?.()
	const id: string | undefined = route?.params?.id
	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const e = s.log?.find(entry => entry.id === id)
	const bottomPadding = useBottomPadding()

	if (!e) {
		return (
			<Page>
				<Text
					color="text-muted"
					variant="text-md/normal"
					style={{ textAlign: 'center', padding: 24 }}
				>
					This change is no longer in the history.
				</Text>
			</Page>
		)
	}

	const link = e.vanity ?? e.invite
	const linkUrl = link ? `https://discord.gg/${link}` : undefined

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: bottomPadding }}>
				<Stack spacing={24}>
					<View style={{ alignItems: 'center', gap: 8, marginTop: 16 }}>
						<Avatar kind="guild" id={e.targetId} hash={e.iconHash} name={e.name} size={64} />
						<Text variant="heading-lg/bold" style={{ textAlign: 'center' }}>
							{e.name}
						</Text>
						<Text color="text-muted" variant="text-sm/normal" style={{ textAlign: 'center' }}>
							{detail(e)} · {ago(e.at)}
							{e.away ? ' · while you were away' : ''}
						</Text>
					</View>

					<TableRowGroup title="Tap to copy">
						<TableRow label="Server ID" subLabel={e.targetId} onPress={() => copy(e.targetId)} />
						<TableRow
							label={e.vanity ? 'Vanity link' : 'Invite'}
							subLabel={
								linkUrl ??
								'None known. Discord only knew of invites it had seen, and none was found.'
							}
							onPress={linkUrl ? () => copy(linkUrl) : undefined}
						/>
						<TableRow
							label="Owner"
							subLabel={
								e.ownerId
									? e.ownerName
										? `${e.ownerName} · ${e.ownerId}`
										: e.ownerId
									: 'Not known'
							}
							onPress={e.ownerId ? () => copy(e.ownerId as string) : undefined}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
