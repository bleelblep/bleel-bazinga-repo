/**
 * The Kotlin half (PocketBrowser.kt): the WebViews and their tabs live there, so they survive the
 * picker closing. JS draws the controls and sends actions; native reports the tab list back through
 * `<id>.changed` and finished pages through `<id>.visited`, each as a JSON string.
 */

import { askPermission, chooseFiles } from './requests'
import { recordVisit, settings } from './store'
import { showToast } from '../../../../shared/toast'
import * as modulesNative from '@valenced/modules/native'
import * as react from '@valenced/react'
import { reportError } from '../../../../shared/report'

export const ID = 'bleelblep.pocket-browser'
const TAG = '[Pocket Browser]'

export interface TabState {
	id: string
	url: string
	title: string
	loading: boolean
	progress: number
	canBack: boolean
	canForward: boolean
	/** Kept out of History, not restored, wiped on close. */
	private: boolean
	/** Why the page didn't load (or crashed); the panel shows an error page instead. */
	error?: string | null
}

export interface BrowserState {
	active: string | null
	tabs: TabState[]
	/** Where native keeps site icons, as <host>.png. */
	iconDir?: string
}

/** What was held in the page: a link, an image, or an image that is a link. */
export interface HoldTarget {
	link: string | null
	image: string | null
	/** The link's text, when the page has one. */
	text: string | null
	/** Held in a private tab: links it opens stay private. */
	private: boolean
}

let holdHandler: ((target: HoldTarget) => void) | undefined

/** Who shows the hold menu (ui/holdMenu.tsx); set at start. */
export function setHoldHandler(handler: ((target: HoldTarget) => void) | undefined) {
	holdHandler = handler
}

function call<T = unknown>(method: string, args: unknown[] = []): Promise<T> {
	return (modulesNative as any).callNativeMethod(`${ID}.${method}`, args)
}

function quietly(promise: Promise<unknown>, what: string) {
	promise.catch(error => reportError(`${TAG} ${what} failed:`, error))
}

let state: BrowserState = { active: null, tabs: [] }
const listeners = new Set<(state: BrowserState) => void>()

function parse(json: unknown): BrowserState | undefined {
	try {
		const value = typeof json === 'string' ? JSON.parse(json) : json
		return value && Array.isArray(value.tabs) ? value : undefined
	} catch {
		return undefined
	}
}

function publish(next: BrowserState | undefined) {
	if (!next) return
	state = next
	for (const listener of listeners) listener(state)
}

export function browserState(): BrowserState {
	return state
}

/** The tab list, re-rendering whenever native reports a change. Call like a hook. */
export function useBrowserState(): BrowserState {
	const { React } = react
	const [value, setValue] = React.useState(state)
	React.useEffect(() => {
		listeners.add(setValue)
		setValue(state)
		return () => {
			listeners.delete(setValue)
		}
	}, [])
	return value
}

let alive = false

/** Registers the events (a stale registration from an earlier start is inert) and asks for the current tabs. */
export function connect(): () => void {
	alive = true
	const native = modulesNative as any
	try {
		native.registerJSMethod(`${ID}.changed`, (json: string) => {
			if (alive) publish(parse(json))
		})
		native.registerJSMethod(`${ID}.visited`, (json: string) => {
			if (!alive) return
			try {
				const { url, title } = JSON.parse(json)
				if (typeof url === 'string') recordVisit(url, typeof title === 'string' ? title : '')
			} catch {
				/* a malformed visit is dropped */
			}
		})
		native.registerJSMethod(`${ID}.chooseFiles`, (json: string) => {
			if (alive) chooseFiles(json)
		})
		native.registerJSMethod(`${ID}.permission`, (json: string) => {
			if (alive) askPermission(json)
		})
		native.registerJSMethod(`${ID}.found`, (json: string) => {
			if (!alive) return
			try {
				const result = JSON.parse(json)
				for (const listener of findListeners) listener(result)
			} catch {
				/* dropped */
			}
		})
		native.registerJSMethod(`${ID}.hold`, (json: string) => {
			if (!alive) return
			try {
				holdHandler?.(JSON.parse(json))
			} catch (error) {
				reportError(`${TAG} the hold menu failed:`, error)
			}
		})
		native.registerJSMethod(`${ID}.notice`, (text: string) => {
			if (alive && typeof text === 'string') showToast(text, 'PocketBrowserToast')
		})
	} catch (error) {
		reportError(`${TAG} could not listen to the browser:`, error)
	}
	// Native keeps its own copy of the page settings (settings.json), so nothing is pushed here:
	// storage may not have loaded yet, and its defaults would overwrite the saved choices.
	refresh()
	return () => {
		alive = false
		listeners.clear()
	}
}

export function refresh() {
	call<string>('state')
		.then(json => publish(parse(json)))
		.catch(error => reportError(`${TAG} state failed:`, error))
}

/** Hands native the settings it applies to pages. */
export function pushSettings() {
	const s = settings()
	const patch = {
		javascript: s.javascript,
		desktop: s.desktop,
		restore: s.restore,
		home: s.home,
		thirdPartyCookies: s.thirdPartyCookies,
		keepPlaying: s.keepPlaying,
		pageNewTabs: s.pageNewTabs,
		darkPages: s.darkPages,
		textZoom: s.textZoom,
	}
	quietly(call('settings', [JSON.stringify(patch)]), 'settings')
}

export const attach = (nativeId: string) => call<boolean>('attach', [nativeId])
export const detach = (nativeId: string) => quietly(call('detach', [nativeId]), 'detach')
export const load = (url: string, newTab = false) => quietly(call('load', [url, newTab]), 'load')
export const act = (action: 'back' | 'forward' | 'reload' | 'stop' | 'home') => quietly(call('act', [action]), action)
/** No [url] opens the start page. */
export const newTab = (url?: string, isPrivate = false) => quietly(call('newTab', [url ?? '', isPrivate]), 'new tab')
export const selectTab = (id: string) => quietly(call('selectTab', [id]), 'select tab')
export const closeTab = (id: string) => quietly(call('closeTab', [id]), 'close tab')
export const closeOthers = () => quietly(call('closeOthers'), 'close other tabs')
export const clearData = () => call('clearData')
/** Saves a file (a held image) to Downloads. */
export const saveUrl = (url: string) => quietly(call('saveUrl', [url]), 'save')

/** A held image fetched into Discord's cache, to attach to the message; or why not. */
export async function fetchImage(url: string): Promise<{ path: string; width: number; height: number; mime?: string } | { error: string }> {
	const raw = await call<string>('fetchImage', [url])
	try {
		return JSON.parse(typeof raw === 'string' ? raw : '{}')
	} catch {
		return { error: "Couldn't get the image." }
	}
}
/** Answers a page's file input: content:// URIs, or none to cancel. */
export const filesChosen = (uris: string[]) => quietly(call('filesChosen', [JSON.stringify(uris)]), 'files chosen')
// ---- Find in page ----

export type FindResult = { current: number; count: number }
const findListeners = new Set<(result: FindResult) => void>()

/** Matches as the page counts them. Call like a hook; reset to 0/0 when [query] changes. */
export function onFound(listener: (result: FindResult) => void): () => void {
	findListeners.add(listener)
	return () => findListeners.delete(listener)
}

export const find = (query: string) => quietly(call('find', [query]), 'find')
export const findNext = (forward: boolean) => quietly(call('findNext', [forward]), 'find next')

// ---- Downloads ----

export interface DownloadItem {
	id: number
	name: string
	url: string
	at: number
	status: 'running' | 'paused' | 'done' | 'failed' | 'gone'
	progress: number
}

export async function downloads(): Promise<DownloadItem[]> {
	const raw = await call<string>('downloads')
	try {
		const list = typeof raw === 'string' ? JSON.parse(raw) : raw
		return Array.isArray(list) ? list : []
	} catch {
		return []
	}
}
/** Null when opened, or why not. */
export const openDownload = (id: number) => call<string | null>('openDownload', [id])
export const removeDownload = (id: number, deleteFile: boolean) => quietly(call('removeDownload', [id, deleteFile]), 'remove download')

// ---- Share and pop out ----

/** Screenshots the page into Discord's cache: the file to attach, or why not. */
export async function screenshot(): Promise<{ path: string; width: number; height: number } | { error: string }> {
	const raw = await call<string>('screenshot')
	try {
		return JSON.parse(typeof raw === 'string' ? raw : '{}')
	} catch {
		return { error: "Couldn't take the screenshot." }
	}
}

export async function mediaInfo(): Promise<{ href?: string; src?: string; time?: number; poster?: string }> {
	try {
		const raw = await call<string>('mediaInfo')
		return JSON.parse(typeof raw === 'string' ? raw : '{}')
	} catch {
		return {}
	}
}
export const pauseMedia = () => quietly(call('pauseMedia'), 'pause')

export const permissionResult = (id: string, allow: boolean) => quietly(call('permissionResult', [id, allow]), 'permission')
