/**
 * Leaving Discord cancels everything still waiting.
 *
 * A held message lives only in memory with a JS timer behind it, and Android can freeze or kill
 * the app in the background. Sending from there would be an account action nobody is watching
 * (account-safety AS-07), so the moment the app goes to the background anything held is
 * cancelled and put back in its chat's box (undo/holds.ts `cancelAll`). Only `background` counts:
 * iOS reports `inactive` for a pulled-down notification shade, and the wait carries on then.
 *
 * `AppState` is read inside the function (docs/coding-rules.md rule 1).
 */

import * as ReactNative from 'react-native'
import { reportError } from '../../../../shared/report'
import { cancelAll } from './holds'
import { TAG } from './state'

export default function watchAppState(): () => void {
	try {
		const { AppState } = ReactNative as any
		if (typeof AppState?.addEventListener !== 'function') return () => {}
		const subscription = AppState.addEventListener(
			'change',
			(state: string) => {
				if (state === 'background') cancelAll('background')
			},
		)
		return () => {
			try {
				if (typeof subscription?.remove === 'function') subscription.remove()
				else AppState.removeEventListener?.('change', subscription)
			} catch {
				/* already gone */
			}
		}
	} catch (error) {
		reportError(`${TAG} could not watch the app state:`, error)
		return () => {}
	}
}
