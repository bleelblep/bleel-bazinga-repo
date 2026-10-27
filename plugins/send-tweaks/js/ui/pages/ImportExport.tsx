import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as react from '@valenced/react'
import * as ReactNative from 'react-native'
import { copyText, readClipboardText } from '../../lib/clipboard'
import { exportRules, importRules } from '../../lib/importRules'
import { readRules, useRules, writeRules } from '../../lib/ruleStore'
import { showToast as triggerToast } from '../../lib/toast'
import { FieldRow } from '../fieldGroup'
import { rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'
import type { DiscordModules } from '@valenced/discord/types'
import type { RuleKind } from '../../lib/ruleStore'

function showToast(content: string) {
	triggerToast(content, { key: 'SendTweaksImportExportToast' })
}

export function ImportExportText() {
	return <ImportExport kind="text" />
}

export function ImportExportLinks() {
	return <ImportExport kind="links" />
}

function ImportExport({ kind }: { kind: RuleKind }) {
	const { React } = react
	const { Page } = components
	const { ScrollView, View } = ReactNative
	const { Stack, Text, TableRowGroup, TableRow, TextInput, TextArea } = Design
	const ImportInput = (TextArea ??
		TextInput) as DiscordModules.Components.TextInput

	const links = kind === 'links'
	const rules = useRules(kind)
	const [pasted, setPasted] = React.useState('')
	const [skipped, setSkipped] = React.useState<string[]>([])
	const [readingClipboard, setReadingClipboard] = React.useState(false)

	const runImport = (text: string) => {
		const result = importRules(text)
		setSkipped(result.skipped)
		if (result.rules.length) {
			writeRules(kind, [...readRules(kind), ...result.rules])
			setPasted('')
		}
		showToast(
			result.rules.length
				? `Imported ${result.rules.length} rule${result.rules.length === 1 ? '' : 's'}${result.skipped.length ? `, skipped ${result.skipped.length}` : ''}.`
				: 'Nothing imported — see below.',
		)
	}

	const importClipboard = async () => {
		setReadingClipboard(true)
		try {
			const text = await readClipboardText()
			if (!text?.trim()) {
				showToast('Clipboard is empty or inaccessible.')
				return
			}
			setPasted(text)
			runImport(text)
		} catch {
			setSkipped([
				'Could not read the clipboard. Paste the full rule JSON into the import box instead.',
			])
			showToast('Could not read the clipboard.')
		} finally {
			setReadingClipboard(false)
		}
	}

	const exportClipboard = () => {
		if (copyText(exportRules(rules))) {
			showToast(
				`Copied ${rules.length} rule${rules.length === 1 ? '' : 's'} to clipboard.`,
			)
		} else {
			showToast('Could not reach the clipboard.')
		}
	}

	return (
		<Page>
			<ScrollView
				keyboardShouldPersistTaps="handled"
				contentContainerStyle={{ paddingBottom: useBottomPadding() }}
			>
				<Stack spacing={24}>
					<Text color="text-muted" variant="text-sm/normal">
						{`Import rules from a JSON backup or Vendetta Text Replace block, or export your ${links ? 'link rules' : 'text rules'} to share them with others.`}
					</Text>

					<View style={{ gap: 8 }}>
						<TableRowGroup title="Import" hasIcons>
							<TableRow
								label="Import from clipboard"
								subLabel="Copy JSON first. Imports all rules found in the copied text."
								icon={rowIcon('ClipboardIcon', 'CopyIcon')}
								disabled={readingClipboard}
								onPress={importClipboard}
							/>
							<FieldRow
								label={links ? 'Paste link rules' : 'Paste rules'}
								description={`Text Replace's format: one rule, an array of rules, or a message containing \`\`\`json blocks. Goes into your ${links ? 'link rules' : 'replacement rules'}.`}
							>
								<ImportInput
									placeholder='Paste a rule or list, e.g. [{ "name": …, "match": …, "replace": … }]'
									value={pasted}
									multiline
									isClearable
									onChange={(value: string) => setPasted(value)}
								/>
							</FieldRow>
							<TableRow
								label="Import pasted JSON"
								icon={rowIcon('DownloadIcon', 'ic_download_24px')}
								disabled={!pasted.trim()}
								onPress={() => runImport(pasted)}
							/>
						</TableRowGroup>
						{skipped.length ? (
							<Text color="text-feedback-warning" variant="text-sm/normal">
								{`Not imported:\n${skipped.join('\n')}`}
							</Text>
						) : null}
					</View>

					<TableRowGroup title="Export" hasIcons>
						<TableRow
							label={links ? 'Export all link rules' : 'Export all rules'}
							subLabel={
								rules.length
									? `Copies all ${rules.length} rule${rules.length === 1 ? '' : 's'} as JSON to clipboard`
									: 'No rules to export'
							}
							icon={rowIcon('CopyIcon', 'ic_copy')}
							disabled={!rules.length}
							onPress={exportClipboard}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
