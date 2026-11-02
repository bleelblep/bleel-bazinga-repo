/** Settings and History, in the plugin's jsonStorage. Native keeps its own copy of the page settings (`pushSettings`). */

export interface HistoryEntry {
	url: string
	title: string
	/** Last visit, ms since epoch. */
	at: number
}

export interface Bookmark {
	url: string
	title: string
}

export type SearchEngine = 'duckduckgo' | 'google' | 'bing' | 'brave' | 'startpage'

export interface PocketBrowserStorage {
	/** The Web tab in the emoji / GIF / sticker picker. */
	showTab: boolean
	/** Links tapped in Discord open in the Web tab instead of your browser. */
	openLinks: boolean
	/** Each tapped link gets its own tab, rather than replacing the page you're on. */
	linksInNewTab: boolean
	/** The row of tabs above the address bar. Off leaves a tab counter in the toolbar. */
	tabRow: boolean
	/** The picker expands to its full height when a page summons the keyboard, instead of hiding behind it. */
	autoExpand: boolean
	/** Keep a list of pages you visit. */
	saveHistory: boolean
	/** Newest first, one entry per address. Stored whole (arrays replace on set). */
	history: HistoryEntry[]
	/** On the start page, in the order added. */
	bookmarks: Bookmark[]
	search: SearchEngine
	/** Empty: the search engine's own page (homeUrl). */
	home: string
	javascript: boolean
	/** Ask sites for their desktop version. */
	desktop: boolean
	/** Bring tabs back after Discord restarts. */
	restore: boolean
	thirdPartyCookies: boolean
	/** Audio and video keep playing when the picker closes. */
	keepPlaying: boolean
	/** Links a page opens in a new window (target=_blank, pop-ups) get their own tab. Off loads them in the current tab. */
	pageNewTabs: boolean
	/** Pop-out player style: Android picture-in-picture, or a floating window over every app. */
	popoutMode: 'pip' | 'overlay'
	/** Swipe the toolbar sideways to switch tabs. */
	gestures: boolean
	/** Bookmarks on the start page as a grid of site tiles instead of a list. */
	speedDial: boolean
	/** ⋮ menu items switched off in settings (ids from MENU_ITEMS). Stored whole: arrays replace. */
	hiddenMenu: string[]
	/** Light pages drawn dark. */
	darkPages: boolean
	/** Page text size, in percent. */
	textZoom: number
}

/** The ⋮ menu's items, in menu order, for the settings page. Ids are what hiddenMenu stores. */
export const MENU_ITEMS: Array<{ id: string; label: string }> = [
	{ id: 'newTab', label: 'New tab' },
	{ id: 'privateTab', label: 'New private tab' },
	{ id: 'history', label: 'History' },
	{ id: 'downloads', label: 'Downloads' },
	{ id: 'find', label: 'Find in page' },
	{ id: 'share', label: 'Share to chat' },
	{ id: 'popout', label: 'Pop out video' },
	{ id: 'home', label: 'Home page' },
	{ id: 'bookmark', label: 'Bookmark this page' },
	{ id: 'linkToMessage', label: 'Add link to message' },
	{ id: 'copyLink', label: 'Copy link' },
	{ id: 'openExternal', label: 'Open in your browser' },
	{ id: 'closeOthers', label: 'Close other tabs' },
	{ id: 'closeTab', label: 'Close tab' },
]

export const DEFAULTS: PocketBrowserStorage = {
	showTab: true,
	// Off: it changes what every link tap does, so it is a choice.
	openLinks: false,
	linksInNewTab: true,
	tabRow: true,
	autoExpand: true,
	saveHistory: true,
	history: [],
	bookmarks: [],
	search: 'duckduckgo',
	home: '',
	javascript: true,
	desktop: false,
	restore: true,
	thirdPartyCookies: true,
	keepPlaying: false,
	pageNewTabs: true,
	popoutMode: 'pip',
	gestures: true,
	speedDial: true,
	hiddenMenu: [],
	darkPages: false,
	textZoom: 100,
}

/** Text size choices, in percent. */
export const TEXT_ZOOMS = [75, 90, 100, 115, 130, 150, 175, 200]

/** `home` is the engine's own front page, used as the home page when none is set. */
export const SEARCH_ENGINES: Record<SearchEngine, { name: string; url: string; home: string }> = {
	duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s', home: 'https://duckduckgo.com' },
	google: { name: 'Google', url: 'https://www.google.com/search?q=%s', home: 'https://www.google.com' },
	bing: { name: 'Bing', url: 'https://www.bing.com/search?q=%s', home: 'https://www.bing.com' },
	brave: { name: 'Brave Search', url: 'https://search.brave.com/search?q=%s', home: 'https://search.brave.com' },
	startpage: { name: 'Startpage', url: 'https://www.startpage.com/do/search?q=%s', home: 'https://www.startpage.com' },
}

/** Every version before 0.4.15 saved this as the default home, so it counts as none set. */
const OLD_DEFAULT_HOME = 'https://duckduckgo.com'

/** The home page someone set themselves, or '' when it follows the search engine. */
export function customHome(s: Pick<PocketBrowserStorage, 'home'>): string {
	const home = s.home?.trim() ?? ''
	return home === OLD_DEFAULT_HOME ? '' : home
}

/** The home page in use: the one set, or else the search engine's front page. */
export function homeUrl(s: Pick<PocketBrowserStorage, 'home' | 'search'>): string {
	return customHome(s) || (SEARCH_ENGINES[s.search] ?? SEARCH_ENGINES.duckduckgo).home
}

const HISTORY_LIMIT = 500

let storage: ValencedJsonStorageApi<PocketBrowserStorage> | undefined
const listeners = new Set<() => void>()

export function setStorage(handle: ValencedJsonStorageApi<PocketBrowserStorage> | undefined) {
	storage = handle
}

/** Read at any time; falls back to the defaults while storage loads. */
export function settings(): PocketBrowserStorage {
	return { ...DEFAULTS, ...((storage as any)?.cache ?? {}) }
}

/** The saved settings, re-rendering on change. Call like a hook. */
export function useSettings(): PocketBrowserStorage {
	return { ...DEFAULTS, ...(storage?.use() ?? {}) }
}

export function update(patch: Partial<PocketBrowserStorage>) {
	storage?.set(patch)
	for (const listener of listeners) listener()
}

/** Runs [fn] after every update() from this plugin. */
export function onUpdate(fn: () => void): () => void {
	listeners.add(fn)
	return () => listeners.delete(fn)
}

/** An address or a search, as typed into the address bar, to a URL. */
export function toUrl(input: string, search: SearchEngine = 'duckduckgo'): string | undefined {
	const text = input.trim()
	if (!text) return undefined
	// A scheme (https:, about:, mailto:), but not host:port.
	if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/^[^\s:/]+:\d+(\/|$)/.test(text)) return text
	if (!/\s/.test(text)) {
		const host = text.split(/[/?#]/)[0]
		if (/^localhost(:\d+)?$/i.test(host) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(host)) return `http://${text}`
		if (/^[^.\s]+(\.[^.\s]+)*\.[a-z][a-z0-9-]{1,62}(:\d+)?$/i.test(host)) return `https://${text}`
	}
	return (SEARCH_ENGINES[search] ?? SEARCH_ENGINES.duckduckgo).url.replace('%s', encodeURIComponent(text))
}

/** One entry per address, newest first. */
export function addVisit(history: HistoryEntry[], url: string, title: string, at = Date.now()): HistoryEntry[] {
	return [{ url, title: title || url, at }, ...history.filter(entry => entry.url !== url)].slice(0, HISTORY_LIMIT)
}

export function recordVisit(url: string, title: string) {
	const s = settings()
	if (!s.saveHistory || !/^https?:/i.test(url)) return
	update({ history: addVisit(s.history ?? [], url, title) })
}

export function isBookmarked(url: string): boolean {
	return (settings().bookmarks ?? []).some(b => b.url === url)
}

export function addBookmark(url: string, title: string) {
	const list = settings().bookmarks ?? []
	if (list.some(b => b.url === url)) return
	update({ bookmarks: [...list, { url, title: title || url }] })
}

export function removeBookmark(url: string) {
	update({ bookmarks: (settings().bookmarks ?? []).filter(b => b.url !== url) })
}

export function renameBookmark(url: string, title: string) {
	update({ bookmarks: (settings().bookmarks ?? []).map(b => (b.url === url ? { ...b, title: title.trim() || b.title } : b)) })
}
