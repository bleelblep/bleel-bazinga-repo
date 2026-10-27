import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import { ReactNavigationNative } from '@valenced/externals/react-navigation'
import * as react from '@valenced/react'
import * as ReactNative from 'react-native'
import { showToast } from '../../../../../shared/toast'
import { copyText } from '../../lib/clipboard'
import {
	expandPlaceholders,
	greetingsUnlocked,
	withSendContext,
} from '../../lib/greetings'
import { expandRandom } from '../../lib/random'
import { useSettings } from '../../lib/state'
import { TemplateTools } from '../components/TemplateTools'
import { FieldRow } from '../fieldGroup'
import { rowIcon } from '../icon'
import {
	EDIT_RULE_ROUTE,
	TEMPLATE_FORMATS_ROUTE,
	TEMPLATE_HELPER_ROUTE,
	TEMPLATE_PLAY_ROUTE,
	TEMPLATE_SNIPPETS_ROUTE,
	WAGON_SERVERS_ROUTE,
} from '../routes'
import { useBottomPadding } from '../safeArea'
import { templateSession } from '../templateSession'
import type { ReactNode } from 'react'
import type { Navigation } from '../navigation'

function TemplatePage({ children }: { children?: ReactNode }) {
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack } = Design
	const paddingBottom = useBottomPadding()
	return (
		<Page>
			{greetingsUnlocked() ? (
				<ScrollView
					keyboardShouldPersistTaps="handled"
					contentContainerStyle={{ paddingBottom }}
				>
					<Stack spacing={24}>{children}</Stack>
				</ScrollView>
			) : null}
		</Page>
	)
}

type Helper = {
	key: string
	label: string
	description: string
	example: string
}
const HELPERS: Array<{ title: string; items: Helper[] }> = [
	{
		title: 'People',
		items: [
			{
				key: 'greeting',
				label: 'Greeting',
				description: 'Changes with the time of day',
				example: 'Good afternoon',
			},
			{
				key: 'mention',
				label: 'Mention',
				description: 'The person you reply to, or the latest loaded join',
				example: '@Alex',
			},
			{
				key: 'name',
				label: 'Name',
				description: 'Their server nickname or display name',
				example: 'Alex',
			},
			{
				key: 'me',
				label: 'Your name',
				description: 'Your server nickname or display name',
				example: 'Sam',
			},
		],
	},
	{
		title: 'Server',
		items: [
			{
				key: 'server',
				label: 'Server name',
				description: 'Unavailable in direct messages',
				example: 'Our community',
			},
			{
				key: 'channel',
				label: 'Channel',
				description: 'A mention of the current channel',
				example: '#welcome',
			},
			{
				key: 'servercount',
				label: 'Member count',
				description: 'Uses the count cached by Discord',
				example: '42',
			},
		],
	},
	{
		title: 'Date & time',
		items: [
			{
				key: 'date',
				label: 'Date',
				description: 'Choose a local date format',
				example: '05/10/26',
			},
			{
				key: 'time',
				label: 'Time',
				description: '12-hour or 24-hour time',
				example: '14:30',
			},
			{
				key: 'timestamp',
				label: 'Discord timestamp',
				description: 'Displays in each reader’s timezone',
				example: 'in 30 minutes',
			},
		],
	},
	{
		title: 'Choices',
		items: [
			{
				key: 'random',
				label: 'Random choice',
				description: 'Pick one greeting each time',
				example: 'Hai, Hewo or Hey',
			},
			{
				key: 'shuffle',
				label: 'Shuffled choices',
				description: 'Use each greeting before repeating',
				example: 'Hai → Hey → Hewo',
			},
		],
	},
	{
		title: 'More',
		items: [
			{
				key: 'username',
				label: 'Username',
				description: 'Their username without the server nickname',
				example: 'alex',
			},
			{
				key: 'displayname',
				label: 'Display name',
				description: 'Their global display name',
				example: 'Alex',
			},
			{
				key: 'joined',
				label: 'Join date',
				description: 'When they joined, if Discord has cached it',
				example: '4 days ago',
			},
			{
				key: 'created',
				label: 'Account creation date',
				description: 'When their Discord account was created',
				example: 'January 1, 2020',
			},
		],
	},
]
let selectedHelper: Helper = HELPERS[0].items[0]

export default function Templates() {
	const { TableRowGroup, TableRow, Text } = Design
	const navigation = ReactNavigationNative.useNavigation() as Navigation
	const s = useSettings()
	const servers = s.wagonServers ?? []
	const own: Helper[] = (s.wagonPlaceholders ?? []).map(entry => ({
		key: entry.key,
		label: `{${entry.key}}`,
		description: 'Your placeholder: its value depends on the server',
		example: entry.value || '(blank)',
	}))
	const groups = own.length
		? [...HELPERS, { title: 'Yours', items: own }]
		: HELPERS
	return (
		<TemplatePage>
			<Text variant="text-sm/normal" color="text-muted">
				Choose something to insert into Replace with.
			</Text>
			{groups.map(group => (
				<TableRowGroup key={group.title} title={group.title}>
					{group.items.map(helper => (
						<TableRow
							key={helper.key}
							label={helper.label}
							subLabel={`${helper.description}. Example: ${helper.example}`}
							arrow
							onPress={() => {
								selectedHelper = helper
								navigation.navigate(TEMPLATE_HELPER_ROUTE)
							}}
						/>
					))}
				</TableRowGroup>
			))}
			<TableRowGroup title="Per server" hasIcons>
				<TableRow
					label="Servers"
					subLabel={
						servers.length
							? `${servers.length} set up · ${servers.filter(server => server.off).length} off`
							: 'Your own placeholders, with a value per server, and on/off per server'
					}
					icon={rowIcon('ServerIcon', 'SettingsIcon')}
					arrow
					onPress={() => navigation.navigate(WAGON_SERVERS_ROUTE)}
				/>
			</TableRowGroup>
			<TableRowGroup title="Reusable text" hasIcons>
				<TableRow
					label="Saved snippets"
					subLabel="Insert or manage reusable text"
					icon={rowIcon('CopyIcon')}
					arrow
					onPress={() => navigation.navigate(TEMPLATE_SNIPPETS_ROUTE)}
				/>
			</TableRowGroup>
			<TableRowGroup title="Tools" hasIcons>
				<TableRow
					label="Try a template"
					subLabel="Preview with a fictional recipient"
					icon={rowIcon('MagicWandIcon')}
					arrow
					onPress={() => navigation.navigate(TEMPLATE_PLAY_ROUTE)}
				/>
				<TableRow
					label="Date & time defaults"
					subLabel="Defaults for all your rules"
					icon={rowIcon('ClockIcon')}
					arrow
					onPress={() => navigation.navigate(TEMPLATE_FORMATS_ROUTE)}
				/>
			</TableRowGroup>
		</TemplatePage>
	)
}

export function TemplateHelper() {
	const { React } = react
	const { Text, TableRowGroup, TableRow, TextInput } = Design
	const navigation = ReactNavigationNative.useNavigation() as Navigation
	const [helper] = React.useState(selectedHelper)
	const [fallback, setFallback] = React.useState('')
	const [choices, setChoices] = React.useState('Hai, Hewo, Hey')
	const [format, setFormat] = React.useState(
		helper.key === 'date' ? 'DD/MM/YY' : helper.key === 'time' ? 'HH:mm' : 'R',
	)
	const [offset, setOffset] = React.useState('')
	const choice = helper.key === 'random' || helper.key === 'shuffle'
	const date = helper.key === 'date' || helper.key === 'time'
	const stamp = ['timestamp', 'joined', 'created'].includes(helper.key)
	const syntax = choice
		? `$${helper.key}{${choices}}`
		: `{${helper.key}${date || stamp ? `:${helper.key === 'timestamp' && offset ? `${offset}:` : ''}${format}` : ''}${fallback ? `|${fallback}` : ''}}`
	let example = helper.example
	try {
		example = withSendContext(
			{
				sample: {
					name: 'Alex',
					mention: '@Alex',
					me: 'Sam',
					server: 'Our community',
					channel: '#welcome',
					servercount: '42',
					username: 'alex',
					displayname: 'Alex',
					joined: '2026-10-01',
					created: '2020-01-01',
				},
			},
			() => expandPlaceholders(expandRandom(syntax, 'helper')),
		)
	} catch {
		/* show example */
	}
	const insert = () => {
		const session = templateSession()
		if (!session.apply) return
		session.apply(session.initial + syntax)
		navigation.navigate(EDIT_RULE_ROUTE)
	}
	return (
		<TemplatePage>
			<Text variant="text-md/semibold" color="text-default">
				{helper.label}
			</Text>
			<Text variant="text-sm/normal" color="text-muted">
				{helper.description}
			</Text>
			{choice ? (
				<TableRowGroup>
					<FieldRow label="Choices" description="Separate choices with commas.">
						<TextInput value={choices} onChange={setChoices} />
					</FieldRow>
				</TableRowGroup>
			) : null}
			{date ? (
				<TableRowGroup title="Format">
					{(helper.key === 'date'
						? [
								['DD/MM/YY', 'Day / month / year'],
								['YYYY-MM-DD', 'Year-month-day'],
							]
						: [
								['HH:mm', '24-hour'],
								['hh:mm A', '12-hour'],
								['HH:mm:ss', '24-hour with seconds'],
							]
					).map(([value, label]) => (
						<TableRow
							key={value}
							label={`${format === value ? '✓ ' : ''}${label}`}
							onPress={() => setFormat(value)}
						/>
					))}
					<FieldRow label="Custom format">
						<TextInput value={format} onChange={setFormat} />
					</FieldRow>
				</TableRowGroup>
			) : null}
			{stamp ? (
				<TableRowGroup title="Display">
					{[
						['R', 'Relative time'],
						['t', 'Time'],
						['T', 'Time with seconds'],
						['d', 'Short date'],
						['D', 'Long date'],
						['f', 'Date and time'],
						['F', 'Full date and time'],
					].map(([value, label]) => (
						<TableRow
							key={value}
							label={`${format === value ? '✓ ' : ''}${label}`}
							onPress={() => setFormat(value)}
						/>
					))}
					{helper.key === 'timestamp' ? (
						<FieldRow
							label="When"
							description="Blank means now. +30m = in 30 minutes; +1d = tomorrow."
						>
							<TextInput value={offset} onChange={setOffset} />
						</FieldRow>
					) : null}
				</TableRowGroup>
			) : null}
			{!choice ? (
				<TableRowGroup>
					<FieldRow
						label="Fallback text"
						description="Optional text when information is unavailable."
					>
						<TextInput value={fallback} onChange={setFallback} />
					</FieldRow>
				</TableRowGroup>
			) : null}
			<TableRowGroup title="Example">
				<TableRow label={example} subLabel={syntax} />
			</TableRowGroup>
			<TableRowGroup>
				<TableRow
					label="Insert into rule"
					subLabel="Adds this helper at the end of Replace with"
					disabled={!templateSession().apply}
					onPress={insert}
				/>
				<TableRow
					label="Copy syntax"
					onPress={() => {
						copyText(syntax)
						showToast('Syntax copied.', 'TemplateCopied')
					}}
				/>
			</TableRowGroup>
		</TemplatePage>
	)
}

const GROUPS = [
	{
		title: 'People',
		items: [
			['{greeting}', 'Good morning / afternoon / evening'],
			['{mention|friend}', 'Mentions your reply target; otherwise “friend”'],
			['{name|friend}', 'Their server nickname or display name'],
			['{username}', 'Their username'],
			['{displayname}', 'Their display name'],
			['{me}', 'Your name'],
		],
	},
	{
		title: 'Server & channel',
		items: [
			['{server|our community}', 'Server name, with a fallback for DMs'],
			['{channel}', 'Current channel mention'],
			['{servercount|unknown}', 'Cached member count'],
			['{joined:R|recently}', 'Their server join date, when cached'],
			['{created:D}', 'Their account creation date'],
		],
	},
	{
		title: 'Choices & reusable text',
		items: [
			['$random{Hai, Hewo, Hey}', 'Pick one each time'],
			[
				'$shuffle{Hai, Hewo, Hey}',
				'Use every choice before repeating; resets on restart',
			],
			['{name|friend}', 'Use text after | when the value is unavailable'],
			[
				'{snippet:install-help}',
				'Insert a snippet saved on the Snippets screen',
			],
		],
	},
	{
		title: 'Dates & times',
		items: [
			['{date}', 'Your default date format'],
			['{time}', 'Your default time format'],
			['{date:dd/mm/yy}', '05/10/26'],
			['{time:HH:mm}', '14:30 — 24-hour'],
			['{time:hh:mm A}', '02:30 PM — 12-hour'],
			['{timestamp:R}', 'Discord relative time: a few seconds ago'],
			['{timestamp:+30m:R}', 'Discord relative time: in 30 minutes'],
			['{timestamp:+1d:F}', 'Tomorrow, with weekday and time'],
		],
	},
	{
		title: 'Discord timestamp styles',
		items: [
			['{timestamp:t}', 'Short time'],
			['{timestamp:T}', 'Time with seconds'],
			['{timestamp:d}', 'Short date'],
			['{timestamp:D}', 'Long date'],
			['{timestamp:f}', 'Date and time (also {timestamp})'],
			['{timestamp:F}', 'Weekday, date and time'],
		],
	},
]

export function TemplateGuide() {
	const { React } = react
	const { Text, TableRowGroup, TableRow } = Design
	const [notice, setNotice] = React.useState('Tap an example to copy it.')
	return (
		<TemplatePage>
			<Text variant="text-sm/normal" color="text-muted">
				{notice}
			</Text>
			{GROUPS.map(group => (
				<TableRowGroup key={group.title} title={group.title}>
					{group.items.map(([syntax, explanation]) => (
						<TableRow
							key={syntax}
							label={syntax}
							subLabel={explanation}
							onPress={() =>
								setNotice(
									copyText(syntax) ? `Copied ${syntax}` : 'Could not copy.',
								)
							}
						/>
					))}
				</TableRowGroup>
			))}
			<Text variant="text-sm/normal" color="text-muted">
				Recipients come from the message you reply to, or the latest loaded
				member-join message. Cached information may be unavailable. Timestamp
				offsets use whole minutes (m), hours (h), or days (d). Random and
				shuffle choices are comma-separated; nested choice blocks are not
				supported. Previews advance shuffle history, and sending that preview
				retains its choices. Send unchanged bypasses templates.
			</Text>
		</TemplatePage>
	)
}

export function TemplatePlayground() {
	const navigation = ReactNavigationNative.useNavigation() as Navigation
	const session = templateSession()
	return (
		<TemplatePage>
			<TemplateTools
				mode="playground"
				initial={session.initial}
				apply={
					session.apply
						? text => {
								session.apply?.(text)
								navigation.goBack()
								navigation.goBack()
							}
						: undefined
				}
			/>
		</TemplatePage>
	)
}

export function TemplateSnippets() {
	return (
		<TemplatePage>
			<TemplateTools mode="snippets" initial="" />
		</TemplatePage>
	)
}
export function TemplateFormats() {
	return (
		<TemplatePage>
			<TemplateTools mode="formats" initial="" />
		</TemplatePage>
	)
}
