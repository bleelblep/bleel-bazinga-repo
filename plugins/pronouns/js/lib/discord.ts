/**
 * Discord's own pronouns, from the profile store.
 *
 * Pronouns are NOT on the UserRecord — they arrive with the profile, into
 * `modules/user_profile/UserProfileStore.tsx`. `getUserProfile(userId)?.pronouns` holds the user's
 * own; `getGuildMemberProfile(userId, guildId)?.pronouns` the guild-specific one, which wins when
 * it is set (the same precedence as DisplayProfile).
 *
 * Missing profiles are fetched with `fetchProfile(userId, { guildId })` from
 * `actions/UserActionCreators.tsx`, the call opening a profile makes. 0.2.0 and earlier used
 * `maybeFetchUserProfile(userId)`, which skips anyone whose user profile is already loaded and
 * never loads the guild member profile, so guild pronouns only appeared after opening the
 * profile (verified on 350.4, 2026-10-11). Fetches go one at a time, paced, and a failed one is
 * retried with backoff instead of being written off for the session.
 *
 * The store comes from `getStore`, which answers at once when it is already registered and waits
 * otherwise, so a cold launch and a late start (switched on from the plugin list) both land in
 * the same callback.
 */

import { getStore, Stores } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { reportError } from '../../../../shared/report'
import { tidy } from './validate'
import type { DiscordModules } from '@valenced/discord/types'

const TAG = '[Pronouns]'

interface Profile {
	pronouns?: string
}

/** modules/user_profile/UserProfileStore.tsx */
export interface UserProfileStore {
	getUserProfile(userId: string): Profile | undefined
	getGuildMemberProfile(userId: string, guildId: string): Profile | undefined
}

/** actions/UserActionCreators.tsx */
interface UserActionCreators {
	fetchProfile(userId: string, options?: { guildId?: string }): unknown
	fetchCurrentUser(): unknown
}

interface UserRecord {
	username: string
	globalName?: string | null
}

interface UserStore {
	getUser(id: string): UserRecord | undefined
}

let store: UserProfileStore | undefined
let fetchProfile: UserActionCreators['fetchProfile'] | undefined

export function watchDiscord(): () => void {
	let active = true

	const unsubStore = getStore<UserProfileStore>('UserProfileStore', found => {
		store = found
		try {
			found.addChangeListener(() => {
				if (active) for (const listener of listeners) listener()
			})
		} catch (error) {
			reportError(`${TAG} profile store subscription failed:`, error)
		}
		// Rows drawn before the store was found are waiting on it; redraw them.
		if (active) for (const listener of listeners) listener()
	})

	const unsubActions = getModules(
		withProps<UserActionCreators>('fetchProfile', 'fetchCurrentUser'),
		exports => {
			// The export is usually on `default` (coding rule 3), but a namespace match carries
			// the functions directly.
			const fn =
				exports.fetchProfile ??
				(exports as { default?: UserActionCreators }).default?.fetchProfile
			if (typeof fn === 'function') {
				fetchProfile = fn
				pump()
			}
		},
	)

	return () => {
		active = false
		unsubStore()
		unsubActions()
		store = undefined
		fetchProfile = undefined
		resetQueue()
	}
}

const listeners = new Set<() => void>()

/** Fires when a profile may have landed, for redrawing rows that were waiting on one. */
export function onProfileChange(listener: () => void): () => void {
	listeners.add(listener)
	return () => listeners.delete(listener)
}

/** The first non-empty pronouns value: guild profile first, then the user's own. */
export function discordPronouns(
	userId: string,
	guildId?: string,
): string | undefined {
	if (!store) return undefined
	try {
		// A guild field that only looks filled (`ㅤ`, zero-width spaces) falls back to the account's.
		const guild = guildId
			? tidy(store.getGuildMemberProfile(userId, guildId)?.pronouns)
			: undefined
		return guild ?? tidy(store.getUserProfile(userId)?.pronouns)
	} catch {
		return undefined
	}
}

/** Their current Discord name, falling back to [saved] (the name kept with a list entry). */
export function nameOf(id: string, saved?: string): string {
	try {
		const UserStore = Stores.UserStore as DiscordModules.Flux.Store<UserStore>
		const user = UserStore.getUser(id)
		const name = user?.globalName ?? user?.username
		if (name) return name
	} catch {
		/* store not ready */
	}
	return saved || `User ${id}`
}

/**
 * Whether the store already holds what the badge needs. In a guild that's the guild member
 * profile, plus the user profile unless the guild one has its own pronouns: an empty guild field
 * falls back to the account's. Discord loads your own guild member profile early without your user
 * profile, so a guild profile alone left your own pronouns ("any") unfetched for the session.
 */
function loaded(userId: string, guildId?: string): boolean {
	if (!store) return false
	try {
		const user = !!store.getUserProfile(userId)
		if (!guildId) return user
		const member = store.getGuildMemberProfile(userId, guildId)
		if (!member) return false
		return !!tidy(member.pronouns) || user
	} catch {
		return false
	}
}

// ---- The fetch queue ---------------------------------------------------------------------------

/** Spacing between starting profile requests: a busy channel shouldn't trip Discord's rate limit. */
const GAP_MS = 150
/** Requests in flight at once. One at a time took 10+ seconds to reach a busy channel's last author. */
const MAX_IN_FLIGHT = 3
/**
 * A request that hasn't answered by now is treated as failed and retried later. Before 0.4.5 one
 * request that never settled kept the queue "busy" for the rest of the session, so badges only
 * appeared for profiles the user opened (Discord fetches those itself). Seen on 351.3, 2026-10-18:
 * visible authors stayed unfetched while a direct fetchProfile answered in under 0.5 s.
 */
const TIMEOUT_MS = 8_000
const MAX_TRIES = 4
const RETRY_MS = [5_000, 30_000, 120_000]

interface Job {
	userId: string
	guildId?: string
	tries: number
	notBefore: number
	done: boolean
	running: boolean
}

/** `userId:guildId` → its attempt state. `done` keys are never fetched again this session. */
const jobs = new Map<string, Job>()
let inFlight = 0
let timer: ReturnType<typeof setTimeout> | undefined

function resetQueue() {
	jobs.clear()
	inFlight = 0
	if (timer !== undefined) clearTimeout(timer)
	timer = undefined
}

function schedule(delay: number) {
	if (timer !== undefined) return
	timer = setTimeout(() => {
		timer = undefined
		pump()
	}, delay)
}

/** The newest due job: rows just drawn are the ones on screen. */
function nextJob(now: number): { job?: Job; soonest: number } {
	let soonest = Number.POSITIVE_INFINITY
	const all = [...jobs.values()]
	for (let i = all.length - 1; i >= 0; i--) {
		const job = all[i]
		if (!job || job.done || job.running) continue
		if (loaded(job.userId, job.guildId)) {
			// Landed some other way (someone opened the profile).
			job.done = true
			continue
		}
		if (job.notBefore <= now) return { job, soonest }
		soonest = Math.min(soonest, job.notBefore)
	}
	return { soonest }
}

/** A rejection from Discord's HTTP layer; a 429 carries Discord's own wait in seconds. */
interface FetchFailure {
	body?: { retry_after?: number }
}

/** Starts the next due fetch while there's room; up to MAX_IN_FLIGHT at a time. */
function pump() {
	if (inFlight >= MAX_IN_FLIGHT || typeof fetchProfile !== 'function') return
	const now = Date.now()
	const { job, soonest } = nextJob(now)
	if (!job) {
		if (soonest !== Number.POSITIVE_INFINITY) schedule(soonest - now)
		return
	}
	inFlight++
	job.running = true
	job.tries++
	let settled = false
	const finish = (ok: boolean, retryAfterMs?: number) => {
		if (settled) return
		settled = true
		clearTimeout(timeout)
		inFlight--
		job.running = false
		if (ok || loaded(job.userId, job.guildId) || job.tries >= MAX_TRIES) {
			job.done = true
		} else {
			job.notBefore =
				Date.now() +
				Math.max(
					retryAfterMs ?? 0,
					RETRY_MS[job.tries - 1] ?? RETRY_MS[RETRY_MS.length - 1] ?? 0,
				)
		}
		schedule(GAP_MS)
	}
	const timeout = setTimeout(() => finish(false), TIMEOUT_MS)
	try {
		const result = fetchProfile(
			job.userId,
			job.guildId ? { guildId: job.guildId } : undefined,
		)
		if (result instanceof Promise) {
			result.then(
				() => finish(true),
				(error: FetchFailure | undefined) => {
					const retryAfter = Number(error?.body?.retry_after)
					finish(
						false,
						Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined,
					)
				},
			)
		} else {
			finish(true)
		}
	} catch (error) {
		reportError(`${TAG} profile fetch failed:`, error)
		finish(false)
	}
	// Room for another: start it after the gap.
	if (inFlight < MAX_IN_FLIGHT) schedule(GAP_MS)
}

/**
 * Queues a profile fetch when the store lacks what the badge needs: the guild member profile in a
 * guild (it can carry its own pronouns, and fetching it brings the user profile too), else the
 * user profile. Cheap to call on every render; each user/guild pair is fetched at most once per
 * session unless it fails, in which case it is retried with backoff.
 */
export function fetchOnMiss(userId: string, guildId?: string) {
	const key = `${userId}:${guildId ?? ''}`
	const existing = jobs.get(key)
	if (existing) {
		// Drawn again: move a waiting job to the front (the newest end) of the queue.
		if (!existing.done && !existing.running && existing.tries === 0) {
			jobs.delete(key)
			jobs.set(key, existing)
		}
		return
	}
	if (loaded(userId, guildId)) return
	jobs.set(key, {
		userId,
		guildId,
		tries: 0,
		notBefore: 0,
		done: false,
		running: false,
	})
	schedule(0)
}
