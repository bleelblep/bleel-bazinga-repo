/**
 * UI Tweaks' Kotlin side (src/main/kotlin): only the swipe stage icons, which JS can't change on
 * 351.x (the native list draws them from Android drawables). Guarded: without the jar the calls
 * settle false and the icons stay Discord's.
 */

import * as modulesNative from '@valenced/modules/native'

const ID = 'bleelblep.ui-tweaks'

function call(method: string, args: unknown[] = []): Promise<any> {
	try {
		return Promise.resolve((modulesNative as any).callNativeMethod(`${ID}.${method}`, args))
	} catch (error) {
		return Promise.reject(error)
	}
}

let supported: Promise<boolean> | undefined

export function swipeIconsSupported(): Promise<boolean> {
	supported ??= call('swipeIconsSupported')
		.then(value => value === true)
		.catch(() => false)
	return supported
}

/** Tells native which action each stage shows ('stock' = Discord's own icon). */
export function setSwipeIcons(short: string, long: string): Promise<boolean> {
	return call('setSwipeIcons', [short, long]).then(value => value === true).catch(() => false)
}
