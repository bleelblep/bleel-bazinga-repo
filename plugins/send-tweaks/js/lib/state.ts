import * as React from 'react'
import { reportError } from '../../../../shared/report'
import { DEFAULTS } from '../defaults'
import type { AiHandle, SendTweaksStorage } from '../types'

const DEBUG: boolean = false

export const TAG = '[SendTweaks]'

type Storage = ValencedJsonStorageApi<SendTweaksStorage>

let storage: Storage | undefined
let ai: AiHandle | undefined
let reload: (() => void) | undefined

/** Valenced's own Reload Required prompt (`plugin.requireReload`), set from `start()`. */
export function setRequireReload(fn: (() => void) | undefined) {
	reload = fn
}

/**
 * Asks for a reload through Valenced's stock prompt. The send button is memoised, so a swipe switch
 * only reaches it when the chat bar redraws; a reload applies it at once.
 */
export function requireReload() {
	try {
		reload?.()
	} catch (error) {
		reportError(`${TAG} could not ask for a reload:`, error)
	}
}

/** AI Core's handle, or undefined when AI Core is not installed. */
export function getAi(): AiHandle | undefined {
	return ai
}

export function setAi(handle: AiHandle | undefined) {
	ai = handle
}

export function setStorage(value: Storage) {
	storage = value
}

/** Sub-pages are plain navigator routes with no plugin `api` prop, so they read through this. */
export function getStorage(): Storage | undefined {
	return storage
}

/** Never reads `cache` without a fallback. */
export function settings(): SendTweaksStorage {
	return { ...DEFAULTS, ...(storage?.cache ?? {}) }
}

/**
 * The settings, re-rendering whenever they change -- from this page, the send sheet, or anywhere.
 * Call like a hook.
 *
 * Every page and the sheet read through this one handle, the one `start()` was given. The root page
 * used to read the `api.jsonStorage` Valenced hands a settings component, and a switch flipped in the
 * send sheet did not show there. It also subscribes directly as well as calling `use()`, so a change
 * made elsewhere always redraws the page.
 */
export function useSettings(): SendTweaksStorage {
	const [, redraw] = React.useReducer((n: number) => n + 1, 0)
	const handle = storage
	const value = handle?.use()
	React.useEffect(() => {
		try {
			return handle?.subscribe?.(() => redraw())
		} catch {
			return undefined
		}
	}, [handle])
	return { ...DEFAULTS, ...(value ?? handle?.cache ?? {}) }
}

export function debug(...args: unknown[]) {
	if (settings().debugLogging) {
		if (DEBUG) console.log(TAG, ...args)
	}
}
