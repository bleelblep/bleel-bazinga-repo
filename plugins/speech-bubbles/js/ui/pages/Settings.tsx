/**
 * The main page: an index (settings design guide §2.2). A neutral card, one muted scope line, the
 * "Show in servers" switch (the plugin's one where-it-applies control, kept on the main page like
 * Second Thoughts' Enabled switch), rows to each page with what's on, then Developer (DEBUG builds
 * only) and the credit.
 *
 * Writes go to `jsonStorage` only; `start()` hears them through subscribe and tells native.
 */

import { Page } from '@valenced/components'
import { Design } from '@valenced/discord/design'
import { ReactNavigationNative } from '@valenced/externals/react-navigation'
import { ScrollView, View } from 'react-native'
import { useChangelog } from '../../../../../shared/changelog'
import { Credit } from '../../../../../shared/ui/credit'
import { rowIcon } from '../../../../../shared/ui/icon'
import { useBottomPadding } from '../../../../../shared/ui/safeArea'
import { DEFAULTS, migrateTimes } from '../../native'
import {
	COLOURS_ROUTE,
	DEBUG_ROUTE,
	SEND_ROUTE,
	SOUNDS_ROUTE,
	TIMES_ROUTE,
	VISUAL_ROUTE,
} from '../routes'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { SpeechBubblesStorage } from '../../native'

const DEBUG: boolean = false

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: SpeechBubblesStorage }>
>

const COLOUR_NAMES: Record<SpeechBubblesStorage['colors'], string> = {
	theme: 'From your theme',
	swapped: 'From your theme, swapped',
	own: 'Your own colours',
}

export const TIME_NAMES: Record<SpeechBubblesStorage['times'], string> = {
	hidden: 'Hidden',
	below: 'Tap: under the bubble',
	popup: 'Tap: pop-up above the bubble',
}

function visualSummary(s: SpeechBubblesStorage): string {
	const on = [
		s.tails ? 'tails' : null,
		s.timeBreaks ? 'time breaks' : null,
		s.invisibleInk ? 'invisible ink' : null,
		s.iosReactions ? 'iOS reactions' : null,
		s.typingBubble ? 'typing bubble' : null,
		s.hideAvatars ? 'avatars hidden' : null,
		s.ownAvatar ? 'your picture shown' : null,
		s.ownName ? 'your name shown' : null,
		s.avatarShape ? 'avatars match bubbles' : null,
		s.hideNames ? 'names hidden' : null,
		s.editedLabel ? '"Edited" under bubbles' : null,
	].filter(Boolean)
	const text = on.length ? on.join(', ') : 'Plain bubbles'
	return text[0].toUpperCase() + text.slice(1)
}

export default function Settings({ api: { jsonStorage } }: Props) {
	// The changelog icon at the top right, and "What's new" once after an update.
	useChangelog()
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { Stack, Text, Card, TableRowGroup, TableRow, TableSwitchRow } = Design
	const navigation = ReactNavigationNative.useNavigation() as {
		navigate: (route: string) => void
	}
	const stored = { ...DEFAULTS, ...(jsonStorage.use() ?? {}) }
	const s: SpeechBubblesStorage = {
		...stored,
		times: migrateTimes(stored.times),
	}

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<Card variant="secondary" border="none">
						<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
							<Text color="text-default" variant="text-md/semibold">
								Only the look changes
							</Text>
							<Text
								color="text-muted"
								variant="text-sm/normal"
								style={{ marginTop: 8 }}
							>
								Messages are drawn as bubbles on this phone: yours on the right,
								theirs on the left. Nothing is sent or stored anywhere else, and
								everyone else sees Discord as usual.
							</Text>
						</View>
					</Card>

					<Text color="text-muted" variant="text-sm/normal">
						Android only. Works in DMs and group DMs, and in servers if you turn
						it on.
					</Text>

					<TableRowGroup hasIcons>
						<TableSwitchRow
							label="Show in servers"
							subLabel="Bubbles in server channels too, not only in DMs and group DMs"
							icon={rowIcon('ServerIcon', 'GlobeEarthIcon')}
							value={s.everywhere}
							onValueChange={everywhere => jsonStorage.set({ everywhere })}
						/>
					</TableRowGroup>

					<TableRowGroup hasIcons>
						<TableRow
							label="Visual style"
							subLabel={visualSummary(s)}
							icon={rowIcon('ChatIcon', 'ic_message')}
							arrow
							onPress={() => navigation.navigate(VISUAL_ROUTE)}
						/>
						<TableRow
							label="Colours"
							subLabel={`${COLOUR_NAMES[s.colors]}${s.perPerson ? ', one per person in groups' : ''}`}
							icon={rowIcon('PaintPaletteIcon', 'ic_theme_24px')}
							arrow
							onPress={() => navigation.navigate(COLOURS_ROUTE)}
						/>
						<TableRow
							label="Message times"
							subLabel={`${TIME_NAMES[s.times]}${s.swipeTimes ? ', two-finger swipe' : ''}`}
							icon={rowIcon('ClockIcon', 'ic_clock')}
							arrow
							onPress={() => navigation.navigate(TIMES_ROUTE)}
						/>
						<TableRow
							label="Send animation"
							subLabel={
								s.sendAnimation
									? s.sendStyle === 'pop'
										? 'Pop'
										: 'iMessage'
									: 'Off'
							}
							icon={rowIcon('SendMessageIcon', 'ic_send')}
							arrow
							onPress={() => navigation.navigate(SEND_ROUTE)}
						/>
						<TableRow
							label="Sounds and haptics"
							subLabel={
								[s.sounds ? 'Sounds' : null, s.haptics ? 'haptics' : null]
									.filter(Boolean)
									.join(' and ')
									.replace(/^h/, 'H') || 'Off'
							}
							icon={rowIcon('BellIcon', 'SettingsIcon')}
							arrow
							onPress={() => navigation.navigate(SOUNDS_ROUTE)}
						/>
					</TableRowGroup>

					{DEBUG && (
						<TableRowGroup title="Developer" hasIcons>
							<TableRow
								label="Debug"
								subLabel="Hook status, colours in use and tap counts"
								icon={rowIcon('BugIcon', 'ic_debug')}
								arrow
								onPress={() => navigation.navigate(DEBUG_ROUTE)}
							/>
						</TableRowGroup>
					)}

					<Credit />
				</Stack>
			</ScrollView>
		</Page>
	)
}
