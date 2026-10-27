import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as finders from '@valenced/modules/finders'
import * as filters from '@valenced/modules/finders/filters'
import * as ReactNative from 'react-native'
import { reportError } from '../../../../../shared/report'
import { copyText } from '../../lib/clipboard'
import { PRESETS, THREAD } from '../../lib/importRules'
import { addRule, useRules } from '../../lib/ruleStore'
import { showToast as triggerToast } from '../../lib/toast'
import AiDraft from '../components/AiDraft'
import { rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'
import type { Preset } from '../../lib/importRules'
import type { RuleKind } from '../../lib/ruleStore'

/** Discord's router: `transitionTo` opens an in-app path. On the namespace or on `default`. */
interface Routing {
	transitionTo?(path: string): void
	transitionToGuild?(...args: unknown[]): void
	default?: Routing
}
function showToast(content: string) {
	triggerToast(content, { key: 'SendTweaksReadyToast' })
}

/**
 * Opens the thread inside Discord. `transitionTo` is Discord's in-app router; handing the
 * discord.com URL to Android instead does nothing visible in this repackaged app, which is not that
 * domain's link handler (ghost-log-native-beta `lib/navigate.ts` found this on-device).
 */
function openThread(): boolean {
	try {
		const { lookupModule } = finders
		const { withProps } = filters
		const routing = lookupModule(withProps<Routing>('transitionToGuild'))?.[0]
		const host =
			typeof routing?.transitionTo === 'function' ? routing : routing?.default
		if (typeof host?.transitionTo !== 'function') return false
		host.transitionTo(`/channels/${THREAD.guildId}/${THREAD.channelId}`)
		return true
	} catch (error) {
		reportError('[SendTweaks] could not open the thread:', error)
		return false
	}
}

const SOURCE: Record<Preset['source'], string> = {
	thread: 'From the thread',
	updated: 'From the thread, updated',
	added: 'Added by Send Tweaks',
}

export function ReadyMadeLinks() {
	return <ReadyMade kind="links" />
}

export function ReadyMadeText() {
	return <ReadyMade kind="text" />
}

/**
 * Ready-made rules for one list. There is one of these per list, each opened only
 * from its own list's screen, so link rules are only offered next to link rules and text rules next
 * to text rules.
 *
 * The rules come from the Text Replace thread in the Vendetta server -- see the note on `PRESETS`
 * for what was checked, changed and left out.
 */
function ReadyMade({ kind }: { kind: RuleKind }) {
	const { Page } = components
	const { ScrollView, View } = ReactNative
	const { Stack, Text, Card, TableRowGroup, TableRow } = Design

	const links = kind === 'links'
	const rules = useRules(kind)
	const presets = PRESETS.filter(preset => preset.kind === kind)

	return (
		<Page>
			<ScrollView
				keyboardShouldPersistTaps="handled"
				contentContainerStyle={{ paddingBottom: useBottomPadding() }}
			>
				<Stack spacing={24}>
					<Card variant="secondary" border="none">
						<View
							style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 6 }}
						>
							<Text color="text-default" variant="text-md/semibold">
								From the Text Replace thread
							</Text>
							<Text color="text-muted" variant="text-sm/normal">
								{links
									? "These were shared in the Vendetta server's thread for Text Replace, a Vendetta and Bunny plugin. Some rules may not work correctly: the sites they point to can change or shut down at any time, so check a link after sending it."
									: "These were shared in the Vendetta server's thread for Text Replace, a Vendetta and Bunny plugin. Some rules may not work correctly, so try one in Try a message before relying on it."}
							</Text>
						</View>
					</Card>

					<TableRowGroup hasIcons>
						<TableRow
							label="Open the thread"
							subLabel="In the Vendetta server. You need to have joined it."
							icon={rowIcon('ChatIcon', 'ic_message')}
							arrow
							onPress={() => {
								if (!openThread()) {
									showToast(
										copyText(THREAD.url)
											? 'Could not open it here, so the link was copied.'
											: 'Could not open the thread.',
									)
								}
							}}
						/>
						<TableRow
							label="Copy the link"
							subLabel={THREAD.url}
							icon={rowIcon('LinkIcon', 'ic_link')}
							onPress={() =>
								showToast(
									copyText(THREAD.url)
										? 'Link copied.'
										: 'Could not reach the clipboard.',
								)
							}
						/>
					</TableRowGroup>

					<AiDraft kind={kind} />

					<TableRowGroup title="Ready-made" hasIcons>
						{presets.map(preset => {
							const added = rules.some(rule => rule.find === preset.rule.find)
							return (
								<TableRow
									key={preset.rule.name}
									label={preset.rule.name ?? preset.rule.find}
									subLabel={`${added ? 'Added · ' : ''}${SOURCE[preset.source]}. ${preset.note}`}
									icon={
										added
											? rowIcon('CircleCheckIcon')
											: rowIcon('PlusSmallIcon', 'PlusLargeIcon', 'ic_add_24px')
									}
									disabled={added}
									onPress={() => {
										addRule(kind, { ...preset.rule })
										showToast(`Added “${preset.rule.name}”.`)
									}}
								/>
							)
						})}
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
