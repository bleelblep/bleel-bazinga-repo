/**
 * Logging out or switching account cancels everything still waiting.
 *
 * A held send belongs to the account that pressed send. Two Flux events say that account is
 * gone, read through Discord's own dispatcher with `subscribe` (a listener, not a dispatch patch,
 * so nothing here can block or change the event):
 *
 * - `LOGOUT`: cancel everything.
 * - `CONNECTION_OPEN`: the gateway is (re)connected; its `user.id` is the account now logged in.
 *   A plain reconnect has the same id and changes nothing; another id cancels.
 *
 * undo/holds.ts also re-reads the user id when a timer ends, so a switch these events miss still
 * cancels rather than sends. Only the user id is read, never the token (AS-01).
 */

import { Dispatcher } from '@valenced/discord/common/flux'
import { reportError } from '../../../../shared/report'
import { cancelAll, heldForOther } from './holds'
import { TAG } from './state'

export default function watchAccount(): () => void {
	const dispatcher = Dispatcher as any
	if (typeof dispatcher?.subscribe !== 'function') {
		reportError(
			`${TAG} no Flux subscribe; account changes are caught at send time only`,
		)
		return () => {}
	}
	const onLogout = () => {
		try {
			cancelAll('account')
		} catch (error) {
			reportError(`${TAG} cancelling on logout failed:`, error)
		}
	}
	const onConnectionOpen = (action: any) => {
		try {
			const id = action?.user?.id
			if (heldForOther(typeof id === 'string' ? id : undefined))
				cancelAll('account')
		} catch (error) {
			reportError(`${TAG} cancelling on account change failed:`, error)
		}
	}
	dispatcher.subscribe('LOGOUT', onLogout)
	dispatcher.subscribe('CONNECTION_OPEN', onConnectionOpen)
	return () => {
		try {
			dispatcher.unsubscribe?.('LOGOUT', onLogout)
			dispatcher.unsubscribe?.('CONNECTION_OPEN', onConnectionOpen)
		} catch {
			/* already gone */
		}
	}
}
