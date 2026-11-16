/**
 * Notes what you removed yourself, so the history can say "by you" instead of guessing.
 *
 * Discord's own action creators are watched with `before` hooks that write down an id and hand
 * the arguments back untouched: the call, its receiver, return value and errors are Discord's
 * (AS-04). Nothing here sends, retries or blocks anything. Traced on the 352.2 bundle:
 *
 * - `actions/RelationshipActionCreators.tsx`: `removeFriend`, `cancelFriendRequest` and
 *   `unblockUser` all call the exported object's `removeRelationship(userId, …)`, so one hook
 *   covers them. `blockUser` calls `addRelationship({ userId, type: BLOCKED })`.
 *   `clearPendingRelationships()` clears every incoming request at once.
 * - `modules/guild_settings/GuildSettingsActionCreators.tsx`: `leaveGuild(guildId, …)`. Every
 *   caller reads it off the exported object.
 * - `actions/ChannelActionCreators.tsx`: `closePrivateChannel(channelId, …)` leaves a group DM,
 *   and `bulkLeaveGroupDMs(…)` several.
 *
 * A mark lasts two minutes, long enough for Discord's request and the gateway event that follows.
 */

import { withProps } from '@valenced/modules/finders/filters'
import { before } from '@valenced/patcher'
import { getModuleByPath } from '../../../../shared/modules'
import { reportError } from '../../../../shared/report'
import { TAG } from './tag'

const DEBUG: boolean = false

const TTL = 2 * 60 * 1000
const BLOCKED = 2

const marks = new Map<string, number>()

function mark(key: string) {
	marks.set(key, Date.now() + TTL)
}

/** Whether you did this on this phone in the last two minutes. */
export function isMine(key: string): boolean {
	const until = marks.get(key)
	if (until === undefined) return false
	if (until < Date.now()) {
		marks.delete(key)
		return false
	}
	return true
}

function ids(value: unknown): string[] {
	if (typeof value === 'string') return [value]
	if (Array.isArray(value))
		return value.filter((v): v is string => typeof v === 'string')
	if (value && typeof value === 'object') {
		const any = value as any
		return ids(any.channelIds ?? any.channel_ids ?? any.ids)
	}
	return []
}

/** Hooks one method on whichever of the namespace or its `default` has it (coding rule 3). */
function watch(
	mod: any,
	key: string,
	onCall: (args: any[]) => void,
): (() => void) | undefined {
	const host = typeof mod?.[key] === 'function' ? mod : mod?.default
	if (typeof host?.[key] !== 'function') {
		if (DEBUG) console.log(`${TAG} ${key} not found`)
		return undefined
	}
	const unpatch = before(host, key, (args: any[]) => {
		try {
			onCall(args)
		} catch (error) {
			reportError(`${TAG} noting your ${key} failed:`, error)
		}
		return args
	})
	if (DEBUG) console.log(`${TAG} watching ${key}`)
	return unpatch
}

export function watchMine(): () => void {
	const unpatches: Array<() => void> = []
	const add = (u?: () => void) => {
		if (u) unpatches.push(u)
	}

	const finds = [
		getModuleByPath(
			'actions/RelationshipActionCreators.tsx',
			withProps('removeRelationship', 'removeFriend'),
			mod => {
				add(
					watch(mod, 'removeRelationship', args =>
						ids(args[0]).forEach(id => mark(`user:${id}`)),
					),
				)
				add(
					watch(mod, 'addRelationship', args => {
						const options = args[0]
						if (options?.type === BLOCKED)
							ids(options.userId).forEach(id => mark(`user:${id}`))
					}),
				)
				add(watch(mod, 'clearPendingRelationships', () => mark('incoming:*')))
			},
			TAG,
		),
		getModuleByPath(
			'modules/guild_settings/GuildSettingsActionCreators.tsx',
			withProps('leaveGuild'),
			mod => {
				add(
					watch(mod, 'leaveGuild', args =>
						ids(args[0]).forEach(id => mark(`guild:${id}`)),
					),
				)
			},
			TAG,
		),
		getModuleByPath(
			'actions/ChannelActionCreators.tsx',
			withProps('closePrivateChannel'),
			mod => {
				add(
					watch(mod, 'closePrivateChannel', args =>
						ids(args[0]).forEach(id => mark(`channel:${id}`)),
					),
				)
				add(
					watch(mod, 'bulkLeaveGroupDMs', args =>
						ids(args[0]).forEach(id => mark(`channel:${id}`)),
					),
				)
			},
			TAG,
		),
	]

	return () => {
		for (const stop of finds) stop()
		for (const unpatch of unpatches.splice(0)) {
			try {
				unpatch()
			} catch {
				/* already gone */
			}
		}
		marks.clear()
	}
}
