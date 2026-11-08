import { Design } from '@valenced/discord/design'
import Constants from '../../../constants'
import { DEFAULTS } from '../../../defaults'
import { getStorage } from '../../../lib/state'
import { SettingsPage } from '../../components/SettingsPage'
import { TextInputRow } from '../../components/TextInputRow'
import { FieldGroup, FieldRow } from '../../fieldGroup'
import type { MultiScrobblerStorage } from '../../../types'

export default function DisplaySettingsPage() {
	// Read per-render, never at module scope (coding rule 1).
	const { TableRowGroup, Slider, Text } = Design as any

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const set = (patch: Partial<MultiScrobblerStorage>) => storage?.set(patch)

	const isLibreFm = s.service === 'librefm'
	const currentInterval = Number(s.timeInterval)

	return (
		<SettingsPage>
			<FieldGroup
				label="App name"
				description={`Shown after "Listening to". You can use {{artist}}, {{name}}, {{album}} and {{service}}. Default: ${Constants.DEFAULT_APP_NAME}.`}
			>
				<TextInputRow
					placeholder={Constants.DEFAULT_APP_NAME}
					value={s.appName}
					onChangeText={v => set({ appName: v })}
				/>
			</FieldGroup>

			<TableRowGroup>
				<FieldRow
					label={`Update interval — ${isLibreFm ? `${Constants.LIBREFM_MIN_UPDATE_INTERVAL}s` : `${currentInterval}s`}`}
				>
					<Text color="text-muted" variant="text-sm/normal">
						{isLibreFm
							? `Libre.fm asks for at most one check a minute, so it's fixed at ${Constants.LIBREFM_MIN_UPDATE_INTERVAL}s.`
							: `How often to check for a new song. ${Constants.MIN_UPDATE_INTERVAL}s to 300s.`}
					</Text>
					<Slider
						step={1}
						value={currentInterval}
						minimumValue={Constants.MIN_UPDATE_INTERVAL}
						maximumValue={300}
						onValueChange={(v: number) => {
							if (!isLibreFm) set({ timeInterval: Math.round(v) })
						}}
					/>
				</FieldRow>
			</TableRowGroup>
		</SettingsPage>
	)
}
