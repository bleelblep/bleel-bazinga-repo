import { useChangelog } from '../../../../shared/changelog'
import { confirmDestructive } from '../../../../shared/ui/confirm'
import { dangerIcon, rowIcon } from '../../../../shared/ui/icon'
import { useBottomPadding } from '../../../../shared/ui/safeArea'
import { clearData, pushSettings } from '../lib/native'
import { syncTabOrder } from '../lib/picker'
import { MENU_ITEMS, type PocketBrowserStorage, SEARCH_ENGINES, type SearchEngine, TEXT_ZOOMS, toUrl, update, useSettings } from '../lib/store'
import * as components from '@valenced/components'
import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import * as ReactNative from 'react-native'
import { reportError } from '../../../../shared/report'
import PopoutSettings from './PopoutSettings'

/** Saves, and hands native the page settings when one of those changed. */
function set(patch: Partial<PocketBrowserStorage>) {
	update(patch)
	if ('showTab' in patch) syncTabOrder()
	if (['javascript', 'desktop', 'restore', 'home', 'thirdPartyCookies', 'keepPlaying', 'pageNewTabs', 'darkPages', 'textZoom'].some(key => key in patch)) pushSettings()
}

function pickSearch(current: SearchEngine) {
	const { AlertModal, AlertActionButton } = Design as any
	const alerts = AlertActionCreators
	const key = 'PocketBrowserSearch'
	alerts.openAlert(
		key,
		<AlertModal
			title="Search with"
			actions={
				<>
					{(Object.keys(SEARCH_ENGINES) as SearchEngine[]).map(engine => (
						<AlertActionButton
							key={engine}
							text={SEARCH_ENGINES[engine].name}
							variant={engine === current ? 'primary' : 'secondary'}
							onPress={() => {
								alerts.dismissAlert(key)
								set({ search: engine })
							}}
						/>
					))}
					<AlertActionButton text="Cancel" variant="secondary" onPress={() => alerts.dismissAlert(key)} />
				</>
			}
		/>,
	)
}

function pickTextZoom(current: number) {
	const { AlertModal, AlertActionButton } = Design as any
	const alerts = AlertActionCreators
	const key = 'PocketBrowserTextZoom'
	alerts.openAlert(
		key,
		<AlertModal
			title="Text size"
			content="How big text is on pages. Layouts that don't fit it may look off."
			actions={
				<>
					{TEXT_ZOOMS.map(zoom => (
						<AlertActionButton
							key={zoom}
							text={zoom === 100 ? '100% (normal)' : `${zoom}%`}
							variant={zoom === current ? 'primary' : 'secondary'}
							onPress={() => {
								alerts.dismissAlert(key)
								set({ textZoom: zoom })
							}}
						/>
					))}
					<AlertActionButton text="Cancel" variant="secondary" onPress={() => alerts.dismissAlert(key)} />
				</>
			}
		/>,
	)
}

function editHome(current: string) {
	const { AlertModal, AlertActionButton, TextInput } = Design as any
	const alerts = AlertActionCreators
	const key = 'PocketBrowserHome'
	let value = current
	const save = () => {
		alerts.dismissAlert(key)
		const url = toUrl(value)
		if (url && /^https?:/i.test(url)) set({ home: url })
	}
	alerts.openAlert(
		key,
		<AlertModal
			title="Home page"
			content="Where new tabs and the Home page button go."
			extraContent={
				<TextInput
					defaultValue={current}
					autoFocus
					autoCapitalize="none"
					autoCorrect={false}
					keyboardType="url"
					onChange={(text: string) => (value = text)}
					onSubmitEditing={save}
				/>
			}
			actions={
				<>
					<AlertActionButton text="Save" variant="primary" onPress={save} />
					<AlertActionButton text="Cancel" variant="secondary" onPress={() => alerts.dismissAlert(key)} />
				</>
			}
		/>,
	)
}

export default function Settings() {
	// The changelog icon at the top right, and "What's new" once after an update.
	useChangelog()
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, TableRowGroup, TableRow, TableSwitchRow } = Design as any
	const s = useSettings()

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Picker" hasIcons>
						<TableSwitchRow
							label="Web tab"
							subLabel="A browser in the emoji, GIF and sticker picker, next to Stickers."
							icon={rowIcon('GlobeEarthIcon', 'CompassIcon')}
							value={s.showTab}
							onValueChange={(showTab: boolean) => set({ showTab })}
						/>
						<TableSwitchRow
							label="Tab row"
							subLabel="Your open tabs above the address bar. Off shows a tab counter instead."
							icon={rowIcon('WindowLaunchIcon', 'ScreenIcon')}
							disabled={!s.showTab}
							value={s.tabRow}
							onValueChange={(tabRow: boolean) => set({ tabRow })}
						/>
						<TableSwitchRow
							label="Expand when the keyboard opens"
							subLabel="A page's text field makes the picker fill the screen, so the page stays above the keyboard."
							icon={rowIcon('ExpandIcon', 'CompassIcon')}
							disabled={!s.showTab}
							value={s.autoExpand}
							onValueChange={(autoExpand: boolean) => set({ autoExpand })}
						/>
						<TableSwitchRow
							label="Keep playing when closed"
							subLabel="Music and videos keep going after you close the picker or leave Discord. Off pauses them."
							icon={rowIcon('MusicIcon', 'VideoIcon')}
							disabled={!s.showTab}
							value={s.keepPlaying}
							onValueChange={(keepPlaying: boolean) => set({ keepPlaying })}
						/>
						<TableSwitchRow
							label="Swipe to switch tabs"
							subLabel="Swipe the toolbar left or right for the next or previous tab."
							icon={rowIcon('ArrowsLeftRightIcon', 'ArrowLargeRightIcon')}
							disabled={!s.showTab}
							value={s.gestures}
							onValueChange={(gestures: boolean) => set({ gestures })}
						/>
						<TableSwitchRow
							label="Speed dial"
							subLabel="Bookmarks on the start page as site tiles. Off shows them as a list."
							icon={rowIcon('GridSquareIcon', 'StarIcon')}
							disabled={!s.showTab}
							value={s.speedDial}
							onValueChange={(speedDial: boolean) => set({ speedDial })}
						/>
					</TableRowGroup>

					<PopoutSettings />

					<TableRowGroup title="Menu" description="Choose what the ⋮ menu shows. Some items only appear on a web page.">
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

					<TableRowGroup title="Links" hasIcons>
						<TableSwitchRow
							label="Open links here"
							subLabel="Web links you tap in a chat open in the Web tab. Discord's own links, like invites, still open in Discord."
							icon={rowIcon('LinkIcon')}
							disabled={!s.showTab}
							value={s.openLinks}
							onValueChange={(openLinks: boolean) => set({ openLinks })}
						/>
						<TableSwitchRow
							label="New tab for each link"
							subLabel="Off loads a tapped link in the tab you're on."
							icon={rowIcon('PlusSmallIcon', 'PlusLargeIcon')}
							disabled={!s.showTab || !s.openLinks}
							value={s.linksInNewTab}
							onValueChange={(linksInNewTab: boolean) => set({ linksInNewTab })}
						/>
						<TableSwitchRow
							label="Pages can open new tabs"
							subLabel="Links a site opens in a new window get their own tab. Off keeps them in the tab you're on, so no tab pile-up."
							icon={rowIcon('WindowLaunchIcon', 'PlusSmallIcon')}
							disabled={!s.showTab}
							value={s.pageNewTabs}
							onValueChange={(pageNewTabs: boolean) => set({ pageNewTabs })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Pages" hasIcons>
						<TableRow
							label="Search with"
							subLabel={SEARCH_ENGINES[s.search]?.name ?? 'DuckDuckGo'}
							icon={rowIcon('SearchIcon')}
							arrow
							onPress={() => pickSearch(s.search)}
						/>
						<TableRow label="Home page" subLabel={s.home} icon={rowIcon('HomeIcon')} arrow onPress={() => editHome(s.home)} />
						<TableSwitchRow
							label="JavaScript"
							subLabel="Most sites need it. Off makes pages lighter and plainer."
							icon={rowIcon('ScreenIcon')}
							value={s.javascript}
							onValueChange={(javascript: boolean) => set({ javascript })}
						/>
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
						<TableSwitchRow
							label="Third-party cookies"
							subLabel="Some sign-ins and embedded videos need them; off stops cross-site tracking cookies."
							icon={rowIcon('LockIcon')}
							value={s.thirdPartyCookies}
							onValueChange={(thirdPartyCookies: boolean) => set({ thirdPartyCookies })}
						/>
					</TableRowGroup>

					<TableRowGroup title="History and tabs" hasIcons>
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
						<TableRow
							variant="danger"
							label="Clear history"
							subLabel={`${s.history?.length ?? 0} page${s.history?.length === 1 ? '' : 's'}`}
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
				</Stack>
			</ScrollView>
		</Page>
	)
}
