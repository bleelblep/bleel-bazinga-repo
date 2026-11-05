import { Credit } from '../../../../shared/ui/credit'
import { useChangelog } from '../../../../shared/changelog'
import { rowIcon } from '../../../../shared/ui/icon'
import { useBottomPadding } from '../../../../shared/ui/safeArea'
import { update, useSettings } from '../lib/state'
import { GESTURES_ROUTE, PLUS_MENU_ROUTE, SETTINGS_ROUTE, SHEET_ROUTE } from './routes'
import { SWIPE_ACTIONS } from '../lib/actions'
import { MEDIA_BUTTONS } from '../patches/mediaButtons'
import type { SwipeAction, UITweaksStorage } from '../defaults'

/** "Double-tap: Edit / Reply · Swipe: Copy text", naming only the gestures that were changed. */
function gesturesLabel(s: UITweaksStorage): string {
	const name = (action: SwipeAction) => SWIPE_ACTIONS.find(a => a.value === action)?.label ?? action
	const pair = (a: SwipeAction, b: SwipeAction) => (a === b ? name(a) : `${name(a)} / ${name(b)}`)
	const changed = (...actions: SwipeAction[]) => actions.some(a => a !== 'stock')
	const parts: string[] = []
	if (changed(s.doubleTapOwn, s.doubleTapOthers)) parts.push(`Double-tap: ${pair(s.doubleTapOwn, s.doubleTapOthers)}`)
	if (changed(s.swipeShortOwn, s.swipeShortOthers)) parts.push(`Swipe: ${pair(s.swipeShortOwn, s.swipeShortOthers)}`)
	if (changed(s.swipeLongOwn, s.swipeLongOthers)) parts.push(`Further: ${pair(s.swipeLongOwn, s.swipeLongOthers)}`)
	return parts.length ? parts.join(' · ') : "Discord's: double-tap reacts, swipe replies or edits."
}
import { ReactNavigationNative } from '@valenced/externals/react-navigation'
import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as ReactNative from 'react-native'

function countHidden(...maps: Array<Record<string, true | null> | undefined>): number {
	return maps.reduce((sum, map) => sum + Object.values(map ?? {}).filter(value => value === true).length, 0)
}

function hiddenLabel(count: number): string {
	return count === 0 ? 'Nothing hidden' : count === 1 ? '1 thing hidden' : `${count} things hidden`
}

export default function Settings() {
	// The changelog icon at the top right, and "What's new" once after an update.
	useChangelog()
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, TableRowGroup, TableRow, TableSwitchRow } = Design as any
	const { useNavigation } = ReactNavigationNative
	const navigation = useNavigation() as { navigate: (route: string) => void }
	const s = useSettings()

	const sheetHidden = countHidden(s.hiddenSheetRows, s.hiddenSheetGroups) + (s.hideSheetEmojiRow ? 1 : 0)
	const settingsHidden = countHidden(s.hiddenSettingsItems, s.hiddenSettingsSections)

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Hide things" hasIcons>
						<TableRow
							label="Long-press menu"
							subLabel={hiddenLabel(sheetHidden)}
							icon={rowIcon('ChatIcon', 'CompassIcon')}
							arrow
							onPress={() => navigation.navigate(SHEET_ROUTE)}
						/>
						<TableRow
							label="Discord settings"
							subLabel={hiddenLabel(settingsHidden)}
							icon={rowIcon('SettingsIcon', 'CompassIcon')}
							arrow
							onPress={() => navigation.navigate(SETTINGS_ROUTE)}
						/>
					</TableRowGroup>

					<TableRowGroup title="Emoji picker" hasIcons>
						<TableSwitchRow
							label="Hide the GIFs tab"
							icon={rowIcon('GifIcon', 'ImageIcon')}
							value={s.hidePickerGifs}
							onValueChange={(hidePickerGifs: boolean) => update({ hidePickerGifs })}
						/>
						<TableSwitchRow
							label="Hide the Stickers tab"
							icon={rowIcon('StickerIcon', 'StickerSmallIcon')}
							value={s.hidePickerStickers}
							onValueChange={(hidePickerStickers: boolean) => update({ hidePickerStickers })}
						/>
						<TableSwitchRow
							label="Keep open after sending a GIF"
							subLabel="Send several GIFs in a row without reopening the picker."
							icon={rowIcon('GifIcon', 'ImageIcon')}
							value={s.keepGifPickerOpen}
							onValueChange={(keepGifPickerOpen: boolean) => update({ keepGifPickerOpen })}
						/>
					</TableRowGroup>

					<TableRowGroup title="The + menu by the message box" hasIcons>
						{MEDIA_BUTTONS.map(button => (
							<TableSwitchRow
								key={button.id}
								label={`Hide ${button.label}`}
								icon={rowIcon(button.icon, 'CompassIcon')}
								value={s.hiddenMediaButtons?.[button.id] === true}
								onValueChange={(hide: boolean) => update({ hiddenMediaButtons: { [button.id]: hide } })}
							/>
						))}
						<TableRow
							label="Long-press +"
							subLabel={hiddenLabel(countHidden(s.hiddenPlusMenuItems))}
							icon={rowIcon('CirclePlusIcon', 'PlusSmallIcon', 'CompassIcon')}
							arrow
							onPress={() => navigation.navigate(PLUS_MENU_ROUTE)}
						/>
					</TableRowGroup>

					<TableRowGroup title="Messages" hasIcons>
						<TableSwitchRow
							label="Hide the reaction bar"
							subLabel="Tapping a message no longer offers the quick emoji row."
							icon={rowIcon('ReactionIcon', 'CompassIcon')}
							value={s.hideReactionBar}
							onValueChange={(hideReactionBar: boolean) => update({ hideReactionBar })}
						/>
						<TableRow
							label="Gestures"
							subLabel={gesturesLabel(s)}
							icon={rowIcon('ArrowsLeftRightIcon', 'ReplyIcon')}
							arrow
							onPress={() => navigation.navigate(GESTURES_ROUTE)}
						/>
					</TableRowGroup>

					<TableRowGroup title="DM list" hasIcons>
						<TableSwitchRow
							label="Hide Message Requests"
							subLabel="No Message Requests entry in the DM list."
							icon={rowIcon('InboxIcon', 'CompassIcon')}
							value={s.hideMessageRequests}
							onValueChange={(hideMessageRequests: boolean) => update({ hideMessageRequests })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Quests" hasIcons>
						<TableSwitchRow
							label="Hide Quests"
							subLabel="No quest bar, Quests button, quest embeds or Quests settings row. Quests you started keep going."
							icon={rowIcon('QuestsIcon', 'CompassIcon')}
							value={s.hideQuests}
							onValueChange={(hideQuests: boolean) => update({ hideQuests })}
						/>
					</TableRowGroup>
					<Credit />
				</Stack>
			</ScrollView>
		</Page>
	)
}
