import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as React from 'react'
import * as ReactNative from 'react-native'
import { tokenHex } from '../../lib/colours'
import {
	applyUpdate,
	attentionTitle,
	linkFor,
	refreshReadyMadeIfStale,
	useReadyMade,
} from '../../lib/readyMade'
import { addRule, deleteRule, useRules } from '../../lib/ruleStore'
import { showToast as triggerToast } from '../../lib/toast'
import UpdateBanner from '../components/UpdateBanner'
import { confirmDestructive } from '../../../../../shared/ui/confirm'
import { dangerIcon, rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'
import type { Preset } from '../../lib/importRules'
import type { RuleKind } from '../../lib/ruleStore'

function showToast(content: string) {
	triggerToast(content, { key: 'SendTweaksReadyToast' })
}

const SOURCE: Record<Preset['source'], string> = {
	thread: 'From the Text Replace thread',
	updated: 'From the Text Replace thread, updated',
	added: 'Added by Send Tweaks',
}

/** Used when the theme's tokens don't resolve. */
const MUTED = '#a8abb2'
const BRAND = '#949cf7'

export function ReadyMadeLinks() {
	return <ReadyMade kind="links" />
}

export function ReadyMadeText() {
	return <ReadyMade kind="text" />
}

/** "twitter.com → fixupx.com" as two small code chips, then the note. */
function Detail({ preset, prefix }: { preset: Preset; prefix: string }) {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { View } = ReactNative
	const { Text } = Design
	const muted = tokenHex('text-muted') ?? MUTED
	const brand = tokenHex('text-brand') ?? BRAND
	const chip = (text: string, colour: string, background: string) => (
		<View
			style={{
				backgroundColor: background,
				borderRadius: 6,
				paddingHorizontal: 6,
				paddingVertical: 1,
			}}
		>
			<Text
				variant="text-sm/medium"
				style={{ color: colour, fontFamily: 'monospace' }}
			>
				{text}
			</Text>
		</View>
	)
	return (
		<View style={{ gap: 6, marginTop: 4 }}>
			{preset.shows ? (
				<View
					style={{
						flexDirection: 'row',
						flexWrap: 'wrap',
						alignItems: 'center',
						gap: 6,
					}}
				>
					{chip(preset.shows.from, tokenHex('text-default') ?? '#f2f3f5', `${muted}26`)}
					<Text color="text-muted" variant="text-sm/normal">
						→
					</Text>
					{chip(preset.shows.to, brand, `${brand}26`)}
				</View>
			) : null}
			<Text color="text-muted" variant="text-sm/normal">
				{prefix}
				{preset.note}
			</Text>
		</View>
	)
}

/**
 * Ready-made rules for one list, and nothing else: one row per site, each showing what it changes.
 * There is one of these per list, each opened only from its own list's screen, so link rules are
 * only offered next to link rules and text rules next to text rules. The list keeps itself up to
 * date (`readyMade.ts`); AI drafting lives on the rule list itself.
 */
function ReadyMade({ kind }: { kind: RuleKind }) {
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, TableRowGroup, TableRow } = Design

	const rules = useRules(kind)
	const readyMade = useReadyMade()
	const presets = readyMade.presets.filter(preset => preset.kind === kind)

	// Fetch a newer list if this one is a few hours old. The rows re-render when it lands.
	React.useEffect(() => refreshReadyMadeIfStale(), [])

	const row = (preset: Preset) => {
		const link = linkFor(rules, preset)
		const label = preset.rule.name ?? preset.rule.find
		if (link?.retired) {
			return (
				<TableRow
					key={preset.id}
					variant="danger"
					label={label}
					subLabel={
						<Detail
							preset={preset}
							prefix="No longer works · tap to remove your copy. "
						/>
					}
					icon={dangerIcon('TrashIcon', 'ic_trash_24px')}
					onPress={() =>
						confirmDestructive({
							title: `Remove “${label}”?`,
							body: 'It no longer works, so it is taken out of your rules. This cannot be undone.',
							action: 'Remove',
							onConfirm: () => {
								deleteRule(kind, link.rule.id)
								showToast(`Removed “${label}”.`)
							},
						})
					}
				/>
			)
		}
		if (link?.outdated) {
			return (
				<TableRow
					key={preset.id}
					label={label}
					subLabel={<Detail preset={preset} prefix="Tap to update. " />}
					icon={rowIcon('RefreshIcon', 'ic_refresh')}
					onPress={() => {
						applyUpdate(kind, link.rule, preset)
						showToast(`Updated “${label}”.`)
					}}
				/>
			)
		}
		return (
			<TableRow
				key={preset.id}
				label={label}
				subLabel={
					<Detail
						preset={preset}
						prefix={`${link ? 'Added · ' : ''}${SOURCE[preset.source]}. `}
					/>
				}
				icon={
					link
						? rowIcon('CircleCheckIcon')
						: rowIcon('PlusSmallIcon', 'PlusLargeIcon', 'ic_add_24px')
				}
				disabled={!!link}
				onPress={() => {
					addRule(kind, {
						...preset.rule,
						preset: { id: preset.id, version: preset.version },
					})
					showToast(`Added “${label}”.`)
				}}
			/>
		)
	}
	const attention = presets.flatMap(preset => {
		const link = linkFor(rules, preset)
		return link && (link.outdated || link.retired) ? [{ preset, link }] : []
	})
	const needsTap = attention.map(item => item.preset)
	// Retired rules are only shown to people who still have them, in the card above. Hidden ones
	// aren't shown at all: whoever has one keeps it as it is.
	const current = presets.filter(
		preset => !preset.retired && !preset.hidden && !needsTap.includes(preset),
	)

	return (
		<Page>
			<ScrollView
				keyboardShouldPersistTaps="handled"
				contentContainerStyle={{ paddingBottom: useBottomPadding() }}
			>
				<Stack spacing={24}>
					{needsTap.length ? (
						<UpdateBanner
							title={attentionTitle(attention.map(item => item.link))}
							body={
								attention.some(item => item.link.retired)
									? 'These were fixed or stopped working after you added them. Tap one to update it, or to remove one that no longer works.'
									: 'These were fixed after you added them. Tap one to update it. Your rule stays on or off and keeps where it runs.'
							}
						>
							<TableRowGroup hasIcons>{needsTap.map(row)}</TableRowGroup>
						</UpdateBanner>
					) : null}

					<TableRowGroup hasIcons>{current.map(row)}</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
