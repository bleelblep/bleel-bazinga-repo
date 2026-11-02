import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import { ReactNavigationNative } from '@valenced/externals/react-navigation'
import * as React from 'react'
import * as ReactNative from 'react-native'
import {
	attentionTitle,
	needingAttention,
	useReadyMade,
} from '../../lib/readyMade'
import { addRule, setEditing, useRules } from '../../lib/ruleStore'
import {
	SORT_MODES,
	searchRules,
	sortModeOf,
	sortRules,
} from '../../lib/ruleSort'
import { useSettings } from '../../lib/state'
import { compileRule } from '../../lib/textReplace'
import AiDraft from '../components/AiDraft'
import RuleSearch from '../components/RuleSearch'
import UpdateBanner from '../components/UpdateBanner'
import { rowIcon } from '../icon'
import {
	EDIT_RULE_ROUTE,
	IMPORT_EXPORT_LINKS_ROUTE,
	IMPORT_EXPORT_TEXT_ROUTE,
	READY_LINKS_ROUTE,
	READY_TEXT_ROUTE,
} from '../routes'
import { useBottomPadding } from '../safeArea'
import type { RuleKind } from '../../lib/ruleStore'
import type { Rule } from '../../lib/textReplace'
import type { Navigation } from '../navigation'

export function TextRules() {
	return <Rules kind="text" />
}

export function LinkRules() {
	return <Rules kind="links" />
}

/** "find → replace", short enough for one row. */
function summary(rule: Rule): string {
	// A line break would split the row, so show it as ↵.
	const clip = (raw: string) => {
		const text = raw.replace(/\r?\n/g, '↵')
		return text.length > 40 ? `${text.slice(0, 39)}…` : text
	}
	if (!rule.find) return 'Empty — tap to set it up'
	return `${clip(rule.find)} → ${rule.replace ? clip(rule.replace) : '(removed)'}`
}

/**
 * A rule list: one row per rule, opening the rule on its own screen (`EditRule.tsx`). Its ready-made
 * rules and import box are on a screen of their own, reachable only from this list, so link rules
 * are only ever offered from Link rules and text rules from Replacement rules. AI drafting sits at
 * the foot of the list.
 */
function Rules({ kind }: { kind: RuleKind }) {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, Text, TableRowGroup, TableRow } = Design
	const { useNavigation } = ReactNavigationNative
	const navigation = useNavigation() as Navigation

	const links = kind === 'links'
	const rules = useRules(kind)
	const { presets } = useReadyMade()
	// Your rules whose ready-made rule has a newer version, or has been retired.
	const attention = needingAttention(
		rules,
		presets.filter(preset => preset.kind === kind),
	)

	const openReadyMade = () =>
		navigation.navigate(links ? READY_LINKS_ROUTE : READY_TEXT_ROUTE)
	const openImportExport = () =>
		navigation.navigate(
			links ? IMPORT_EXPORT_LINKS_ROUTE : IMPORT_EXPORT_TEXT_ROUTE,
		)

	const open = (rule: Rule) => {
		setEditing(kind, rule.id)
		navigation.navigate(EDIT_RULE_ROUTE)
	}

	// Search and sort only change what's shown; the rules still run in their saved order.
	const [search, setSearch] = React.useState('')
	const mode = sortModeOf(kind, useSettings())
	const shown = sortRules(searchRules(rules, search), mode)
	const base = links ? 'Your link rules' : 'Your rules'
	const sortedBy = SORT_MODES.find(option => option.value === mode)?.short
	const listTitle = search.trim()
		? `${base} (${shown.length} of ${rules.length})`
		: mode !== 'default' && sortedBy
			? `${base} · sorted by ${sortedBy.toLowerCase()}`
			: base

	const icon = (rule: Rule) => {
		const broken = rule.find && compileRule(rule).error
		if (broken) return rowIcon('CircleErrorIcon')
		return rule.enabled && rule.find
			? rowIcon('CircleCheckIcon')
			: rowIcon('CircleMinusIcon', 'CircleErrorIcon')
	}

	return (
		<Page>
			<ScrollView
				keyboardShouldPersistTaps="handled"
				contentContainerStyle={{ paddingBottom: useBottomPadding() }}
			>
				<Stack spacing={24}>
					{attention.size ? (
						<UpdateBanner
							title={attentionTitle(attention.values())}
							body="Ready-made rules you added have been fixed or have stopped working since. Tap here to sort them out."
							onPress={openReadyMade}
						/>
					) : null}

					<Text color="text-muted" variant="text-sm/normal">
						{links
							? 'These run only inside links, after tracking is removed, and never inside code blocks — for swapping a site for a better-embedding one, like x.com for fixupx.com.'
							: 'These run top to bottom, each on the result of the one before. They never touch code blocks, links, mentions, custom emoji or timestamps.'}
					</Text>

					{rules.length ? (
						<RuleSearch
							kind={kind}
							search={search}
							onSearch={setSearch}
							mode={mode}
						/>
					) : null}

					{rules.length ? (
						<TableRowGroup title={listTitle} hasIcons>
							{shown.length ? null : (
								<TableRow
									label={`No rules match “${search.trim()}”`}
									subLabel="Tap to clear the search"
									icon={rowIcon('CircleXIcon', 'XSmallIcon')}
									onPress={() => setSearch('')}
								/>
							)}
							{shown.map(rule => {
								const error = rule.find ? compileRule(rule).error : undefined
								return (
									<TableRow
										key={rule.id}
										// Numbered by where it runs, whatever order the list is shown in.
										label={rule.name || `Rule ${rules.indexOf(rule) + 1}`}
										subLabel={
											error
												? `Not working: ${error}`
												: `${attention.get(rule.id)?.retired ? 'No longer works · ' : attention.has(rule.id) ? 'Needs updating · ' : ''}${rule.enabled ? '' : 'Off · '}${summary(rule)}`
										}
										icon={
											attention.get(rule.id)?.retired
												? rowIcon('TrashIcon', 'ic_trash_24px')
												: attention.has(rule.id)
													? rowIcon('RefreshIcon', 'ic_refresh')
												: icon(rule)
										}
										arrow
										onPress={() => open(rule)}
									/>
								)
							})}
						</TableRowGroup>
					) : null}

					<TableRowGroup hasIcons>
						<TableRow
							label={links ? 'Add a link rule' : 'Add a rule'}
							subLabel={
								rules.length
									? undefined
									: links
										? 'For example: find twitter.com, replace with fxtwitter.com'
										: 'For example: find "teh", replace with "the"'
							}
							icon={rowIcon('PlusSmallIcon', 'PlusLargeIcon', 'ic_add_24px')}
							arrow
							onPress={() => open(addRule(kind))}
						/>
						<TableRow
							label={links ? 'Ready-made link rules' : 'Ready-made rules'}
							subLabel={
								attention.size
									? attentionTitle(attention.values())
									: links
										? 'One for each site, like X to fixupx'
										: 'Shortcuts others use, like /shrug'
							}
							icon={rowIcon('DownloadIcon', 'ic_download_24px')}
							arrow
							onPress={openReadyMade}
						/>
						<TableRow
							label={
								links
									? 'Import and export link rules'
									: 'Import and export rules'
							}
							subLabel="Backup, share, or import rules from JSON"
							icon={rowIcon('CopyIcon', 'ic_copy')}
							arrow
							onPress={openImportExport}
						/>
					</TableRowGroup>

					<AiDraft kind={kind} />
				</Stack>
			</ScrollView>
		</Page>
	)
}
