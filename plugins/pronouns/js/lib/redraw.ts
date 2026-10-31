/**
 * Redrawing one message so its row picks the badge up once pronouns arrive asynchronously.
 *
 * Native rows are generated once from the message records; nothing re-runs `getTagProperties`
 * after a PronounDB batch or profile fetch lands. The technique is Message Tweaks' and Ghost Log
 * Native Beta's (`plugins/ghost-log-native-beta/js/lib/deleted.ts`): swap the record for a copy
 * whose text ends in a space and a zero-width space, commit the collection, and emit a MessageStore change.
 * The row diff (`determineChangeType`) compares records by value, so an identical copy is a no-op
 * — the invisible character is what makes it a change. It is toggled, not appended: a second
 * redraw of a row that already ends in one would otherwise be identical and do nothing (0.2.0
 * and earlier: a row redrawn once, e.g. for another author's profile, never got its badge).
 * Messages without text content don't redraw this way; they pick the badge up on the next natural
 * redraw.
 */

import { Stores } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { reportError } from '../../../../shared/report'
import type { DiscordModules } from '@valenced/discord/types'

const TAG = '[Pronouns]'
const ZWSP = '​'
// The space keeps a trailing link a link: a zero-width space straight after a URL stops
// Discord recognising it, so a link-only message lost its blue underline
const REDRAW_MARK = ` ${ZWSP}`

interface MessageRecord {
	id: string
	content?: string
}

interface MessageCollection {
	has(id: string): boolean
	/** Immutable: returns a new collection, which has to be committed. */
	update(
		id: string,
		fn: (message: MessageRecord) => MessageRecord,
	): MessageCollection
}

/** Discord's per-channel message cache, `lib/ChannelMessages.tsx`. */
interface ChannelMessages {
	getOrCreate(channelId: string): MessageCollection
	commit(collection: MessageCollection): void
}

/** 350.4 moved the cache instance behind a `_channelMessages` export. */
interface ChannelMessagesModule {
	_channelMessages: ChannelMessages
}

interface MessageStore {
	emitChange(): void
}

let channelMessages: ChannelMessages | undefined
let emitQueued = false

/**
 * Two subscriptions, one per shape the module has had; whichever answers first wins. Both are
 * props filters: Discord 349.5 minified names, and these export names survived it.
 */
export function watchChannelMessages(): () => void {
	const unsubDirect = getModules(
		withProps<ChannelMessages>('getOrCreate', 'commit'),
		exports => {
			channelMessages ??= exports
		},
	)
	const unsubWrapped = getModules(
		withProps<ChannelMessagesModule>('_channelMessages'),
		exports => {
			const cache = exports._channelMessages
			if (
				typeof cache?.getOrCreate === 'function' &&
				typeof cache.commit === 'function'
			) {
				channelMessages ??= cache
			}
		},
	)
	return () => {
		unsubDirect()
		unsubWrapped()
		channelMessages = undefined
	}
}

/** Best effort; the badge simply appears on the next natural redraw when this fails. */
export function redrawMessage(channelId: string, messageId: string): boolean {
	try {
		const cache = channelMessages
		if (!cache) return false
		const collection = cache.getOrCreate(channelId)
		if (typeof collection?.has !== 'function' || !collection.has(messageId))
			return false
		if (typeof collection.update !== 'function') return false
		const updated = collection.update(messageId, message => {
			try {
				if (message?.id !== messageId) return message
				// A same-prototype copy with the same fields. Records built through merge() or the
				// constructor come back missing array fields and crash the row builder.
				const copy: MessageRecord = Object.create(
					Object.getPrototypeOf(message),
				)
				Object.defineProperties(copy, Object.getOwnPropertyDescriptors(message))
				if (typeof copy.content === 'string') {
					copy.content = copy.content.endsWith(REDRAW_MARK)
						? copy.content.slice(0, -REDRAW_MARK.length)
						: copy.content + REDRAW_MARK
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
					const MessageStore =
						Stores.MessageStore as DiscordModules.Flux.Store<MessageStore>
					MessageStore.emitChange()
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
