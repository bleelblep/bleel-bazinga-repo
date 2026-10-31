import { DEFAULTS, type NativeState, type TextAnimationStorage, callNative } from '../native'
import { reportError } from '../../../../shared/report'

/** Set once in start(); the settings page reads it from here. */
let storage: ValencedJsonStorageApi<TextAnimationStorage> | undefined

export function setStorage(handle: ValencedJsonStorageApi<TextAnimationStorage>) {
	storage = handle
}

/** The saved settings, re-rendering on change. Call like a hook. */
export function useSettings(): TextAnimationStorage {
	return { ...DEFAULTS, ...(storage?.use() ?? {}) }
}

let cursorSupported = true

export function setCursorSupported(value: boolean) {
	cursorSupported = value
}

export function isCursorSupported() {
	return cursorSupported
}

/** Saves a change and hands it to native, which applies it on the next frame. */
export function update(patch: Partial<TextAnimationStorage>) {
	storage?.set(patch)
	callNative('setSettings', [patch])
		.then((state: NativeState) => {
			if (state && typeof state.cursorSupported === 'boolean') cursorSupported = state.cursorSupported
		})
		.catch(error => reportError('[TextAnimation] setSettings failed:', error))
}
