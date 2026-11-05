/**
 * Time breaks: which messages of the open channel come after a quiet gap, so the native side can
 * draw a small centred time above them (SpeechBubblesPlugin.kt applyBreak/placeBreak).
 *
 * The channel's messages come from Discord's MessageStore, oldest first; a message more than
 * [GAP_MS] after the one before it starts a block. Only the ids go to native, which formats the
 * time from the id's own send time. Recomputed when the channel changes and on the message events
 * that change its list; the result is only sent when it differs from the last one sent.
 *
 * `onFluxEventDispatched` is a transformer: every handler returns the payload (coding rule 2).
 */

import { onFluxEventDispatched, Stores } from '@valenced/discord/flux'
import { reportError } from '../../../shared/report'
import { setBreaks } from './native'
import { onSelectedChannel, selectedChannel } from './typing/stores'

const TAG = '[SpeechBubbles]'
/** A gap longer than this starts a new block: an hour. */
const GAP_MS = 60 * 60 * 1000
/** How many of the newest messages are looked at. */
const MAX_MESSAGES = 600
const EVENTS = [
	'MESSAGE_CREATE',
	'LOAD_MESSAGES_SUCCESS',
	'LOAD_MESSAGES_SUCCESS_CACHED',
	'MESSAGE_DELETE',
	'MESSAGE_DELETE_BULK',
] as const

interface StoredMessage {
	id: string
	timestamp?: unknown
}

interface MessageCollection {
	toArray?(): StoredMessage[]
	_array?: StoredMessage[]
}

const DISCORD_EPOCH = 1420070400000

/** The send time: the message's timestamp (a moment-like or string), else from the id snowflake. */
function sentAt(m: StoredMessage): number | undefined {
	try {
		const t = m.timestamp as { valueOf?(): unknown } | string | undefined
		if (typeof t === 'string') {
			const n = Date.parse(t)
			if (Number.isFinite(n)) return n
		} else if (t && typeof t.valueOf === 'function') {
			const n = Number(t.valueOf())
			if (Number.isFinite(n)) return n
		}
		if (typeof BigInt === 'function')
			return Number(BigInt(m.id) >> 22n) + DISCORD_EPOCH
	} catch {
		/* unreadable */
	}
	return undefined
}

function messagesOf(channelId: string): StoredMessage[] {
	const store = (Stores as unknown as Record<string, unknown>).MessageStore as
		| { getMessages?(id: string): MessageCollection | undefined }
		| undefined
	const collection = store?.getMessages?.(channelId)
	const all = collection?.toArray?.() ?? collection?._array ?? []
	return all.length > MAX_MESSAGES ? all.slice(-MAX_MESSAGES) : all
}

/** Ids of the messages that start a block, oldest first. */
export function breakIds(channelId: string): string[] {
	const ids: string[] = []
	let previous: number | undefined
	for (const m of messagesOf(channelId)) {
		const at = sentAt(m)
		if (at === undefined) continue
		if (previous !== undefined && at - previous > GAP_MS) ids.push(m.id)
		previous = at
	}
	return ids
}

/** Keeps native's break list for the open channel up to date while [enabled]. */
export function watchBreaks(enabled: () => boolean): () => void {
	const sent = new Map<string, string>()
	let timer: ReturnType<typeof setTimeout> | undefined

	const send = (channelId: string) => {
		const ids = enabled() ? breakIds(channelId) : []
		const key = ids.join(',')
		if (sent.get(channelId) === key) return
		sent.set(channelId, key)
		setBreaks(channelId, ids)
	}
	const schedule = (channelId: string) => {
		if (timer !== undefined) clearTimeout(timer)
		timer = setTimeout(() => {
			timer = undefined
			try {
				send(channelId)
			} catch (error) {
				reportError(`${TAG} time breaks failed:`, error)
			}
		}, 100)
	}

	const unsubscribes: Array<() => void> = []
	unsubscribes.push(onSelectedChannel(channel => schedule(channel.id)))
	for (const event of EVENTS) {
		unsubscribes.push(
			onFluxEventDispatched(
				event,
				(payload: { type: string; channelId?: string }) => {
					try {
						const open = selectedChannel()?.id
						if (open && (!payload?.channelId || payload.channelId === open))
							schedule(open)
					} catch (error) {
						reportError(`${TAG} ${event} handler failed:`, error)
					}
					return payload
				},
			),
		)
	}
	return () => {
		if (timer !== undefined) clearTimeout(timer)
		for (const u of unsubscribes) u()
		// Switched off or stopped: nothing is marked any more.
		for (const channelId of sent.keys()) setBreaks(channelId, [])
	}
}

/** The open channel is recomputed, for a settings change. */
export function refreshBreaks(): void {
	const open = selectedChannel()?.id
	if (open) setBreaks(open, breakIds(open))
}
