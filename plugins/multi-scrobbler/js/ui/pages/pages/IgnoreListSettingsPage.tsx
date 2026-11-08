import { Design } from '@valenced/discord/design'
import { confirmDestructive } from '../../../../../../shared/ui/confirm'
import { DEFAULTS } from '../../../defaults'
import { getStorage } from '../../../lib/state'
import { showToast } from '../../../lib/toasts'
import { SettingsPage } from '../../components/SettingsPage'
import { TextInputRow } from '../../components/TextInputRow'
import { FieldGroup } from '../../fieldGroup'
import { dangerIcon, rowIcon } from '../../icon'
import type { MultiScrobblerStorage } from '../../../types'

export default function IgnoreListSettingsPage() {
	// Read per-render, never at module scope (coding rule 1).
	const React = valenced.react.React
	const { TableRowGroup, TableRow, Text } = Design as any

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const set = (patch: Partial<MultiScrobblerStorage>) => storage?.set(patch)

	const [newAppName, setNewAppName] = React.useState('')

	const addAppToIgnoreList = () => {
		const name = newAppName.trim()
		if (!name) {
			showToast('Type an app name first')
			return
		}

		if (!s.ignoreList.includes(name)) {
			set({ ignoreList: [...s.ignoreList, name] })
			setNewAppName('')
			showToast(`Added ${name}`)
		} else {
			showToast(`${name} is already on the list`)
		}
	}

	const removeAppFromIgnoreList = (appName: string) => {
		confirmDestructive({
			title: `Remove ${appName}?`,
			body: 'Your music status will show again while it is on your profile.',
			action: 'Remove',
			onConfirm: () => {
				set({
					ignoreList: s.ignoreList.filter((app: string) => app !== appName),
				})
				showToast(`Removed ${appName}`)
			},
		})
	}

	return (
		<SettingsPage>
			<Text color="text-muted" variant="text-sm/normal">
				Use this when another app already puts your music on your Discord
				profile, like Spotify's own connection, Kizzy or Metrolist. While one of
				these shows on your profile, Multi Scrobbler hides its status, so your
				music doesn't show twice.
			</Text>
			<Text color="text-muted" variant="text-sm/normal">
				Type the name as it shows on your profile. Part of the name is enough,
				and capitals don't matter.
			</Text>
			<Text color="text-muted" variant="text-sm/normal">
				To choose which apps on this phone Music Bridge reads songs from, use
				Open Music Bridge in the settings instead.
			</Text>

			<FieldGroup label="App name">
				<TextInputRow
					placeholder="For example Spotify"
					value={newAppName}
					onChangeText={setNewAppName}
				/>
			</FieldGroup>

			<TableRowGroup hasIcons>
				<TableRow
					label="Add to the list"
					subLabel="Add the app name above"
					icon={rowIcon('PlusSmallIcon', 'PlusMediumIcon', 'ic_add_24px')}
					onPress={addAppToIgnoreList}
				/>
			</TableRowGroup>

			{s.ignoreList.length > 0 && (
				<TableRowGroup title="Hide while these show" hasIcons>
					{s.ignoreList.map((appName: string) => (
						<TableRow
							key={appName}
							label={appName}
							subLabel="Tap to remove"
							variant="danger"
							icon={dangerIcon('TrashIcon')}
							onPress={() => removeAppFromIgnoreList(appName)}
						/>
					))}
				</TableRowGroup>
			)}
		</SettingsPage>
	)
}
