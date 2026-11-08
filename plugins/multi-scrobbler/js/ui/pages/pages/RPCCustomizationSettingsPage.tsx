import { Design } from '@valenced/discord/design'
import { DEFAULTS } from '../../../defaults'
import { getStorage } from '../../../lib/state'
import { SettingsPage } from '../../components/SettingsPage'
import { rowIcon } from '../../icon'
import RPCPreview from './components/RPCPreview'
import type { MultiScrobblerStorage } from '../../../types'

export default function RPCCustomizationSettingsPage() {
	// Read per-render, never at module scope (coding rule 1).
	const { TableRowGroup, TableSwitchRow } = Design as any

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const set = (patch: Partial<MultiScrobblerStorage>) => storage?.set(patch)

	// Same rule as upstream: the timestamp only works with "Listening to", so turning that off
	// turns the timestamp off too.
	const setListeningTo = (value: boolean) => {
		if (!value && s.showTimestamp)
			set({ listeningTo: value, showTimestamp: false })
		else set({ listeningTo: value })
	}

	return (
		<SettingsPage>
			<RPCPreview />

			<TableRowGroup title="Status" hasIcons>
				<TableSwitchRow
					label="Show as listening"
					subLabel={`"Listening to" instead of "Playing"`}
					icon={rowIcon('HeadphonesIcon', 'MusicIcon')}
					value={s.listeningTo}
					onValueChange={setListeningTo}
				/>
				<TableSwitchRow
					label="Show timestamp"
					subLabel={
						s.listeningTo
							? 'How far into the song you are, and how long it is'
							: 'Needs "Show as listening" on'
					}
					icon={rowIcon('ClockIcon', 'ic_timer')}
					value={s.showTimestamp}
					disabled={!s.listeningTo}
					onValueChange={(value: boolean) => {
						if (s.listeningTo) set({ showTimestamp: value })
					}}
				/>
			</TableRowGroup>

			<TableRowGroup title="Album art tooltip" hasIcons>
				<TableSwitchRow
					label="Show tooltip text"
					subLabel="Text shown when someone holds your album art"
					icon={rowIcon('ChatIcon', 'ic_message')}
					value={s.showLargeText}
					onValueChange={(value: boolean) => set({ showLargeText: value })}
				/>
				<TableSwitchRow
					label="Album name"
					subLabel="Include the album in the tooltip"
					icon={rowIcon('DiscIcon', 'MusicIcon')}
					value={s.showAlbumInTooltip}
					onValueChange={(value: boolean) => set({ showAlbumInTooltip: value })}
				/>
				<TableSwitchRow
					label="Song length"
					subLabel="Include how long the song is in the tooltip"
					icon={rowIcon('TimerIcon', 'ClockIcon')}
					value={s.showDurationInTooltip}
					onValueChange={(value: boolean) =>
						set({ showDurationInTooltip: value })
					}
				/>
			</TableRowGroup>
		</SettingsPage>
	)
}
