/**
 * Undo send's names and settings, read from Send Tweaks' own storage (`lib/state.ts`).
 *
 * Undo send was its own plugin (Undo Send 0.1.6) before it moved in here. Its settings did not
 * carry over: the switch starts off, and the wait starts at 5 seconds.
 */

import { settings } from '../lib/state'
import type { SendTweaksStorage } from '../types'

export const TAG = '[SendTweaks:undo]'
export const TOAST = 'SendTweaksUndoToast'

/** The waits on offer, in seconds. */
export const DELAYS = [3, 5, 10] as const
export type Delay = (typeof DELAYS)[number]
export const DEFAULT_DELAY: Delay = 5

/** Whether new sends are held right now. Read on every send, so the switch needs no reload. */
export function undoOn(s: Partial<SendTweaksStorage> = settings()): boolean {
	return !!s.undoSend
}

/** Hold sends with a photo or file on them too. On unless switched off. */
export function holdFiles(s: Partial<SendTweaksStorage> = settings()): boolean {
	return s.undoSendFiles !== false
}

/** The wait in milliseconds, from whatever storage says. */
export function delayMs(s: Partial<SendTweaksStorage> = settings()): number {
	const sec = Number(s.undoSendDelay)
	const known = DELAYS.find(d => d === sec)
	return (known ?? DEFAULT_DELAY) * 1000
}
