/**
 * Which account is logged in, by user id only (never the token, account-safety AS-01).
 *
 * A held send belongs to the account that pressed send. undo/holds.ts reads this when it holds a
 * message and again just before releasing it, and undo/watchAccount.ts cancels everything on
 * `LOGOUT` or a `CONNECTION_OPEN` for another user. `valenced.*` is only read inside functions
 * (coding rule 1).
 */

import { Stores } from '@valenced/discord/flux'

export function currentUserId(): string | undefined {
	try {
		const id = (Stores as any).UserStore?.getCurrentUser?.()?.id
		return typeof id === 'string' && id ? id : undefined
	} catch {
		return undefined
	}
}
