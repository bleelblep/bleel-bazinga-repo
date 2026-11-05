import { CORNHUB_SOUND } from './cornhubSound'
import { getStorage, settings } from './state'
import { showToast } from '../../../../shared/toast'
import { FileModule } from '@valenced/discord/native'
import * as ReactNative from 'react-native'
import { reportError } from '../../../../shared/report'

/**
 * Cornhub: an easter egg that re-skins the Hub. Long-press the settings button at the top right of
 * the Hub or AI Hub page for a second and a half to switch it on, and again to switch it off.
 *
 * While it is on, the rows and pages are called Cornhub / AI Cornhub, the section Plugin Cornhub,
 * the Hub pages use the black-and-orange palette below, and an intro sound plays each time the Hub
 * or AI Hub page opens.
 */

export const CORN = {
	orange: '#ffa31a',
	grey: '#808080',
	card: '#292929',
	background: '#1b1b1b',
	white: '#ffffff',
} as const

export function isCornhub(): boolean {
	return !!settings().cornhub
}

export function hubName(ai: boolean): string {
	if (isCornhub()) return ai ? 'AI Cornhub' : 'Cornhub'
	return ai ? 'AI Hub' : 'Hub'
}

export function sectionName(): string {
	return isCornhub() ? 'Plugin Cornhub' : 'Plugin Hub'
}

function toast(content: string) {
	try {
		showToast(content, 'PluginHubCornhubToast')
	} catch (error) {
		reportError('[PluginHub] toast failed:', error)
	}
}

/** Flips the easter egg. Plays the intro when switching on, so it is obvious what happened. */
export function toggleCornhub() {
	const next = !isCornhub()
	getStorage()?.set({ cornhub: next })
	toast(next ? 'Welcome to Cornhub' : 'Back to Plugin Hub')
	if (next) playIntro()
}

// ---------------------------------------------------------------------------------------------
// The intro sound
// ---------------------------------------------------------------------------------------------

/**
 * Played through Discord's own `DCDSoundManager` (com.discord.sounds), which plugins can reach
 * without native code. Its `prepare(url, usage, key, callback)` looks for
 * `<cache>/sounds/<last path segment>.mp3` before downloading anything (SoundManagerModule on
 * 348.1), so the MP3 is written there once per session with Discord's FileModule and a URL whose
 * last segment matches is handed over. Nothing is ever fetched; the host is `.invalid` on purpose.
 */
const FILE = 'cornhub-intro'
const SOUND_URL = `https://plugin-hub.invalid/${FILE}`
/** Keys are ints shared with Discord's own sounds; start well away from anything it uses. */
let nextKey = 0x0c0c_0000

let written: Promise<unknown> | undefined

function soundManager(): any {
	const RN = ReactNative as any
	try {
		return (
			RN.NativeModules?.DCDSoundManager ??
			RN.TurboModuleRegistry?.get?.('DCDSoundManager') ??
			(globalThis as any).nativeModuleProxy?.DCDSoundManager
		)
	} catch {
		return undefined
	}
}

export function playIntro() {
	if (!CORNHUB_SOUND) return
	const manager = soundManager()
	if (typeof manager?.prepare !== 'function') {
		reportError('[PluginHub] DCDSoundManager is not reachable; the Cornhub intro stays silent')
		return
	}
	written ??= FileModule.writeFile(
		'cache',
		`sounds/${FILE}.mp3`,
		CORNHUB_SOUND,
		'base64',
	).catch((error: unknown) => {
		written = undefined
		throw error
	})

	written
		.then(() => {
			const key = nextKey++
			manager.prepare(SOUND_URL, 'media', key, (error: unknown, info: any) => {
				if (error) {
					reportError('[PluginHub] Cornhub intro would not load:', error)
					return
				}
				manager.play(key)
				const duration = typeof info?.duration === 'number' && info.duration > 0 ? info.duration : 4000
				setTimeout(() => {
					try {
						manager.release(key)
					} catch {
						/* already released */
					}
				}, duration + 500)
			})
		})
		.catch((error: unknown) => reportError('[PluginHub] Cornhub intro failed:', error))
}
