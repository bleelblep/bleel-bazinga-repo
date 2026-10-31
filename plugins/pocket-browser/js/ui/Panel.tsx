/**
 * The Web tab: tab row, toolbar, and the page underneath -- or the start page.
 *
 * The page isn't drawn by React. `PageHost` is an empty view with a unique `nativeID`; native
 * finds it and puts the live WebView inside (PocketBrowser.kt `attach`). It must stay childless on
 * the React side, see the note in the Kotlin file.
 *
 * A tab with no address is on the start page, which is drawn here instead (bookmarks, recent
 * pages, the address box). The WebView is taken out while it shows, and put back as soon as the
 * tab gets an address.
 *
 * Typing an address uses Discord's alert dialog: a text field inside the picker would bring up
 * the keyboard in the space the picker is using (Sekai Stickers does the same).
 */

import { confirmDestructive } from '../../../../shared/ui/confirm'
import { rowIcon } from '../../../../shared/ui/icon'
import { showToast } from '../../../../shared/toast'
import { addToMessage } from '../lib/chatInput'
import * as browser from '../lib/native'
import type { HoldTarget } from '../lib/native'
import { type HistoryRow, historyRows, shortHost, timeOf } from '../lib/format'
import {
	type Bookmark,
	type HistoryEntry,
	addBookmark,
	isBookmarked,
	removeBookmark,
	settings,
	renameBookmark,
	toUrl,
	update,
	useSettings,
} from '../lib/store'
import { SheetFlatList, SheetScrollView } from './sheet'
import { openPopout } from '../popout/viewerButton'
import type { PopoutRequest } from '../popout/player'
import { youtubeOf } from '../popout/source'
import { attach } from '../lib/upload'
import { AlertActionCreators } from '@valenced/discord/actions'
import * as assets from '@valenced/assets'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { Design } from '@valenced/discord/design'
import * as react from '@valenced/react'
import * as ReactNative from 'react-native'
import * as clipboardModule from '@valenced/externals/react-native-clipboard'
import { reportError } from '../../../../shared/report'
import { token } from './theme'

const TAG = '[Pocket Browser]'

export { shortHost }
let hosts = 0
/** The chat the picker was opened from, for the hold menu's "Share image to chat". */
let currentChannelId: string | undefined

const press = (pressed: boolean) => (pressed ? 'rgba(128,128,128,0.22)' : 'transparent')

function toast(text: string) {
	showToast(text, 'PocketBrowserToast')
}

function copyText(text: string): boolean {
	try {
		const bundled = (clipboardModule as any)?.Clipboard
		const clipboard = bundled ?? (ReactNative as any)?.Clipboard
		if (typeof clipboard?.setString !== 'function') return false
		clipboard.setString(text)
		return true
	} catch {
		return false
	}
}

const copyLink = (url: string) => toast(copyText(url) ? 'Link copied' : "Couldn't copy the link")
const linkToMessage = (url: string) => {
	if (!addToMessage(url)) toast("Couldn't reach the message box")
}


const tabLabel = (tab: browser.TabState) =>
	!tab.url ? (tab.private ? 'Private tab' : 'Start page') : tab.loading && !tab.title ? 'Loading…' : tab.title || shortHost(tab.url)

function IconButton({
	icon,
	label,
	onPress,
	onLongPress,
	disabled,
	...trigger
}: {
	icon: string[]
	label: string
	onPress?: () => void
	onLongPress?: () => void
	disabled?: boolean
	/** What Discord's ContextMenu hands its trigger (its own onPress, the anchor ref). */
	[prop: string]: any
}) {
	const { Pressable } = ReactNative
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			disabled={disabled}
			onPress={onPress}
			onLongPress={onLongPress}
			{...trigger}
			hitSlop={4}
			style={({ pressed }: { pressed: boolean }) => ({
				width: 36,
				height: 36,
				borderRadius: 18,
				alignItems: 'center',
				justifyContent: 'center',
				opacity: disabled ? 0.35 : 1,
				backgroundColor: press(pressed),
			})}
		>
			{rowIcon(...icon)}
		</Pressable>
	)
}

// ---- Dialogs ---------------------------------------------------------------------------------

/** A menu in Discord's alert dialog: one button per action, then Cancel. */
function menu(
	key: string,
	title: string,
	content: string | undefined,
	items: Array<false | { text: string; danger?: boolean; run: () => void }>,
	extraContent?: any,
) {
	const { AlertModal, AlertActionButton } = Design as any
	const alerts = AlertActionCreators
	alerts.openAlert(
		key,
		<AlertModal
			title={title}
			content={content}
			extraContent={extraContent}
			actions={
				<>
					{items.filter(Boolean).map((item: any) => (
						<AlertActionButton
							key={item.text}
							text={item.text}
							variant={item.danger ? 'destructive' : 'secondary'}
							onPress={() => {
								alerts.dismissAlert(key)
								item.run()
							}}
						/>
					))}
					<AlertActionButton text="Cancel" variant="secondary" onPress={() => alerts.dismissAlert(key)} />
				</>
			}
		/>,
	)
}

function promptText(options: { key: string; title: string; content: string; value: string; placeholder?: string; url?: boolean; action: string; onSubmit: (text: string) => void }) {
	const { AlertModal, AlertActionButton, TextInput } = Design as any
	const alerts = AlertActionCreators
	let value = options.value
	const submit = () => {
		alerts.dismissAlert(options.key)
		options.onSubmit(value)
	}
	alerts.openAlert(
		options.key,
		<AlertModal
			title={options.title}
			content={options.content}
			extraContent={
				<TextInput
					defaultValue={options.value}
					placeholder={options.placeholder}
					autoFocus
					selectTextOnFocus
					autoCapitalize={options.url ? 'none' : 'sentences'}
					autoCorrect={!options.url}
					keyboardType={options.url ? 'url' : 'default'}
					returnKeyType={options.url ? 'go' : 'done'}
					onChange={(text: string) => (value = text)}
					onSubmitEditing={submit}
				/>
			}
			actions={
				<>
					<AlertActionButton text={options.action} variant="primary" onPress={submit} />
					<AlertActionButton text="Cancel" variant="secondary" onPress={() => alerts.dismissAlert(options.key)} />
				</>
			}
		/>,
	)
}

function promptAddress(current: string, search: Parameters<typeof toUrl>[1], target: 'here' | 'new' | 'private' = 'here') {
	promptText({
		key: 'PocketBrowserAddress',
		title: target === 'here' ? 'Go to' : target === 'private' ? 'New private tab' : 'New tab',
		content: 'An address, or words to search for.',
		value: current,
		placeholder: 'Search or type an address',
		url: true,
		action: 'Go',
		onSubmit: text => {
			const url = toUrl(text, search)
			if (!url) return
			if (target === 'here') browser.load(url)
			else browser.newTab(url, target === 'private')
		},
	})
}

function toggleBookmark(url: string, title: string) {
	if (isBookmarked(url)) {
		removeBookmark(url)
		toast('Bookmark removed')
	} else {
		addBookmark(url, title)
		toast('Bookmarked')
	}
}

type MenuOptions = { tab?: browser.TabState; tabCount: number; channelId?: string; showHistory: () => void; showDownloads: () => void; openFind: () => void }
type MenuItem = { id: string; text: string; icon: string[]; danger?: boolean; run: () => void }

/**
 * The ⋮ menu's items, in sections. Items switched off in settings (Menu) are left out; ids match
 * MENU_ITEMS in lib/store.ts. `quick` is the first section: the four most used page actions, which
 * the dialog fallback draws as a row of icons.
 */
function menuSections(options: MenuOptions): { quick: MenuItem[]; rest: MenuItem[][] } {
	const { Linking } = ReactNative
	const { tab } = options
	const url = tab?.url ?? ''
	const web = /^https?:/i.test(url)
	const hidden = new Set(settings().hiddenMenu ?? [])
	const keep = (items: Array<false | MenuItem>) => items.filter((item): item is MenuItem => !!item && !hidden.has(item.id))
	const saved = web && isBookmarked(url)
	const quick = keep([
		web && {
			id: 'bookmark',
			text: saved ? 'Remove bookmark' : 'Bookmark',
			icon: saved ? ['StarIcon', 'ic_star'] : ['StarOutlineIcon', 'StarIcon'],
			run: () => toggleBookmark(url, tab?.title ?? ''),
		},
		web && { id: 'share', text: 'Share to chat', icon: ['ArrowAngleRightUpIcon', 'ShareIcon', 'ChatIcon'], run: () => shareToChat(tab!, options.channelId) },
		web && { id: 'find', text: 'Find in page', icon: ['MagnifyingGlassIcon', 'SearchIcon'], run: options.openFind },
		web && { id: 'copyLink', text: 'Copy link', icon: ['CopyIcon', 'LinkIcon'], run: () => copyLink(url) },
	])
	const rest = [
		keep([
			{ id: 'newTab', text: 'New tab', icon: ['PlusMediumIcon', 'PlusSmallIcon', 'PlusLargeIcon'], run: () => browser.newTab() },
			{ id: 'privateTab', text: 'New private tab', icon: ['EyeSlashIcon', 'LockIcon'], run: () => browser.newTab(undefined, true) },
			{ id: 'history', text: 'History', icon: ['ClockIcon', 'ic_history'], run: options.showHistory },
			{ id: 'downloads', text: 'Downloads', icon: ['DownloadIcon', 'ic_download_24px'], run: options.showDownloads },
			{ id: 'home', text: 'Home page', icon: ['HomeIcon', 'ic_home'], run: () => browser.act('home') },
		]),
		keep([
			web && { id: 'popout', text: 'Pop out video', icon: ['PictureInPictureIcon', 'VideoIcon'], run: () => void popOutPage(tab!) },
			web && { id: 'linkToMessage', text: 'Add link to message', icon: ['ChatPlusIcon', 'ChatIcon'], run: () => linkToMessage(url) },
			web && {
				id: 'openExternal',
				text: 'Open in your browser',
				icon: ['WindowLaunchIcon', 'GlobeEarthIcon'],
				run: () => {
					Linking.openURL(url).catch(() => toast("Couldn't open another browser"))
				},
			},
		]),
		keep([
			options.tabCount > 1 && { id: 'closeOthers', text: 'Close other tabs', icon: ['XSmallIcon', 'XLargeIcon'], run: browser.closeOthers },
			!!tab && { id: 'closeTab', text: 'Close tab', icon: ['XLargeIcon', 'TrashIcon'], danger: true, run: () => browser.closeTab(tab!.id) },
		]),
	].filter(section => section.length)
	return { quick, rest }
}

/** An icon for a ContextMenu item: Discord's generated component, else a registry asset. */
function menuIcon(names: string[]): { IconComponent?: any; iconSource?: number } {
	for (const name of names) {
		try {
			const Component = lookupGeneratedIconComponent(name)
			if (Component) return { IconComponent: Component }
		} catch {}
		try {
			const source = assets.getAssetIdByName(name)
			if (source) return { iconSource: source }
		} catch {}
	}
	return {}
}

/**
 * Width of the ⋮ menu's title. Discord's menu (design/components/ContextMenu, 351.3) has a minimum
 * width (220) but no maximum, and draws its title as plain unlimited text, so a long page title
 * used to stretch the whole menu. A one-line title of a fixed width keeps the menu the same width
 * on every page; item labels shrink to fit it.
 */
const MENU_TITLE_WIDTH = 232
/** The menu's title row: padding 12 each side plus a 1 px border, and Discord's 12 px screen edge. */
const MENU_CHROME = 12 * 2 + 2 + 12 * 2

function MenuTitle({ text }: { text: string }) {
	const { View, Dimensions } = ReactNative
	const { Text } = Design as any
	const width = Math.min(MENU_TITLE_WIDTH, Dimensions.get('window').width - MENU_CHROME)
	return (
		<View style={{ width }}>
			<Text variant="text-md/bold" color="mobile-text-heading-primary" numberOfLines={1} ellipsizeMode="tail">
				{text}
			</Text>
		</View>
	)
}

/**
 * Where the ⋮ button is on screen decides where the menu opens. Below the button, Discord limits
 * the menu's height to the window minus a bottom inset that counts the picker sheet as a keyboard
 * (ContextMenuPopout: `useSafeAreaInsetsKeyboardAware({ includeKeyboardHeight: true })`). With the
 * sheet half open the button sits inside that inset, so the menu got almost no height and was cut
 * off. Above the button the limit is the space up to the status bar, which is right.
 */
const OPEN_ABOVE_FROM = 0.4
/** How often the button checks where it is while the sheet may be moving. */
const ALIGN_CHECK_MS = 400

/**
 * The ⋮ button. Opens Discord's own context menu, anchored to the button. If this Discord has no
 * ContextMenu, it opens the older dialog menu instead.
 *
 * The side has to be chosen before the tap: on Android the menu opens from its own tap gesture
 * (its `onPress` only works with a screen reader on), using the `align` of the last render. So the
 * button checks its place every ALIGN_CHECK_MS and again the moment a finger lands on it.
 */
function MoreButton(options: MenuOptions) {
	const { React } = react
	const { View, Dimensions } = ReactNative
	const { ContextMenu } = Design as any
	const label = options.tab ? tabLabel(options.tab) : 'Pocket Browser'
	const [align, setAlign] = React.useState<'below' | 'above'>('below')
	const anchor = React.useRef<any>(null)
	const check = React.useCallback(() => {
		const node = anchor.current
		if (typeof node?.measureInWindow !== 'function') return
		node.measureInWindow((_x: number, y: number) => {
			if (typeof y !== 'number') return
			setAlign(y > Dimensions.get('window').height * OPEN_ABOVE_FROM ? 'above' : 'below')
		})
	}, [])
	React.useEffect(() => {
		check()
		const timer = setInterval(check, ALIGN_CHECK_MS)
		return () => clearInterval(timer)
	}, [check])
	if (!ContextMenu) return <IconButton icon={['MoreVerticalIcon', 'MoreHorizontalIcon']} label="More" onPress={() => openMenu(options)} />
	const { quick, rest } = menuSections(options)
	const items = [quick, ...rest]
		.filter(section => section.length)
		.map(section =>
			section.map(item => ({
				label: item.text,
				variant: item.danger ? 'destructive' : 'default',
				action: item.run,
				...menuIcon(item.icon),
			})),
		)
	return (
		<ContextMenu title={<MenuTitle text={label} />} items={items} align={align}>
			{(props: any) => (
				<View ref={anchor} collapsable={false} onLayout={check} onTouchStart={check}>
					<IconButton icon={['MoreVerticalIcon', 'MoreHorizontalIcon']} label="More" {...props} />
				</View>
			)}
		</ContextMenu>
	)
}

/** The dialog version of the ⋮ menu: quick actions as a row of icons above a list. */
function openMenu(options: MenuOptions) {
	const { tab } = options
	const { quick, rest } = menuSections(options)
	menu(
		'PocketBrowserMenu',
		tab ? tabLabel(tab) : 'Pocket Browser',
		tab?.url || undefined,
		rest.flat(),
		quick.length ? <QuickRow menuKey="PocketBrowserMenu" items={quick} /> : undefined,
	)
}

type QuickItem = MenuItem

/** Icon buttons with a label under each, for the top of the ⋮ menu. */
function QuickRow({ menuKey, items }: { menuKey: string; items: QuickItem[] }) {
	const { View, Pressable } = ReactNative
	const { Text } = Design as any
	return (
		<View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 4 }}>
			{items.map(item => (
				<Pressable
					key={item.id}
					accessibilityRole="button"
					accessibilityLabel={item.text}
					onPress={() => {
						AlertActionCreators.dismissAlert(menuKey)
						item.run()
					}}
					style={({ pressed }: { pressed: boolean }) => ({
						alignItems: 'center',
						minWidth: 64,
						paddingVertical: 8,
						paddingHorizontal: 4,
						borderRadius: 12,
						backgroundColor: press(pressed),
					})}
				>
					{rowIcon(...item.icon)}
					<Text variant="text-xs/medium" color="text-muted" style={{ marginTop: 4 }} numberOfLines={1}>
						{item.text}
					</Text>
				</Pressable>
			))}
		</View>
	)
}

// ---- Holding a link or image in the page -----------------------------------------------------

/** The menu for a link or image held in the page; native sends what was under the finger. */
export function openHoldMenu(target: HoldTarget) {
	const { Linking } = ReactNative
	const link = target.link && !/^javascript:/i.test(target.link) ? target.link : null
	const image = target.image
	const isWeb = (url: string | null): url is string => !!url && /^https?:/i.test(url)
	const title = target.text || (link ? shortHost(link) : 'Image')

	const shareImage = async () => {
		if (!image) return
		if (!currentChannelId) return toast('Open a chat first')
		const result = await browser.fetchImage(image).catch(() => ({ error: "Couldn't get the image." }))
		if ('error' in result) return toast(result.error)
		try {
			// Queued on the draft like a picked photo, the same way as a page screenshot.
			attach(result, currentChannelId)
			toast('Image added to your message')
		} catch (error: any) {
			toast(String(error?.message ?? "Couldn't add the image").slice(0, 160))
		}
	}

	menu('PocketBrowserHold', title, link ?? (image && !image.startsWith('data:') ? image : undefined), [
		isWeb(link) && { text: target.private ? 'Open in new private tab' : 'Open in new tab', run: () => browser.newTab(link, target.private) },
		isWeb(link) && !target.private && { text: 'Open in private tab', run: () => browser.newTab(link, true) },
		isWeb(link) && { text: 'Add link to message', run: () => linkToMessage(link) },
		!!link && { text: 'Copy link', run: () => copyLink(link) },
		!!image && { text: 'Share image to chat', run: () => void shareImage() },
		isWeb(image) && { text: 'Save image', run: () => browser.saveUrl(image) },
		isWeb(image) && { text: 'Open image in new tab', run: () => browser.newTab(image, target.private) },
		isWeb(image) && { text: 'Copy image link', run: () => copyLink(image) },
		isWeb(link) && {
			text: 'Open in your browser',
			run: () => {
				Linking.openURL(link).catch(() => toast("Couldn't open another browser"))
			},
		},
	])
}

/** The page's link, a screenshot of it, or both, into the message you're writing. */
function shareToChat(tab: browser.TabState, channelId: string | undefined) {
	const screenshot = async () => {
		if (!channelId) return toast('Open a chat first')
		try {
			const shot = await browser.screenshot()
			if ('error' in shot) return toast(shot.error)
			// Queued on the draft like a picked photo: it sends with the message, or can be removed.
			attach(shot, channelId)
			toast('Screenshot added to your message')
		} catch (error: any) {
			toast(String(error?.message ?? "Couldn't add the screenshot").slice(0, 160))
		}
	}
	menu('PocketBrowserShare', 'Share to chat', tab.title || shortHost(tab.url), [
		{ text: 'Link', run: () => linkToMessage(tab.url) },
		{
			text: 'Link and screenshot',
			run: () => {
				linkToMessage(tab.url)
				void screenshot()
			},
		},
		{ text: 'Screenshot only', run: () => void screenshot() },
	])
}

/**
 * The page's video in the pop-out player. YouTube goes by its video id (the player embeds it);
 * anything else needs a real file address: most sites stream through blob: URLs, which only exist
 * inside the page.
 */
async function popOutPage(tab: browser.TabState) {
	const info = await browser.mediaInfo()
	const href = info.href || tab.url
	const youtube = youtubeOf(href) ?? (info.src ? youtubeOf(info.src) : undefined)
	let request: PopoutRequest | undefined
	if (youtube) request = { kind: 'youtube', url: href, videoId: youtube.videoId, start: info.time || youtube.start }
	else if (info.src && /^https?:/i.test(info.src)) request = { kind: 'video', url: info.src, poster: info.poster || undefined }
	if (!request) {
		toast(info.src ? "This site's video can't be popped out." : 'No video on this page.')
		return
	}
	if (await openPopout(request)) browser.pauseMedia()
}

/** Holding a tab in the tab row. */
function openTabMenu(tab: browser.TabState, tabCount: number) {
	const web = /^https?:/i.test(tab.url)
	menu('PocketBrowserTabMenu', tabLabel(tab), tab.url || undefined, [
		web && { text: 'Duplicate tab', run: () => browser.newTab(tab.url, tab.private) },
		web && { text: 'Add link to message', run: () => linkToMessage(tab.url) },
		web && { text: 'Copy link', run: () => copyLink(tab.url) },
		web && { text: isBookmarked(tab.url) ? 'Remove bookmark' : 'Bookmark', run: () => toggleBookmark(tab.url, tab.title) },
		tabCount > 1 && {
			text: 'Close other tabs',
			run: () => {
				browser.selectTab(tab.id)
				browser.closeOthers()
			},
		},
		{ text: 'Close tab', danger: true, run: () => browser.closeTab(tab.id) },
	])
}

/** The tab list as a dialog, for when the tab row is switched off. */
function openTabList(state: browser.BrowserState) {
	const { AlertModal, AlertActionButton } = Design as any
	const alerts = AlertActionCreators
	const key = 'PocketBrowserTabs'
	const run = (fn: () => void) => () => {
		alerts.dismissAlert(key)
		fn()
	}
	alerts.openAlert(
		key,
		<AlertModal
			title={`${state.tabs.length} tab${state.tabs.length === 1 ? '' : 's'}`}
			actions={
				<>
					{state.tabs.map(tab => (
						<AlertActionButton
							key={tab.id}
							text={`${tab.id === state.active ? '● ' : ''}${tab.private && tab.url ? 'Private · ' : ''}${tabLabel(tab)}`}
							variant={tab.id === state.active ? 'primary' : 'secondary'}
							onPress={run(() => browser.selectTab(tab.id))}
						/>
					))}
					<AlertActionButton text="New tab" variant="secondary" onPress={run(() => browser.newTab())} />
					<AlertActionButton text="Cancel" variant="secondary" onPress={() => alerts.dismissAlert(key)} />
				</>
			}
		/>,
	)
}

/** Holding a History entry or a recent page. */
function openEntryMenu(entry: HistoryEntry, onOpen: (url: string) => void, remove?: () => void) {
	menu('PocketBrowserEntry', entry.title || shortHost(entry.url), entry.url, [
		{ text: 'Open', run: () => onOpen(entry.url) },
		{ text: 'Open in new tab', run: () => browser.newTab(entry.url) },
		{ text: isBookmarked(entry.url) ? 'Remove bookmark' : 'Bookmark', run: () => toggleBookmark(entry.url, entry.title) },
		{ text: 'Copy link', run: () => copyLink(entry.url) },
		!!remove && { text: 'Remove from History', danger: true, run: remove! },
	])
}

function openBookmarkMenu(bookmark: Bookmark) {
	menu('PocketBrowserBookmark', bookmark.title, bookmark.url, [
		{ text: 'Open in new tab', run: () => browser.newTab(bookmark.url) },
		{ text: 'Open in private tab', run: () => browser.newTab(bookmark.url, true) },
		{
			text: 'Rename',
			run: () =>
				promptText({
					key: 'PocketBrowserRename',
					title: 'Rename bookmark',
					content: bookmark.url,
					value: bookmark.title,
					action: 'Save',
					onSubmit: title => renameBookmark(bookmark.url, title),
				}),
		},
		{ text: 'Copy link', run: () => copyLink(bookmark.url) },
		{ text: 'Remove bookmark', danger: true, run: () => removeBookmark(bookmark.url) },
	])
}

// ---- Pieces ----------------------------------------------------------------------------------

/**
 * A site's icon, from the ones native keeps as <iconDir>/<host>.png (saved as pages load, so no
 * icon service learns your sites). A site never visited yet gets its first letter instead.
 */
function Favicon({ url, dir, size }: { url: string; dir?: string; size: number }) {
	const { React } = react
	const { Image, View } = ReactNative
	const { Text } = Design as any
	const host = shortHost(url).toLowerCase()
	const [failed, setFailed] = React.useState(false)
	React.useEffect(() => setFailed(false), [host, dir])
	if (dir && host && !failed) {
		return (
			<Image
				source={{ uri: `file://${dir}/${host}.png` }}
				style={{ width: size, height: size, borderRadius: size / 5 }}
				resizeMode="contain"
				onError={() => setFailed(true)}
			/>
		)
	}
	return (
		<View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(128,128,128,0.25)' }}>
			<Text variant={size >= 24 ? 'text-md/bold' : 'text-xxs/bold'} color="text-default">
				{(host.replace(/^[^a-z0-9]+/i, '')[0] ?? '?').toUpperCase()}
			</Text>
		</View>
	)
}

function TabRow({ state }: { state: browser.BrowserState }) {
	const { ScrollView, Pressable, View } = ReactNative
	const { Text } = Design as any
	return (
		<View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 8, paddingRight: 4, paddingTop: 6 }}>
			<ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 6 }}>
				{state.tabs.map(tab => {
					const selected = tab.id === state.active
					return (
						<Pressable
							key={tab.id}
							accessibilityRole="tab"
							accessibilityState={{ selected }}
							accessibilityHint="Hold for more"
							onPress={() => browser.selectTab(tab.id)}
							onLongPress={() => openTabMenu(tab, state.tabs.length)}
							style={({ pressed }: { pressed: boolean }) => ({
								flexDirection: 'row',
								alignItems: 'center',
								maxWidth: 170,
								height: 32,
								paddingLeft: tab.private ? 4 : tab.url ? 8 : 12,
								paddingRight: 2,
								borderRadius: 16,
								backgroundColor: selected ? 'rgba(128,128,128,0.32)' : pressed ? 'rgba(128,128,128,0.2)' : 'rgba(128,128,128,0.1)',
							})}
						>
							{tab.private && (
								<View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center', transform: [{ scale: 0.65 }] }}>
									{rowIcon('EyeSlashIcon')}
								</View>
							)}
							{!tab.private && !!tab.url && (
								<View style={{ marginRight: 6 }}>
									<Favicon url={tab.url} dir={state.iconDir} size={16} />
								</View>
							)}
							<Text variant="text-sm/medium" color={selected ? 'text-default' : 'text-muted'} numberOfLines={1} style={{ flexShrink: 1 }}>
								{tabLabel(tab)}
							</Text>
							<Pressable
								accessibilityRole="button"
								accessibilityLabel="Close tab"
								hitSlop={6}
								onPress={() => browser.closeTab(tab.id)}
								style={{ width: 26, height: 26, alignItems: 'center', justifyContent: 'center', transform: [{ scale: 0.7 }] }}
							>
								{rowIcon('XSmallIcon', 'XLargeIcon')}
							</Pressable>
						</Pressable>
					)
				})}
			</ScrollView>
			<IconButton
				icon={['PlusSmallIcon', 'PlusLargeIcon']}
				label="New tab"
				onPress={() => browser.newTab()}
				onLongPress={() => browser.newTab(undefined, true)}
			/>
		</View>
	)
}

function PageHost() {
	const { React } = react
	const { View } = ReactNative
	const id = React.useMemo(() => `pocket-browser-${++hosts}`, [])
	React.useEffect(() => {
		let cancelled = false
		let tries = 0
		let timer: ReturnType<typeof setTimeout> | undefined
		// The view may not be in the window yet on the first try; native says so and we try again.
		const tryAttach = () => {
			browser
				.attach(id)
				.then(ok => {
					if (!ok && !cancelled && ++tries < 20) timer = setTimeout(tryAttach, 100)
					else if (!ok && !cancelled) reportError(`${TAG} the page area never appeared`)
				})
				.catch(error => reportError(`${TAG} attach failed:`, error))
		}
		tryAttach()
		return () => {
			cancelled = true
			if (timer) clearTimeout(timer)
			browser.detach(id)
		}
	}, [id])
	return <View nativeID={id} collapsable={false} style={{ flex: 1 }} />
}

/** A tab with no address: search box, bookmarks, recent pages. */
function StartPage({ tab, iconDir, onHistory }: { tab: browser.TabState; iconDir?: string; onHistory: () => void }) {
	const { Stack, TableRowGroup, TableRow } = Design as any
	const s = useSettings()
	const bookmarks = s.bookmarks ?? []
	const recent = (s.history ?? []).slice(0, 5)

	return (
		<SheetScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: 24 }}>
			<Stack spacing={16}>
				<TableRowGroup hasIcons>
					<TableRow
						label="Search or type an address"
						subLabel={tab.private ? 'Private tab: not saved to History, and gone when you close it or Discord. Sign-ins are shared with your other tabs.' : undefined}
						icon={rowIcon(tab.private ? 'EyeSlashIcon' : 'MagnifyingGlassIcon', 'SearchIcon')}
						arrow
						onPress={() => promptAddress('', s.search)}
					/>
				</TableRowGroup>

				{s.speedDial && bookmarks.length > 0 ? (
					<SpeedDial bookmarks={bookmarks} iconDir={iconDir} />
				) : (
				<TableRowGroup title="Bookmarks" hasIcons>
					{bookmarks.length ? (
						bookmarks.map(bookmark => (
							<TableRow
								key={bookmark.url}
								label={bookmark.title}
								subLabel={shortHost(bookmark.url)}
								icon={rowIcon('StarIcon', 'ic_star')}
								onPress={() => browser.load(bookmark.url)}
								onLongPress={() => openBookmarkMenu(bookmark)}
							/>
						))
					) : (
						<TableRow
							label="No bookmarks yet"
							subLabel="Open the ⋮ menu on a page and choose Bookmark this page."
							icon={rowIcon('StarOutlineIcon', 'StarIcon')}
						/>
					)}
				</TableRowGroup>
				)}

				{!!recent.length && (
					<TableRowGroup title="Recent" hasIcons>
						{recent.map(entry => (
							<TableRow
								key={entry.url}
								label={entry.title || shortHost(entry.url)}
								subLabel={shortHost(entry.url)}
								icon={rowIcon('ClockIcon')}
								onPress={() => browser.load(entry.url)}
								onLongPress={() => openEntryMenu(entry, url => browser.load(url))}
							/>
						))}
						<TableRow label="All history" icon={rowIcon('ListBulletsIcon', 'ClockIcon')} arrow onPress={onHistory} />
					</TableRowGroup>
				)}
			</Stack>
		</SheetScrollView>
	)
}

function FindBar({ onClose }: { onClose: () => void }) {
	const { React } = react
	const { View, TextInput } = ReactNative
	const { Text, SearchField } = Design as any
	const [query, setQuery] = React.useState('')
	const [result, setResult] = React.useState<browser.FindResult>({ current: 0, count: 0 })
	React.useEffect(() => browser.onFound(setResult), [])
	// Closing clears the highlights.
	React.useEffect(() => () => browser.find(''), [])
	const change = (text: string) => {
		setQuery(text ?? '')
		setResult({ current: 0, count: 0 })
		browser.find(text ?? '')
	}
	return (
		<View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, gap: 2 }}>
			<View style={{ flex: 1 }}>
				{SearchField ? (
					<SearchField size="md" round autoFocus placeholder="Find in page" onChange={change} onSubmitEditing={() => browser.findNext(true)} />
				) : (
					<TextInput
						autoFocus
						value={query}
						onChangeText={change}
						onSubmitEditing={() => browser.findNext(true)}
						placeholder="Find in page"
						placeholderTextColor="rgba(128,128,128,0.9)"
						style={{ height: 36, borderRadius: 18, paddingHorizontal: 12, backgroundColor: 'rgba(128,128,128,0.15)', color: 'rgb(128,128,128)' }}
					/>
				)}
			</View>
			{!!query && (
				<Text variant="text-xs/medium" color="text-muted" style={{ minWidth: 40, textAlign: 'center' }}>
					{result.count ? `${result.current}/${result.count}` : '0/0'}
				</Text>
			)}
			<IconButton icon={['ChevronSmallUpIcon', 'ArrowSmallUpIcon']} label="Previous match" disabled={!result.count} onPress={() => browser.findNext(false)} />
			<IconButton icon={['ChevronSmallDownIcon', 'ArrowSmallDownIcon']} label="Next match" disabled={!result.count} onPress={() => browser.findNext(true)} />
			<IconButton icon={['XSmallIcon', 'XLargeIcon']} label="Close find" onPress={onClose} />
		</View>
	)
}

function downloadLine(item: browser.DownloadItem): string {
	const when = new Date(item.at).toLocaleString()
	switch (item.status) {
		case 'running':
			return `Downloading${item.progress ? ` ${item.progress}%` : '…'}`
		case 'paused':
			return 'Waiting…'
		case 'failed':
			return `Failed · ${when}`
		case 'gone':
			return `Removed · ${when}`
		default:
			return when
	}
}

function Downloads({ onBack }: { onBack: () => void }) {
	const { React } = react
	const { View, Pressable } = ReactNative
	const { Text } = Design as any
	const [items, setItems] = React.useState<browser.DownloadItem[] | undefined>()
	const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
	const load = React.useCallback(() => {
		if (timer.current) clearTimeout(timer.current)
		browser.downloads().then(
			list => {
				setItems(list)
				// Progress, only while something is still downloading.
				if (list.some(item => item.status === 'running' || item.status === 'paused')) timer.current = setTimeout(load, 1500)
			},
			() => setItems([]),
		)
	}, [])
	React.useEffect(() => {
		load()
		return () => {
			if (timer.current) clearTimeout(timer.current)
		}
	}, [load])

	const open = (item: browser.DownloadItem) =>
		browser
			.openDownload(item.id)
			.then(error => error && toast(error))
			.catch(() => toast("Couldn't open that file"))

	const more = (item: browser.DownloadItem) =>
		menu('PocketBrowserDownload', item.name, item.url, [
			item.status === 'done' && { text: 'Open', run: () => void open(item) },
			{ text: 'Copy link', run: () => copyLink(item.url) },
			{
				text: 'Remove from list',
				run: () => {
					browser.removeDownload(item.id, false)
					load()
				},
			},
			item.status !== 'gone' && {
				text: 'Delete file',
				danger: true,
				run: () =>
					confirmDestructive({
						title: `Delete ${item.name}?`,
						body: 'The file is removed from your phone.',
						action: 'Delete',
						onConfirm: () => {
							browser.removeDownload(item.id, true)
							load()
						},
					}),
			},
		])

	return (
		<View style={{ flex: 1 }}>
			<View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, height: 44 }}>
				<IconButton icon={['ArrowLargeLeftIcon', 'ChevronLargeLeftIcon']} label="Back to the page" onPress={onBack} />
				<Text variant="text-md/semibold" color="text-default" style={{ flex: 1, marginLeft: 4 }}>
					Downloads
				</Text>
			</View>
			{items && !items.length ? (
				<View style={{ padding: 24, alignItems: 'center' }}>
					<Text variant="text-sm/normal" color="text-muted" style={{ textAlign: 'center' }}>
						Files you download in Pocket Browser show up here. They're saved to your Downloads folder.
					</Text>
				</View>
			) : (
				<SheetFlatList
					data={items ?? []}
					keyExtractor={(item: browser.DownloadItem) => String(item.id)}
					contentContainerStyle={{ paddingBottom: 16 }}
					renderItem={({ item }: { item: browser.DownloadItem }) => (
						<Pressable
							accessibilityHint="Hold for more"
							onPress={() => (item.status === 'done' ? void open(item) : more(item))}
							onLongPress={() => more(item)}
							style={({ pressed }: { pressed: boolean }) => ({ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: press(pressed) })}
						>
							<Text variant="text-sm/medium" color={item.status === 'gone' ? 'text-muted' : 'text-default'} numberOfLines={1}>
								{item.name}
							</Text>
							<Text variant="text-xs/normal" color="text-muted" numberOfLines={1}>
								{downloadLine(item)} · {shortHost(item.url)}
							</Text>
						</Pressable>
					)}
				/>
			)}
		</View>
	)
}

/** Bookmarks as site tiles, for the start page, with the icons saved on the phone. */
function SpeedDial({ bookmarks, iconDir }: { bookmarks: Bookmark[]; iconDir?: string }) {
	const { View, Pressable } = ReactNative
	const { Text } = Design as any
	return (
		<View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
			{bookmarks.map(bookmark => {
				const host = shortHost(bookmark.url)
				return (
					<Pressable
						key={bookmark.url}
						accessibilityLabel={bookmark.title}
						accessibilityHint="Hold for more"
						onPress={() => browser.load(bookmark.url)}
						onLongPress={() => openBookmarkMenu(bookmark)}
						style={({ pressed }: { pressed: boolean }) => ({
							width: '25%',
							alignItems: 'center',
							paddingVertical: 10,
							borderRadius: 12,
							backgroundColor: press(pressed),
						})}
					>
						<View style={{ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(128,128,128,0.15)' }}>
							<Favicon url={bookmark.url} dir={iconDir} size={28} />
						</View>
						<Text variant="text-xs/medium" color="text-default" numberOfLines={1} style={{ marginTop: 6, maxWidth: '90%' }}>
							{bookmark.title || host}
						</Text>
					</Pressable>
				)
			})}
		</View>
	)
}

function History({ onBack, onOpen }: { onBack: () => void; onOpen: (url: string) => void }) {
	const { React } = react
	const { View, Pressable, TextInput } = ReactNative
	const { Text, SearchField } = Design as any
	const s = useSettings()
	const history = s.history ?? []
	const [query, setQuery] = React.useState('')
	const rows = React.useMemo(() => historyRows(history, query), [history, query])

	const remove = (entry: HistoryEntry) => {
		update({ history: history.filter(item => item.url !== entry.url) })
		toast('Removed from History')
	}
	const clear = () =>
		confirmDestructive({
			title: 'Clear history?',
			body: 'Every page in History is removed. Open tabs stay open.',
			action: 'Clear',
			onConfirm: () => update({ history: [] }),
		})

	return (
		<View style={{ flex: 1 }}>
			<View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, height: 44 }}>
				<IconButton icon={['ArrowLargeLeftIcon', 'ChevronLargeLeftIcon']} label="Back to the page" onPress={onBack} />
				<Text variant="text-md/semibold" color="text-default" style={{ flex: 1, marginLeft: 4 }}>
					History
				</Text>
				<IconButton icon={['TrashIcon']} label="Clear history" disabled={!history.length} onPress={clear} />
			</View>
			{history.length > 0 && (
				<View style={{ paddingHorizontal: 12, paddingBottom: 6 }}>
					{SearchField ? (
						<SearchField size="md" placeholder="Search history" onChange={(text: string) => setQuery(text ?? '')} />
					) : (
						<TextInput
							value={query}
							onChangeText={setQuery}
							placeholder="Search history"
							placeholderTextColor="rgba(128,128,128,0.9)"
							style={{ height: 36, borderRadius: 18, paddingHorizontal: 12, backgroundColor: 'rgba(128,128,128,0.15)', color: token('TEXT_DEFAULT', '#DBDEE1') }}
						/>
					)}
				</View>
			)}
			{!rows.length ? (
				<View style={{ padding: 24, alignItems: 'center' }}>
					<Text variant="text-sm/normal" color="text-muted" style={{ textAlign: 'center' }}>
						{history.length
							? 'Nothing in History matches that.'
							: s.saveHistory
								? 'Pages you visit show up here.'
								: 'History is switched off in Pocket Browser settings.'}
					</Text>
				</View>
			) : (
				<SheetFlatList
					data={rows}
					keyExtractor={(row: HistoryRow) => (row.kind === 'day' ? `day:${row.label}` : row.entry.url)}
					contentContainerStyle={{ paddingBottom: 16 }}
					renderItem={({ item }: { item: HistoryRow }) =>
						item.kind === 'day' ? (
							<Text variant="text-xs/bold" color="text-muted" style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
								{item.label.toUpperCase()}
							</Text>
						) : (
							<Pressable
								accessibilityHint="Hold for more"
								onPress={() => onOpen(item.entry.url)}
								onLongPress={() => openEntryMenu(item.entry, onOpen, () => remove(item.entry))}
								style={({ pressed }: { pressed: boolean }) => ({ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: press(pressed) })}
							>
								<Text variant="text-sm/medium" color="text-default" numberOfLines={1}>
									{item.entry.title || shortHost(item.entry.url)}
								</Text>
								<Text variant="text-xs/normal" color="text-muted" numberOfLines={1}>
									{shortHost(item.entry.url)} · {timeOf(item.entry.at)}
								</Text>
							</Pressable>
						)
					}
				/>
			)}
		</View>
	)
}

/** Shown instead of the page when it didn't load, or crashed. */
function ErrorPage({ tab }: { tab: browser.TabState }) {
	const { View } = ReactNative
	const { Text, Button, Stack } = Design as any
	const crashed = /crashed/i.test(tab.error ?? '')
	return (
		<SheetScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24, paddingTop: 40, alignItems: 'center' }}>
			<View style={{ transform: [{ scale: 1.6 }], marginBottom: 20, opacity: 0.8 }}>
				{rowIcon(crashed ? 'CircleWarningIcon' : 'WifiSlashIcon', 'WarningIcon', 'CircleXIcon')}
			</View>
			<Stack spacing={8} style={{ alignItems: 'center' }}>
				<Text variant="heading-md/bold" color="text-default" style={{ textAlign: 'center' }}>
					{crashed ? 'This page crashed' : "Couldn't load this page"}
				</Text>
				<Text variant="text-sm/normal" color="text-muted" style={{ textAlign: 'center' }}>
					{tab.error}
				</Text>
				{!!tab.url && (
					<Text variant="text-xs/normal" color="text-muted" style={{ textAlign: 'center' }} numberOfLines={2}>
						{tab.url}
					</Text>
				)}
			</Stack>
			<View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
				{Button ? (
					<>
						<Button text="Try again" size="md" variant="primary" onPress={() => browser.act('reload')} />
						<Button text="Home page" size="md" variant="secondary" onPress={() => browser.act('home')} />
					</>
				) : null}
			</View>
		</SheetScrollView>
	)
}

// ---- The tab ---------------------------------------------------------------------------------

export default function Panel(props: { channel: any }) {
	const { React } = react
	const { View, Pressable } = ReactNative
	const { Text } = Design as any
	const s = useSettings()
	const state = browser.useBrowserState()
	const [page, setPage] = React.useState<'web' | 'history' | 'downloads'>('web')
	const [finding, setFinding] = React.useState(false)
	currentChannelId = props.channel?.id

	// Swipe the toolbar sideways for the next or previous tab. Down is left to the picker sheet,
	// which uses it to close.
	const latest = React.useRef({ state, gestures: s.gestures })
	latest.current = { state, gestures: s.gestures }
	const swipe = React.useMemo(
		() =>
			ReactNative.PanResponder.create({
				onMoveShouldSetPanResponder: (_: unknown, g: { dx: number; dy: number }) =>
					latest.current.gestures && Math.abs(g.dx) > 30 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
				onPanResponderRelease: (_: unknown, g: { dx: number }) => {
					const { tabs, active } = latest.current.state
					const at = tabs.findIndex(item => item.id === active)
					const next = tabs[at + (g.dx < 0 ? 1 : -1)]
					if (!next) return
					browser.selectTab(next.id)
					// Without the tab row there's nothing else to show which tab you landed on.
					toast(`${tabs.indexOf(next) + 1}/${tabs.length} · ${tabLabel(next)}`)
				},
			}),
		[],
	)

	const tab = state.tabs.find(item => item.id === state.active)
	const onStartPage = !!tab && !tab.url
	const failed = !!tab?.error
	const showHistory = () => setPage('history')

	// Find in page searches the tab it was opened on; another tab starts without it.
	React.useEffect(() => setFinding(false), [state.active])

	// Android's Back steps back inside the browser first: a list, the find bar, then the page.
	const back = React.useRef<() => boolean>(() => false)
	back.current = () => {
		if (page !== 'web') {
			setPage('web')
			return true
		}
		if (finding) {
			setFinding(false)
			return true
		}
		if (tab?.canBack && !onStartPage) {
			browser.act('back')
			return true
		}
		return false
	}
	React.useEffect(() => {
		const handler = ReactNative.BackHandler?.addEventListener?.('hardwareBackPress', () => back.current())
		return () => handler?.remove?.()
	}, [])

	const address = !tab?.url ? (tab?.private ? 'Private · Search or type an address' : 'Search or type an address') : `${tab.private ? 'Private · ' : ''}${shortHost(tab.url)}`
	// A padlock on secure pages, a warning on plain http, nothing on the start page.
	const addressIcon = !tab?.url
		? undefined
		: /^https:/i.test(tab.url)
			? ['LockIcon']
			: /^http:/i.test(tab.url)
				? ['WarningIcon', 'CircleWarningIcon']
				: undefined

	return (
		<View style={{ flex: 1 }}>
			{page === 'downloads' ? (
				<Downloads onBack={() => setPage('web')} />
			) : page === 'history' ? (
				<History
					onBack={() => setPage('web')}
					onOpen={url => {
						browser.load(url)
						setPage('web')
					}}
				/>
			) : (
				<>
					{s.tabRow && <TabRow state={state} />}
					<View {...swipe.panHandlers} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, height: 44, gap: 2 }}>
						<IconButton
							icon={['ArrowLargeLeftIcon', 'ChevronLargeLeftIcon']}
							label="Back"
							disabled={!tab?.canBack || onStartPage}
							onPress={() => browser.act('back')}
							onLongPress={showHistory}
						/>
						<IconButton
							icon={['ArrowLargeRightIcon', 'ChevronLargeRightIcon']}
							label="Forward"
							disabled={!tab?.canForward || onStartPage}
							onPress={() => browser.act('forward')}
						/>
						<IconButton
							icon={tab?.loading ? ['XSmallIcon', 'XLargeIcon'] : ['RefreshIcon']}
							label={tab?.loading ? 'Stop' : 'Reload'}
							disabled={onStartPage}
							onPress={() => browser.act(tab?.loading ? 'stop' : 'reload')}
						/>
						<Pressable
							accessibilityRole="button"
							accessibilityLabel="Address"
							onPress={() => promptAddress(tab?.url ?? '', s.search)}
							style={({ pressed }: { pressed: boolean }) => ({
								flex: 1,
								height: 34,
								borderRadius: 17,
								paddingLeft: addressIcon ? 6 : 14,
								paddingRight: 14,
								flexDirection: 'row',
								alignItems: 'center',
								backgroundColor: pressed ? 'rgba(128,128,128,0.24)' : 'rgba(128,128,128,0.14)',
							})}
						>
							{addressIcon && (
								<View
									accessibilityLabel={addressIcon[0] === 'LockIcon' ? 'Secure' : 'Not secure'}
									style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center', transform: [{ scale: 0.65 }] }}
								>
									{rowIcon(...addressIcon)}
								</View>
							)}
							<Text variant="text-sm/normal" color={tab?.url ? 'text-default' : 'text-muted'} numberOfLines={1} style={{ flexShrink: 1 }}>
								{address}
							</Text>
						</Pressable>
						{!s.tabRow && (
							<Pressable
								accessibilityRole="button"
								accessibilityLabel={`${state.tabs.length} tabs`}
								onPress={() => openTabList(state)}
								style={({ pressed }: { pressed: boolean }) => ({
									minWidth: 28,
									height: 24,
									marginHorizontal: 4,
									borderRadius: 6,
									borderWidth: 2,
									borderColor: 'rgba(128,128,128,0.6)',
									alignItems: 'center',
									justifyContent: 'center',
									backgroundColor: press(pressed),
								})}
							>
								<Text variant="text-xs/bold" color="text-default">
									{state.tabs.length}
								</Text>
							</Pressable>
						)}
						<MoreButton
							tab={tab}
							tabCount={state.tabs.length}
							channelId={props.channel?.id}
							showHistory={showHistory}
							showDownloads={() => setPage('downloads')}
							openFind={() => setFinding(true)}
						/>
					</View>
					<View style={{ height: 2 }}>
						{tab?.loading && (
							<View style={{ height: 2, width: `${Math.max(5, tab.progress)}%`, backgroundColor: token('BRAND_500', '#5865F2') }} />
						)}
					</View>
					{finding && !onStartPage && !failed && <FindBar onClose={() => setFinding(false)} />}
					{onStartPage ? (
						<StartPage tab={tab!} iconDir={state.iconDir} onHistory={showHistory} />
					) : failed ? (
						<ErrorPage tab={tab!} />
					) : (
						<PageHost />
					)}
				</>
			)}
		</View>
	)
}
