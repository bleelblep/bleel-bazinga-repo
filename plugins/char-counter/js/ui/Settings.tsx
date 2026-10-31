import { Page } from '@valenced/components'
import { Design } from '@valenced/discord/design'
import { ScrollView, View } from 'react-native'
import { useChangelog } from '../../../../shared/changelog'
import { rowIcon } from '../../../../shared/ui/icon'
import { useBottomPadding } from '../../../../shared/ui/safeArea'
import { DEFAULTS, FONT_SIZE, SPLIT_DELAY, SPLIT_MAX } from '../index'
import { CounterSquare, fontSizeOf } from '../lib/badge'
import { delaySecondsOf, maxPartsOf } from '../lib/sender'
import { FieldRow } from './fieldGroup'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { CharCounterStorage } from '../index'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: CharCounterStorage }>
>

export default function Settings({ api }: Props) {
	// The changelog icon at the top right, and "What's new" once after an update.
	useChangelog()
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const {
		Stack,
		Text,
		TableRowGroup,
		TableSwitchRow,
		TableRadioGroup,
		TableRadioRow,
		Slider,
	} = Design

	const s = { ...DEFAULTS, ...(api.jsonStorage.use() ?? {}) }

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRadioGroup<CharCounterStorage['show']>
						key={`show-${s.show}`}
						title="Show"
						description="In a small square above the message box, while you type. Past the limit it turns red and says how far over you are."
						hasIcons
						defaultValue={s.show}
						onChange={show => api.jsonStorage.set({ show })}
					>
						<TableRadioRow
							label="Characters typed"
							subLabel="45 characters"
							icon={rowIcon('TextIcon')}
							value="count"
						/>
						<TableRadioRow
							label="Typed out of the limit"
							subLabel="45 / 4,000 characters"
							icon={rowIcon('TextIcon')}
							value="limit"
						/>
						<TableRadioRow
							label="Characters left"
							subLabel="3,955 characters left"
							icon={rowIcon('TextIcon')}
							value="left"
						/>
					</TableRadioGroup>

					<TableRadioGroup<CharCounterStorage['side']>
						key={`side-${s.side}`}
						title="Side"
						hasIcons
						defaultValue={s.side}
						onChange={side => api.jsonStorage.set({ side })}
					>
						<TableRadioRow
							label="Left"
							icon={rowIcon('ArrowLargeLeftIcon', 'ArrowLeftIcon')}
							value="left"
						/>
						<TableRadioRow
							label="Right"
							icon={rowIcon('ArrowLargeRightIcon', 'ArrowRightIcon')}
							value="right"
						/>
					</TableRadioGroup>

					<TableRowGroup>
						<FieldRow label="Text size">
							<View
								style={{
									flexDirection: 'row',
									alignItems: 'center',
									justifyContent: 'space-between',
								}}
							>
								<Text color="text-muted" variant="text-sm/normal">
									{`${fontSizeOf(s)} pt${fontSizeOf(s) === FONT_SIZE.default ? ' (default)' : ''}`}
								</Text>
								<CounterSquare
									text="45 characters"
									colour="text-muted"
									fontSize={fontSizeOf(s)}
								/>
							</View>
							<Slider
								step={1}
								value={fontSizeOf(s)}
								minimumValue={FONT_SIZE.min}
								maximumValue={FONT_SIZE.max}
								onValueChange={value =>
									api.jsonStorage.set({ fontSize: Math.round(value) })
								}
							/>
						</FieldRow>
					</TableRowGroup>

					<TableRowGroup hasIcons>
						<TableSwitchRow
							label="Only near the limit"
							subLabel="Appears once a message is 90% of the way there"
							icon={rowIcon('EyeIcon', 'ic_eye')}
							value={!!s.onlyNearLimit}
							onValueChange={value =>
								api.jsonStorage.set({ onlyNearLimit: value })
							}
						/>
					</TableRowGroup>

					<TableRowGroup title="Long messages" hasIcons>
						<TableSwitchRow
							label="Offer to split long messages"
							subLabel="Past the limit, Send sends the message as several, cut at a blank line, a line break or the end of a sentence, one by one. The square becomes a button that shows the parts first."
							icon={rowIcon('ChatIcon', 'TextIcon')}
							value={!!s.split}
							onValueChange={split => api.jsonStorage.set({ split })}
						/>
						{s.split ? (
							<TableRadioGroup<CharCounterStorage['onSend']>
								key={`onSend-${s.onSend}`}
								title="When you tap Send on a long message"
								hasIcons
								defaultValue={s.onSend}
								onChange={onSend => api.jsonStorage.set({ onSend })}
							>
								<TableRadioRow
									label="Send the parts"
									subLabel="Starts straight away. A sheet shows the progress, with Stop."
									icon={rowIcon('SendIcon', 'ArrowSmallRightIcon')}
									value="send"
								/>
								<TableRadioRow
									label="Show the parts first"
									subLabel="A sheet shows every part; nothing goes until you tap Send there."
									icon={rowIcon('EyeIcon', 'ic_eye')}
									value="ask"
								/>
							</TableRadioGroup>
						) : null}
						{s.split ? (
							<FieldRow
								label={`Wait between messages — ${delaySecondsOf(s)} s`}
								description="So the parts arrive in order and read as one. A channel's slowmode wins when it's longer. Each part waits for Discord to confirm the one before."
							>
								<Slider
									step={SPLIT_DELAY.step}
									value={delaySecondsOf(s)}
									minimumValue={SPLIT_DELAY.min}
									maximumValue={SPLIT_DELAY.max}
									onValueChange={value =>
										api.jsonStorage.set({
											splitDelaySec:
												Math.round(value / SPLIT_DELAY.step) * SPLIT_DELAY.step,
										})
									}
								/>
							</FieldRow>
						) : null}
						{s.split ? (
							<FieldRow
								label={`At most — ${maxPartsOf(s)} messages`}
								description="Anything that would need more parts than this isn't offered."
							>
								<Slider
									step={1}
									value={maxPartsOf(s)}
									minimumValue={SPLIT_MAX.min}
									maximumValue={SPLIT_MAX.max}
									onValueChange={value =>
										api.jsonStorage.set({ splitMax: Math.round(value) })
									}
								/>
							</FieldRow>
						) : null}
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
