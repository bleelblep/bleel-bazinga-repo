/**
 * "Timezone for <name>": a search box and the matching zones in Discord's alert dialog, used from
 * the message long-press sheet and the settings page, so both look the same. Tapping a zone saves
 * it; Clear removes yours.
 *
 * Call from an event handler: `valenced.*` is read here, so module scope is out (coding rule 1).
 */

import * as React from 'react'
import * as ReactNative from 'react-native'
import { zoneFor } from './resolve'
import { setPersonZone, settings } from './state'
import { searchPlaces } from './places'
import { searchZones, timeIn, zoneName, type ZoneMatch } from './zones'
import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { showToast } from '../../../../shared/toast'
import { reportError } from '../../../../shared/report'

const TAG = '[Timezones]'
const KEY = 'TimezonesPicker'

function nowLine(zone: string): string {
	const time = timeIn(zone, Date.now(), settings().hour24)
	if (!time) return "This phone can't show this zone"
	return `${time.time}${time.otherDay ? ` ${time.otherDay}` : ''} now · ${time.offset}`
}

// Wait this long after the last keystroke before searching online.
const PLACE_DEBOUNCE_MS = 450

/** Online places for [query] (lib/places.ts), debounced; idle until 2+ letters or when switched off. */
function usePlaces(query: string): { places: ZoneMatch[]; state: 'idle' | 'loading' | 'done' | 'failed' } {
	const [result, setResult] = React.useState<{ q: string; places: ZoneMatch[]; failed: boolean } | undefined>()
	const text = query.trim()
	// Offsets and full zone names are answered offline.
	const wanted = settings().placeSearch && text.length >= 2 && !/^[+-]?\d/.test(text) && !text.includes('/')
	React.useEffect(() => {
		if (!wanted) return
		let live = true
		const timer = setTimeout(() => {
			searchPlaces(text).then(
				places => live && setResult({ q: text, places, failed: false }),
				() => live && setResult({ q: text, places: [], failed: true }),
			)
		}, PLACE_DEBOUNCE_MS)
		return () => {
			live = false
			clearTimeout(timer)
		}
	}, [text, wanted])
	if (!wanted) return { places: [], state: 'idle' }
	if (result?.q !== text) return { places: [], state: 'loading' }
	return { places: result.places, state: result.failed ? 'failed' : 'done' }
}

function ZoneList({ current, onPick }: { current?: string; onPick(match: ZoneMatch): void }) {
	const { TextInput, TableRowGroup, TableRow } = Design as any
	const { ScrollView, View } = ReactNative
	const [query, setQuery] = React.useState('')
	const matches = searchZones(query)
	const online = usePlaces(query)
	// An online place already listed offline under the same zone and name adds nothing.
	const places = online.places.filter(p => !matches.some(m => m.zone === p.zone && m.title === p.title))
	const row = (match: ZoneMatch, i: number) => (
		<TableRow
			key={`${match.zone}|${match.title}|${i}`}
			label={match.zone === current ? `${match.title} ✓` : match.title}
			subLabel={[match.detail, nowLine(match.zone)].filter(Boolean).join(' · ')}
			onPress={() => onPick(match)}
		/>
	)
	const placesNote =
		online.state === 'loading'
			? 'Searching places…'
			: online.state === 'failed'
				? "Couldn't search places online."
				: online.state === 'done' && places.length === 0 && matches.length === 0
					? 'No place by that name.'
					: undefined
	return (
		<View style={{ gap: 12 }}>
			<TextInput
				placeholder="A country, city or town, or an offset like +5:30"
				autoCapitalize="none"
				autoCorrect={false}
				value={query}
				onChange={setQuery}
			/>
			<ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
				<View style={{ gap: 12 }}>
					{matches.length > 0 && <TableRowGroup title={query.trim() ? 'Countries and zones' : undefined}>{matches.map(row)}</TableRowGroup>}
					{(places.length > 0 || placesNote) && (
						<TableRowGroup title="Places">
							{places.map(row)}
							{placesNote && <TableRow label={placesNote} />}
						</TableRowGroup>
					)}
					{matches.length === 0 && online.state === 'idle' && (
						<TableRowGroup>
							<TableRow label="No matching timezone" subLabel="Try their country, a big city near them, or an offset like -4." />
						</TableRowGroup>
					)}
				</View>
			</ScrollView>
		</View>
	)
}

export function pickZone(userId: string, name: string) {
	const { AlertModal, AlertActionButton } = Design as any
	const alerts = AlertActionCreators as any
	const entry = settings().people[userId]
	const yours = entry?.zone
	const found = zoneFor(userId)
	const save = (zone: string | undefined, place?: string) => {
		alerts.dismissAlert(KEY)
		try {
			// update() redraws their recent messages (patches/chat.ts listens).
			setPersonZone(userId, name, zone, place)
			showToast(zone ? `${name}: ${place ?? zoneName(zone)}` : `Timezone for ${name} cleared.`, 'TimezonesSavedToast')
		} catch (error) {
			reportError(`${TAG} saving the timezone failed:`, error)
		}
	}
	const content = yours
		? `Set to ${entry?.place ? `${entry.place} (${yours})` : yours}. Pick another, or clear it.`
		: found
			? `The shared list says ${found.zone}. Picking one here overrides it for you.`
			: 'Their local time shows next to their messages. Only you see this.'
	alerts.openAlert(
		KEY,
		<AlertModal
			title={`Timezone for ${name}`}
			content={content}
			extraContent={<ZoneList current={yours ?? found?.zone} onPick={match => save(match.zone, match.place)} />}
			actions={
				<>
					{yours && <AlertActionButton text="Clear" variant="destructive" onPress={() => save(undefined)} />}
					<AlertActionButton text="Cancel" variant="secondary" onPress={() => alerts.dismissAlert(KEY)} />
				</>
			}
		/>,
	)
}
