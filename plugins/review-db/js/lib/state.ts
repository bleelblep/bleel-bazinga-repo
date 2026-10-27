/**
 * Plugin storage, and the signed-in ReviewDB account for whichever Discord account is active.
 *
 * Tokens are kept per Discord user id, as on desktop, so switching accounts doesn't post reviews
 * as the wrong person. `jsonStorage.set()` merges and can never delete a key (coding rule 6), so
 * logging out writes an empty token rather than removing the entry.
 */

import type { ReviewDBCurrentUser } from './entities'
import { Stores } from '@valenced/discord/flux'
import * as React from 'react'
import { reportError } from '../../../../shared/report'

export interface AccountAuth {
	token?: string
	user?: ReviewDBCurrentUser
}

export interface ReviewDBStorage {
	notifyReviews: boolean
	showWarning: boolean
	hideTimestamps: boolean
	hideBlockedUsers: boolean
	/** Private: the newest review id seen on your own profile, for the "new reviews" toast. */
	lastReviewId: number
	auth: Record<string, AccountAuth>
}

/** Also the fallback for every read. */
export const DEFAULTS: ReviewDBStorage = {
	notifyReviews: true,
	showWarning: true,
	hideTimestamps: false,
	hideBlockedUsers: true,
	lastReviewId: 0,
	auth: {},
}

type Storage = ValencedPluginStartApi<ReviewDBStorage>['jsonStorage']

let storage: Storage | undefined
let unsubscribe: (() => void) | undefined

/**
 * One in-memory copy of the settings. `jsonStorage.get()` is async (a Promise), so reads come from
 * here instead, and each storage handle keeps its own `cache` (the settings page gets a different
 * handle), so this copy also follows `subscribe`, which fires for writes through any handle.
 */
let mirror: ReviewDBStorage = structuredCloneish(DEFAULTS)

function structuredCloneish<T>(value: T): T {
	return JSON.parse(JSON.stringify(value))
}

function isPlainObject(value: unknown): value is Record<string, any> {
	return !!value && typeof value === 'object' && !Array.isArray(value)
}

function deepMerge(target: Record<string, any>, patch: Record<string, any>) {
	for (const [key, value] of Object.entries(patch ?? {})) {
		if (isPlainObject(value) && isPlainObject(target[key])) deepMerge(target[key], value)
		else target[key] = isPlainObject(value) ? structuredCloneish(value) : value
	}
	return target
}

export function setStorage(next: Storage | undefined) {
	unsubscribe?.()
	unsubscribe = undefined
	storage = next
	mirror = structuredCloneish(DEFAULTS)
	if (!next) return
	if (next.cache) deepMerge(mirror, next.cache as any)
	unsubscribe = next.subscribe((update: any, mode: number) => {
		// 0 = merge; 1 / 2 = replace / load from disk.
		if (mode === 0) deepMerge(mirror, update)
		else mirror = deepMerge(structuredCloneish(DEFAULTS), update) as ReviewDBStorage
		notify()
	})
	// In case the file finished loading after `cache` was read.
	next.get()
		.then(value => {
			if (value) mirror = deepMerge(structuredCloneish(DEFAULTS), value as any) as ReviewDBStorage
			notify()
		})
		.catch(() => {})
}

export function getStorage(): Storage | undefined {
	return storage
}

export function settings(): ReviewDBStorage {
	return mirror
}

function write(patch: Record<string, any>) {
	deepMerge(mirror, patch)
	notify()
	storage?.set(patch as any).catch(error => reportError('[ReviewDB] could not save settings:', error))
}

export function setSetting<K extends keyof ReviewDBStorage>(key: K, value: ReviewDBStorage[K]) {
	write({ [key]: value })
}

export function currentUserId(): string | undefined {
	try {
		return (Stores as any).UserStore?.getCurrentUser?.()?.id
	} catch {
		return undefined
	}
}

export function getAuth(): AccountAuth {
	const id = currentUserId()
	if (!id) return {}
	return mirror.auth?.[id] ?? {}
}

export function getToken(): string | undefined {
	return getAuth().token || undefined
}

export function updateAuth(next: AccountAuth) {
	const id = currentUserId()
	if (!id || !storage) return
	const patch: AccountAuth = {}
	if (next.token !== undefined) patch.token = next.token
	if (next.user !== undefined) patch.user = next.user
	write({ auth: { [id]: patch } })
}

export function logOut() {
	const id = currentUserId()
	if (!id || !storage) return
	// A merge can't delete keys, so blank them.
	write({ auth: { [id]: { token: '', user: null } } })
}

const listeners = new Set<() => void>()

function notify() {
	for (const listener of listeners) listener()
}

/** Re-renders whenever the settings change, through any handle. */
export function useSettings(): ReviewDBStorage {
	const [, rerender] = React.useReducer((n: number) => n + 1, 0)
	React.useEffect(() => {
		listeners.add(rerender)
		return () => {
			listeners.delete(rerender)
		}
	}, [])
	return mirror
}
