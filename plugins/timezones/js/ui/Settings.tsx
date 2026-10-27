import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import * as React from 'react'
import * as ReactNative from 'react-native'
import { useChangelog } from '../../../../shared/changelog'
import { confirmDestructive } from '../../../../shared/ui/confirm'
import { FieldGroup } from '../../../../shared/ui/fieldGroup'
import { dangerIcon, rowIcon } from '../../../../shared/ui/icon'
import { useBottomPadding } from '../../../../shared/ui/safeArea'
import { pickZone } from '../lib/picker'
import { refetch } from '../lib/shared'
import { bindSettingsStorage, setPersonZone, update, useSettings } from '../lib/state'
import { intlZonesWork, timeIn, zoneName } from '../lib/zones'
import { showToast } from '../../../../shared/toast'

/** Their current Discord name, falling back to the one saved with the entry. */
function nameOf(id: string, saved?: string): string {
	try {
		const user = (Stores as any).UserStore?.getUser?.(id)
		const name = user?.globalName ?? user?.global_name ?? user?.username
		if (name) return name
	} catch {
		/* store not ready */
	}
	return saved || `User ${id}`
}

function nowLine(zone: string, hour24: boolean, place?: string): string {
	const where = place ?? zone
	const time = timeIn(zone, Date.now(), hour24)
	return time ? `${time.time}${time.otherDay ? ` ${time.otherDay}` : ''} · ${where}` : `${where} · can't be shown here`
}

function People() {
	const s = useSettings()
	const { TableRowGroup, TableRow } = Design as any
	const [selected, setSelected] = React.useState<string | undefined>()
	// Re-render every minute so the times stay current while the page is open.
	const [, tick] = React.useReducer((n: number) => n + 1, 0)
	React.useEffect(() => {
		const timer = setInterval(tick, 60_000)
		return () => clearInterval(timer)
	}, [])
	const people = Object.entries(s.people)
		.filter((entry): entry is [string, NonNullable<(typeof entry)[1]>] => !!entry[1])
		.sort((a, b) => nameOf(a[0], a[1].name).localeCompare(nameOf(b[0], b[1].name)))

	return (
		<>
			<TableRowGroup title={`Timezones you set (${people.length})`} hasIcons>
				{people.length === 0 ? (
					<TableRow
						label="No one yet"
						subLabel="Long-press someone's message and choose Set their timezone, or add them by user ID below."
						icon={rowIcon('UserCircleIcon', 'CompassIcon')}
					/>
				) : (
					people.map(([id, entry]) => (
						<TableRow
							key={id}
							label={nameOf(id, entry.name)}
							subLabel={nowLine(entry.zone, s.hour24, entry.place)}
							icon={rowIcon('UserCircleIcon', 'CompassIcon')}
							onPress={() => setSelected(selected === id ? undefined : id)}
						/>
					))
				)}
			</TableRowGroup>
			{selected && s.people[selected] && <PersonActions id={selected} />}
		</>
	)
}

function PersonActions({ id }: { id: string }) {
	const s = useSettings()
	const { TableRowGroup, TableRow } = Design as any
	const entry = s.people[id]
	const name = nameOf(id, entry?.name)
	return (
		<TableRowGroup title={name} hasIcons>
			<TableRow
				label="Change timezone"
				subLabel={entry ? (entry.place ?? zoneName(entry.zone)) : undefined}
				icon={rowIcon('PencilIcon', 'ic_edit')}
				onPress={() => pickZone(id, name)}
			/>
			<TableRow
				label="Remove"
				subLabel={s.sharedLookup ? 'Their time goes back to the shared list, if they are on it.' : undefined}
				variant="danger"
				icon={dangerIcon('TrashIcon')}
				onPress={() =>
					confirmDestructive({
						title: `Remove ${name}?`,
						body: 'Their local time stops showing next to their messages.',
						action: 'Remove',
						onConfirm: () => setPersonZone(id, name, undefined),
					})
				}
			/>
		</TableRowGroup>
	)
}

function AddById() {
	const s = useSettings()
	const { TableRowGroup, TableRow, TextInput } = Design as any
	const [id, setId] = React.useState('')
	const trimmed = id.trim()
	const valid = /^\d{15,21}$/.test(trimmed)
	return (
		<>
			<FieldGroup
				label="Add by user ID"
				description="Developer Mode lets you copy anyone's ID from their profile."
			>
				<TextInput placeholder="123456789012345678" value={id} onChange={setId} keyboardType="number-pad" />
			</FieldGroup>
			<TableRowGroup hasIcons>
				<TableRow
					label="Choose their timezone"
					icon={rowIcon('ClockIcon', 'PlusSmallIcon')}
					arrow
					disabled={!valid}
					onPress={() => {
						pickZone(trimmed, nameOf(trimmed))
						setId('')
					}}
				/>
				{s.sharedLookup && (
					<TableRow
						label="Look them up again"
						subLabel="Ask the shared list about this ID now."
						icon={rowIcon('RefreshIcon', 'ArrowAngleLeftUpIcon')}
						disabled={!valid}
						onPress={() => {
							refetch(trimmed)
							showToast('Looking them up…', 'TimezonesRefetchToast')
						}}
					/>
				)}
			</TableRowGroup>
		</>
	)
}

export default function Settings({ api }: { api?: { jsonStorage?: any } }) {
	bindSettingsStorage(api?.jsonStorage)
	useChangelog()
	const s = useSettings()
	const { Page } = components
	const { ScrollView, View } = ReactNative
	const { Stack, Card, Text, TableRowGroup, TableSwitchRow } = Design as any

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<Card variant="secondary" border="none">
						<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
							<Text color="text-default" variant="text-md/semibold">
								Their time, beside their messages
							</Text>
							<Text color="text-muted" variant="text-sm/normal" style={{ marginTop: 8 }}>
								Long-press someone's message to set their timezone. Only you see it.
							</Text>
						</View>
					</Card>
					{!intlZonesWork() && (
						<Text color="text-feedback-critical" variant="text-sm/normal">
							This Discord build can't work out city timezones, so only offsets like +5:30 show.
						</Text>
					)}
					<TableRowGroup title="Chat" hasIcons>
						<TableSwitchRow
							label="Show in chat"
							subLabel="Their local time after the timestamp on their messages."
							icon={rowIcon('ClockIcon', 'ic_clock')}
							value={s.showInChat}
							onValueChange={(showInChat: boolean) => update({ showInChat })}
						/>
						<TableSwitchRow
							label="24-hour time"
							subLabel={s.hour24 ? '15:02' : '3:02 PM'}
							icon={rowIcon('TimerIcon', 'ClockIcon')}
							value={s.hour24}
							onValueChange={(hour24: boolean) => update({ hour24 })}
						/>
						<TableSwitchRow
							label="Show their day"
							subLabel="Add the weekday when it's a different day for them, like 3:02 AM Tue."
							icon={rowIcon('CalendarIcon', 'ClockIcon')}
							value={s.showDay}
							onValueChange={(showDay: boolean) => update({ showDay })}
						/>
					</TableRowGroup>
					<TableRowGroup title="Lookups" hasIcons>
						<TableSwitchRow
							label="Use the shared timezone list"
							subLabel="For people you haven't set, ask timezonedb.catvibers.me, where people add their own timezone. Sends it the IDs of people whose messages you see."
							icon={rowIcon('GlobeEarthIcon', 'ic_link')}
							value={s.sharedLookup}
							onValueChange={(sharedLookup: boolean) => update({ sharedLookup })}
						/>
						<TableSwitchRow
							label="Search places online"
							subLabel="Find any town or city when picking a timezone, through Open-Meteo. Sends only what you type. Countries and big cities work without it."
							icon={rowIcon('MagnifyingGlassIcon', 'CompassIcon')}
							value={s.placeSearch}
							onValueChange={(placeSearch: boolean) => update({ placeSearch })}
						/>
					</TableRowGroup>
					<People />
					<AddById />
				</Stack>
			</ScrollView>
		</Page>
	)
}
