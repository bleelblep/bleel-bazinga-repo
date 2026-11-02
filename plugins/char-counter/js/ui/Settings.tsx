import { Page } from '@valenced/components'
import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { ScrollView, View } from 'react-native'
import { useChangelog } from '../../../../shared/changelog'
import { Credit } from '../../../../shared/ui/credit'
import { rowIcon } from '../../../../shared/ui/icon'
import { useBottomPadding } from '../../../../shared/ui/safeArea'
import { DEFAULTS, FONT_SIZE, SPLIT_DELAY, SPLIT_MAX } from '../index'
import { fontSizeOf, label } from '../lib/badge'
import { delaySecondsOf, maxPartsOf } from '../lib/sender'
import { FieldRow } from './fieldGroup'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { CharCounterStorage } from '../index'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: CharCounterStorage }>
>

/** "Are you sure?" before the intro card goes for good (settings design guide §4.3). */
function confirmHideIntro(onHide: () => void) {
	const { AlertModal, AlertActionButton } = Design as any
	const alerts = AlertActionCreators as any
	const key = `char-counter-hide-intro-${Date.now()}`
	alerts.openAlert(
		key,
		<AlertModal
			title="Hide this note?"
			content="It won't be shown again, even after updates."
			actions={
				<>
					<AlertActionButton
						text="Hide"
						variant="primary"
						onPress={() => {
							alerts.dismissAlert(key)
							onHide()
						}}
					/>
					<AlertActionButton
						text="Cancel"
						variant="secondary"
						onPress={() => alerts.dismissAlert(key)}
					/>
				</>
			}
		/>,
	)
}

/**
 * One page (settings design guide §2.1): the intro note until it's hidden, what the square shows
 * and where, how it looks, then long messages. Each Show option's sub-label is its example.
 */
export default function Settings({ api }: Props) {
	// The changelog icon at the top right, and "What's new" once after an update.
	useChangelog()
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const {
		Stack,
		Text,
		Card,
		Button,
		TableRowGroup,
		TableSwitchRow,
		TableRadioGroup,
		TableRadioRow,
		Slider,
	} = Design as any

	const s = { ...DEFAULTS, ...(api.jsonStorage.use() ?? {}) }
	const set = (patch: Partial<CharCounterStorage>) => api.jsonStorage.set(patch)
	// The examples follow "Numbers only", so each row shows what the square will say.
	const example = (show: CharCounterStorage['show']) =>
		label(45, 4000, show, 0, !!s.numbersOnly)
	const size = fontSizeOf(s)
	const delay = delaySecondsOf(s)
	const maxParts = maxPartsOf(s)

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					{s.introDismissed ? null : (
						<Card variant="secondary" border="none">
							<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
								<Text variant="text-md/semibold" color="text-default">
									How it works
								</Text>
								<Text
									variant="text-sm/normal"
									color="text-muted"
									style={{ marginTop: 8 }}
								>
									A small square above the message box counts as you type. It
									turns yellow near the limit and red past it. With splitting on,
									a message that's too long can go as several.
								</Text>
								<View style={{ marginTop: 12, alignItems: 'flex-start' }}>
									<Button
										text="Don't show again"
										size="sm"
										variant="secondary"
										onPress={() =>
											confirmHideIntro(() => set({ introDismissed: true }))
										}
									/>
								</View>
							</View>
						</Card>
					)}

					<TableRadioGroup
						key={`show-${s.show}`}
						title="Show"
						description="In a small square above the message box. It turns yellow near the limit and red past it."
						hasIcons
						defaultValue={s.show}
						onChange={(show: CharCounterStorage['show']) => set({ show })}
					>
						<TableRadioRow
							label="Characters typed"
							subLabel={example('count')}
							icon={rowIcon('TextIcon')}
							value="count"
						/>
						<TableRadioRow
							label="Typed out of the limit"
							subLabel={example('limit')}
							icon={rowIcon('SpeedometerIcon', 'TextIcon')}
							value="limit"
						/>
						<TableRadioRow
							label="Characters left"
							subLabel={example('left')}
							icon={rowIcon('TimerIcon', 'ClockIcon')}
							value="left"
						/>
					</TableRadioGroup>

					<TableRadioGroup
						key={`side-${s.side}`}
						title="Side"
						hasIcons
						defaultValue={s.side}
						onChange={(side: CharCounterStorage['side']) => set({ side })}
					>
						<TableRadioRow
							label="Left"
							icon={rowIcon('ArrowLargeLeftIcon', 'ArrowLeftIcon')}
							value="left"
						/>
						<TableRadioRow
							label="Right"
							subLabel="Moves aside while Jump to present shows"
							icon={rowIcon('ArrowLargeRightIcon', 'ArrowRightIcon')}
							value="right"
						/>
					</TableRadioGroup>

					<TableRowGroup title="Square" hasIcons>
						<FieldRow
							label={`Text size — ${size} pt${size === FONT_SIZE.default ? ' (default)' : ''}`}
						>
							<Slider
								step={1}
								value={size}
								minimumValue={FONT_SIZE.min}
								maximumValue={FONT_SIZE.max}
								onValueChange={(value: number) =>
									set({ fontSize: Math.round(value) })
								}
							/>
						</FieldRow>
						<TableSwitchRow
							label="Numbers only"
							subLabel='Shows 45 instead of "45 characters"'
							icon={rowIcon('TextIcon')}
							value={!!s.numbersOnly}
							onValueChange={(value: boolean) => set({ numbersOnly: value })}
						/>
						<TableSwitchRow
							label="Only near the limit"
							subLabel="Hidden until a message is 90% of the way there"
							icon={rowIcon('EyeIcon', 'ic_eye')}
							value={!!s.onlyNearLimit}
							onValueChange={(value: boolean) => set({ onlyNearLimit: value })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Long messages" hasIcons>
						<TableSwitchRow
							label="Offer to split long messages"
							subLabel="Past the limit, the message goes as several, cut at a blank line, a line break or the end of a sentence. The square becomes a button that shows the parts."
							icon={rowIcon('ChatIcon', 'TextIcon')}
							value={!!s.split}
							onValueChange={(split: boolean) => set({ split })}
						/>
					</TableRowGroup>

					{s.split ? (
						<TableRadioGroup
							key={`onSend-${s.onSend}`}
							title="When you tap Send on a long message"
							hasIcons
							defaultValue={s.onSend}
							onChange={(onSend: CharCounterStorage['onSend']) =>
								set({ onSend })
							}
						>
							<TableRadioRow
								label="Send the parts"
								subLabel="Starts straight away. A sheet shows the progress, with Stop."
								icon={rowIcon('SendIcon', 'ArrowSmallRightIcon')}
								value="send"
							/>
							<TableRadioRow
								label="Show the parts first"
								subLabel="Nothing goes until you tap Send in the sheet."
								icon={rowIcon('EyeIcon', 'ic_eye')}
								value="ask"
							/>
						</TableRadioGroup>
					) : null}

					{s.split ? (
						<TableRowGroup title="Pacing">
							<FieldRow
								label={`Wait between messages — ${delay} s`}
								description="So the parts arrive in order and read as one. Each part waits for Discord to confirm the one before, and a longer slowmode wins."
							>
								<Slider
									step={SPLIT_DELAY.step}
									value={delay}
									minimumValue={SPLIT_DELAY.min}
									maximumValue={SPLIT_DELAY.max}
									onValueChange={(value: number) =>
										set({
											splitDelaySec:
												Math.round(value / SPLIT_DELAY.step) * SPLIT_DELAY.step,
										})
									}
								/>
							</FieldRow>
							<FieldRow
								label={`At most — ${maxParts} messages`}
								description="A message that would need more parts isn't offered a split."
							>
								<Slider
									step={1}
									value={maxParts}
									minimumValue={SPLIT_MAX.min}
									maximumValue={SPLIT_MAX.max}
									onValueChange={(value: number) =>
										set({ splitMax: Math.round(value) })
									}
								/>
							</FieldRow>
						</TableRowGroup>
					) : null}

					<Credit />
				</Stack>
			</ScrollView>
		</Page>
	)
}
