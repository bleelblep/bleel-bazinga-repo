/** Message times: whether tapping a bubble shows its time, and where. Try it on the preview. */

import { Page } from '@valenced/components'
import { Design } from '@valenced/discord/design'
import { ScrollView } from 'react-native'
import { rowIcon } from '../../../../../shared/ui/icon'
import { useBottomPadding } from '../../../../../shared/ui/safeArea'
import { setBuggy } from '../../lib/buggy'
import { migrateTimes } from '../../native'
import { setSettings, useSettings } from '../../state'
import { ChatPreview } from '../components/ChatPreview'
import type { SpeechBubblesStorage } from '../../native'

export default function Times() {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { Stack, TableRadioGroup, TableRadioRow, TableRowGroup, TableSwitchRow } =
		Design
	const stored = useSettings()
	// Older values ("tap", "beside") are migrated by start(); shown as "below" meanwhile.
	const s: SpeechBubblesStorage = {
		...stored,
		times: migrateTimes(stored.times),
	}

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<ChatPreview s={s} page="times" />

					<TableRadioGroup
						title="When you tap a bubble"
						value={s.times}
						onChange={(times: SpeechBubblesStorage['times']) =>
							setSettings({ times })
						}
					>
						<TableRadioRow
							label="Hidden"
							subLabel="No times at all, not even next to their name."
							value="hidden"
						/>
						<TableRadioRow
							label="Tap: under the bubble"
							subLabel="The time shows under it. Tap again to hide it."
							value="below"
						/>
						<TableRadioRow
							label="Tap: pop-up above the bubble"
							subLabel="The time pops up above it and fades after 3 seconds."
							value="popup"
						/>
					</TableRadioGroup>

					<TableRowGroup title="Always showing" hasIcons>
						<TableSwitchRow
							label="Time next to names"
							subLabel={
								s.ownName
									? 'Discord’s time beside the name above the first bubble of each run, no tap needed. Yours too.'
									: 'Discord’s time beside their name above the first bubble of each run, no tap needed. Turn on Show my name (Visual style) for yours.'
							}
							icon={rowIcon('ClockIcon', 'TagIcon')}
							value={s.headerTimes}
							onValueChange={(headerTimes: boolean) => setSettings({ headerTimes })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Every time at once" hasIcons>
						<TableSwitchRow
							label="Two-finger swipe (buggy)"
							subLabel="Drag the chat left with two fingers to see when each message was sent. One finger still replies."
							icon={rowIcon('ArrowLargeLeftIcon', 'ClockIcon')}
							value={s.swipeTimes}
							onValueChange={(on: boolean) => setBuggy('swipeTimes', 'Two-finger swipe', on)}
						/>
						{s.swipeTimes && s.hideNames ? (
							<TableSwitchRow
								label="Also show names"
								subLabel="Names are hidden, so the swipe shows who sent each run of messages above its time"
								icon={rowIcon('TagIcon', 'UserIcon')}
								value={s.swipeNames}
								onValueChange={(swipeNames: boolean) => setSettings({ swipeNames })}
							/>
						) : null}
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
