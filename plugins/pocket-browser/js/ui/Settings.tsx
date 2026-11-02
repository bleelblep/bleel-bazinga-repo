import { Design } from '@valenced/discord/design'
import { ReactNavigationNative } from '@valenced/externals/react-navigation'
import { useChangelog } from '../../../../shared/changelog'
import { Credit } from '../../../../shared/ui/credit'
import { rowIcon } from '../../../../shared/ui/icon'
import { MENU_ITEMS, SEARCH_ENGINES, useSettings } from '../lib/store'
import {
	HISTORY_ROUTE,
	LINKS_ROUTE,
	MENU_ROUTE,
	PAGES_ROUTE,
	PICKER_ROUTE,
	POPOUT_ROUTE,
} from './routes'
import { SettingsPage, set } from './settingsShared'

/**
 * The index page (settings design guide §2.2): the Web tab switch, then a row for each settings
 * page, each saying what's set there. Picker, Links and Menu only apply to the Web tab, so they
 * show while it's on; Pages, Pop-out player and History and data always do.
 */
export default function Settings() {
	// The changelog icon at the top right, and "What's new" once after an update.
	useChangelog()
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { TableRowGroup, TableRow, TableSwitchRow } = Design as any
	const navigation = ReactNavigationNative.useNavigation() as {
		navigate(route: string): void
	}
	const s = useSettings()
	const shownItems = MENU_ITEMS.length - (s.hiddenMenu ?? []).filter(id => MENU_ITEMS.some(item => item.id === id)).length
	const pages = s.history?.length ?? 0

	const go = (label: string, subLabel: string, icon: any, route: string) => (
		<TableRow label={label} subLabel={subLabel} icon={icon} arrow onPress={() => navigation.navigate(route)} />
	)

	return (
		<SettingsPage>
			<TableRowGroup hasIcons>
				<TableSwitchRow
					label="Web tab"
					subLabel="A browser in the emoji, GIF and sticker picker, next to Stickers."
					icon={rowIcon('GlobeEarthIcon', 'CompassIcon')}
					value={s.showTab}
					onValueChange={(showTab: boolean) => set({ showTab })}
				/>
			</TableRowGroup>

			{s.showTab ? (
				<TableRowGroup title="Web tab" hasIcons>
					{go('Tabs and picker', 'Tab row, swiping, speed dial, keyboard and playback', rowIcon('WindowLaunchIcon', 'ScreenIcon'), PICKER_ROUTE)}
					{go('Links', s.openLinks ? 'Links in chat open here' : 'Links in chat open as usual', rowIcon('LinkIcon'), LINKS_ROUTE)}
					{go('Menu', `${shownItems} of ${MENU_ITEMS.length} items in the ⋮ menu`, rowIcon('ListBulletsIcon', 'ListIcon'), MENU_ROUTE)}
				</TableRowGroup>
			) : null}

			<TableRowGroup title="Browsing" hasIcons>
				{go(
					'Pages',
					`${SEARCH_ENGINES[s.search]?.name ?? 'DuckDuckGo'}${s.darkPages ? ', dark pages' : ''}${s.javascript ? '' : ', no JavaScript'}`,
					rowIcon('GlobeEarthIcon', 'ScreenIcon'),
					PAGES_ROUTE,
				)}
				{go(
					'Pop-out player',
					s.popoutMode === 'overlay' ? 'Floating window' : 'Picture-in-picture',
					rowIcon('PlayIcon', 'VideoIcon'),
					POPOUT_ROUTE,
				)}
				{go(
					'History and data',
					s.saveHistory ? `${pages} page${pages === 1 ? '' : 's'} in history` : 'History off',
					rowIcon('HistoryIcon', 'ClockIcon'),
					HISTORY_ROUTE,
				)}
			</TableRowGroup>

			<Credit />
		</SettingsPage>
	)
}
