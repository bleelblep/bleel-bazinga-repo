/**
 * A toast with this plugin's default key, through `shared/toast.ts`, which picks the
 * `ToastActionCreators` call the running Discord build understands.
 */

import { showToast as sharedToast } from '../../../../shared/toast'

export interface ToastOptions {
	/** Discord shows one toast per key at a time; a second one with the same key replaces it. */
	key?: string
}

export function showToast(content: string, options?: ToastOptions) {
	sharedToast(content, options?.key ?? 'SendTweaksToast')
}
