import * as components from '@valenced/components'
import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { ReactNavigationNative } from '@valenced/externals/react-navigation'
import * as React from 'react'
import * as ReactNative from 'react-native'
import { TAGS } from '../../lib/getTag'
import {
	iconById,
	isValidCustomSvg,
	MAX_CUSTOM_SVG_LENGTH,
} from '../../lib/icons'
import { selectedTagId } from '../../lib/selection'
import {
	getStorage,
	overrideFor,
	resetOverride,
	setOverride,
} from '../../lib/state'
import ColorInput from '../ColorInput'
import { FieldGroup, FieldRow } from '../fieldGroup'
import { ICONS_ROUTE } from '../routes'
import { useBottomPadding } from '../safeArea'
import TagIcon from '../TagIcon'

/** Everything about one tag. Reached from the list, which sets the tag being edited. */
export default function TagEditor() {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { Page } = components
	const { ScrollView, View } = ReactNative
	const {
		Stack,
		Text,
		Card,
		TableRowGroup,
		TableRow,
		TableSwitchRow,
		TextInput,
		AlertModal,
		AlertActionButton,
	} = Design
	const Alerts = AlertActionCreators
	const { useNavigation } = ReactNavigationNative

	const navigation = useNavigation() as { navigate: (route: string) => void }
	// Re-render on any storage write, so a change made here shows immediately.
	getStorage()?.use()

	const id = selectedTagId()
	const def = TAGS.find(tag => tag.id === id)
	const custom = overrideFor(id)
	const [svgDraft, setSvgDraft] = React.useState(custom.customSvg ?? '')

	if (!def) {
		return (
			<Page>
				<Text color="text-muted" variant="text-sm/normal">
					That tag no longer exists.
				</Text>
			</Page>
		)
	}

	const enabled = custom.enabled !== false
	const colour =
		custom.useCustomColor && custom.color ? custom.color : def.defaultColor
	const label = custom.text?.trim() || def.text
	const svgOk = !svgDraft.trim() || isValidCustomSvg(svgDraft)

	const confirmReset = () => {
		const key = 'StaffTagsReset'
		Alerts.openAlert(
			key,
			<AlertModal
				title={`Reset ${def.text}?`}
				content="Its text, colour and icon go back to how they ship."
				actions={
					<>
						<AlertActionButton
							text="Reset"
							variant="destructive"
							onPress={() => {
								Alerts.dismissAlert(key)
								resetOverride(def.id)
								setSvgDraft('')
							}}
						/>
						<AlertActionButton
							text="Cancel"
							variant="secondary"
							onPress={() => Alerts.dismissAlert(key)}
						/>
					</>
				}
			/>,
		)
	}

	return (
		<Page>
			<ScrollView
				keyboardShouldPersistTaps="handled"
				contentContainerStyle={{ paddingBottom: useBottomPadding() }}
			>
				<Stack spacing={24}>
					{/* What the tag will look like, built from the same pieces the real one uses. */}
					<Card variant="secondary" border="none">
						<View
							style={{
								paddingHorizontal: 16,
								paddingVertical: 16,
								alignItems: 'center',
							}}
						>
							<View
								style={{
									flexDirection: 'row',
									alignItems: 'center',
									paddingHorizontal: 6,
									paddingVertical: 3,
									borderRadius: 4,
									backgroundColor: colour,
								}}
							>
								<TagIcon
									icon={custom.icon}
									customSvg={custom.customSvg}
									color="#FFFFFF"
								/>
								{custom.iconOnly && custom.icon ? null : (
									<Text
										style={{
											color: '#FFFFFF',
											fontSize: 10,
											fontWeight: '700',
										}}
									>
										{label}
									</Text>
								)}
							</View>
							<Text
								color="text-muted"
								variant="text-xs/normal"
								style={{ marginTop: 8 }}
							>
								{custom.useGradient && custom.gradientColor
									? 'Gradients show on profiles and member lists; message rows use the first colour.'
									: 'Preview'}
							</Text>
						</View>
					</Card>

					<TableRowGroup hasIcons>
						<TableSwitchRow
							label="Show this tag"
							subLabel={
								enabled ? 'Shown wherever it applies' : 'Hidden everywhere'
							}
							value={enabled}
							onValueChange={value => setOverride(def.id, { enabled: value })}
						/>
					</TableRowGroup>

					<FieldGroup
						label="Text"
						description="What the tag reads. Leave it empty for the original."
					>
						<TextInput
							placeholder={def.text}
							value={custom.text ?? ''}
							returnKeyType="done"
							isClearable
							onChange={value => setOverride(def.id, { text: value })}
						/>
					</FieldGroup>

					<TableRowGroup title="Icon" hasIcons>
						<TableRow
							label="Icon"
							subLabel={
								custom.icon === 'custom'
									? 'Your own SVG'
									: (iconById(custom.icon)?.name ?? 'None')
							}
							arrow
							onPress={() => navigation.navigate(ICONS_ROUTE)}
						/>
						<TableSwitchRow
							label="Icon only"
							subLabel="Drop the text and show just the icon"
							value={!!custom.iconOnly}
							onValueChange={value => setOverride(def.id, { iconOnly: value })}
						/>
						{custom.icon === 'custom' ? (
							<FieldRow
								label="Your own SVG"
								description={`Pasted markup, up to ${MAX_CUSTOM_SVG_LENGTH} characters. Saved only when it parses.`}
							>
								<TextInput
									placeholder="<svg viewBox='0 0 24 24'>…</svg>"
									value={svgDraft}
									multiline
									status={svgOk ? 'default' : 'error'}
									errorMessage={
										svgOk ? undefined : 'That is not SVG this can draw'
									}
									onChange={value => {
										setSvgDraft(value)
										if (!value.trim()) setOverride(def.id, { customSvg: '' })
										else if (isValidCustomSvg(value))
											setOverride(def.id, { customSvg: value })
									}}
								/>
							</FieldRow>
						) : null}
					</TableRowGroup>

					<TableRowGroup title="Colour" hasIcons>
						<TableSwitchRow
							label="Use my own colour"
							subLabel={`Off uses the tag's own ${def.defaultColor}`}
							value={!!custom.useCustomColor}
							onValueChange={value =>
								setOverride(def.id, { useCustomColor: value })
							}
						/>
						{custom.useCustomColor ? (
							<ColorInput
								label="Background"
								value={custom.color ?? ''}
								placeholder={def.defaultColor}
								onChange={value => setOverride(def.id, { color: value })}
							/>
						) : null}
					</TableRowGroup>

					<TableRowGroup title="Gradient" hasIcons>
						<TableSwitchRow
							label="Fade into a second colour"
							subLabel="Shown on profiles and member lists"
							value={!!custom.useGradient}
							onValueChange={value =>
								setOverride(def.id, { useGradient: value })
							}
						/>
						{custom.useGradient ? (
							<ColorInput
								label="Fades to"
								value={custom.gradientColor ?? ''}
								placeholder="#9B59B6"
								onChange={value =>
									setOverride(def.id, { gradientColor: value })
								}
							/>
						) : null}
					</TableRowGroup>

					<TableRowGroup hasIcons>
						<TableRow
							label="Reset this tag"
							subLabel="Back to its original text, colour and icon"
							variant="danger"
							onPress={confirmReset}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
