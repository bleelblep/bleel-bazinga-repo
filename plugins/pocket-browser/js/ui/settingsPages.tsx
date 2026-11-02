/**
 * The settings sub-pages, opened from the index (Settings.tsx). One job each (settings design
 * guide §7): the picker tab, links, how pages load, the ⋮ menu, the pop-out player, and history
 * and site data.
 */

import { Design } from '@valenced/discord/design'
import { reportError } from '../../../../shared/report'
import { confirmDestructive } from '../../../../shared/ui/confirm'
import { dangerIcon, rowIcon } from '../../../../shared/ui/icon'
import { clearData } from '../lib/native'
import { MENU_ITEMS, SEARCH_ENGINES, customHome, useSettings } from '../lib/store'
import PopoutSettings from './PopoutSettings'
import { SettingsPage, editHome, pickSearch, pickTextZoom, set } from './settingsShared'

export function PickerPage() {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { TableRowGroup, TableSwitchRow } = Design as any
	const s = useSettings()
	return (
		<SettingsPage>
			<TableRowGroup hasIcons>
				<TableSwitchRow
					label="Tab row"
					subLabel="Your open tabs above the address bar. Off shows a tab counter instead."
					icon={rowIcon('WindowLaunchIcon', 'ScreenIcon')}
					value={s.tabRow}
					onValueChange={(tabRow: boolean) => set({ tabRow })}
				/>
				<TableSwitchRow
					label="Swipe to switch tabs"
					subLabel="Swipe the toolbar left or right for the next or previous tab."
					icon={rowIcon('ArrowsLeftRightIcon', 'ArrowLargeRightIcon')}
					value={s.gestures}
					onValueChange={(gestures: boolean) => set({ gestures })}
				/>
				<TableSwitchRow
					label="Speed dial"
					subLabel="Bookmarks on the start page as site tiles. Off shows them as a list."
					icon={rowIcon('GridSquareIcon', 'StarIcon')}
					value={s.speedDial}
					onValueChange={(speedDial: boolean) => set({ speedDial })}
				/>
			</TableRowGroup>
			<TableRowGroup hasIcons>
				<TableSwitchRow
					label="Expand when the keyboard opens"
					subLabel="A page's text field makes the picker fill the screen, so the page stays above the keyboard."
					icon={rowIcon('ExpandIcon', 'CompassIcon')}
					value={s.autoExpand}
					onValueChange={(autoExpand: boolean) => set({ autoExpand })}
				/>
				<TableSwitchRow
					label="Keep playing when closed"
					subLabel="Music and videos keep going after you close the picker or leave Discord. Off pauses them."
					icon={rowIcon('MusicIcon', 'VideoIcon')}
					value={s.keepPlaying}
					onValueChange={(keepPlaying: boolean) => set({ keepPlaying })}
				/>
			</TableRowGroup>
		</SettingsPage>
	)
}

export function LinksPage() {
	const { TableRowGroup, TableSwitchRow } = Design as any
	const s = useSettings()
	return (
		<SettingsPage>
			<TableRowGroup title="Links in chat" hasIcons>
				<TableSwitchRow
					label="Open links here"
					subLabel="Web links you tap in a chat open in the Web tab. Discord's own links, like invites, still open in Discord."
					icon={rowIcon('LinkIcon')}
					value={s.openLinks}
					onValueChange={(openLinks: boolean) => set({ openLinks })}
				/>
				{/* Only matters while links open here (guide: options that need a switch show with it). */}
				{s.openLinks ? (
					<TableSwitchRow
						label="New tab for each link"
						subLabel="Off loads a tapped link in the tab you're on."
						icon={rowIcon('PlusSmallIcon', 'PlusLargeIcon')}
						value={s.linksInNewTab}
						onValueChange={(linksInNewTab: boolean) => set({ linksInNewTab })}
					/>
				) : null}
			</TableRowGroup>
			<TableRowGroup title="Links on a page" hasIcons>
				<TableSwitchRow
					label="Pages can open new tabs"
					subLabel="Links a site opens in a new window get their own tab. Off keeps them in the tab you're on, so no tab pile-up."
					icon={rowIcon('WindowLaunchIcon', 'PlusSmallIcon')}
					value={s.pageNewTabs}
					onValueChange={(pageNewTabs: boolean) => set({ pageNewTabs })}
				/>
			</TableRowGroup>
		</SettingsPage>
	)
}

export function PagesPage() {
	const { TableRowGroup, TableRow, TableSwitchRow } = Design as any
	const s = useSettings()
	return (
		<SettingsPage>
			<TableRowGroup title="Start" hasIcons>
				<TableRow
					label="Search with"
					subLabel={SEARCH_ENGINES[s.search]?.name ?? 'DuckDuckGo'}
					icon={rowIcon('SearchIcon')}
					arrow
					onPress={() => pickSearch(s.search)}
				/>
				<TableRow
					label="Home page"
					subLabel={customHome(s) || `${SEARCH_ENGINES[s.search]?.name ?? 'DuckDuckGo'}, your search engine`}
					icon={rowIcon('HomeIcon')}
					arrow
					onPress={() => editHome(customHome(s))}
				/>
			</TableRowGroup>
			<TableRowGroup title="Look" hasIcons>
				<TableSwitchRow
					label="Dark pages"
					subLabel="Light sites are drawn dark. Sites that are already dark, or have their own dark mode, stay as they are."
					icon={rowIcon('MoonIcon', 'DarkModeIcon', 'ScreenIcon')}
					value={s.darkPages}
					onValueChange={(darkPages: boolean) => set({ darkPages })}
				/>
				<TableRow
					label="Text size"
					subLabel={s.textZoom === 100 ? 'Normal' : `${s.textZoom}%`}
					icon={rowIcon('TextIcon', 'ic_text', 'ScreenIcon')}
					arrow
					onPress={() => pickTextZoom(s.textZoom)}
				/>
				<TableSwitchRow
					label="Desktop sites"
					subLabel="Asks sites for the version they show on a computer."
					icon={rowIcon('ScreenIcon', 'WindowLaunchIcon')}
					value={s.desktop}
					onValueChange={(desktop: boolean) => set({ desktop })}
				/>
			</TableRowGroup>
			<TableRowGroup title="Privacy and speed" hasIcons>
				<TableSwitchRow
					label="JavaScript"
					subLabel="Most sites need it. Off makes pages lighter and plainer."
					icon={rowIcon('CodeIcon', 'ScreenIcon')}
					value={s.javascript}
					onValueChange={(javascript: boolean) => set({ javascript })}
				/>
				<TableSwitchRow
					label="Third-party cookies"
					subLabel="Some sign-ins and embedded videos need them. Off stops cross-site tracking cookies."
					icon={rowIcon('LockIcon')}
					value={s.thirdPartyCookies}
					onValueChange={(thirdPartyCookies: boolean) => set({ thirdPartyCookies })}
				/>
			</TableRowGroup>
		</SettingsPage>
	)
}

export function MenuPage() {
	const { TableRowGroup, TableSwitchRow } = Design as any
	const s = useSettings()
	return (
		<SettingsPage>
			<TableRowGroup description="Some items only appear on a web page.">
				{MENU_ITEMS.map(item => (
					<TableSwitchRow
						key={item.id}
						label={item.label}
						value={!(s.hiddenMenu ?? []).includes(item.id)}
						onValueChange={(on: boolean) => {
							const hidden = (s.hiddenMenu ?? []).filter(id => id !== item.id)
							set({ hiddenMenu: on ? hidden : [...hidden, item.id] })
						}}
					/>
				))}
			</TableRowGroup>
		</SettingsPage>
	)
}

export function PopoutPage() {
	return (
		<SettingsPage>
			<PopoutSettings />
		</SettingsPage>
	)
}

export function HistoryPage() {
	const { TableRowGroup, TableRow, TableSwitchRow } = Design as any
	const s = useSettings()
	const pages = s.history?.length ?? 0
	return (
		<SettingsPage>
			<TableRowGroup hasIcons>
				<TableSwitchRow
					label="Save history"
					subLabel="Keeps a list of pages you visit. Hold Back in the browser to see it."
					icon={rowIcon('ClockIcon')}
					value={s.saveHistory}
					onValueChange={(saveHistory: boolean) => set({ saveHistory })}
				/>
				<TableSwitchRow
					label="Keep tabs after closing Discord"
					subLabel="Your tabs, and where you were in each, come back next time. Closing the picker always keeps them."
					icon={rowIcon('RefreshIcon')}
					value={s.restore}
					onValueChange={(restore: boolean) => set({ restore })}
				/>
			</TableRowGroup>
			<TableRowGroup hasIcons>
				<TableRow
					variant="danger"
					label="Clear history"
					subLabel={`${pages} page${pages === 1 ? '' : 's'}`}
					icon={dangerIcon('TrashIcon')}
					onPress={() =>
						confirmDestructive({
							title: 'Clear history?',
							body: 'Every page in History is removed. Open tabs stay open.',
							action: 'Clear',
							onConfirm: () => set({ history: [] }),
						})
					}
				/>
				<TableRow
					variant="danger"
					label="Clear cookies and site data"
					subLabel="Signs you out of sites in the browser. Discord's own sign-in isn't touched."
					icon={dangerIcon('TrashIcon')}
					onPress={() =>
						confirmDestructive({
							title: 'Clear cookies and site data?',
							body: "Sites in Pocket Browser forget you, and their saved data and cache are removed. Discord's own sites are kept, so Vencord Tab and activities stay signed in.",
							action: 'Clear',
							onConfirm: () => {
								clearData().catch(error => reportError('[Pocket Browser] clear data failed:', error))
							},
						})
					}
				/>
			</TableRowGroup>
		</SettingsPage>
	)
}
