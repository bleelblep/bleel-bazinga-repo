/**
 * Colours: where the bubble colours come from (one choice: theme, theme swapped, or the user's
 * own), the two colour rows for "My own", and colour per person. The preview sits on the chat
 * background, because their bubbles are picked against it.
 */

import { Page } from '@valenced/components'
import { Design } from '@valenced/discord/design'
import { ScrollView, View } from 'react-native'
import { confirmDestructive } from '../../../../../shared/ui/confirm'
import { dangerIcon, rowIcon } from '../../../../../shared/ui/icon'
import { useBottomPadding } from '../../../../../shared/ui/safeArea'
import { hasColorPicker, openColorPicker } from '../../lib/colorPicker'
import { setSettings, useSettings } from '../../state'
import { resolveColors, toHex6 } from '../../theme'
import ColorInput from '../ColorInput'
import { ChatPreview } from '../components/ChatPreview'
import type { SpeechBubblesStorage } from '../../native'

/** A colour row: Discord's own picker when this build has it, a hex field when not. */
function ColorRow({
	label,
	value,
	theme,
	onChange,
}: {
	label: string
	/** The picked colour, or '' for the theme's. */
	value: string
	/** The theme's colour for this side, `#RRGGBB`. */
	theme: string
	onChange: (hex: string) => void
}) {
	const { TableRow } = Design
	const shown = value || theme
	if (!hasColorPicker())
		return (
			<ColorInput
				label={label}
				description="Hex like #F0B232, or RGB like 240, 178, 50. Empty uses the theme's colour."
				value={value}
				placeholder={theme}
				onChange={onChange}
			/>
		)
	return (
		<TableRow
			label={label}
			subLabel={value ? value : `Theme colour (${theme})`}
			trailing={
				<View
					style={{
						width: 24,
						height: 24,
						borderRadius: 12,
						backgroundColor: shown,
					}}
				/>
			}
			arrow
			onPress={() => openColorPicker(shown, onChange)}
		/>
	)
}

export default function Colours() {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const {
		Stack,
		TableRowGroup,
		TableRow,
		TableSwitchRow,
		TableRadioGroup,
		TableRadioRow,
	} = Design
	const s = useSettings()
	const theme = resolveColors()
	const picked = !!(s.ownColor || s.otherColor)

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<ChatPreview s={s} page="colours" />

					<TableRadioGroup
						title="Bubble colours"
						value={s.colors}
						onChange={(colors: SpeechBubblesStorage['colors']) =>
							setSettings({ colors })
						}
					>
						<TableRadioRow
							label="From your theme"
							subLabel="Yours in the accent colour, theirs in a surface colour. They change with your theme."
							value="theme"
						/>
						<TableRadioRow
							label="From your theme, swapped"
							subLabel="Theirs in the accent colour and yours in the surface colour. Sides stay the same."
							value="swapped"
						/>
						<TableRadioRow
							label="My own"
							subLabel="Pick both colours. Text turns white or black, whichever reads better."
							value="own"
						/>
					</TableRadioGroup>

					{s.colors === 'own' ? (
						<TableRowGroup title="My own colours">
							<ColorRow
								label="Your bubbles"
								value={s.ownColor}
								theme={toHex6(theme.ownBg)}
								onChange={ownColor => setSettings({ ownColor })}
							/>
							<ColorRow
								label="Their bubbles"
								value={s.otherColor}
								theme={toHex6(theme.otherBg)}
								onChange={otherColor => setSettings({ otherColor })}
							/>
						</TableRowGroup>
					) : null}

					{s.colors === 'own' && picked ? (
						<TableRowGroup hasIcons>
							<TableRow
								label="Reset to theme colours"
								subLabel="Forgets both picked colours"
								variant="danger"
								icon={dangerIcon('RefreshIcon', 'ic_refresh')}
								onPress={() =>
									confirmDestructive({
										title: 'Reset colours?',
										body: 'Both bubbles go back to your theme’s colours. The colours you picked are forgotten.',
										action: 'Reset',
										onConfirm: () =>
											setSettings({ ownColor: '', otherColor: '' }),
									})
								}
							/>
						</TableRowGroup>
					) : null}

					<TableRowGroup title="Group chats" hasIcons>
						<TableSwitchRow
							label="Colour per person"
							subLabel="Each person's bubbles get their own colour, so you can tell who's who"
							icon={rowIcon('UsersIcon', 'UserIcon')}
							value={s.perPerson}
							onValueChange={perPerson => setSettings({ perPerson })}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
