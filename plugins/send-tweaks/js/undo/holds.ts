/**
 * The held sends and their timers.
 *
 * Each held message is a whole `sendMessage` call, kept exactly as it reached the hold
 * (`undo/hold.ts`). When its timer ends the call is replayed once with `Reflect.apply`, so the
 * message goes out as if nothing had been in the way. Undo cancels the timer and hands the typed
 * text, the reply and the files back to the box (`undo/draft.ts`).
 *
 * ## What the caller gets back
 *
 * `hold()` returns a promise that stays pending while the message waits, and then settles with
 * what really happened:
 *
 * - **Sent:** it settles exactly as Discord's own `sendMessage` did -- resolved with its result
 *   (the HTTP response) or rejected with its error. A caller sees the same outcome it would have
 *   seen without the hold, only a few seconds later.
 * - **Undone or cancelled:** nothing was sent, so there is no response to give. It resolves with
 *   `undefined`, which is not a confirmed send: Char Counter's split send, for one, reads that as
 *   unconfirmed and stops instead of sending the next part.
 *
 * Undo Send 0.1.6 resolved straight away while the message was still waiting, which told the
 * caller it had gone before it existed; that was the open AS-04 item in its review.
 *
 * ## Account safety
 *
 * - Only the timer ever sends. Stopping the plugin, the app going to the background, a logout or
 *   another account logging in all *cancel* what's held (`cancelAll`), never send it (AS-07).
 * - Each entry remembers the user id that held it. If a different account (or none) is logged in
 *   when the timer ends, it's cancelled instead of sent.
 * - At most `MAX_HELD` at once; `undo/hold.ts` lets any more go straight through.
 * - The original is called at most once per entry: the entry leaves the map before the call, and
 *   a failed or uncertain replay is never retried (AS-05). The text goes back in the box and the
 *   toast only says it may not have sent.
 * - Each promise settles exactly once (`settle` is cleared on first use).
 *
 * Nothing is written to storage.
 */

import { reportError } from '../../../../shared/report'
import { showToast } from '../../../../shared/toast'
import { currentUserId } from './account'
import {
	restoreAttachments,
	restoreDraft,
	restoreReply,
	viaClipboard,
} from './draft'
import { undoNotice, uploadsOf } from './held'
import { TAG, TOAST } from './state'
import type { Held, Summary } from './held'

const DEBUG: boolean = false

/** What the hook saw: the receiver, the real argument array, and the function before ours. */
export interface Call {
	self: unknown
	args: any[]
	original: (...args: any[]) => unknown
}

interface Settle {
	resolve: (value: unknown) => void
	reject: (error: unknown) => void
}

interface Entry {
	held: Held
	call: Call
	/** The account that held it. */
	userId: string
	timer?: ReturnType<typeof setTimeout>
	/** The caller's promise. Cleared once used, so it settles once. */
	settle?: Settle
}

/**
 * Held sends at once. Three covers sending a few quick lines in a row; past that the hold steps
 * aside rather than build a backlog (`undo/hold.ts`).
 */
export const MAX_HELD = 3

export type CancelReason = 'stop' | 'background' | 'account'

const entries = new Map<number, Entry>()
const listeners = new Set<() => void>()
let nextId = 1

/** For the Debug page. */
export const holdStatus = {
	held: 0,
	sent: 0,
	undone: 0,
	cancelled: 0,
	failed: 0,
	passedCap: 0,
}

function notify() {
	for (const listener of listeners) {
		try {
			listener()
		} catch {
			/* a bar that went away */
		}
	}
}

/** For the bar: re-render when the queue changes. */
export function subscribe(listener: () => void): () => void {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}

/** Oldest first: the order they'd go out in. */
export function heldList(): Held[] {
	return [...entries.values()].map(e => e.held).sort((a, b) => a.at - b.at)
}

/** The one the bar shows: the newest, since that's the one you just sent. */
export function newest(): Held | undefined {
	let best: Held | undefined
	for (const { held } of entries.values())
		if (!best || held.id > best.id) best = held
	return best
}

/** Whether anything is held for an account other than [userId] (or for any, when undefined). */
export function heldForOther(userId: string | undefined): boolean {
	for (const entry of entries.values())
		if (!userId || entry.userId !== userId) return true
	return false
}

/** Whether another send can be held right now. */
export function hasRoom(): boolean {
	return entries.size < MAX_HELD
}

/** Settles [entry]'s promise once; later calls do nothing. */
function settleOnce(
	entry: Entry,
	how: 'resolve' | 'reject',
	value: unknown,
): void {
	const settle = entry.settle
	if (!settle) return
	entry.settle = undefined
	try {
		settle[how](value)
	} catch {
		/* a promise callback never throws, but nothing here may */
	}
}

/**
 * Holds [call] for [ms] for account [userId]. Returns the promise to hand back to the caller (see
 * "What the caller gets back" above).
 *
 * The timer is set last, and the entry is removed if anything up to it throws, so a throw here
 * never leaves a timer behind: the hook's fallback send is then the only send.
 */
export function hold(
	call: Call,
	summary: Summary,
	ms: number,
	userId: string,
): { held: Held; done: Promise<unknown> } {
	const id = nextId++
	const now = Date.now()
	const held: Held = { id, from: now, at: now + ms, ...summary }
	const entry: Entry = { held, call, userId }
	const done = new Promise<unknown>((resolve, reject) => {
		entry.settle = { resolve, reject }
	})
	entries.set(id, entry)
	try {
		if (DEBUG) console.log(`${TAG} holding #${id} for ${ms} ms`)
		entry.timer = setTimeout(() => release(id), ms)
	} catch (error) {
		entries.delete(id)
		entry.settle = undefined
		throw error
	}
	holdStatus.held++
	notify()
	return { held, done }
}

/** Takes [id] out of the queue. Undefined if it already went, or was undone or cancelled. */
function take(id: number): Entry | undefined {
	const entry = entries.get(id)
	if (!entry) return undefined
	if (entry.timer !== undefined) clearTimeout(entry.timer)
	entries.delete(id)
	notify()
	return entry
}

/** A failure category for the plugin error list: status, code or name only, no message text. */
function category(error: unknown): string {
	const e = error as any
	const status = e?.status ?? e?.statusCode ?? e?.response?.status
	const code = e?.body?.code ?? e?.code
	const parts: string[] = []
	if (typeof status === 'number') parts.push(`status ${status}`)
	if (typeof code === 'number' || typeof code === 'string')
		parts.push(`code ${String(code).slice(0, 32)}`)
	if (!parts.length)
		parts.push(typeof e?.name === 'string' ? e.name.slice(0, 32) : 'unknown')
	return parts.join(', ')
}

/** The timer ended: sends [id] once, if the same account is still logged in. */
function release(id: number) {
	const entry = take(id)
	if (!entry) return
	const { call, held } = entry
	if (currentUserId() !== entry.userId) {
		dropped([entry], 'account')
		return
	}
	if (DEBUG) console.log(`${TAG} sending #${id}`)
	// Rejected or thrown: delivery is unknown, so it's never sent again. The typed text goes back
	// in the box (ahead of anything typed since), the toast doesn't claim either way, and the
	// caller gets the same error Discord gave.
	const failed = (error: unknown) => {
		holdStatus.failed++
		reportError(`${TAG} send after the wait failed (${category(error)})`)
		try {
			restoreDraft(held.channelId, held.content, true)
			showToast('May not have sent', TOAST)
		} finally {
			settleOnce(entry, 'reject', error)
		}
	}
	let result: any
	try {
		result = Reflect.apply(call.original, call.self, call.args)
	} catch (error) {
		failed(error)
		return
	}
	holdStatus.sent++
	if (result && typeof result.then === 'function')
		result.then((value: unknown) => settleOnce(entry, 'resolve', value), failed)
	else settleOnce(entry, 'resolve', result)
}

/**
 * Cancels everything held; nothing is sent. For `stop` and `background` the text, reply and files
 * go back in their chat's box the way Undo does. For `account` they belong to the account that's
 * gone, so the text only goes to the clipboard. One short toast either way.
 */
export function cancelAll(why: CancelReason) {
	const taken = heldList()
		.map(held => take(held.id))
		.filter((entry): entry is Entry => !!entry)
	if (taken.length) dropped(taken, why)
}

function dropped(taken: Entry[], why: CancelReason) {
	holdStatus.cancelled += taken.length
	if (DEBUG) console.log(`${TAG} cancelled ${taken.length} (${why})`)
	let back = true
	for (const entry of taken) {
		const { held, call } = entry
		try {
			if (why === 'account') {
				if (held.content && !viaClipboard(held.content)) back = false
				continue
			}
			const route = restoreDraft(held.channelId, held.content, true)
			if (held.content && route === 'none') back = false
			if (held.reply)
				restoreReply(held.channelId, held.reply.messageId, held.reply.mention)
			if (held.attachments > 0)
				restoreAttachments(held.channelId, uploadsOf(call.args))
		} catch (error) {
			back = false
			reportError(
				`${TAG} restoring a cancelled send failed (${category(error)})`,
			)
		} finally {
			// Not sent: settled after the box is restored, so a caller that checks the box sees it.
			settleOnce(entry, 'resolve', undefined)
		}
	}
	const what = taken.length > 1 ? 'Unsent messages' : 'Unsent message'
	showToast(
		!back
			? `${what} cancelled`
			: why === 'account'
				? `${what} cancelled, text copied`
				: `${what} cancelled, back in the box`,
		TOAST,
	)
}

/**
 * Cancels [id] and puts it back in the box. [openChannelId] is the chat on screen, so the toast
 * can say where the text went when it isn't this one.
 */
export function undo(
	id: number,
	openChannelId: string | undefined,
	channelName: (id: string) => string,
) {
	const entry = take(id)
	if (!entry) return
	holdStatus.undone++
	const { held, call } = entry
	if (DEBUG) console.log(`${TAG} undone #${id}`)
	try {
		restoreDraft(held.channelId, held.content)
		if (held.reply)
			restoreReply(held.channelId, held.reply.messageId, held.reply.mention)
		// The files go back in the tray; the toast only mentions the ones that couldn't.
		const restored =
			held.attachments > 0
				? restoreAttachments(held.channelId, uploadsOf(call.args))
				: 0
		const sameChat = openChannelId === held.channelId
		const notice = undoNotice(
			{ ...held, attachments: Math.max(0, held.attachments - restored) },
			sameChat,
			channelName(held.channelId),
		)
		if (notice) showToast(notice, TOAST)
	} finally {
		settleOnce(entry, 'resolve', undefined)
	}
}

/** On stop: everything held is cancelled, never sent. */
export function clear() {
	cancelAll('stop')
	for (const listener of listeners) listeners.delete(listener)
}
