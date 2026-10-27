import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { ReactNavigationNative } from '@valenced/externals/react-navigation'
import * as react from '@valenced/react'
import { copyText } from '../../lib/clipboard'
import { expandPlaceholders, withSendContext } from '../../lib/greetings'
import { renderMarkdown } from '../../lib/markdown'
import { expandRandom } from '../../lib/random'
import { getStorage, useSettings } from '../../lib/state'
import { expandSnippets } from '../../lib/templateSyntax'
import { validateTemplate } from '../../lib/templateValidation'
import { FieldRow } from '../fieldGroup'
import { dangerIcon } from '../icon'
import { EDIT_RULE_ROUTE } from '../routes'
import { templateSession } from '../templateSession'
import type { DiscordModules } from '@valenced/discord/types'
import type { RuleScope } from '../../lib/templateSyntax'
import type { Navigation } from '../navigation'

export function ScopeControls({
	value,
	onChange,
}: {
	value?: RuleScope
	onChange: (scope: RuleScope) => void
}) {
	const { TableRowGroup, TableRow, TextInput } = Design
	const kind = value?.kind ?? 'all'
	return (
		<TableRowGroup title="Rule scope">
			{(['all', 'servers', 'channels', 'dms'] as const).map(mode => (
				<TableRow
					key={mode}
					label={`${kind === mode ? '✓ ' : ''}${{ all: 'Everywhere', servers: 'Selected servers', channels: 'Selected channels', dms: 'DMs only' }[mode]}`}
					onPress={() => onChange({ kind: mode, ids: value?.ids ?? [] })}
				/>
			))}
			{kind === 'servers' || kind === 'channels' ? (
				<FieldRow
					label={`${kind === 'servers' ? 'Server' : 'Channel'} IDs`}
					description="Separate IDs with commas. An empty list matches nothing."
				>
					<TextInput
						value={value?.ids?.join(', ') ?? ''}
						onChange={(text: string) =>
							onChange({ kind, ids: text.split(/[,\s]+/).filter(Boolean) })
						}
					/>
				</FieldRow>
			) : null}
		</TableRowGroup>
	)
}

export function TemplateTools({
	initial,
	apply,
	mode = 'playground',
}: {
	initial: string
	apply?: (text: string) => void
	mode?: 'playground' | 'snippets' | 'formats'
}) {
	const {
		React,
		ReactNative: { View },
	} = react
	const { Text, TextInput, TextArea, TableRow, TableRowGroup } = Design
	const Input = (TextArea ?? TextInput) as DiscordModules.Components.TextInput
	const s = useSettings()
	const navigation = ReactNavigationNative.useNavigation() as Navigation
	const [template, setTemplate] = React.useState(
		initial || '$random{Hai, Hewo, Hey}, {name|friend}!',
	)
	const [person, setPerson] = React.useState('Alex')
	const [raw, setRaw] = React.useState(false)
	const [output, setOutput] = React.useState('')
	const [snippetName, setSnippetName] = React.useState('')
	const [snippetText, setSnippetText] = React.useState('')
	const [notice, setNotice] = React.useState('')
	const run = () => {
		const sample = {
			name: person,
			mention: person ? `<@123456789012345678>` : '',
			username: person.toLowerCase(),
			displayname: person,
			me: 'Sam',
			server: 'Example server',
			channel: '<#123456789012345678>',
			servercount: '42',
			joined: '2026-10-01T12:00:00Z',
			created: '2020-01-01T12:00:00Z',
		}
		setOutput(
			withSendContext({ sample }, () =>
				expandPlaceholders(
					expandRandom(
						expandSnippets(template, s.snippets ?? []),
						'playground',
					),
				).replace(/\$\$/g, '$'),
			),
		)
	}
	React.useEffect(run, [])
	const warnings = validateTemplate(template, output, s.snippets ?? [])
	if (!person && /\{mention\}/.test(template))
		warnings.push('No fictional recipient is set for {mention}.')
	const save = () => {
		const name = snippetName.trim()
		if (!/^[\w-]+$/.test(name)) {
			setNotice(
				'Use letters, numbers, underscores or hyphens for the snippet name.',
			)
			return
		}
		getStorage()?.set({
			snippets: [
				...(s.snippets ?? []).filter(entry => entry.name !== name),
				{ name, text: snippetText },
			],
		})
		setNotice(`Saved ${name}.`)
	}
	const removeSnippet = (name: string) => {
		const { AlertModal, AlertActionButton } = Design
		const alerts = AlertActionCreators
		const key = 'SendTweaksDeleteSnippet'
		alerts.openAlert(
			key,
			<AlertModal
				title={`Delete ${name}?`}
				content="Rules using this snippet will need another snippet or replacement text."
				actions={
					<>
						<AlertActionButton
							text="Delete"
							variant="destructive"
							onPress={() => {
								getStorage()?.set({
									snippets: (s.snippets ?? []).filter(
										item => item.name !== name,
									),
								})
								alerts.dismissAlert(key)
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
	return (
		<View style={{ gap: 16 }}>
			{mode === 'playground' ? (
				<>
					<Text variant="text-sm/normal" color="text-muted">
						Try your message with Alex as the recipient. Nothing is sent.
					</Text>
					<FieldRow label="Template">
						<Input multiline value={template} onChange={setTemplate} />
					</FieldRow>
					<FieldRow
						label="Fictional recipient"
						description="Leave blank to test fallback text."
					>
						<TextInput value={person} onChange={setPerson} />
					</FieldRow>
					<TableRowGroup>
						<TableRow
							label="Preview"
							subLabel="Refresh the result and pick new random choices"
							onPress={run}
						/>
						<TableRow
							label={raw ? 'Show rendered preview' : 'Show raw Discord text'}
							onPress={() => setRaw(!raw)}
						/>
						<TableRow
							label="Copy template"
							onPress={() =>
								setNotice(
									copyText(template)
										? 'Template copied.'
										: 'Could not copy template.',
								)
							}
						/>
						{apply ? (
							<TableRow
								label="Use in this rule"
								onPress={() => {
									apply(template)
									setNotice('Applied to Replace with.')
								}}
							/>
						) : null}
					</TableRowGroup>
					{raw ? (
						<Text selectable variant="text-sm/normal" color="text-default">
							{output}
						</Text>
					) : (
						renderMarkdown(
							output
								.replace(/<@123456789012345678>/g, `@${person}`)
								.replace(/<#123456789012345678>/g, '#example-channel'),
						)
					)}
					{warnings.map(warning => (
						<Text
							key={warning}
							variant="text-sm/normal"
							color="text-feedback-warning"
						>
							{warning}
						</Text>
					))}
				</>
			) : null}
			{mode === 'formats' ? (
				<>
					<Text variant="text-sm/normal" color="text-muted">
						These defaults apply to {'{date}'} and {'{time}'}. A format inside a
						placeholder overrides them.
					</Text>
					<TableRowGroup title="Date">
						<TableRow
							label="Device default"
							onPress={() => getStorage()?.set({ dateFormat: '' })}
						/>
						<TableRow
							label="Day / month / year"
							subLabel="05/10/26"
							onPress={() => getStorage()?.set({ dateFormat: 'DD/MM/YY' })}
						/>
						<TableRow
							label="Year-month-day"
							subLabel="2026-10-05"
							onPress={() => getStorage()?.set({ dateFormat: 'YYYY-MM-DD' })}
						/>
					</TableRowGroup>
					<FieldRow
						label="Date format"
						description="Blank = device locale. Example: DD/MM/YY (dd/mm/yy also works)."
					>
						<TextInput
							value={s.dateFormat ?? ''}
							onChange={(dateFormat: string) =>
								getStorage()?.set({ dateFormat })
							}
						/>
					</FieldRow>
					<FieldRow
						label="Time format"
						description="Blank = device locale. HH:mm = 24-hour; hh:mm A = 12-hour. Add :ss for seconds."
					>
						<TextInput
							value={s.timeFormat ?? ''}
							onChange={(timeFormat: string) =>
								getStorage()?.set({ timeFormat })
							}
						/>
					</FieldRow>
					<TableRowGroup title="Time">
						<TableRow
							label="Device default"
							onPress={() => getStorage()?.set({ timeFormat: '' })}
						/>
						<TableRow
							label="24-hour"
							subLabel="14:30"
							onPress={() => getStorage()?.set({ timeFormat: 'HH:mm' })}
						/>
						<TableRow
							label="12-hour"
							subLabel="02:30 PM"
							onPress={() => getStorage()?.set({ timeFormat: 'hh:mm A' })}
						/>
					</TableRowGroup>
				</>
			) : null}
			{mode === 'snippets' ? (
				<>
					<Text variant="text-sm/normal" color="text-muted">
						Save text once, then insert it with {'{snippet:name}'}. Tap a saved
						snippet to edit it.
					</Text>
					{(s.snippets ?? []).map(entry => (
						<TableRowGroup key={entry.name}>
							<TableRow
								label={entry.name}
								subLabel={entry.text.slice(0, 100)}
								onPress={() => {
									setSnippetName(entry.name)
									setSnippetText(entry.text)
								}}
							/>
							<TableRow
								label="Insert into rule"
								subLabel={`{snippet:${entry.name}}`}
								disabled={!templateSession().apply}
								onPress={() => {
									const session = templateSession()
									session.apply?.(`${session.initial}{snippet:${entry.name}}`)
									navigation.navigate(EDIT_RULE_ROUTE)
								}}
							/>
							<TableRow
								label={`Delete ${entry.name}`}
								variant="danger"
								icon={dangerIcon('TrashIcon')}
								onPress={() => removeSnippet(entry.name)}
							/>
						</TableRowGroup>
					))}
					<FieldRow label="Snippet name">
						<TextInput value={snippetName} onChange={setSnippetName} />
					</FieldRow>
					<FieldRow label="Snippet text">
						<Input multiline value={snippetText} onChange={setSnippetText} />
					</FieldRow>
					<TableRowGroup>
						<TableRow label="Save snippet" onPress={save} />
					</TableRowGroup>
				</>
			) : null}
			{notice ? (
				<Text variant="text-sm/normal" color="text-muted">
					{notice}
				</Text>
			) : null}
		</View>
	)
}
