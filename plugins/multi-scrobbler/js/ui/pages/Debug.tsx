import { DEFAULTS } from '../../defaults'
import {
	logComponentError,
	logComponentMount,
	useDebugInfo,
} from '../../lib/debug'
import { getStorage } from '../../lib/state'
import { SettingsPage } from '../components/SettingsPage'
import { rowIcon } from '../icon'
import type { MultiScrobblerStorage } from '../../types'

/**
 * Verbose logging (upstream's Logging page) plus the live status. Upstream shows this to users,
 * so it stays reachable from the main page's Developer group rather than behind `DEBUG`.
 */
function LoggingGroup() {
	const { TableRowGroup, TableSwitchRow } = valenced.discord.design
		.Design as any
	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const set = (patch: Partial<MultiScrobblerStorage>) => storage?.set(patch)
	return (
		<TableRowGroup title="Logging" hasIcons>
			<TableSwitchRow
				label="Verbose logging"
				subLabel="Write API calls, song changes and errors to the app's console"
				icon={rowIcon('BugIcon', 'ic_debug')}
				value={s.verboseLogging}
				onValueChange={(value: boolean) => set({ verboseLogging: value })}
			/>
		</TableRowGroup>
	)
}

export default function Debug() {
	const React = valenced.react.React
	const { TableRowGroup, TableRow } = valenced.discord.design.Design

	React.useEffect(() => {
		logComponentMount('Debug')
	}, [])

	try {
		const debugInfo = useDebugInfo()

		if (!debugInfo) {
			logComponentError('Debug', 'useDebugInfo returned null or undefined')
			return (
				<SettingsPage>
					<LoggingGroup />
					<TableRowGroup>
						<TableRow
							label="No debug information available"
							subLabel="Debug data could not be loaded"
						/>
					</TableRowGroup>
				</SettingsPage>
			)
		}

		const parsed = JSON.parse(debugInfo)

		return (
			<SettingsPage>
				<LoggingGroup />
				<TableRowGroup title="Status">
					<TableRow
						label="Current Service"
						subLabel={parsed.status?.currentService || 'unknown'}
					/>
					<TableRow
						label="Last Successful Update"
						subLabel={parsed.status?.lastSuccessfulUpdate || 'never'}
					/>
					<TableRow
						label="Connection Attempts"
						subLabel={String(parsed.status?.connectionAttempts || 0)}
					/>
					<TableRow
						label="API Call Count"
						subLabel={String(parsed.status?.apiCallCount || 0)}
					/>
				</TableRowGroup>

				<TableRowGroup title="Credential Validation">
					<TableRow
						label="Last.fm"
						subLabel={
							parsed.lastCredentialValidation?.lastfm ? 'Valid' : 'Invalid'
						}
					/>
					<TableRow
						label="Libre.fm"
						subLabel={
							parsed.lastCredentialValidation?.librefm ? 'Valid' : 'Invalid'
						}
					/>
					<TableRow
						label="ListenBrainz"
						subLabel={
							parsed.lastCredentialValidation?.listenbrainz
								? 'Valid'
								: 'Invalid'
						}
					/>
				</TableRowGroup>

				<TableRowGroup title="Errors">
					<TableRow
						label="Total Component Errors"
						subLabel={String(parsed.errors?.totalComponentErrors || 0)}
					/>
					<TableRow
						label="Last Error"
						subLabel={parsed.errors?.lastError || 'none'}
					/>
					<TableRow
						label="Last.fm Errors"
						subLabel={String(parsed.errors?.serviceErrors?.lastfm || 0)}
					/>
					<TableRow
						label="Libre.fm Errors"
						subLabel={String(parsed.errors?.serviceErrors?.librefm || 0)}
					/>
					<TableRow
						label="ListenBrainz Errors"
						subLabel={String(parsed.errors?.serviceErrors?.listenbrainz || 0)}
					/>
				</TableRowGroup>

				<TableRowGroup title="Last Track">
					<TableRow label="Artist" subLabel={parsed.lastTrack?.artist || '—'} />
					<TableRow label="Track" subLabel={parsed.lastTrack?.name || '—'} />
					<TableRow
						label="Now Playing"
						subLabel={parsed.lastTrack?.nowPlaying ? 'Yes' : 'No'}
					/>
					<TableRow
						label="Service"
						subLabel={parsed.lastTrack?.service || '—'}
					/>
				</TableRowGroup>

				<TableRowGroup title="Runtime">
					<TableRow label="Timestamp" subLabel={parsed.timestamp || '—'} />
					<TableRow
						label="Has Reanimated Error"
						subLabel={parsed.hasReanimatedError ? 'Yes' : 'No'}
					/>
					<TableRow
						label="Total Errors"
						subLabel={String(parsed.totalErrors || 0)}
					/>
				</TableRowGroup>
			</SettingsPage>
		)
	} catch (error) {
		logComponentError('Debug', error)
		return (
			<SettingsPage>
				<LoggingGroup />
				<TableRowGroup>
					<TableRow
						label="Error loading debug information"
						subLabel={String(error)}
					/>
				</TableRowGroup>
			</SettingsPage>
		)
	}
}
