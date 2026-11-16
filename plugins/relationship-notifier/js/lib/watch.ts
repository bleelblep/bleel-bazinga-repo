/**
 * Keeps a list of your friends, requests, servers and group DMs, and compares Discord's stores
 * against it whenever they change.
 *
 * Comparing lists rather than reacting to single events is what lets this catch changes made
 * while Discord was closed, and it means the names are always the ones we saved: by the time a
 * removal reaches a store, Discord has already forgotten who it was.
 *
 * Timing:
 *
 * - Before the gateway connects, the stores hold the phone's cache, which can be days old. So
 *   nothing is compared until `CONNECTION_OPEN`, and then only after `SETTLE_MS`, by which time
 *   the follow-up events (private channels, lazily sent servers) have landed. That first check is
 *   the "while you were away" one. The same happens after every full reconnect.
 * - After that, a change to RelationshipStore, GuildStore, ChannelStore or UserStore schedules a
 *   check `DEBOUNCE_MS` later, so a burst of updates costs one comparison.
 * - `LOGOUT` stops checking until the next connect. Lists are kept per account, so switching
 *   accounts compares each one with its own list.
 *
 * `CONNECTION_OPEN` and `LOGOUT` are read with Discord's dispatcher `subscribe`, a listener, so
 * nothing here can change or block them. Nothing is sent or requested (AS-02, AS-03): this only
 * reads stores and writes the plugin's own storage.
 */

import { Dispatcher } from '@valenced/discord/common/flux'
import { Stores } from '@valenced/discord/flux'
import { reportError } from '../../../../shared/report'
import { showToast } from '../../../../shared/toast'
import { cancelAvatars, forget, saveAvatar } from './avatars'
import { diff, sameSnapshot, strip } from './diff'
import { isMine } from './mine'
import { currentUserId, readCurrent, storesReady } from './snapshot'
import { settings } from './state'
import { TAG } from './tag'
import { sentence } from './text'
import type { RelationshipEvent, RelationshipNotifierStorage } from '../types'

const DEBUG: boolean = false

const SETTLE_MS = 10_000
const DEBOUNCE_MS = 1_500
/** Connect checks before a part-loaded-looking list is taken as it is. */
const TRIES = 3
/** More than this many live changes at once get one summary toast instead of one each. */
const MAX_TOASTS = 3

const log = (...m: unknown[]) => {
	if (DEBUG) console.log(TAG, ...m)
}

function wanted(e: RelationshipEvent, s: RelationshipNotifierStorage): boolean {
	if (e.byYou && !s.includeMine) return false
	switch (e.kind) {
		case 'friend':
			return s.watchFriends
		case 'incoming':
		case 'outgoing':
			return s.watchRequests
		case 'name':
			return s.watchNames
		case 'newfriend':
			return s.watchNewFriends
		case 'avatar':
			return s.watchAvatars
		case 'guild':
			return s.watchGuilds
		case 'groupdm':
			return s.watchGroupDms
	}
}

function toast(events: RelationshipEvent[], away: boolean) {
	// Your own changes never pop up: you just did them.
	const shown = events.filter(e => !e.byYou)
	if (!shown.length) return
	try {
		if (away) {
			const text =
				shown.length === 1
					? `While you were away: ${sentence(shown[0])}`
					: `While you were away: ${shown.length} changes. See Relationship Notifier's history.`
			showToast(text, 'relationship-notifier:away')
			return
		}
		if (shown.length > MAX_TOASTS) {
			showToast(
				`${shown.length} changes. See Relationship Notifier's history.`,
				'relationship-notifier:many',
			)
			return
		}
		for (const e of shown)
			showToast(sentence(e), `relationship-notifier:${e.id}`)
	} catch (error) {
		reportError(`${TAG} showing a toast failed:`, error)
	}
}

export function watchRelationships(
	jsonStorage: ValencedJsonStorageApi<RelationshipNotifierStorage>,
	startedLate: boolean,
): () => void {
	let live = false
	let settleTimer: ReturnType<typeof setTimeout> | undefined
	let debounceTimer: ReturnType<typeof setTimeout> | undefined
	let stopped = false

	/** Saves both pictures of an avatar change, then adds their paths to its history entry. */
	const keepAvatars = (e: RelationshipEvent) => {
		Promise.all([
			saveAvatar(e.targetId, e.oldIconHash),
			saveAvatar(e.targetId, e.iconHash),
		])
			.then(([oldFile, newFile]) => {
				if (!oldFile && !newFile) return
				const log = settings().log ?? []
				if (stopped || !log.some(entry => entry.id === e.id)) {
					// Cleared, trimmed or stopped meanwhile: don't leave the files behind.
					forget([oldFile, newFile])
					return
				}
				jsonStorage.set({
					log: log.map(entry =>
						entry.id === e.id
							? {
									...entry,
									...(oldFile ? { oldFile } : {}),
									...(newFile ? { newFile } : {}),
								}
							: entry,
					),
				})
			})
			.catch(error => reportError(`${TAG} keeping avatars failed:`, error))
	}

	/** Returns false when a list looked part-loaded and the check should run again. */
	const check = (away: boolean, lastTry = true): boolean => {
		if (stopped) return true
		try {
			if (!storesReady()) {
				reportError(
					`${TAG} Discord's friend, server or channel store is missing; nothing is being watched`,
				)
				return true
			}
			const account = currentUserId()
			if (!account) return true
			const s = settings()
			const before = s.accounts?.[account]
			const now = readCurrent(before)
			const next = strip(now)

			if (!before) {
				// First look at this account: remember it, report nothing.
				log(
					`first snapshot for this account: ${next.friends.length} friends, ${next.guilds.length} servers`,
				)
				jsonStorage.set({ accounts: { [account]: next } })
				return true
			}

			const at = Date.now()
			const result = diff(before, now, isMine, at, away)
			if (result.partial && !lastTry) {
				log('a list looks part-loaded; looking again shortly')
				return false
			}
			const events = result.events.filter(e => wanted(e, s))
			if (events.length) {
				log(`${events.length} change(s)${away ? ' while away' : ''}`)
				const all = [...events, ...(s.log ?? [])]
				const kept = all.slice(0, Math.max(1, s.maxEntries))
				forget(all.slice(kept.length).flatMap(e => [e.oldFile, e.newFile]))
				jsonStorage.set({ log: kept, accounts: { [account]: next } })
				if (s.toastOnEvent) toast(events, away)
				for (const e of events) if (e.kind === 'avatar') keepAvatars(e)
			} else if (!sameSnapshot(before, next)) {
				jsonStorage.set({ accounts: { [account]: next } })
			}
		} catch (error) {
			reportError(`${TAG} comparing failed:`, error)
		}
		return true
	}

	/** The connect check, looked at up to `TRIES` times while a list still seems to be loading. */
	const settle = (delay: number, attempt = 1) => {
		live = false
		if (debounceTimer) clearTimeout(debounceTimer)
		if (settleTimer) clearTimeout(settleTimer)
		settleTimer = setTimeout(() => {
			settleTimer = undefined
			if (check(true, attempt >= TRIES)) live = true
			else settle(delay, attempt + 1)
		}, delay)
	}

	const onChange = () => {
		if (!live || stopped) return
		if (debounceTimer) clearTimeout(debounceTimer)
		debounceTimer = setTimeout(() => {
			debounceTimer = undefined
			check(false)
		}, DEBOUNCE_MS)
	}

	const onConnectionOpen = () => {
		try {
			settle(SETTLE_MS)
		} catch (error) {
			reportError(`${TAG} handling connect failed:`, error)
		}
	}

	const onLogout = () => {
		cancelAvatars()
		live = false
		if (settleTimer) clearTimeout(settleTimer)
		if (debounceTimer) clearTimeout(debounceTimer)
		settleTimer = debounceTimer = undefined
	}

	const dispatcher = Dispatcher as any
	const subscribed = typeof dispatcher?.subscribe === 'function'
	if (subscribed) {
		dispatcher.subscribe('CONNECTION_OPEN', onConnectionOpen)
		dispatcher.subscribe('LOGOUT', onLogout)
	} else {
		reportError(`${TAG} no Flux subscribe; changes can't be watched`)
	}

	const watched: any[] = []
	for (const name of [
		'RelationshipStore',
		'GuildStore',
		'ChannelStore',
		'UserStore',
	]) {
		try {
			const store = (Stores as any)[name]
			if (typeof store?.addChangeListener === 'function') {
				store.addChangeListener(onChange)
				watched.push(store)
			}
		} catch (error) {
			reportError(`${TAG} listening to ${name} failed:`, error)
		}
	}

	// Turned on mid-session: Discord is already connected, so there is no CONNECTION_OPEN to
	// wait for. A short wait still lets this start() finish first.
	if (startedLate) settle(2_000)

	return () => {
		stopped = true
		cancelAvatars()
		live = false
		if (settleTimer) clearTimeout(settleTimer)
		if (debounceTimer) clearTimeout(debounceTimer)
		for (const store of watched) {
			try {
				store.removeChangeListener?.(onChange)
			} catch {
				/* already gone */
			}
		}
		if (subscribed) {
			try {
				dispatcher.unsubscribe?.('CONNECTION_OPEN', onConnectionOpen)
				dispatcher.unsubscribe?.('LOGOUT', onLogout)
			} catch {
				/* already gone */
			}
		}
	}
}
