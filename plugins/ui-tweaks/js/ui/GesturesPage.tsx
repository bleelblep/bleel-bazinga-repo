import { FieldGroup } from '../../../../shared/ui/fieldGroup'
import { rowIcon } from '../../../../shared/ui/icon'
import { useBottomPadding } from '../../../../shared/ui/safeArea'
import { actionLabel } from '../lib/actions'
import type { Gesture } from '../lib/gestures'
import { GESTURES } from '../lib/gestures'
import { requireReload, update, useSettings } from '../lib/state'
import { GESTURE_PICKER_ROUTE } from './routes'
import { ReactNavigationNative } from '@valenced/externals/react-navigation'
import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as ReactNative from 'react-native'

/**
 * Gestures: one row per slot (lib/gestures.ts) showing what it does now; tapping opens the picker
 * (GesturePickerPage.tsx). Double-taps are read on every tap, so they apply straight away; the
 * swipes' icons are cached per built row, so those changes ask for Valenced's reload.
 */
export default function GesturesPage() {
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, TableRowGroup, TableRow, TableSwitchRow, TextInput } = Design as any
	const { useNavigation } = ReactNavigationNative
	const navigation = useNavigation() as { navigate: (route: string, params?: unknown) => void }
	const s = useSettings()

	const row = (gesture: Gesture) => (
		<TableRow
			key={gesture.key}
			label={gesture.title}
			subLabel={actionLabel(s[gesture.key], gesture)}
			icon={gesture.own ? rowIcon('UserIcon', 'FriendsIcon') : rowIcon('GroupIcon', 'FriendsIcon')}
			arrow
			onPress={() => navigation.navigate(GESTURE_PICKER_ROUTE, { gesture: gesture.key })}
		/>
	)
	const [doubleTapOwn, doubleTapOthers, swipeShortOwn, swipeShortOthers, swipeLongOwn, swipeLongOthers] = GESTURES

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Double-tap" hasIcons>
						{row(doubleTapOwn)}
						{row(doubleTapOthers)}
					</TableRowGroup>

					<TableRowGroup title="Short swipe" hasIcons>
						{row(swipeShortOwn)}
						{row(swipeShortOthers)}
					</TableRowGroup>

					<TableRowGroup
						title="Further swipe"
						description="Each swipe's icon is drawn once for every message, so it follows the choice for other people's messages when the two differ."
						hasIcons
					>
						{row(swipeLongOwn)}
						{row(swipeLongOthers)}
						<TableSwitchRow
							label="Further swipe on every message"
							subLabel="Discord only gives your own messages a second swipe. Others' get one too. Takes effect after a restart."
							icon={rowIcon('ArrowsLeftRightIcon', 'ReplyIcon')}
							value={s.swipeAllMessages}
							onValueChange={(swipeAllMessages: boolean) => {
								update({ swipeAllMessages })
								requireReload()
							}}
						/>
					</TableRowGroup>

					<FieldGroup title="React" label="Emoji" description="For the React action. Leave empty to use your Discord double-tap emoji.">
						<TextInput
							defaultValue={s.swipeEmoji}
							placeholder="👍"
							maxLength={16}
							onChange={(text: string) => update({ swipeEmoji: text.trim() })}
						/>
					</FieldGroup>
					<FieldGroup label="Second emoji" description="For the Second react action, so two gestures can add different reactions.">
						<TextInput
							defaultValue={s.swipeEmoji2}
							placeholder="❤️"
							maxLength={16}
							onChange={(text: string) => update({ swipeEmoji2: text.trim() })}
						/>
					</FieldGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
