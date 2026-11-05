/** Send animation: your message flies from the message box into the chat. Native half: Flights.kt. */

import { Page } from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as react from '@valenced/react'
import { ScrollView } from 'react-native'
import { rowIcon } from '../../../../../shared/ui/icon'
import { useBottomPadding } from '../../../../../shared/ui/safeArea'
import { flightStatus } from '../../native'
import { setSettings, useSettings } from '../../state'
import type { FlightStatus, SpeechBubblesStorage } from '../../native'

export default function SendAnimation() {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { React } = react
	const {
		Stack,
		TableRadioGroup,
		TableRadioRow,
		TableRowGroup,
		TableSwitchRow,
		TableRow,
	} = Design as any
	const s = useSettings()
	const [info, setInfo] = React.useState<FlightStatus | undefined>()
	React.useEffect(() => {
		void flightStatus().then(setInfo)
	}, [s.sendAnimation])

	const working = !s.sendAnimation
		? 'Off'
		: info?.hooked
			? `${info.flown ?? 0} messages flown in since Discord started`
			: info?.error
				? `Not working on this Discord version: ${info.error}`
				: 'Starting…'

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup hasIcons>
						<TableSwitchRow
							label="Send animation"
							subLabel="Your message lifts out of the message box and goes into the chat"
							icon={rowIcon('SendMessageIcon', 'ic_send')}
							value={s.sendAnimation}
							onValueChange={(sendAnimation: boolean) =>
								setSettings({ sendAnimation })
							}
						/>
					</TableRowGroup>

					{s.sendAnimation && (
						<>
							<TableRadioGroup
								title="How it moves"
								value={s.sendStyle}
								onChange={(sendStyle: SpeechBubblesStorage['sendStyle']) =>
									setSettings({ sendStyle })
								}
							>
								<TableRadioRow
									label="iMessage"
									subLabel="The message box shrinks into a bubble, then goes up into place"
									value="imessage"
								/>
								<TableRadioRow
									label="Pop"
									subLabel="Appears in its place and pops up to full size"
									value="pop"
								/>
							</TableRadioGroup>

							<TableRadioGroup
								title="Speed"
								value={s.sendSpeed}
								onChange={(sendSpeed: SpeechBubblesStorage['sendSpeed']) =>
									setSettings({ sendSpeed })
								}
							>
								<TableRadioRow label="Quick" value="quick" />
								<TableRadioRow label="Normal" value="normal" />
								<TableRadioRow label="Relaxed" value="relaxed" />
							</TableRadioGroup>

							<TableRowGroup hasIcons>
								<TableSwitchRow
									label="Tick when it lands"
									subLabel="A light vibration, if your phone has touch vibration on"
									icon={rowIcon('BellIcon', 'SettingsIcon')}
									value={s.sendHaptic}
									onValueChange={(sendHaptic: boolean) =>
										setSettings({ sendHaptic })
									}
								/>
							</TableRowGroup>
						</>
					)}

					<TableRowGroup title="Working" hasIcons>
						<TableRow
							label={working}
							subLabel="Your messages still send straight away. Only how they appear changes."
							icon={rowIcon('CircleInformationIcon')}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
