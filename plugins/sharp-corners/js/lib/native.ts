/**
 * The Kotlin side (src/main/kotlin) does the sharpening; JS only sends the switches and reads the
 * counts for the settings page. Guarded: without the jar the calls settle false/undefined.
 */

import * as modulesNative from '@valenced/modules/native'
import type { CirclesStorage } from './settings'

const ID = 'bleelblep.sharp-corners'

function call(method: string, args: unknown[] = []): Promise<any> {
	try {
		return Promise.resolve((modulesNative as any).callNativeMethod(`${ID}.${method}`, args))
	} catch (error) {
		return Promise.reject(error)
	}
}

export function sendOptions(s: CirclesStorage): Promise<boolean> {
	return call('setOptions', [s.app, s.native, s.ovals])
		.then(value => value === true)
		.catch(() => false)
}

export interface Stats {
	hooks: number
	app: number
	native: number
	ovals: number
}

export function stats(): Promise<Stats | undefined> {
	return call('stats')
		.then(value => (value && typeof value === 'object' ? (value as Stats) : undefined))
		.catch(() => undefined)
}
