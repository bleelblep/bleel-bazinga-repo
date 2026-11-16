import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import { ReactNavigationNative } from '@valenced/externals/react-navigation'
import * as ReactNative from 'react-native'
import { useBottomPadding } from '../../../../../shared/ui/safeArea'
import { DEFAULTS } from '../../defaults'
import { getStorage } from '../../lib/state'
import { ago } from '../../lib/text'
import Avatar from '../components/Avatar'

const BIG = 128

/** One avatar change, before and after, at a size you can actually see. */
export default function AvatarChange() {
	// Read per-render, never at module scope (coding rule 1).
	const { Page } = components
	const { ScrollView, View } = ReactNative
	const { Stack, Text } = Design as any
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

	const side = (
		label: string,
		hash: string | undefined,
		file: string | undefined,
	) => (
		<View style={{ alignItems: 'center', gap: 12, flex: 1 }}>
			<Avatar
				kind="user"
				id={e.targetId}
				hash={hash}
				file={file}
				name={e.name}
				size={BIG}
				fixed
			/>
			<Text variant="text-md/semibold">{label}</Text>
			<Text
				color="text-muted"
				variant="text-xs/normal"
				style={{ textAlign: 'center' }}
			>
				{file
					? 'Saved on this phone'
					: hash
						? 'From Discord'
						: 'Default avatar'}
			</Text>
		</View>
	)

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: bottomPadding }}>
				<Stack spacing={24}>
					<Text
						variant="heading-lg/bold"
						style={{ textAlign: 'center', marginTop: 16 }}
					>
						{e.name}
					</Text>
					<View
						style={{ flexDirection: 'row', justifyContent: 'space-around' }}
					>
						{side('Before', e.oldIconHash, e.oldFile)}
						{side('After', e.iconHash, e.newFile)}
					</View>
					<Text
						color="text-muted"
						variant="text-sm/normal"
						style={{ textAlign: 'center' }}
					>
						Changed {ago(e.at)}
						{e.away ? ', while you were away' : ''}. A picture that wasn't saved
						is loaded from Discord, which may no longer have the old one.
					</Text>
				</Stack>
			</ScrollView>
		</Page>
	)
}
