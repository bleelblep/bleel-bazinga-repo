import { useBottomPadding } from '../../../../shared/ui/safeArea'
import type { SwipeAction } from '../defaults'
import { actionsFor } from '../lib/actions'
import { gestureByKey } from '../lib/gestures'
import { requireReload, update, useSettings } from '../lib/state'
import { ReactNavigationNative } from '@valenced/externals/react-navigation'
import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as ReactNative from 'react-native'

/** One gesture's action, as a radio list. Opened from GesturesPage with `{ gesture: key }`. */
export default function GesturePickerPage() {
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, TableRadioGroup, TableRadioRow, Text } = Design as any
	const { useRoute } = ReactNavigationNative as any
	const route = useRoute?.() as { params?: { gesture?: string } } | undefined
	const gesture = gestureByKey(route?.params?.gesture)
	const s = useSettings()

	if (!gesture) {
		return (
			<Page>
				<Text variant="text-md/normal" color="text-muted">
					Open this page from Gestures.
				</Text>
			</Page>
		)
	}

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRadioGroup
						title={gesture.title}
						description={gesture.description}
						value={s[gesture.key]}
						onChange={(next: SwipeAction) => {
							update({ [gesture.key]: next })
							if (gesture.needsReload) requireReload()
						}}
					>
						{actionsFor(gesture).map(action => (
							<TableRadioRow key={action.value} label={action.label} subLabel={action.subLabel} value={action.value} />
						))}
					</TableRadioGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
