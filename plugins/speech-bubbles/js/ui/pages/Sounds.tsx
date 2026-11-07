/** Sounds and haptics: our own short sounds and light vibrations. Native half: Feedback.kt. */

import { Page } from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as react from '@valenced/react'
import { ScrollView } from 'react-native'
import { FieldRow } from '../../../../../shared/ui/fieldGroup'
import { rowIcon } from '../../../../../shared/ui/icon'
import { useBottomPadding } from '../../../../../shared/ui/safeArea'
import { feedback, feedbackStatus } from '../../native'
import type { FeedbackKind, FeedbackStatus } from '../../native'
import { setSettings, useSettings } from '../../state'

export default function Sounds() {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { Stack, TableRowGroup, TableSwitchRow, TableRow, Slider } = Design as any
	const s = useSettings()
	const { React } = react
	const [info, setInfo] = React.useState<FeedbackStatus | undefined>()
	const refresh = () => void feedbackStatus().then(setInfo)
	React.useEffect(refresh, [])
	// Tried from here: plays even with the switches off, then the status line updates.
	const tryIt = (kind: FeedbackKind) => {
		feedback(kind, true, true)
		setTimeout(refresh, 400)
	}
	const working = info?.error
		? `Error: ${info.error}`
		: info?.skip
			? `Last one didn't play: ${info.skip}`
			: `${info?.played ?? 0} sounds and ${info?.vibrated ?? 0} vibrations since Discord started`

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup hasIcons>
						<TableSwitchRow
							label="Sounds"
							subLabel="A whoosh when you send, a pop when a message comes into the chat you have open, and a tick when you react. They use your notification volume and stay quiet with Do Not Disturb on or your phone on silent or vibrate"
							icon={rowIcon('BellIcon', 'SettingsIcon')}
							value={s.sounds}
							onValueChange={(sounds: boolean) => setSettings({ sounds })}
						/>
						<TableSwitchRow
							label="Haptics"
							subLabel="A light click when you send or react. Off with Do Not Disturb on or your phone on silent"
							icon={rowIcon('MobilePhoneIcon', 'SettingsIcon')}
							value={s.haptics}
							onValueChange={(haptics: boolean) => setSettings({ haptics })}
						/>
					</TableRowGroup>

					{s.sounds && (
						<TableRowGroup title="Volume">
							<FieldRow label={`Volume: ${s.soundVolume}%`}>
								<Slider
									step={10}
									value={s.soundVolume}
									minimumValue={10}
									maximumValue={100}
									onValueChange={(v: number) =>
										setSettings({ soundVolume: Math.round(v / 10) * 10 })
									}
								/>
							</FieldRow>
						</TableRowGroup>
					)}

					<TableRowGroup title="Try them" hasIcons>
						<TableRow
							label="Send"
							icon={rowIcon('SendMessageIcon', 'ic_send')}
							onPress={() => tryIt('send')}
						/>
						<TableRow
							label="Message comes in"
							icon={rowIcon('ChatIcon', 'ic_message')}
							onPress={() => tryIt('receive')}
						/>
						<TableRow
							label="React"
							icon={rowIcon('ReactionIcon', 'EmojiSmileIcon')}
							onPress={() => tryIt('react')}
						/>
					</TableRowGroup>

					<TableRowGroup title="Working" hasIcons>
						<TableRow
							label={working}
							subLabel="The Try rows play sound and vibration even with the switches off. In chat, only what you switched on plays"
							icon={rowIcon('CircleInformationIcon')}
							onPress={refresh}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
