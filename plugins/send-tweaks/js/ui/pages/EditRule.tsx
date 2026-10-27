import * as components from '@valenced/components'
import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { ReactNavigationNative } from '@valenced/externals/react-navigation'
import * as react from '@valenced/react'
import * as ReactNative from 'react-native'
import { copyText } from '../../lib/clipboard'
import { greetingsUnlocked, PLACEHOLDERS, tryUnlock } from '../../lib/greetings'
import { exportRule } from '../../lib/importRules'
import {
	deleteRule,
	getEditing,
	readRules,
	updateRule,
} from '../../lib/ruleStore'
import { settings } from '../../lib/state'
import { validateTemplate } from '../../lib/templateValidation'
import { compileRule } from '../../lib/textReplace'
import { showToast as triggerToast } from '../../lib/toast'
import { TemplateHelpButton } from '../components/TemplateHelp'
import { FieldRow } from '../fieldGroup'
import { dangerIcon, rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'
import { clearTemplateSession } from '../templateSession'
import { openServerPicker } from './WagonServers'
import type { DiscordModules } from '@valenced/discord/types'
import type { ComponentProps } from 'react'
import type { Rule } from '../../lib/textReplace'
import type { Navigation } from '../navigation'

function showToast(content: string) {
	triggerToast(content, { key: 'SendTweaksRuleToast' })
}

/**
 * A multi-line field that keeps its own text while you type. Bound straight to the rule store, each
 * keystroke came back a moment later and Discord's TextArea put that older text back, so the cursor
 * jumped and deletes fought you. The store still gets every change; it just never drives the field.
 * Seeded once: the screen pins its rule on mount, so nothing else edits this text meanwhile.
 */
function LinesField({
	value,
	onChange,
	...rest
}: { value: string; onChange: (value: string) => void } & Record<
	string,
	unknown
>) {
	const { React } = react
	const { TextInput, TextArea } = Design
	// TextArea is Discord's multi-line field, so Enter adds a line. TextInput with `multiline` didn't
	// on the phone (348/349); it's only the fallback if a Discord update drops TextArea.
	const Input = (TextArea ?? TextInput) as DiscordModules.Components.TextInput
	const [draft, setDraft] = React.useState(value)
	return (
		<Input
			{...rest}
			multiline
			value={draft}
			onChange={(next: string) => {
				setDraft(next)
				onChange(next)
			}}
		/>
	)
}

function SingleLineField({
	value,
	onChange,
	...props
}: {
	value: string
	onChange: (value: string) => void
} & Omit<
	ComponentProps<DiscordModules.Components.TextInput>,
	'value' | 'onChange'
>) {
	const { React } = react
	const { TextInput } = Design
	const [draft, setDraft] = React.useState(value ?? '')
	return (
		<TextInput
			{...props}
			value={draft}
			onChange={(next: string) => {
				setDraft(next)
				onChange(next)
			}}
		/>
	)
}

function RuleSwitch({
	label,
	value,
	onValueChange,
	...props
}: {
	label: string
	value: boolean
	onValueChange: (value: boolean) => void
} & Omit<
	ComponentProps<DiscordModules.Components.TableSwitchRow>,
	'label' | 'value' | 'onValueChange'
>) {
	const { React } = react
	const { TableSwitchRow } = Design
	const [checked, setChecked] = React.useState(value)
	const [prevValue, setPrevValue] = React.useState(value)

	if (value !== prevValue) {
		setPrevValue(value)
		setChecked(value)
	}

	return (
		<TableSwitchRow
			label={label}
			{...props}
			value={checked}
			onValueChange={(next: boolean) => {
				setChecked(next)
				onValueChange(next)
			}}
		/>
	)
}

/** One rule, on its own screen. Opened from a rule list (`Rules.tsx`). */
export default function EditRule() {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { React } = react
	const { Page } = components
	const { ScrollView, View } = ReactNative
	const {
		Stack,
		Text,
		TableRowGroup,
		TableRow,
		AlertModal,
		AlertActionButton,
	} = Design
	const Alerts = AlertActionCreators
	const { useNavigation } = ReactNavigationNative
	const navigation = useNavigation() as Navigation

	// Pinned on mount, so opening another rule later cannot swap this screen's rule underneath it.
	const [target] = React.useState(getEditing())
	const kind = target?.kind ?? 'text'
	const [rule, setRule] = React.useState<Rule | undefined>(() =>
		readRules(kind).find(r => r.id === target?.id),
	)
	const unlocked = greetingsUnlocked()
	React.useEffect(() => clearTemplateSession, [])
	const [replacementRevision, bumpReplacement] = React.useReducer(
		(n: number) => n + 1,
		0,
	)
	React.useLayoutEffect(() => {
		navigation.setOptions?.({
			headerRight:
				unlocked && rule && target
					? () => (
							<TemplateHelpButton
								initial={rule.replace}
								apply={text => {
									set({ replace: text })
									bumpReplacement()
								}}
							/>
						)
					: () => null,
		})
		return () => navigation.setOptions?.({ headerRight: () => null })
	}, [navigation, unlocked, rule?.replace, target, kind])

	if (!target || !rule) {
		return (
			<Page>
				<View style={{ padding: 16 }}>
					<Text color="text-muted" variant="text-sm/normal">
						This rule no longer exists.
					</Text>
				</View>
			</Page>
		)
	}

	const links = kind === 'links'
	const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
	const pendingRule = React.useRef<Rule | undefined>(rule)
	pendingRule.current = rule

	const flushSave = React.useCallback(() => {
		if (saveTimer.current) {
			clearTimeout(saveTimer.current)
			saveTimer.current = null
		}
		if (pendingRule.current) {
			updateRule(kind, target.id, pendingRule.current)
		}
	}, [kind, target?.id])

	const set = (patch: Partial<Rule>) => {
		setRule(prev => {
			if (!prev) return prev
			const next = { ...prev, ...patch }
			pendingRule.current = next
			return next
		})
		if (saveTimer.current) clearTimeout(saveTimer.current)
		// Defer storage write off the critical render frame so disabled states render in 0ms
		saveTimer.current = setTimeout(() => {
			if (pendingRule.current) {
				updateRule(kind, target.id, pendingRule.current)
			}
		}, 80)
	}

	React.useEffect(() => {
		return () => {
			flushSave()
		}
	}, [flushSave])
	// Only in these servers: rule.scope { kind: 'servers' }. No servers = everywhere.
	const serverIds = rule.scope?.kind === 'servers' ? (rule.scope.ids ?? []) : []
	const otherScope =
		rule.scope && rule.scope.kind !== 'all' && rule.scope.kind !== 'servers'
			? rule.scope.kind
			: undefined
	const guildName = (id: string) =>
		(
			Stores.GuildStore as
				| DiscordModules.Flux.Store<{
						getGuild?(id: string): { name?: string } | undefined
				  }>
				| undefined
		)?.getGuild?.(id)?.name ?? id
	const setServers = (ids: string[]) =>
		set({ scope: ids.length ? { kind: 'servers', ids } : undefined })
	const removeServer = (id: string) => {
		const key = 'SendTweaksRemoveRuleServer'
		const last = serverIds.length === 1
		Alerts.openAlert(
			key,
			<AlertModal
				title={`Remove ${guildName(id)}?`}
				content={
					last
						? 'With no servers left, this rule works everywhere again.'
						: 'This rule will stop working in that server.'
				}
				actions={
					<>
						<AlertActionButton
							text="Remove"
							variant="destructive"
							onPress={() => {
								Alerts.dismissAlert(key)
								setServers(serverIds.filter(item => item !== id))
							}}
						/>
						<AlertActionButton
							text="Cancel"
							variant="secondary"
							onPress={() => Alerts.dismissAlert(key)}
						/>
					</>
				}
			/>,
		)
	}
	const error = rule.find ? compileRule(rule).error : undefined

	const confirmDelete = () => {
		const key = 'SendTweaksDeleteRule'
		Alerts.openAlert(
			key,
			<AlertModal
				title={`Delete ${rule.name ? `“${rule.name}”` : 'this rule'}?`}
				content={
					rule.find
						? `"${rule.find}" → "${rule.replace}"`
						: 'This rule is empty.'
				}
				actions={
					<>
						<AlertActionButton
							text="Delete"
							variant="destructive"
							onPress={() => {
								Alerts.dismissAlert(key)
								pendingRule.current = undefined
								if (saveTimer.current) {
									clearTimeout(saveTimer.current)
									saveTimer.current = null
								}
								deleteRule(kind, rule.id)
								navigation?.goBack?.()
							}}
						/>
						<AlertActionButton
							text="Cancel"
							variant="secondary"
							onPress={() => Alerts.dismissAlert(key)}
						/>
					</>
				}
			/>,
		)
	}

	return (
		<Page>
			<ScrollView
				keyboardShouldPersistTaps="handled"
				contentContainerStyle={{ paddingBottom: useBottomPadding() }}
			>
				<Stack spacing={24}>
					<TableRowGroup title="Rule">
						<FieldRow label="Name">
							<SingleLineField
								placeholder={
									links ? 'Optional, e.g. Twitter to fxtwitter' : 'Optional'
								}
								value={rule.name ?? ''}
								onChange={(value: string) => set({ name: value || undefined })}
							/>
						</FieldRow>
						<FieldRow label="Find">
							<LinesField
								placeholder={
									rule.regex
										? 'A regular expression'
										: links
											? 'Part of a link, e.g. twitter.com'
											: 'Text to look for'
								}
								value={rule.find}
								status={error ? 'error' : 'default'}
								errorMessage={error}
								onChange={(value: string) => {
									set({ find: value })
									if (!links && tryUnlock(value))
										showToast(
											'Greetings unlocked: placeholders now work in Replace with',
										)
								}}
							/>
						</FieldRow>
						<FieldRow
							label="Replace with"
							description={
								(rule.regex
									? `Use $1, $2 … for captured groups, and \\n for a line break.${links ? '' : ' Find ^ or $ alone to add text to the start or end of every message.'}`
									: 'Used exactly as typed, line breaks included.') +
								(!links
									? greetingsUnlocked()
										? ` Placeholders: ${PLACEHOLDERS.map(key => `{${key}}`).join(' ')}. {mention} is who you reply to, or whoever joined last.`
										: ' Tip: use {timestamp} for a timestamp (<t:time:F>), or {rainbow:$1} / {rainbow} for an ANSI rainbow codeblock.'
									: '')
							}
						>
							<LinesField
								key={`replacement-${replacementRevision}`}
								placeholder="Leave empty to delete what was found"
								value={rule.replace}
								onChange={(value: string) => set({ replace: value })}
							/>
						</FieldRow>
					</TableRowGroup>

					<TableRowGroup title="Only in these servers" hasIcons>
						{serverIds.map(id => (
							<TableRow
								key={id}
								label={guildName(id)}
								subLabel="Tap to remove"
								onPress={() => removeServer(id)}
							/>
						))}
						<TableRow
							label="Add a server"
							subLabel={
								serverIds.length
									? undefined
									: otherScope
										? `Imported to work only in ${otherScope === 'dms' ? 'DMs' : 'some channels'}. Adding a server replaces that.`
										: 'Works everywhere now. Add servers to use it only there (not in DMs).'
							}
							icon={rowIcon('PlusSmallIcon', 'PlusMediumIcon')}
							arrow
							onPress={() =>
								openServerPicker(navigation, {
									exclude: serverIds,
									onPick: guild => setServers([...serverIds, guild.id]),
								})
							}
						/>
					</TableRowGroup>

					{unlocked
						? validateTemplate(
								rule.replace,
								rule.replace,
								settings().snippets ?? [],
							).map(warning => (
								<Text
									key={warning}
									variant="text-sm/normal"
									color="text-feedback-warning"
								>
									{warning}
								</Text>
							))
						: null}

					<TableRowGroup title="Options">
						<RuleSwitch
							label="On"
							value={!!rule.enabled}
							onValueChange={(value: boolean) => set({ enabled: value })}
						/>
						{!links && (
							<RuleSwitch
								label="Apply directly while typing"
								subLabel="Replaces text directly in the chat box while typing instead of waiting till send."
								disabled={!rule.enabled}
								value={!!rule.live}
								onValueChange={(value: boolean) => set({ live: value })}
							/>
						)}
						<RuleSwitch
							label="Regular expression"
							subLabel="For advanced patterns. A pattern that is not valid is skipped, never sent."
							disabled={!rule.enabled}
							value={!!rule.regex}
							onValueChange={(value: boolean) => set({ regex: value })}
						/>
						<RuleSwitch
							label="Match case"
							subLabel='Off means "Cat" and "cat" both match.'
							disabled={!rule.enabled}
							value={!!rule.caseSensitive}
							onValueChange={(value: boolean) => set({ caseSensitive: value })}
						/>
						<RuleSwitch
							label="Whole words only"
							subLabel={
								rule.regex
									? 'Not used for regular expressions — write \\b yourself.'
									: '"cat" matches "cat" but not "concatenate".'
							}
							disabled={!rule.enabled || rule.regex}
							value={!!rule.wholeWord}
							onValueChange={(value: boolean) => set({ wholeWord: value })}
						/>
					</TableRowGroup>

					<TableRowGroup hasIcons>
						<TableRow
							label="Copy as JSON"
							subLabel="In Text Replace's format, to share it"
							icon={rowIcon('CopyIcon')}
							disabled={!rule.find}
							onPress={() =>
								showToast(
									copyText(exportRule(rule))
										? 'Rule copied.'
										: 'Could not reach the clipboard.',
								)
							}
						/>
						<TableRow
							variant="danger"
							label="Delete rule"
							icon={dangerIcon('TrashIcon', 'ic_trash_24px')}
							onPress={confirmDelete}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
