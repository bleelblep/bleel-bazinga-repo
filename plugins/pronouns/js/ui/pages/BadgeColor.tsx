/**
 * Badge colour: one colour for everyone, or a colour per person. Split off the root page: see
 * docs/plugin-design-language.md §2.2.
 */

import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as React from 'react'
import * as ReactNative from 'react-native'
import { confirmDestructive } from '../../../../../shared/ui/confirm'
import { FieldGroup } from '../../../../../shared/ui/fieldGroup'
import { dangerIcon, rowIcon } from '../../../../../shared/ui/icon'
import { useBottomPadding } from '../../../../../shared/ui/safeArea'
import { isDark, PRESETS, parseColor, textOn } from '../../lib/color'
import { nameOf } from '../../lib/discord'
import { settings, update, useSettings } from '../../lib/state'
import { textInput } from '../textInput'

/** Swatches + hex field for one colour, shared by the global and per-person pickers. */
function ColorPicker({
	label,
	value,
	onChange,
	emptyHint,
}: {
	label: string
	value: string
	onChange(next: string): void
	emptyHint: string
}) {
	const { View, Pressable } = ReactNative
	const { Text } = Design
	const TextInput = textInput()
	const [draft, setDraft] = React.useState(value)
	const parsed = parseColor(draft)
	const current = parseColor(value)

	React.useEffect(() => setDraft(value), [value])

	const pick = (color: string) => {
		setDraft(color)
		onChange(color)
	}

	return (
		<FieldGroup
			label={label}
			description={
				current ? 'Choose a swatch or enter a hex or RGB colour.' : emptyHint
			}
		>
			<View style={{ gap: 12 }}>
				<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
					{PRESETS.map(color => (
						<Pressable
							key={color}
							accessibilityLabel={color}
							accessibilityRole="button"
							accessibilityState={{ selected: current === color }}
							onPress={() => pick(color)}
							style={{
								width: 32,
								height: 32,
								borderRadius: 16,
								backgroundColor: color,
								borderWidth: current === color ? 3 : 0,
								borderColor: isDark(color) ? '#FFFFFF' : '#000000',
							}}
						/>
					))}
				</View>
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
					{current ? (
						<View
							style={{
								paddingHorizontal: 8,
								paddingVertical: 2,
								borderRadius: 4,
								backgroundColor: current,
							}}
						>
							<Text variant="text-xs/bold" style={{ color: textOn(current) }}>
								they/them
							</Text>
						</View>
					) : null}
					<View style={{ flex: 1 }}>
						<TextInput
							placeholder="#5865F2"
							value={draft}
							autoCapitalize="none"
							autoCorrect={false}
							isClearable
							status={draft && !parsed ? 'error' : 'default'}
							errorMessage={
								draft && !parsed ? "That isn't a colour I can read" : undefined
							}
							onChange={(next: string) => {
								setDraft(next)
								const color = parseColor(next)
								if (color) onChange(color)
								else if (!next.trim()) onChange('')
							}}
						/>
					</View>
				</View>
			</View>
		</FieldGroup>
	)
}

/** The global picker: one colour for every badge. */
function GlobalColor({
	badgeColor,
	perPerson = false,
}: {
	badgeColor: string
	perPerson?: boolean
}) {
	const { TableRowGroup, TableRow } = Design
	const current = parseColor(badgeColor)
	return (
		<>
			<ColorPicker
				label={perPerson ? 'Default colour' : 'Global colour'}
				value={badgeColor}
				onChange={color => update({ badgeColor: color })}
				emptyHint="Discord's own tag colour. Tap a swatch or type one to change it."
			/>
			{current ? (
				<TableRowGroup hasIcons>
					<TableRow
						label="Use Discord's colour"
						icon={rowIcon('RefreshIcon', 'ArrowAngleLeftUpIcon')}
						onPress={() => update({ badgeColor: '' })}
					/>
				</TableRowGroup>
			) : null}
		</>
	)
}

/** The per-person picker: a list of people with their own colour, plus a default for anyone else. */
function PerPersonColor({
	perPersonColors,
	badgeColor,
}: {
	perPersonColors: Record<string, string | null>
	badgeColor: string
}) {
	const { TableRowGroup, TableRow } = Design
	const TextInput = textInput()
	const [id, setId] = React.useState('')
	const [editing, setEditing] = React.useState<string | undefined>(undefined)
	const people = Object.entries(perPersonColors).filter(
		(entry): entry is [string, string] => typeof entry[1] === 'string',
	)
	const validId = /^\d{15,21}$/.test(id.trim())

	const setPersonColor = (personId: string, color: string) => {
		update({
			perPersonColors: {
				...settings().perPersonColors,
				[personId]: color || null,
			},
		})
	}

	return (
		<>
			<TableRowGroup
				title={`People with their own colour (${people.length})`}
				hasIcons
			>
				{people.length === 0 ? (
					<TableRow
						label="No one yet"
						subLabel="Add someone by user ID below to give them their own badge colour."
						icon={rowIcon('UserCircleIcon', 'CompassIcon')}
					/>
				) : (
					people.map(([personId, color]) => {
						const name = nameOf(personId)
						const parsed = parseColor(color)
						return (
							<TableRow
								key={personId}
								label={name}
								subLabel={parsed ?? color}
								icon={rowIcon('UserCircleIcon', 'CompassIcon')}
								arrow={editing !== personId}
								onPress={() =>
									setEditing(editing === personId ? undefined : personId)
								}
							/>
						)
					})
				)}
			</TableRowGroup>

			{editing ? (
				<>
					<ColorPicker
						key={editing}
						label={`Colour for ${nameOf(editing)}`}
						value={
							typeof perPersonColors[editing] === 'string'
								? (perPersonColors[editing] as string)
								: ''
						}
						onChange={color => setPersonColor(editing, color)}
						emptyHint="Tap a swatch, or type hex like #F0B232 or RGB like 240, 178, 50."
					/>
					<TableRowGroup hasIcons>
						<TableRow
							variant="danger"
							label={`Remove ${nameOf(editing)}`}
							icon={dangerIcon('TrashIcon')}
							onPress={() => {
								const name = nameOf(editing)
								confirmDestructive({
									title: `Remove ${name}?`,
									body: 'Their badge goes back to the default colour below.',
									action: 'Remove',
									onConfirm: () => {
										const next = { ...settings().perPersonColors }
										delete next[editing]
										update({ perPersonColors: next })
										setEditing(undefined)
									},
								})
							}}
						/>
					</TableRowGroup>
				</>
			) : null}

			<FieldGroup
				label="Add by user ID"
				description="Developer Mode lets you copy anyone's ID from their profile."
			>
				<TextInput
					placeholder="123456789012345678"
					value={id}
					onChange={setId}
					keyboardType="number-pad"
				/>
			</FieldGroup>
			<TableRowGroup hasIcons>
				<TableRow
					label="Give this person a colour"
					icon={rowIcon('UserPlusIcon', 'PlusSmallIcon')}
					disabled={!validId}
					onPress={() => {
						const trimmed = id.trim()
						if (!validId) return
						setEditing(trimmed)
						setId('')
					}}
				/>
			</TableRowGroup>

			<GlobalColor badgeColor={badgeColor} perPerson />
		</>
	)
}

export default function BadgeColor() {
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, TableRowGroup, TableSwitchRow } = Design
	const s = useSettings()

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Badge colour" hasIcons>
						<TableSwitchRow
							label="Match their role colour"
							subLabel="Role colour takes priority in servers. Your chosen colours are used when no role colour is available."
							icon={rowIcon('PaintPaletteIcon', 'CompassIcon')}
							value={s.useRoleColor}
							onValueChange={(useRoleColor: boolean) =>
								update({ useRoleColor })
							}
						/>
						<TableSwitchRow
							label="One colour for everyone"
							subLabel="Off lets you pick a different colour per person, with a default for everyone else."
							icon={rowIcon('UsersIcon', 'CompassIcon')}
							value={s.colorMode === 'global'}
							onValueChange={(on: boolean) =>
								update({ colorMode: on ? 'global' : 'perPerson' })
							}
						/>
					</TableRowGroup>

					{s.colorMode === 'global' ? (
						<GlobalColor badgeColor={s.badgeColor} />
					) : (
						<PerPersonColor
							perPersonColors={s.perPersonColors}
							badgeColor={s.badgeColor}
						/>
					)}
				</Stack>
			</ScrollView>
		</Page>
	)
}
