import { Stores } from '@valenced/discord/flux'
import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import * as finders from '@valenced/modules/finders'
import * as filters from '@valenced/modules/finders/filters'
import { reportError } from '../../../../shared/report'
import { redactedAvatarUrl } from '../lib/alias'
import { noteAvatarPatch, noteResolverSkipped } from '../lib/diagnostics'
import {
	patchResolver,
	ResolverSlots,
	resolverHosts,
} from '../lib/resolverHooks'
import { isEnabled, settings } from '../lib/state'
import { findUserIdField, findUserObject } from '../lib/userArgs'

const DEBUG: boolean = false

/**
 * The avatar beside a name, on every surface that isn't a message row.
 *
 * ## Why the DM header name redacted and the face next to it didn't
 *
 * Because they are resolved by two entirely different mechanisms, and this plugin only had one of
 * them. Traced through the shipped bundle (coding rule 5), the header avatar's path is:
 *
 * ```
 * PrivateChannelHeader                       fn 75860
 *   → renderUserAvatar(user, status, …)      fn 75956, ChannelHeaderShared.tsx
 *     → <UserAvatar user={user} … />         fn 75946
 *       → <Avatar user={user} size={…} />    fn 92365
 *         → user.getAvatarSource(guildId, animate, size)      ← UserRecord.prototype method
 *           → getAnimatableSourceWithFallback(animate, cb)
 *             → cb → AvatarUtils.getUserAvatarSource(user, animate, size)
 * ```
 *
 * Nothing in that chain touches a row, a name resolver or a Flux store. `Avatar` is handed the
 * whole `user` record and derives the image itself, so the header name going through
 * `RelationshipStore.getNickname` (which `patches/dmHeader.ts` hooks) said nothing at all about
 * the avatar sitting next to it. Redaction covered message-row avatars because those arrive as an
 * `avatarURL` **string** on the flat row object, which `lib/rowSchema.ts` rewrites; the header
 * never produces one.
 *
 * This is the third bug in this plugin with the same shape — `getNickname` was a store method,
 * `getAvatarSource` is a record method, and both were being looked for as module exports. The
 * useful generalisation: **if a surface is handed a record rather than a string, the string is
 * being computed somewhere this plugin isn't looking.**
 *
 * ## Where the hook goes
 *
 * On `utils/AvatarUtils.tsx`, not on `UserRecord.prototype`. The record's methods reach the utils
 * through a property read on the required namespace at call time —
 *
 * ```
 * GetById reg3, reg4, 'getUserAvatarSource'          // inside UserRecord.prototype.getAvatarSource
 * GetById reg3, reg4, 'getGuildMemberAvatarURLSimple'
 * ```
 *
 * — so patching the export is visible to it, and to every other caller in the app at the same
 * time: the member list, profile sheets, facepiles, the mention autocomplete. Patching the record
 * prototype would need an instance to reach it from and would cover strictly less.
 *
 * The same module reached by the same means as the name resolvers, and for the same reasons:
 * `valenced.discord.utils.modules.finders.getModuleWithImportedPath` is uncapped, uncached and
 * self-unsubscribing. See the header of `patches/displayName.ts` for why the `getModules` +
 * `withProps` route silently installs nothing here.
 */

/** Discord's own source path for the module. Read from the bundle, not guessed. */
const MODULE_PATH = 'utils/AvatarUtils.tsx'

/**
 * Resolvers that return a URL **string**.
 *
 * `getUserAvatarURL(user, canAnimate, size, format, canWebP)` and
 * `getGuildMemberAvatarURL(…)` take a user record; `getGuildMemberAvatarURLSimple({ guildId,
 * avatar, userId, canAnimate, size })` takes a descriptor, which is why `lib/userArgs.ts` has to
 * find a subject two ways.
 */
const URL_RESOLVERS = [
	'getUserAvatarURL',
	'getUserAvatarURLWithoutFallback',
	'getGuildMemberAvatarURL',
	'getGuildMemberAvatarURLSimple',
]

/**
 * Resolvers that return a React Native image *source* rather than a URL.
 *
 * `getUserAvatarSource` is the one the DM header actually reaches. It returns `makeSource(url)`
 * — normally `{ uri }`, but for a user with no avatar set it can return a bundled asset id (a
 * plain number), because `DEFAULT_AVATARS` is a list of `require`d images rather than URLs.
 */
const SOURCE_RESOLVERS = ['getUserAvatarSource', 'getGuildMemberAvatarSource']

/**
 * Whether this call should be redacted, and for whom.
 *
 * Gated on `redactAvatars` **and** `redactResolvedNames`: the first is "replace faces at all",
 * the second is "cover surfaces outside the message list". Someone who has turned the second off
 * because a resolver hook is misbehaving should not keep getting avatar rewrites from it.
 *
 * @returns the user id to redact for, or undefined to leave the call alone.
 */
function subjectOf(args: any[]): string | undefined {
	if (!isEnabled()) return undefined

	const { redactAvatars, redactResolvedNames } = settings()
	if (!redactAvatars || !redactResolvedNames) return undefined

	const userId = findUserObject(args)?.id ?? findUserIdField(args)
	if (!userId) return undefined

	if (!settings().redactSelf) {
		const { UserStore } = Stores as any
		if (UserStore?.getCurrentUser?.()?.id === userId) return undefined
	}

	return userId
}

function patchOne(
	namespace: any,
	key: string,
	kind: 'url' | 'source',
	cleanups: Array<() => void>,
) {
	cleanups.push(
		patchResolver(namespace, key, subjectOf, (ret, userId) => {
			try {
				if (!userId) return ret

				const placeholder = redactedAvatarUrl(userId)

				if (kind === 'url') {
					// Only a string is replaced. `getUserAvatarURLWithoutFallback` returns null
					// for a user with no avatar set, and callers branch on that -- handing them a
					// URL would tell them an avatar exists when none does.
					return typeof ret === 'string' ? placeholder : ret
				}

				// A source. `{ uri }` is rewritten in place of its URL so any sibling fields
				// (width, height, headers, the animated/static pair) survive.
				if (ret && typeof ret === 'object') {
					if (typeof (ret as any).uri === 'string')
						return { ...ret, uri: placeholder }
					return ret
				}

				// A bundled asset id, which is what a user with no avatar resolves to. Discord
				// picks that asset from the user's id, so it is a stable six-way narrowing of the
				// account across unrelated screenshots -- exactly what `redactedAvatarUrl` exists
				// to break. An image source object is valid anywhere an asset id is.
				if (typeof ret === 'number') return { uri: placeholder }

				return ret
			} catch (error) {
				reportError('[ScreenshotRedactor] avatar hook failed:', error)
			}

			return ret
		}),
	)

	if (DEBUG) console.log(`[ScreenshotRedactor] hooked avatar resolver: ${key}`)
	noteAvatarPatch(key)
}

/** @returns how many hooks were installed. */
function patchNamespace(
	mod: any,
	seen: ResolverSlots,
	cleanups: Array<() => void>,
): number {
	let hooked = 0

	const install = (key: string, kind: 'url' | 'source') => {
		try {
			// Both shapes, for the same reason as the name resolvers: `withProps` matches a
			// module whose helper is one level down on `default` (coding rule 3).
			for (const host of resolverHosts(mod, key)) {
				if (seen.has(host, key)) continue
				patchOne(host, key, kind, cleanups)
				seen.add(host, key)
				hooked++
			}
		} catch (error) {
			reportError(`[ScreenshotRedactor] failed to patch ${key}:`, error)
		}
	}

	for (const key of URL_RESOLVERS) install(key, 'url')
	for (const key of SOURCE_RESOLVERS) install(key, 'source')

	return hooked
}

export default function patchAvatar(): () => void {
	const cleanups: Array<() => void> = []
	const unsubscribes: Array<() => void> = []
	const seen = new ResolverSlots()
	// The sweep is for a build where the path has moved; once the path has answered it can only
	// hook the same functions a second time.
	let pathHooked = false
	let stopSweep: (() => void) | undefined

	try {
		unsubscribes.push(
			getModuleWithImportedPath(MODULE_PATH, (mod: any) => {
				// Nothing new to hook is also what happens when the sweep got here first (348.1), so
				// only a module with none of the resolvers is a miss.
				const carries = [...URL_RESOLVERS, ...SOURCE_RESOLVERS].some(
					key =>
						typeof mod?.[key] === 'function' ||
						typeof mod?.default?.[key] === 'function',
				)
				if (patchNamespace(mod, seen, cleanups) === 0 && !carries) {
					reportError(
						`[ScreenshotRedactor] ${MODULE_PATH} found but carries no avatar resolver`,
					)
					noteResolverSkipped(MODULE_PATH)
					return
				}
				pathHooked = true
				stopSweep?.()
				stopSweep = undefined
			}),
		)
	} catch (error) {
		reportError(
			`[ScreenshotRedactor] imported-path lookup for ${MODULE_PATH} failed:`,
			error,
		)
	}

	// Fallback for a build that has moved the file, and only then. `getUserAvatarSource` is
	// distinctive enough that a prop sweep for it is not the lottery `getName` was, but it is still
	// split into lookup + wait so that no `max` counter can swallow the subscription -- see
	// `patches/displayName.ts`.
	if (!pathHooked) {
		try {
			const { lookupModules, waitForModules } = finders
			const { withProps } = filters
			const filter = () => withProps('getUserAvatarSource')

			const onModule = (mod: any) => {
				patchNamespace(mod, seen, cleanups)
			}

			for (const [exports] of lookupModules(filter())) onModule(exports)
			if (!pathHooked) stopSweep = waitForModules(filter(), onModule)
		} catch (error) {
			reportError('[ScreenshotRedactor] avatar sweep failed:', error)
		}
	}
	unsubscribes.push(() => stopSweep?.())

	return () => {
		unsubscribes.forEach(unsubscribe => {
			try {
				unsubscribe()
			} catch {
				/* already gone */
			}
		})
		cleanups.forEach(unpatch => {
			try {
				unpatch()
			} catch {
				/* already gone */
			}
		})
	}
}
