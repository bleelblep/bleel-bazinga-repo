import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import { ReactNavigationNative } from '@valenced/externals/react-navigation'
import * as ReactNative from 'react-native'
import { useChangelog } from '../../../../../shared/changelog'
import { hasLiveRule } from '../../lib/liveReplace'
import { getAi, getStorage, useSettings } from '../../lib/state'
import { rowIcon } from '../icon'
import {
	AI_ROUTE,
	DEBUG_ROUTE,
	LINK_RULES_ROUTE,
	OPTIONS_ROUTE,
	RULES_ROUTE,
	TRY_ROUTE,
} from '../routes'
import { useBottomPadding } from '../safeArea'
import type { Rule, SendTweaksStorage } from '../../types'

const DEBUG: boolean = false

function countLabel(rules: Rule[]): string {
	if (!rules.length) return 'No rules yet'
	const on = rules.filter(rule => rule.enabled && rule.find).length
	return `${on} of ${rules.length} rule${rules.length === 1 ? '' : 's'} on`
}

/**
 * The root page, laid out like Ghost Log Native Beta's: a context card, one muted scope line, the
 * main destination in a group of its own, an index of everything else, then Developer on its own.
 * Switches live on the Settings sub-page (`Options.tsx`); the only one repeated here is Silent
 * messages, and only while it is on, because it changes every message and is easy to forget.
 */
export default function Settings({
	api,
}: {
	api: ValencedPluginStartApi<SendTweaksStorage>
}) {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { Page } = components
	const { ScrollView, View } = ReactNative
	const { Stack, Text, Card, TableRowGroup, TableRow, TableSwitchRow } = Design
	const { useNavigation } = ReactNavigationNative

	const navigation = useNavigation() as { navigate: (route: string) => void }
	// The changelog icon at the top right, and "What's new" once after an update.
	useChangelog()
	const s = useSettings()
	const set = (patch: Partial<SendTweaksStorage>) =>
		(getStorage() ?? api.jsonStorage).set(patch)

	const liveRules = hasLiveRule(s)

	const on = [
		s.silentMessages && 'silent',
		s.cleanUrls && 'tracking',
		s.linkRewrite && 'link rules',
		s.textReplace && 'text rules',
		liveRules && 'live replace',
		s.polishWording && 'polish wording',
		s.noReplyMention && 'no reply pings',
	].filter(Boolean) as string[]
	const settingsLabel = on.length ? `On: ${on.join(', ')}` : 'Everything is off'

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<Card variant="secondary" border="none">
						<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
							<Text color="text-default" variant="text-md/semibold">
								Small fixes to what you send
							</Text>
							<Text
								color="text-muted"
								variant="text-sm/normal"
								style={{ marginTop: 8 }}
							>
								Everything here happens on your phone, just before a message
								leaves. A message none of these apply to is sent exactly as you
								typed it.
							</Text>
						</View>
					</Card>

					{s.silentMessages ? (
						<TableRowGroup hasIcons>
							<TableSwitchRow
								label="Silent messages are on"
								subLabel="Nobody is notified about what you send. Switch off to send normally."
								icon={rowIcon('BellSlashIcon', 'BellZIcon')}
								value
								onValueChange={value => set({ silentMessages: value })}
							/>
						</TableRowGroup>
					) : null}

					<Text color="text-muted" variant="text-sm/normal">
						Text inside code blocks is never changed, so a link or command you
						are quoting stays exactly as you wrote it.
					</Text>

					<TableRowGroup hasIcons>
						<TableRow
							label="Try a message"
							subLabel="Type something and see exactly what would be sent"
							icon={rowIcon('ChatIcon', 'ic_message')}
							arrow
							onPress={() => navigation.navigate(TRY_ROUTE)}
						/>
					</TableRowGroup>

					<TableRowGroup hasIcons>
						<TableRow
							label="Settings"
							subLabel={settingsLabel}
							icon={rowIcon('SettingsIcon', 'ic_settings')}
							arrow
							onPress={() => navigation.navigate(OPTIONS_ROUTE)}
						/>
						<TableRow
							label="Link rules"
							subLabel={
								s.linkRewrite
									? countLabel(s.linkRules ?? [])
									: 'Turn on Rewrite links in Settings to use these'
							}
							icon={rowIcon('LinkIcon', 'ic_link')}
							arrow
							disabled={!s.linkRewrite}
							onPress={() => navigation.navigate(LINK_RULES_ROUTE)}
						/>
						<TableRow
							label="Replacement rules"
							subLabel={
								s.textReplace || liveRules
									? countLabel(s.rules)
									: 'Replace text as you send is off. Rules set to apply while typing still run.'
							}
							icon={rowIcon('TextIcon', 'ic_edit_24px')}
							arrow
							onPress={() => navigation.navigate(RULES_ROUTE)}
						/>
						{/* Only with AI Core installed: the route is not registered without it. */}
						{getAi() ? (
							<TableRow
								label="Write a rule with AI"
								subLabel="Describe a rule and AI Core writes and tests it"
								icon={rowIcon('MagicWandIcon')}
								arrow
								onPress={() => navigation.navigate(AI_ROUTE)}
							/>
						) : null}
					</TableRowGroup>

					{DEBUG && (
						<TableRowGroup title="Developer" hasIcons>
							<TableRow
								label="Debug"
								subLabel="Whether the hooks installed, and what they have changed"
								icon={rowIcon('BugIcon', 'ic_debug')}
								arrow
								onPress={() => navigation.navigate(DEBUG_ROUTE)}
							/>
						</TableRowGroup>
					)}
				</Stack>
			</ScrollView>
		</Page>
	)
}
