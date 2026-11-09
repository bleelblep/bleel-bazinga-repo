import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { ReactNavigationNative } from '@valenced/externals/react-navigation'
import * as ReactNative from 'react-native'
import { useChangelog } from '../../../../../shared/changelog'
import { DEFAULTS } from '../../defaults'
import { bridgeUpdate, type BridgeUpdate } from '../../lib/bridgeUpdate'
import { switchService } from '../../lib/manager'
import { showToast } from '../../lib/toasts'
import {
	BRIDGE_DOWNLOAD_URL,
	bridgeStatus,
	openBridge,
	requestBridge,
} from '../../services/MusicBridgeService'
import { serviceFactory } from '../../services/ServiceFactory'
import { SettingsPage } from '../components/SettingsPage'
import { Credit } from '../credit'
import { rowIcon } from '../icon'
import {
	DEBUG_ROUTE,
	DISPLAY_ROUTE,
	IGNORE_LIST_ROUTE,
	LASTFM_ROUTE,
	LIBREFM_ROUTE,
	LISTENBRAINZ_ROUTE,
	RPC_ROUTE,
} from './routes'
import type { PluginApi } from '@valenced/plugins/types'
import type { MultiScrobblerStorage, ServiceType } from '../../types'

/**
 * The intro card's "Don't show again" (settings design guide §4.3, as Ghost Log NG's
 * `confirmHideWarning`): asks first, then hides it for good. The scope line under the card
 * still says how each source works.
 */
function confirmHideIntro(hide: () => void) {
	const { AlertModal, AlertActionButton } = Design as any
	const alerts = AlertActionCreators as any
	const key = `multi-scrobbler-hide-intro-${Date.now()}`
	alerts.openAlert(
		key,
		<AlertModal
			title="Hide this note?"
			content="It won't be shown again, even after updates."
			actions={
				<>
					<AlertActionButton
						text="Hide"
						variant="primary"
						onPress={() => {
							alerts.dismissAlert(key)
							hide()
						}}
					/>
					<AlertActionButton
						text="Cancel"
						variant="secondary"
						onPress={() => alerts.dismissAlert(key)}
					/>
				</>
			}
		/>,
	)
}

/** Display names for the service picker. */
const SERVICE_LABELS: Record<ServiceType, string> = {
	lastfm: 'Last.fm',
	librefm: 'Libre.fm',
	listenbrainz: 'ListenBrainz',
	bridge: 'This phone',
}

/** The index page (settings design guide §2.2). */
export default function Settings({
	api,
}: {
	api: PluginApi<{ jsonStorage: MultiScrobblerStorage }>
}) {
	// The changelog icon at the top right, and "What's new" once after an update.
	useChangelog()
	// Read per-render, never at module scope (coding rule 1).
	const { View } = ReactNative
	const {
		Card,
		Text,
		TableRowGroup,
		TableRow,
		TableRadioGroup,
		TableRadioRow,
		Button,
	} = Design as any
	const { useNavigation } = ReactNavigationNative

	const navigation = useNavigation() as { navigate: (route: string) => void }
	const React = valenced.react.React

	// When the Music Bridge app last spoke: 0 = not this session, -1 = no Android half (iOS).
	const [bridgeHeard, setBridgeHeard] = React.useState<number>(0)
	const [update, setUpdate] = React.useState<BridgeUpdate | null>(null)
	React.useEffect(() => {
		let live = true
		let tries = 0
		let timer: ReturnType<typeof setTimeout> | undefined
		// Ask the bridge once, then look a few times: its answer takes a moment to arrive.
		const check = () =>
			void bridgeStatus().then(status => {
				if (!live) return
				if (!status?.listening) return setBridgeHeard(-1)
				if (status.heardAt > 0) {
					void bridgeUpdate().then(u => live && setUpdate(u))
					return setBridgeHeard(status.now - status.heardAt)
				}
				if (tries === 0) void requestBridge()
				if (++tries < 6) timer = setTimeout(check, 1000)
			})
		check()
		return () => {
			live = false
			if (timer) clearTimeout(timer)
		}
	}, [])
	const s = { ...DEFAULTS, ...(api.jsonStorage.use() ?? {}) }
	const set = (patch: Partial<MultiScrobblerStorage>) =>
		api.jsonStorage.set({ ...s, ...patch })

	const currentService = s.service as ServiceType | undefined

	/** Each service's state: green "Connected" once it's set up (or the bridge has spoken). */
	const serviceState = (
		service: ServiceType,
	): { ok: boolean; text: string } => {
		switch (service) {
			case 'lastfm':
				return s.username && s.apiKey
					? { ok: true, text: 'Connected' }
					: { ok: false, text: 'Username or API key missing' }
			case 'librefm':
				return s.librefmUsername && s.librefmApiKey
					? { ok: true, text: 'Connected' }
					: { ok: false, text: 'Username or API key missing' }
			case 'listenbrainz':
				return s.listenbrainzUsername
					? { ok: true, text: 'Connected' }
					: { ok: false, text: 'Username missing' }
			case 'bridge':
				if (bridgeHeard < 0) return { ok: false, text: 'Only on Android' }
				return bridgeHeard > 0
					? { ok: true, text: 'Connected' }
					: { ok: false, text: 'Not heard yet. Open Music Bridge below' }
			default:
				return { ok: false, text: 'Unknown' }
		}
	}

	/** The state as a row's sub-label: green when connected, red when not. */
	const stateLabel = (service: ServiceType) => {
		const { ok, text } = serviceState(service)
		return (
			<Text
				variant="text-sm/medium"
				color={ok ? 'text-feedback-positive' : 'text-feedback-critical'}
			>
				{text}
			</Text>
		)
	}

	const handleServiceChange = (service: ServiceType) => {
		if (service !== currentService) {
			set({ service })
			switchService(service)
		}
	}

	return (
		<SettingsPage>
			{!s.introDismissed && (
				<Card variant="secondary" border="none">
					<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
						<Text color="text-default" variant="text-md/semibold">
							Your music, as your Discord status
						</Text>
						<Text
							color="text-muted"
							variant="text-sm/normal"
							style={{ marginTop: 8 }}
						>
							Every few seconds this checks what you're playing, and shows it as
							"Listening to" on your profile, with the song, artist and album
							art.
						</Text>
						<View style={{ marginTop: 12, alignItems: 'flex-start' }}>
							<Button
								text="Don't show again"
								size="sm"
								variant="secondary"
								onPress={() =>
									confirmHideIntro(() => set({ introDismissed: true }))
								}
							/>
						</View>
					</View>
				</Card>
			)}

			<Text color="text-muted" variant="text-sm/normal">
				Last.fm, Libre.fm and ListenBrainz read your scrobbles, so the song must
				already scrobble there. "This phone" reads whatever this phone is
				playing, through the Music Bridge app.
			</Text>

			<TableRowGroup title="Service">
				<TableRadioGroup
					defaultValue={currentService}
					onChange={handleServiceChange}
				>
					{serviceFactory.getSupportedServices().map(service => (
						<TableRadioRow
							key={service}
							value={service}
							label={SERVICE_LABELS[service]}
							subLabel={stateLabel(service)}
						/>
					))}
				</TableRadioGroup>
			</TableRowGroup>

			{/* One row per service, in the same order as the list above. */}
			<TableRowGroup title="Set up" hasIcons>
				<TableRow
					label="Last.fm"
					icon={rowIcon('UserIcon', 'ic_person')}
					arrow
					onPress={() => navigation.navigate(LASTFM_ROUTE)}
				/>
				<TableRow
					label="Libre.fm"
					icon={rowIcon('UserIcon', 'ic_person')}
					arrow
					onPress={() => navigation.navigate(LIBREFM_ROUTE)}
				/>
				<TableRow
					label="ListenBrainz"
					icon={rowIcon('UserIcon', 'ic_person')}
					arrow
					onPress={() => navigation.navigate(LISTENBRAINZ_ROUTE)}
				/>
				{bridgeHeard >= 0 && (
					<TableRow
						label="This phone"
						subLabel="Opens Music Bridge, to choose which apps it reads songs from"
						icon={rowIcon('HeadphonesIcon', 'MusicIcon')}
						arrow
						onPress={() =>
							void openBridge().then(opened => {
								if (!opened)
									showToast(
										"Music Bridge isn't installed. Tap Get Music Bridge",
									)
							})
						}
					/>
				)}
				{bridgeHeard >= 0 && (
					<TableRow
						label={update ? 'Update Music Bridge' : 'Get Music Bridge'}
						subLabel={
							update
								? `${update.installed ?? 'Your version'} → ${update.latest.name}. Downloads the new version; install it over the old one`
								: 'Free app for This phone, Android 10+. Downloads the newest version'
						}
						icon={rowIcon('DownloadIcon', 'ic_download_24px')}
						arrow
						onPress={() =>
							void ReactNative.Linking?.openURL(BRIDGE_DOWNLOAD_URL)
						}
					/>
				)}
			</TableRowGroup>

			<TableRowGroup title="Status" hasIcons>
				<TableRow
					label="Display"
					subLabel="App name and how often to check"
					icon={rowIcon('SettingsIcon', 'ic_settings')}
					arrow
					onPress={() => navigation.navigate(DISPLAY_ROUTE)}
				/>
				<TableRow
					label="Status details"
					subLabel="Listening or playing, timestamp and album art tooltip"
					icon={rowIcon('MusicIcon', 'ic_music')}
					arrow
					onPress={() => navigation.navigate(RPC_ROUTE)}
				/>
				<TableRow
					label="Hide for other apps"
					subLabel={
						s.ignoreList.length
							? `Hides your music status while ${s.ignoreList.length} other app${s.ignoreList.length === 1 ? '' : 's'} show on your profile`
							: 'Hide your music status when Spotify or another app already shows it'
					}
					icon={rowIcon('EyeSlashIcon', 'ic_hide')}
					arrow
					onPress={() => navigation.navigate(IGNORE_LIST_ROUTE)}
				/>
			</TableRowGroup>

			<TableRowGroup title="Developer" hasIcons>
				<TableRow
					label="Debug"
					subLabel="Verbose logging, connection status and the last song seen"
					icon={rowIcon('BugIcon', 'ic_debug')}
					arrow
					onPress={() => navigation.navigate(DEBUG_ROUTE)}
				/>
			</TableRowGroup>

			<Credit />
		</SettingsPage>
	)
}
