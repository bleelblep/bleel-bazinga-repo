/**
 * Making the React surfaces re-resolve names.
 *
 * The single-DM header resolves its name inside a `useStateFromStores([RelationshipStore,
 * UserStore], selector, [userId])` (read from the shipped bundle). An emit on either store
 * makes the memoized selector re-run — so once the resolvers are hooked, nudging those stores
 * is all it takes to hide or restore the name on toggle.
 *
 * The group-DM header is a different component. The plugin can't read its subscriptions from
 * the minified bytecode, and neither the targeted stores nor the full callback sweep repaints it
 * immediately. Its redacted names appear only after a channel refresh or switch. The sweep is
 * retained for other resolver-backed surfaces and future Discord builds where the subscription
 * path may differ.
 *
 * `RelationshipStore` is where a friend nickname comes from and is the first thing the header
 * asks; `UserStore` supplies the object for the `getName` fallback. The rest of the targeted
 * list covers the member list, profile sheets, and other resolver-backed surfaces.
 */

import { Stores } from '@valenced/discord/flux'

const STORE_NAMES = [
	'RelationshipStore',
	'UserStore',
	'ChannelStore',
	'GuildMemberStore',
	// Not SelectedChannelStore (through 0.27.15): listeners on "which channel is open" can act on
	// a change -- mark it read, load messages -- and no header redaction depended on it.
	'PresenceStore',
	'MessageReactionsStore',
	'TypingStore',
]

const EMIT_METHODS = ['emitChange', 'doEmitChanges']

/**
 * Emits on one store, by whatever mechanism this build gives it.
 *
 * The vendored types (`DiscordModules.Flux.Store`) document the fallback: every store carries
 * `_changeCallbacks` and `_reactChangeCallbacks`, each with `invokeAll()`. `useStateFromStores`
 * — the memoized hook the headers use — subscribes through `addReactChangeListener`, so
 * invoking the react callback set re-runs it *directly*, whether or not the store's own
 * `emitChange` exists or decides a no-op isn't worth broadcasting.
 *
 * @returns a description of what fired, or undefined if nothing did.
 */
function emitOn(store: any): string | undefined {
	for (const method of EMIT_METHODS) {
		try {
			if (typeof store?.[method] === 'function') {
				store[method]()
				return method
			}
		} catch {
			/* fall through to the callback sets */
		}
	}

	let invoked: string | undefined
	for (const key of ['_reactChangeCallbacks', '_changeCallbacks'] as const) {
		try {
			const callbacks = store?.[key]
			if (
				typeof callbacks?.invokeAll === 'function' &&
				callbacks.hasAny?.() !== false
			) {
				callbacks.invokeAll()
				invoked = key
			}
		} catch {
			/* next set */
		}
	}
	return invoked
}

/** @returns the "Store.method" descriptions of everything it managed to call. */
export function nudgeStores(): string[] {
	let stores: any
	try {
		stores = Stores as any
	} catch {
		return []
	}

	const called: string[] = []

	// The stores the headers are known to subscribe to, first and reported individually.
	for (const name of STORE_NAMES) {
		try {
			const how = emitOn(stores?.[name])
			if (how) called.push(`${name}.${how}`)
		} catch {
			/* try the next store */
		}
	}

	return called
}
