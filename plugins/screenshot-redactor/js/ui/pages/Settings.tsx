import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import { ReactNavigationNative } from '@valenced/externals/react-navigation'
import * as ReactNative from 'react-native'
import { useChangelog } from '../../../../../shared/changelog'
import { reportError } from '../../../../../shared/report'
import { showToast as sharedToast } from '../../../../../shared/toast'
import { Credit } from '../../../../../shared/ui/credit'
import { DEFAULTS } from '../../defaults'
import { refreshChat } from '../../lib/chatRows'
import { coverageWarning } from '../../lib/coverage'
import { RELOAD_NOTICE_LONG, toggleToast } from '../../lib/notices'
import { rowIcon } from '../icon'
import { DEBUG_ROUTE, VISUALS_ROUTE } from '../routes'
import { useBottomPadding } from '../safeArea'
import type { ScreenshotRedactorStorage } from '../../types'

const DEBUG: boolean = false

// Read inside the component, never at module scope -- see docs/coding-rules.md rule 1.
function showToast(content: string) {
	sharedToast(content, 'ScreenshotRedactorToast')
}

/**
 * The root page, on the shared base layout (see ghost-log): the scope warning as a
 * yellow-tinted card first (it scopes everything below it), the master toggle as the
 * primary group, the leftovers caveat as a muted caption right under the toggle it
 * belongs to, then the Visuals/Debug index, and Reload Discord last as the escape hatch.
 *
 * There is deliberately no switch for the long-press sheet row here: with the floating
 * button gone the sheet row is the only quick toggle, so it just stays on
 * (`showSheetToggle` keeps defaulting to true). A switch whose only effect is "remove the
 * one quick way in" is not worth a row.
 */
export default function Settings({
	api,
}: {
	api: ValencedPluginStartApi<ScreenshotRedactorStorage>
}) {
	// The changelog icon at the top right, and "What's new" once after an update.
	useChangelog()
	const { Page } = components
	const { ScrollView, View } = ReactNative
	const { Stack, Text, Card, TableRowGroup, TableSwitchRow, TableRow } = Design
	const { useNavigation } = ReactNavigationNative

	const navigation = useNavigation() as { navigate: (route: string) => void }
	const settings = api.jsonStorage.use() ?? DEFAULTS

	const setSetting = (patch: Partial<ScreenshotRedactorStorage>) =>
		api.jsonStorage.set(patch)

	function setEnabled(enabled: boolean) {
		api.jsonStorage.set({ enabled })

		showToast(
			toggleToast(
				enabled,
				refreshChat(),
				enabled ? coverageWarning() : undefined,
			),
		)
	}

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<Card variant="secondary" border="none">
						<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
							<Text variant="text-md/semibold" style={{ textAlign: 'center' }}>
								What this covers
							</Text>
							<Text
								color="text-muted"
								variant="text-sm/normal"
								style={{ marginTop: 8 }}
							>
								Names and avatars in chat, replies, inline @mentions, DM and
								group DM headers, member lists, reactions and profiles. A name
								someone typed out in a message is not covered, nor are server
								names, channel names or timestamps.
							</Text>
						</View>
					</Card>

					{/* What didn't hook on this build, said where the switch is (lib/coverage.ts). */}
					{settings.enabled && coverageWarning() && (
						<Card variant="secondary" border="none">
							<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
								<Text color="text-feedback-warning" variant="text-sm/semibold">
									{coverageWarning()}
								</Text>
							</View>
						</Card>
					)}

					{/* The leftovers caveat, as a caption above the toggle it belongs to. */}
					<Text color="text-muted" variant="text-sm/normal">
						{RELOAD_NOTICE_LONG}
					</Text>

					<TableRowGroup hasIcons>
						<TableSwitchRow
							label="Redact names and avatars"
							subLabel="Replaces every author in chat with a placeholder. Local only — nobody else sees any of this."
							icon={rowIcon('EyeSlashIcon')}
							value={!!settings.enabled}
							onValueChange={setEnabled}
						/>
					</TableRowGroup>

					{/*
					 * Message text, kept apart from the identity toggles above because it is a
					 * different promise. Those replace who somebody is; this blanks what they
					 * typed. Pattern matching only -- nothing here reaches the network.
					 */}
					<TableRowGroup title="Message text" hasIcons>
						<TableSwitchRow
							label="Blank details in messages"
							subLabel="Emails, phone numbers, addresses, card numbers, invite links and API keys people typed. Matched on this device — nothing is sent anywhere."
							icon={rowIcon('LockIcon')}
							value={!!settings.redactBodyDetails}
							onValueChange={value => {
								setSetting({ redactBodyDetails: value })
								refreshChat()
							}}
						/>
					</TableRowGroup>

					<TableRowGroup hasIcons>
						<TableRow
							label="Visual style"
							subLabel="Placeholder style, avatars, badges, numbering, whether to redact yourself"
							icon={rowIcon('PaintPaletteIcon', 'PaintbrushThinIcon')}
							arrow
							onPress={() => navigation.navigate(VISUALS_ROUTE)}
						/>
					</TableRowGroup>

					<TableRowGroup title="Developer" hasIcons>
						{DEBUG && (
							<TableRow
								label="Debug"
								subLabel="Verbose logging, module probe, diagnostics"
								icon={rowIcon('BugIcon')}
								arrow
								onPress={() => navigation.navigate(DEBUG_ROUTE)}
							/>
						)}
						<TableRow
							label="Reload Discord"
							subLabel="Marks the plugin as needing a reload, then reload when it suits you — the sure way to clear every leftover placeholder at once."
							icon={rowIcon('RefreshIcon')}
							onPress={() => {
								try {
									api.plugin.requireReload()
									showToast(
										'Reload marked — reload Discord from the plugin list to finish.',
									)
								} catch (error) {
									reportError(
										'[ScreenshotRedactor] requireReload failed:',
										error,
									)
									showToast("Couldn't mark for reload — see the log.")
								}
							}}
						/>
					</TableRowGroup>

					<Credit />
				</Stack>
			</ScrollView>
		</Page>
	)
}
