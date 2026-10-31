/**
 * Whose pronouns show, the lists that back it, and the pronouns you've set yourself per person.
 * Split off the root page: see docs/plugin-design-language.md §2.2.
 */

import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as React from 'react'
import * as ReactNative from 'react-native'
import { confirmDestructive } from '../../../../../shared/ui/confirm'
import { FieldGroup } from '../../../../../shared/ui/fieldGroup'
import { dangerIcon, rowIcon } from '../../../../../shared/ui/icon'
import { useBottomPadding } from '../../../../../shared/ui/safeArea'
import { nameOf } from '../../lib/discord'
import { addToList, clearList, entries, removeFromList } from '../../lib/filter'
import { promptOverride } from '../../lib/promptOverride'
import { refetch } from '../../lib/pronounDB'
import { resolve } from '../../lib/resolve'
import { settings, update, useSettings } from '../../lib/state'
import { showToast } from '../../lib/toast'
import { textInput } from '../textInput'
import type { ListKey } from '../../lib/filter'
import type { FilterMode } from '../../lib/state'

const LISTS: Record<
	'only' | 'except',
	{ key: ListKey; title: string; verb: string; hint: string }
> = {
	only: {
		key: 'showList',
		title: 'Showing pronouns for',
		verb: 'Show',
		hint: 'Long-press someone’s message and choose Show their pronouns, or add them by user ID below.',
	},
	except: {
		key: 'hideList',
		title: 'Hiding pronouns for',
		verb: 'Hide',
		hint: 'Long-press someone’s message and choose Hide their pronouns, or add them by user ID below.',
	},
}

function pronounsLine(id: string): string {
	const found = resolve(id)
	return found ? found.text : 'No pronouns found yet'
}

function PeopleList({ list }: { list: (typeof LISTS)['only'] }) {
	const { TableRowGroup, TableRow } = Design
	const TextInput = textInput()
	const [id, setId] = React.useState('')
	const [selected, setSelected] = React.useState<string | undefined>()
	const people = entries(list.key)
	const validId = /^\d{15,21}$/.test(id.trim())

	return (
		<>
			<TableRowGroup title={`${list.title} (${people.length})`} hasIcons>
				{people.length === 0 ? (
					<TableRow
						label="No one yet"
						subLabel={list.hint}
						icon={rowIcon('UserCircleIcon', 'CompassIcon')}
					/>
				) : (
					people.map(person => {
						const name = nameOf(person.id, person.name)
						return (
							<TableRow
								key={person.id}
								label={name}
								subLabel={pronounsLine(person.id)}
								icon={rowIcon('UserCircleIcon', 'CompassIcon')}
								onPress={() => setSelected(person.id)}
							/>
						)
					})
				)}
			</TableRowGroup>
			{selected && people.some(person => person.id === selected) && (
				<PersonActions id={selected} listKey={list.key} />
			)}
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
					label={`${list.verb} this person`}
					icon={rowIcon('UserPlusIcon', 'PlusSmallIcon')}
					disabled={!validId}
					onPress={() => {
						const trimmed = id.trim()
						addToList(list.key, trimmed, nameOf(trimmed))
						setId('')
					}}
				/>
				{people.length > 0 && (
					<TableRow
						variant="danger"
						label="Clear list"
						icon={dangerIcon('TrashIcon')}
						onPress={() =>
							confirmDestructive({
								title: 'Clear the list?',
								body: `Removes all ${people.length} ${people.length === 1 ? 'person' : 'people'}.`,
								action: 'Clear',
								onConfirm: () => clearList(list.key),
							})
						}
					/>
				)}
			</TableRowGroup>
		</>
	)
}

/** Selecting an override reveals separate editing and removal actions. */
function Overrides() {
	const s = useSettings()
	const [selected, setSelected] = React.useState<string | undefined>()
	const { TableRowGroup, TableRow } = Design
	const people = Object.entries(s.overrides).filter(
		(entry): entry is [string, string] => typeof entry[1] === 'string',
	)
	if (!people.length) return null
	return (
		<>
			<TableRowGroup title="Pronouns you set" hasIcons>
				{people.map(([id, text]) => {
					const name = nameOf(id)
					return (
						<TableRow
							key={id}
							label={name}
							subLabel={text}
							icon={rowIcon('PencilIcon', 'CompassIcon')}
							onPress={() => setSelected(id)}
						/>
					)
				})}
			</TableRowGroup>
			{selected && s.overrides[selected] && <PersonActions id={selected} />}
		</>
	)
}

/** Standard action rows for the selected person. */
function PersonActions({ id, listKey }: { id: string; listKey?: ListKey }) {
	const { TableRowGroup, TableRow } = Design
	const s = useSettings()
	const name = nameOf(id)
	return (
		<TableRowGroup title={name} hasIcons>
			<TableRow
				label="Edit pronouns"
				subLabel={pronounsLine(id)}
				icon={rowIcon('PencilIcon', 'ic_edit')}
				onPress={() => promptOverride(id, name)}
			/>
			{s.pronounDbEnabled && (
				<TableRow
					label="Look up again"
					subLabel="Refresh this person's PronounDB result. Your override still takes priority."
					icon={rowIcon('RefreshIcon', 'ArrowAngleLeftUpIcon')}
					onPress={() => {
						if (!settings().pronounDbEnabled) return
						refetch(id)
						showToast(
							`Looking up pronouns for ${name}…`,
							'PronounsRefetchToast',
						)
					}}
				/>
			)}
			{s.overrides[id] && (
				<TableRow
					label="Clear pronoun override"
					variant="danger"
					icon={dangerIcon('TrashIcon')}
					onPress={() =>
						confirmDestructive({
							title: `Clear pronouns for ${name}?`,
							body: 'Their badge goes back to their profile pronouns.',
							action: 'Clear',
							onConfirm: () =>
								update({ overrides: { ...settings().overrides, [id]: null } }),
						})
					}
				/>
			)}
			{listKey && (
				<TableRow
					label="Remove from list"
					variant="danger"
					icon={dangerIcon('TrashIcon')}
					onPress={() =>
						confirmDestructive({
							title: `Remove ${name}?`,
							body:
								listKey === 'showList'
									? 'Their pronouns stop showing in picked-people mode.'
									: 'Their pronouns show again in hidden-people mode.',
							action: 'Remove',
							onConfirm: () => removeFromList(listKey, id),
						})
					}
				/>
			)}
		</TableRowGroup>
	)
}

export default function People() {
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, TableRadioGroup, TableRadioRow } = Design
	const s = useSettings()
	const list =
		s.filterMode === 'only' || s.filterMode === 'except'
			? LISTS[s.filterMode]
			: undefined

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRadioGroup
						key={`filterMode-${s.filterMode}`}
						title="Whose pronouns show"
						description="Both lists are kept when you switch, so you can go back to either."
						hasIcons
						defaultValue={s.filterMode}
						onChange={(filterMode: FilterMode) => update({ filterMode })}
					>
						<TableRadioRow
							label="Everyone"
							value="everyone"
							icon={rowIcon('GlobeEarthIcon', 'CompassIcon')}
						/>
						<TableRadioRow
							label={`Only people I pick (${entries('showList').length})`}
							value="only"
							icon={rowIcon('EyeIcon', 'CompassIcon')}
						/>
						<TableRadioRow
							label={`Everyone except people I hide (${entries('hideList').length})`}
							value="except"
							icon={rowIcon('EyeSlashIcon', 'CompassIcon')}
						/>
					</TableRadioGroup>

					{list && <PeopleList key={list.key} list={list} />}

					<Overrides />
				</Stack>
			</ScrollView>
		</Page>
	)
}
