import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import { ReactNavigationNative } from '@valenced/externals/react-navigation'
import * as ReactNative from 'react-native'
import { addRule, setEditing, useRules } from '../../lib/ruleStore'
import { compileRule } from '../../lib/textReplace'
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
 * are only ever offered from Link rules and text rules from Replacement rules.
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

	const icon = (rule: Rule) => {
		const broken = rule.find && compileRule(rule).error
		if (broken) return rowIcon('CircleErrorIcon')
		return rule.enabled && rule.find
			? rowIcon('CircleCheckIcon')
			: rowIcon('CircleMinusIcon', 'CircleErrorIcon')
	}

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<Text color="text-muted" variant="text-sm/normal">
						{links
							? 'These run only inside links, after tracking is removed, and never inside code blocks — for swapping a site for a better-embedding one, like twitter.com for fxtwitter.com.'
							: 'These run top to bottom, each on the result of the one before. They never touch code blocks, links, mentions, custom emoji or timestamps.'}
					</Text>

					{rules.length ? (
						<TableRowGroup
							title={links ? 'Your link rules' : 'Your rules'}
							hasIcons
						>
							{rules.map((rule, index) => {
								const error = rule.find ? compileRule(rule).error : undefined
								return (
									<TableRow
										key={rule.id}
										label={rule.name || `Rule ${index + 1}`}
										subLabel={
											error
												? `Not working: ${error}`
												: `${rule.enabled ? '' : 'Off · '}${summary(rule)}`
										}
										icon={icon(rule)}
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
							subLabel="Community presets and AI rule drafting"
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
				</Stack>
			</ScrollView>
		</Page>
	)
}
