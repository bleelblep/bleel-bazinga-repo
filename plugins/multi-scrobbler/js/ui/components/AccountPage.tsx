import { Design } from '@valenced/discord/design'
import * as ReactNative from 'react-native'
import { DEFAULTS } from '../../defaults'
import { getStorage } from '../../lib/state'
import { showToast } from '../../lib/toasts'
import { serviceFactory } from '../../services/ServiceFactory'
import { FieldRow } from '../fieldGroup'
import { rowIcon } from '../icon'
import { SettingsPage } from './SettingsPage'
import { TextInputRow } from './TextInputRow'
import type { MultiScrobblerStorage, ServiceType } from '../../types'

type Key = keyof MultiScrobblerStorage

export interface AccountConfig {
	service: ServiceType
	name: string
	usernameKey: Key
	secretKey: Key
	/** "API key" or "User token". */
	secretLabel: string
	secretDescription: string
	/** The page where people get the key or token. */
	secretUrl: string
	secretLinkLabel: string
	secretLinkDescription: string
}

/** One service's username, key and connection test (Last.fm, Libre.fm, ListenBrainz). */
export function AccountPage({ config }: { config: AccountConfig }) {
	// Read per-render, never at module scope (coding rule 1).
	const { TableRowGroup, TableRow, Text } = Design as any

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const set = (patch: Partial<MultiScrobblerStorage>) => storage?.set(patch)

	const testConnection = async () => {
		showToast(`Testing ${config.name} connection…`)
		try {
			const isValid = await serviceFactory.testService(config.service)
			showToast(
				isValid
					? `${config.name} connection works`
					: `${config.name} connection failed. Check the username and ${config.secretLabel.toLowerCase()}.`,
			)
		} catch {
			showToast(`Couldn't reach ${config.name}`)
		}
	}

	const openSecretPage = async () => {
		try {
			await ReactNative.Linking?.openURL(config.secretUrl)
		} catch {
			showToast(`Couldn't open the browser. Go to ${config.secretUrl}`)
		}
	}

	return (
		<SettingsPage>
			<TableRowGroup title="Account">
				<FieldRow label="Username">
					<TextInputRow
						placeholder={`Your ${config.name} username`}
						value={String(s[config.usernameKey] ?? '')}
						onChangeText={v =>
							set({ [config.usernameKey]: v } as Partial<MultiScrobblerStorage>)
						}
					/>
				</FieldRow>
				<FieldRow
					label={config.secretLabel}
					description={config.secretDescription}
				>
					<TextInputRow
						placeholder={config.secretLabel}
						value={String(s[config.secretKey] ?? '')}
						onChangeText={v =>
							set({ [config.secretKey]: v } as Partial<MultiScrobblerStorage>)
						}
						secureTextEntry
					/>
				</FieldRow>
			</TableRowGroup>

			<TableRowGroup hasIcons>
				<TableRow
					label="Test connection"
					subLabel={`Check the username and ${config.secretLabel.toLowerCase()} with ${config.name}`}
					icon={rowIcon('CircleCheckIcon', 'ic_check')}
					onPress={testConnection}
				/>
				<TableRow
					label={config.secretLinkLabel}
					subLabel={config.secretLinkDescription}
					icon={rowIcon('LinkIcon', 'ic_link')}
					arrow
					onPress={openSecretPage}
				/>
			</TableRowGroup>

			<Text color="text-muted" variant="text-sm/normal">
				{`These stay on this phone and are only sent to ${config.name}.`}
			</Text>
		</SettingsPage>
	)
}
