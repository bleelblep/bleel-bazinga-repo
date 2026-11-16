import { Stores } from '@valenced/discord/flux'
import * as finders from '@valenced/modules/finders'
import * as filters from '@valenced/modules/finders/filters'
import { after, before } from '@valenced/patcher'
import { reportError } from '../../../../shared/report'
import { isPlaceholderFor, redactedName } from '../lib/alias'
import { noteNamePatch } from '../lib/diagnostics'
import { isEnabled, settings, withOriginalResolution } from '../lib/state'

const DEBUG: boolean = false

/**
 * The DM header: a friend nickname, when there is one.
 *
 * Re-checked against the 352.6 (352206) bundle on 2026-11-13. `DMChannelName` (functions 65639/
 * 65640) passes this selector (119064) to `useStateFromStores`:
 *
 * ```js
 * () => RelationshipStore.getNickname(userId) ?? UserUtils.getName(UserStore.getUser(userId)) ?? ""
 * ```
 *
 * `getName` is read off the module object at call time, so `patches/displayName.ts`'s `getName`
 * hook covers everyone *without* a friend nickname. Only a real friend nickname needs this hook.
 *
 * ## What changed in 0.27.16, and why
 *
 * Through 0.27.15 this hooked `getNickname` on four stores (Relationship, User, GuildMember,
 * Nickname) and answered "User N" even when there was **no** nickname. Every "does this person
 * have a nickname, and what is it?" question in the app got a placeholder, including the ones
 * Discord's nickname editors ask to fill their text box. Saving such a box would have sent the
 * placeholder to Discord as a real nickname (coding rule 8: a display filter on a getter that
 * also feeds a save). Now:
 *
 * - **Only `RelationshipStore`**, the one store the header asks. The server-nickname editor reads
 *   its own state (`handleSaveNickname` -> `changeNickname(guildId, …, state.nick)`), which no
 *   hook here touches any more.
 * - **No answer for "no nickname".** `null` stays `null`; `getName` takes it from there.
 * - **A save guard.** The friend-nickname editor (`AddFriendNicknameModal`) may still fill its box
 *   from `RelationshipStore.getNickname`, so `updateRelationship(userId, body)` (42236, an
 *   `HTTP.patch` to `USER_RELATIONSHIP`) is checked on the way out: a nickname equal to a
 *   placeholder this session showed for that user is swapped back for the real nickname, so the
 *   save changes nothing. Any other value goes through untouched; it is what the person typed.
 */

/** A Discord snowflake: 17–19 digits, nothing else. */
const SNOWFLAKE = /^\d{17,19}$/

const cleanups: Array<() => void> = []
let installed = false
let guardInstalled = false

/** Whether the friend-nickname hook is in, for the coverage report (lib/notices.ts). */
export function isDmHeaderPatched(): boolean {
	return installed
}

function patchStore(store: any) {
	let pendingUserId: string | undefined

	cleanups.push(
		before(store, 'getNickname', (args: any[]) => {
			try {
				// `getNickname(userId)`: only the plain one-snowflake form is the person.
				const list = Array.isArray(args) ? args : []
				const id = list[0]
				const shapeOk = list.length === 1 || list[1] == null
				pendingUserId =
					shapeOk && typeof id === 'string' && SNOWFLAKE.test(id)
						? id
						: undefined
			} catch {
				pendingUserId = undefined
			}
			// Must return the args array -- see docs/coding-rules.md rule 2.
			return args
		}),
	)

	cleanups.push(
		after(store, 'getNickname', (ret: any) => {
			const userId = pendingUserId
			pendingUserId = undefined

			try {
				// A real nickname only. No nickname stays "no nickname" (see the note above).
				if (typeof ret !== 'string' || !ret) return ret
				if (!isEnabled()) return ret
				if (!userId) return ret

				const { style, redactSelf, redactResolvedNames } = settings()
				if (!redactResolvedNames) return ret

				if (!redactSelf) {
					const { UserStore } = Stores as any
					if (UserStore?.getCurrentUser?.()?.id === userId) return ret
				}

				return redactedName(userId, style)
			} catch (error) {
				reportError('[ScreenshotRedactor] getNickname hook failed:', error)
			}

			return ret
		}),
	)

	if (DEBUG)
		console.log('[ScreenshotRedactor] hooked RelationshipStore.getNickname')
	noteNamePatch('RelationshipStore.getNickname (store)')
}

/** The real friend nickname, with every redaction hook standing down. */
function realNickname(userId: string): string | null {
	try {
		const nick = withOriginalResolution(() =>
			(Stores as any).RelationshipStore?.getNickname?.(userId),
		)
		return typeof nick === 'string' ? nick : null
	} catch {
		return null
	}
}

/**
 * `updateRelationship(userId, body)`: a placeholder on its way to Discord becomes the real
 * nickname again. The body is `{ nickname }` on 352.6; a bare string is handled too in case a build
 * passes it flat. Anything else (a type change, a different overload) is left alone.
 */
function guardSave(host: any) {
	cleanups.push(
		before(host, 'updateRelationship', (args: any[]) => {
			try {
				const userId = args?.[0]
				if (typeof userId !== 'string' || !SNOWFLAKE.test(userId)) return args
				const body = args[1]
				if (typeof body === 'string' && isPlaceholderFor(userId, body)) {
					const copy = [...args]
					copy[1] = realNickname(userId) ?? ''
					return copy
				}
				if (
					body &&
					typeof body === 'object' &&
					isPlaceholderFor(userId, body.nickname)
				) {
					const copy = [...args]
					copy[1] = { ...body, nickname: realNickname(userId) }
					return copy
				}
			} catch (error) {
				reportError('[ScreenshotRedactor] nickname save guard failed:', error)
			}
			// Must return the args array -- see docs/coding-rules.md rule 2.
			return args
		}),
	)
	if (DEBUG) console.log('[ScreenshotRedactor] guarding updateRelationship')
	noteNamePatch('updateRelationship (nickname save guard)')
}

/** The real server nickname, with every redaction hook standing down. */
function realGuildNickname(guildId: string, userId: string): string | null {
	try {
		const nick = withOriginalResolution(
			() =>
				(Stores as any).GuildMemberStore?.getMember?.(guildId, userId)?.nick,
		)
		return typeof nick === 'string' ? nick : null
	} catch {
		return null
	}
}

/**
 * `changeNickname`, the server-nickname save: `(guildId, userId, nick)` from the Change Nickname
 * sheet (`handleSaveNickname`, 352.6 function 62341), or `(guildId, channelId, userId, nick)`
 * (52057). The editor reads its own state, but `NicknameUtils.getNickname` (patches/displayName.ts,
 * kept for who-reacted rows) could have seeded it, so a placeholder is swapped back here too.
 */
function guardGuildSave(host: any) {
	cleanups.push(
		before(host, 'changeNickname', (args: any[]) => {
			try {
				const list = Array.isArray(args) ? args : []
				const guildId = list[0]
				const userIndex = list.length >= 4 ? 2 : 1
				const nickIndex = userIndex + 1
				const userId = list[userIndex]
				if (
					typeof guildId !== 'string' ||
					typeof userId !== 'string' ||
					!SNOWFLAKE.test(userId)
				)
					return args
				if (!isPlaceholderFor(userId, list[nickIndex])) return args
				const copy = [...list]
				copy[nickIndex] = realGuildNickname(guildId, userId) ?? ''
				return copy
			} catch (error) {
				reportError(
					'[ScreenshotRedactor] server nickname save guard failed:',
					error,
				)
			}
			// Must return the args array -- see docs/coding-rules.md rule 2.
			return args
		}),
	)
	noteNamePatch('changeNickname (nickname save guard)')
}

/** Both save guards, by the action creator each one lives on. */
function installGuard() {
	if (guardInstalled) return
	guardInstalled = true
	const watch = (key: string, guard: (host: any) => void) => {
		const seen = new Set<any>()
		const install = (mod: any) => {
			const host = typeof mod?.[key] === 'function' ? mod : mod?.default
			if (typeof host?.[key] !== 'function' || seen.has(host)) return
			seen.add(host)
			guard(host)
		}
		try {
			const { lookupModules, waitForModules } = finders
			const { withProps } = filters
			for (const [exports] of lookupModules(withProps(key))) install(exports)
			cleanups.push(
				waitForModules(withProps(key), (exports: any) => install(exports)),
			)
		} catch (error) {
			reportError(`[ScreenshotRedactor] could not look for ${key}:`, error)
		}
	}
	watch('updateRelationship', guardSave)
	watch('changeNickname', guardGuildSave)
}

/**
 * Installs if it hasn't already. Retried from the row hook: the `Stores` proxy resolves lazily
 * and need not be ready when `start()` runs.
 */
export function ensureDmHeaderPatched(): boolean {
	if (installed) return true
	try {
		const store = (Stores as any)?.RelationshipStore
		if (typeof store?.getNickname !== 'function') return false
		// The guard goes in before the hook it protects against, never after.
		installGuard()
		patchStore(store)
		installed = true
		return true
	} catch (error) {
		reportError(
			'[ScreenshotRedactor] failed to hook RelationshipStore.getNickname:',
			error,
		)
		return false
	}
}

export default function patchDmHeader(): () => void {
	// The save guards don't wait for the store: they go in at start, whatever else is ready.
	installGuard()
	if (!ensureDmHeaderPatched()) {
		if (DEBUG)
			console.log(
				'[ScreenshotRedactor] RelationshipStore not ready; will retry when chat renders',
			)
	}

	return () => {
		installed = false
		guardInstalled = false
		for (const unpatch of cleanups.splice(0).reverse()) {
			try {
				unpatch()
			} catch {
				/* already gone */
			}
		}
	}
}
