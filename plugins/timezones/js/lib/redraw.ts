/**
 * Redrawing one message so its timestamp picks up a timezone that arrived or changed.
 *
 * Native rows are generated once from the message records; nothing re-runs `RowManager.generate`
 * when a shared lookup lands or you set a zone. The technique is Message Tweaks' and Ghost Log
 * Native Beta's (`plugins/ghost-log-native-beta/js/lib/deleted.ts`): swap the record for a copy
 * whose text ends in a zero-width space, commit the collection, and emit a MessageStore change.
 * The row diff (`determineChangeType`) compares records by value, so an identical copy is a no-op
 * — the invisible character is what makes it a change. It is toggled, not appended: a second
 * redraw of a row that already ends in one would otherwise be identical and do nothing (Pronouns
 * learned that the hard way). Messages without text content don't redraw this way; they pick the
 * time up on the next natural redraw.
 */

import { getModuleByPath } from '../../../../shared/modules'
import { Stores } from '@valenced/discord/flux'
import * as filters from '@valenced/modules/finders/filters'
import { reportError } from '../../../../shared/report'

const TAG = '[Timezones]'
const ZWSP = '​'

// Discord's per-channel message cache (`lib/ChannelMessages.tsx`). Path first: Discord 349.5
// minifies names, and module paths survived it.
let channelMessages: any
let emitQueued = false

export function watchChannelMessages(): () => void {
	const { withProps } = filters
	const resolve = (mod: any) => {
		if (!mod) return undefined
		if (typeof mod?.getOrCreate === 'function' && typeof mod?.commit === 'function') return mod
		if (typeof mod?.default?.getOrCreate === 'function' && typeof mod?.default?.commit === 'function') return mod.default
		// 350.4: the cache instance moved behind a `_channelMessages` export (module ~5752, which
		// is what the withProps fallback matches).
		if (typeof mod?._channelMessages?.getOrCreate === 'function' && typeof mod?._channelMessages?.commit === 'function') {
			return mod._channelMessages
		}
		return undefined
	}
	return getModuleByPath(
		'lib/ChannelMessages.tsx',
		withProps('getOrCreate', 'commit'),
		mod => {
			const cache = resolve(mod)
			if (cache) channelMessages = cache
		},
		TAG,
	)
}

/** Best effort; the time simply appears on the next natural redraw when this fails. */
export function redrawMessage(channelId: string, messageId: string): boolean {
	try {
		const cache = channelMessages
		if (!cache) return false
		const collection = cache.getOrCreate(channelId)
		if (typeof collection?.has !== 'function' || !collection.has(messageId)) return false
		if (typeof collection.update !== 'function') return false
		// update() is immutable: it returns a new collection, which has to be committed.
		const updated = collection.update(messageId, (message: any) => {
			try {
				if (message?.id !== messageId) return message
				// A same-prototype copy with the same fields. Records built through merge() or the
				// constructor come back missing array fields and crash the row builder.
				const copy = Object.create(Object.getPrototypeOf(message))
				Object.defineProperties(copy, Object.getOwnPropertyDescriptors(message))
				if (typeof copy.content === 'string') {
					copy.content = copy.content.endsWith(ZWSP) ? copy.content.slice(0, -ZWSP.length) : copy.content + ZWSP
				}
				return copy
			} catch {
				return message
			}
		})
		cache.commit(updated)
		// After the current dispatch finishes: emitting from inside it re-enters React mid-render.
		// One emit covers every row redrawn in the same tick (a settings change redraws many).
		if (!emitQueued) {
			emitQueued = true
			queueMicrotask(() => {
				emitQueued = false
				try {
					;(Stores as any).MessageStore?.emitChange?.()
				} catch (error) {
					reportError(`${TAG} redraw emit failed:`, error)
				}
			})
		}
		return true
	} catch (error) {
		reportError(`${TAG} redraw failed:`, error)
		return false
	}
}
