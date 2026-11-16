import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as ReactNative from 'react-native'
import { reportError } from '../../../../../shared/report'
import { showToast as sharedToast } from '../../../../../shared/toast'
import { DEFAULTS } from '../../defaults'
import {
	mirroredRowCount,
	mirroredTagCount,
	refreshChat,
} from '../../lib/chatRows'
import { diagnostics, resetDiagnostics } from '../../lib/diagnostics'
import { probeNameModules } from '../../lib/probe'
import { getStorage } from '../../lib/state'
import { rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'

// Read inside the component, never at module scope -- see docs/coding-rules.md rule 1.
function showToast(content: string) {
	sharedToast(content, 'ScreenshotRedactorToast')
}

/**
 * Reads as a sentence rather than a table because the useful signal is a comparison: rows seen
 * but never redacted means they reached the hook and were skipped; no rows at all from a
 * surface means that surface goes through a RowManager we never patched.
 */
function diagnosticsSummary(): string {
	const d = diagnostics()
	const skipped =
		d.skippedDisabled +
		d.skippedRowType +
		d.skippedNoRow +
		d.skippedNoMessage +
		d.skippedNoAuthor +
		d.skippedSelf

	const reasons = [
		d.skippedDisabled && `${d.skippedDisabled} off`,
		d.skippedRowType && `${d.skippedRowType} row type`,
		d.skippedNoRow && `${d.skippedNoRow} NO ROW (bug)`,
		d.skippedNoMessage && `${d.skippedNoMessage} no message`,
		d.skippedNoAuthor && `${d.skippedNoAuthor} no author`,
		d.skippedSelf && `${d.skippedSelf} you`,
	].filter(Boolean)

	return [
		d.chatManagerPatch === 'patched'
			? `Native chat module hooked. ${d.batchesSeen} row batches seen, ${mirroredRowCount()} rows mirrored across ${mirroredTagCount()} list${mirroredTagCount() === 1 ? '' : 's'}.`
			: `LEAK: native chat module ${d.chatManagerPatch ?? 'not reached'} — redaction falls back to RowManager and the toggle needs a channel switch.`,
		d.refreshOutcome
			? `Last repaint: ${d.refreshOutcome}.`
			: 'Chat not repainted yet.',
		`${d.rowManagersPatched} RowManager${d.rowManagersPatched === 1 ? '' : 's'} patched.`,
		`${d.rowsSeen} rows seen, ${d.rowsRedacted} redacted, ${skipped} skipped${reasons.length ? ` (${reasons.join(', ')})` : ''}.`,
		d.rowTypes.size
			? `Row types seen: ${[...d.rowTypes].sort().join(', ')}.`
			: 'No rows seen yet.',
		d.skippedRowTypeWithAuthor
			? `LEAK: ${d.skippedRowTypeWithAuthor} skipped rows had an author.`
			: 'No skipped row carried an author.',
		`Deepest nesting: ${d.maxDepth}${d.maxDepth > 1 ? ' (generate re-enters itself)' : ''}.`,
		d.avatarKeysSeen.size
			? `Avatar fields found: ${[...d.avatarKeysSeen].join(', ')}.`
			: 'No avatar field found yet.',
		d.namePatches.size
			? `Name resolvers patched: ${[...d.namePatches].join(', ')}.`
			: "No name resolver found — @mentions and the member list can't be redacted.",
		// Inline mentions are row content, not resolved names, so the resolver list above says
		// nothing about them. This counter is the only thing that does. Zero after scrolling past
		// a message containing an @mention means the content nodes aren't the shape we expect.
		`${d.mentionsRedacted} inline @mention${d.mentionsRedacted === 1 ? '' : 's'} redacted in message content.`,
		d.avatarPatches.size
			? `Avatar resolvers patched: ${[...d.avatarPatches].join(', ')}.`
			: 'DM header avatar: LEAK — no avatar resolver found, so the face beside the name is real.',
		[...d.namePatches].some(label => label.includes('getNickname'))
			? 'DM header name: getNickname hooked — the header asks it first.'
			: 'DM header name: LEAK — getNickname was never hooked, and that is what the header asks first.',
		d.resolverSkips.size
			? `Modules matched but carried nothing callable: ${[...d.resolverSkips]
					.map(([key, n]) => `${key} ×${n}`)
					.join(', ')}.`
			: '',
		d.sheetHost
			? `Sheet module patched: ${d.sheetHost}.`
			: 'Sheet module not patched yet.',
		d.injectOutcome
			? `Row insertion: ${d.injectOutcome}.`
			: 'Row insertion not attempted yet.',
		d.sheetKeysSeen.size
			? `Action sheets seen: ${[...d.sheetKeysSeen].join(', ')}.`
			: 'No action sheet opened yet.',
		d.sheetTypesSeen.size
			? `Sheet contains: ${[...d.sheetTypesSeen].join(', ')}.`
			: '',
	]
		.filter(Boolean)
		.join(' ')
}

/**
 * The diagnostics wall, the probe and verbose logging, on their own route. None of this is
 * useful unless something is leaking, and when something IS leaking you want it all on one
 * screen rather than scrolled past on the way to the toggles.
 *
 * Rendered as a plain navigator route, so there's no plugin `api` prop here -- the storage
 * handle comes from `lib/state`, same as anti-ghost-ping's pages.
 */
export default function Debug() {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { Page } = components
	const { ScrollView, Alert } = ReactNative
	const { Stack, TableRowGroup, TableRow, TableSwitchRow } = Design

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Logging" hasIcons>
						<TableSwitchRow
							label="Verbose logging"
							subLabel="Prints message-row field names and channel-title hook detail to the log (adb logcat -s ReactNativeJS). Shapes and key names only — never a name, id or URL."
							icon={rowIcon('PencilIcon', 'ic_edit')}
							value={!!s.verboseLogging}
							onValueChange={verboseLogging => storage?.set({ verboseLogging })}
						/>
						<TableRow
							label="Probe name modules"
							subLabel="Sweeps Metro for anything that resolves a name or title and prints it to the log (adb logcat -s ReactNativeJS). Module ids and key names only — never a value."
							icon={rowIcon('SearchIcon', 'MagnifyingGlassIcon', 'ic_search')}
							onPress={() => {
								try {
									showToast(probeNameModules())
								} catch (error) {
									reportError('[ScreenshotRedactor] probe failed:', error)
									showToast('Probe failed — see the log.')
								}
							}}
						/>
					</TableRowGroup>

					<TableRowGroup title="Diagnostics" hasIcons>
						<TableRow
							label="Repaint chat now"
							subLabel="Runs the full repaint: store nudge, mirror replay where the chat module exists, and a channel re-select. What it did appears in the summary below."
							icon={rowIcon('RefreshIcon', 'ic_refresh')}
							onPress={() => {
								showToast(
									refreshChat() ??
										'Nothing to repaint — no channel opened yet.',
								)
							}}
						/>
						<TableRow
							label="Summary"
							subLabel={diagnosticsSummary()}
							icon={rowIcon('ChatIcon')}
							subLabelLineClamp={10}
						/>
						<TableRow
							label="Reset diagnostics"
							subLabel="Zero the counters, then open the surface that isn't working and come back."
							icon={rowIcon('TrashIcon', 'ic_delete')}
							onPress={() => {
								Alert.alert(
									'Reset diagnostics',
									'Clear all diagnostics counters now?',
									[
										{ text: 'Cancel', style: 'cancel' },
										{
											text: 'Reset',
											style: 'destructive',
											onPress: () => {
												resetDiagnostics()
												showToast('Diagnostics reset.')
											},
										},
									],
								)
							}}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
