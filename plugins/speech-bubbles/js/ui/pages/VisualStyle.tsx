/** Visual style: how bubbles are drawn. The preview shows each switch as it's flipped. */

import { Page } from '@valenced/components'
import { Design } from '@valenced/discord/design'
import { ScrollView } from 'react-native'
import { FieldRow } from '../../../../../shared/ui/fieldGroup'
import { rowIcon } from '../../../../../shared/ui/icon'
import { useBottomPadding } from '../../../../../shared/ui/safeArea'
import { setBuggy } from '../../lib/buggy'
import { setSettings, useSettings } from '../../state'
import { ChatPreview } from '../components/ChatPreview'

export default function VisualStyle() {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { Stack, TableRowGroup, TableSwitchRow, Slider } = Design as any
	const s = useSettings()

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<ChatPreview s={s} page="visual" />

					<TableRowGroup title="Shape">
						<FieldRow
							label={`Corner roundness: ${s.bubbleRadius >= 40 ? 'pill' : s.bubbleRadius}`}
							description="18 is iMessage's."
						>
							<Slider
								step={2}
								value={s.bubbleRadius}
								minimumValue={0}
								maximumValue={40}
								onValueChange={(v: number) => setSettings({ bubbleRadius: Math.round(v / 2) * 2 })}
							/>
						</FieldRow>
						<FieldRow
							label={`Bubble opacity: ${s.bubbleOpacity >= 100 ? 'solid' : `${s.bubbleOpacity}%`}`}
							description="Lower lets the chat background show through the bubbles and reactions. The text stays solid."
						>
							<Slider
								step={10}
								value={s.bubbleOpacity}
								minimumValue={30}
								maximumValue={100}
								onValueChange={(v: number) => setSettings({ bubbleOpacity: Math.round(v / 10) * 10 })}
							/>
						</FieldRow>
					</TableRowGroup>

					<TableRowGroup title="Bubbles" hasIcons>
						<TableSwitchRow
							label="Tails"
							subLabel="A small tail on the last bubble of each run of messages"
							icon={rowIcon('ChatIcon', 'ic_message')}
							value={s.tails}
							onValueChange={(tails: boolean) => setSettings({ tails })}
						/>
						<TableSwitchRow
							label="Time breaks"
							subLabel="A small time above the first message after an hour's quiet"
							icon={rowIcon('TimerIcon', 'ClockIcon')}
							value={s.timeBreaks}
							onValueChange={(timeBreaks: boolean) => setSettings({ timeBreaks })}
						/>
						<TableSwitchRow
							label="Invisible ink (buggy)"
							subLabel="Spoilers shimmer as moving specks. Tap one to read it"
							icon={rowIcon('EyeSlashIcon', 'EyeIcon')}
							value={s.invisibleInk}
							onValueChange={(on: boolean) => setBuggy('invisibleInk', 'Invisible ink', on)}
						/>
						<TableSwitchRow
							label="iOS-style reactions"
							subLabel="Round reactions in the bubble colours, yours in yours"
							icon={rowIcon('ReactionIcon', 'EmojiSmileIcon')}
							value={s.iosReactions}
							onValueChange={(iosReactions: boolean) => setSettings({ iosReactions })}
						/>
						<TableSwitchRow
							label="Edited under the bubble"
							subLabel={'"Edited" under an edited message instead of "(edited)" in its text'}
							icon={rowIcon('PencilIcon', 'ic_edit_24px')}
							value={s.editedLabel}
							onValueChange={(editedLabel: boolean) => setSettings({ editedLabel })}
						/>
						<TableSwitchRow
							label="Show my profile picture"
							subLabel="Your picture on the right, beside the first of your messages in a row"
							icon={rowIcon('UserCircleIcon', 'UserIcon')}
							value={s.ownAvatar}
							onValueChange={(ownAvatar: boolean) => setSettings({ ownAvatar })}
						/>
						<TableSwitchRow
							label="Hide avatars"
							subLabel="Their bubbles move left into the space the pictures used"
							icon={rowIcon('UserCircleIcon', 'UserIcon')}
							value={s.hideAvatars}
							onValueChange={(hideAvatars: boolean) => setSettings({ hideAvatars })}
						/>
						<TableSwitchRow
							label="Hide names"
							subLabel="No name above their bubbles. Best with colour per person, so you can still tell who's who"
							icon={rowIcon('TagIcon', 'UserIcon')}
							value={s.hideNames}
							onValueChange={(hideNames: boolean) => setSettings({ hideNames })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Typing" hasIcons>
						<TableSwitchRow
							label="Typing bubble (buggy)"
							subLabel={'A bubble with dots above the message box, instead of the "…is typing" line'}
							icon={rowIcon('PencilIcon', 'ic_edit_24px')}
							value={s.typingBubble}
							onValueChange={(on: boolean) => setBuggy('typingBubble', 'Typing bubble', on)}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
