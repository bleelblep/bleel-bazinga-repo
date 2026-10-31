import { FieldRow } from './fieldGroup'
import { callNative } from '../native'
import { rowIcon } from './icon'
import { useBottomPadding } from './safeArea'
import { isCursorSupported, update, useSettings } from './state'
import { useChangelog } from '../../../../shared/changelog'
import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as React from 'react'
import * as ReactNative from 'react-native'

export default function Settings() {
	// The changelog icon at the top right, and "What's new" once after an update.
	useChangelog()
	const { Page } = components
	const { ScrollView, View } = ReactNative
	const { Stack, Text, TableRowGroup, TableSwitchRow, TableRadioGroup, TableRadioRow, Slider, TextInput } = Design as any

	const s = useSettings()
	const [sample, setSample] = React.useState('')

	// While this page is open every text field animates, so the try-it box below does too.
	React.useEffect(() => {
		callNative('setPreview', [true]).catch(() => {})
		return () => {
			callNative('setPreview', [false]).catch(() => {})
		}
	}, [])

	const cursorWorks = isCursorSupported()

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }} keyboardShouldPersistTaps="handled">
				<Stack spacing={24}>
					<TableRowGroup title="Try it">
						<FieldRow label="Type here" description="Or open any chat: the message box animates the same way.">
							<TextInput placeholder="Typing smoothly…" value={sample} onChange={setSample} />
						</FieldRow>
					</TableRowGroup>

					<TableRowGroup title="Typing" hasIcons>
						<TableSwitchRow
							label="Animate new letters"
							subLabel="Each letter fades in at its spot. Pastes ripple in one after another."
							icon={rowIcon('TextIcon')}
							value={s.typing}
							onValueChange={(typing: boolean) => update({ typing })}
						/>
						<TableSwitchRow
							label="Slide up"
							icon={rowIcon('ArrowLargeUpIcon', 'ArrowUpIcon')}
							value={s.slide}
							disabled={!s.typing}
							onValueChange={(slide: boolean) => update({ slide })}
						/>
						<TableSwitchRow
							label="Unblur"
							icon={rowIcon('EyeIcon')}
							value={s.blur}
							disabled={!s.typing}
							onValueChange={(blur: boolean) => update({ blur })}
						/>
						<TableSwitchRow
							label="Pop"
							subLabel="Grows in with a little bounce."
							icon={rowIcon('MagicWandIcon')}
							value={s.pop}
							disabled={!s.typing}
							onValueChange={(pop: boolean) => update({ pop })}
						/>
						<TableSwitchRow
							label="Tilt"
							icon={rowIcon('RefreshIcon', 'RetryIcon')}
							value={s.tilt}
							disabled={!s.typing}
							onValueChange={(tilt: boolean) => update({ tilt })}
						/>
					</TableRowGroup>

					{s.pop && s.typing ? (
						<TableRowGroup>
							<FieldRow label={`Pop strength — ${s.popAmount}%`}>
								<Slider
									step={5}
									value={s.popAmount}
									minimumValue={25}
									maximumValue={200}
									onValueChange={(v: number) => update({ popAmount: Math.round(v / 5) * 5 })}
								/>
							</FieldRow>
						</TableRowGroup>
					) : null}

					{s.tilt && s.typing ? (
						<TableRowGroup>
							<FieldRow label={`Tilt strength — ${s.tiltAmount}%`}>
								<Slider
									step={5}
									value={s.tiltAmount}
									minimumValue={25}
									maximumValue={200}
									onValueChange={(v: number) => update({ tiltAmount: Math.round(v / 5) * 5 })}
								/>
							</FieldRow>
						</TableRowGroup>
					) : null}

					<TableRowGroup>
						<FieldRow label={`Speed — ${s.duration} ms per letter`}>
							<Slider
								step={20}
								value={s.duration}
								minimumValue={120}
								maximumValue={900}
								onValueChange={(v: number) => update({ duration: Math.round(v / 20) * 20 })}
							/>
						</FieldRow>
					</TableRowGroup>

					{s.slide && s.typing ? (
						<TableRowGroup>
							<FieldRow label={`Slide distance — ${s.slideDp} dp`}>
								<Slider
									step={1}
									value={s.slideDp}
									minimumValue={2}
									maximumValue={30}
									onValueChange={(v: number) => update({ slideDp: Math.round(v) })}
								/>
							</FieldRow>
						</TableRowGroup>
					) : null}

					<TableRadioGroup
						key={`delete-${s.deleteFx}`}
						title="Deleting"
						hasIcons
						defaultValue={s.deleteFx}
						onChange={(deleteFx: 'off' | 'drop' | 'dust') => update({ deleteFx })}
					>
						<TableRadioRow label="Letters fall away" icon={rowIcon('ArrowLargeDownIcon', 'ArrowDownIcon')} value="drop" />
						<TableRadioRow label="Turn to dust" icon={rowIcon('MagicWandIcon')} value="dust" />
						<TableRadioRow label="Nothing" icon={rowIcon('CloseSmallIcon', 'XSmallIcon')} value="off" />
					</TableRadioGroup>

					<TableRowGroup title="Cursor" hasIcons>
						<TableSwitchRow
							label="Gliding cursor"
							subLabel={
								cursorWorks
									? 'The cursor slides to where you type or tap, and fades instead of blinking.'
									: "Needs Android 10 or newer, which this phone doesn't have."
							}
							icon={rowIcon('PencilIcon')}
							value={s.cursor && cursorWorks}
							disabled={!cursorWorks}
							onValueChange={(cursor: boolean) => update({ cursor })}
						/>
						<TableSwitchRow
							label="Stretchy trail"
							subLabel="Stretches out behind itself as it moves."
							icon={rowIcon('WaveIcon', 'MagicWandIcon')}
							value={s.cursorTrail}
							disabled={!s.cursor || !cursorWorks}
							onValueChange={(cursorTrail: boolean) => update({ cursorTrail })}
						/>
					</TableRowGroup>

					{s.cursor && cursorWorks ? (
						<TableRowGroup>
							<FieldRow label={`Cursor speed — ${s.cursorSpeed}`}>
								<Text color="text-muted" variant="text-sm/normal">
									Higher catches up faster.
								</Text>
								<Slider
									step={1}
									value={s.cursorSpeed}
									minimumValue={6}
									maximumValue={40}
									onValueChange={(v: number) => update({ cursorSpeed: Math.round(v) })}
								/>
							</FieldRow>
						</TableRowGroup>
					) : null}

					<TableRowGroup hasIcons>
						<TableSwitchRow
							label="Every text field"
							subLabel="Search, profile and settings boxes too, not just the message box. Password fields never animate."
							icon={rowIcon('GlobeEarthIcon', 'SearchIcon')}
							value={s.everywhere}
							onValueChange={(everywhere: boolean) => update({ everywhere })}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
