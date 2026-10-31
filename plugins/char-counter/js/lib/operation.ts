/**
 * One multi-part send, as the account-safety policy (docs/account-safety.md, AS-03 to AS-05 and
 * AS-07) asks for it. Pure: everything that touches Discord comes in through [Host], so
 * `tests/operation.test.ts` can drive it against a fake.
 *
 * - **One at a time.** `startOperation` refuses while another is running (`busy`).
 * - **Bound.** The parts are fixed when it starts; nothing is added later. The caller enforces the
 *   maximum count before starting.
 * - **Each part at most once.** A part is handed to `host.send` once. Whatever comes back, it is
 *   never sent again: a confirmed result moves on, anything else stops the operation.
 * - **Confirmed means confirmed.** Only a result the host marks as delivered (`host.confirmed`)
 *   counts. A rejection, an `ok: false`, an unknown shape or no result at all is `uncertain` or
 *   `rejected`, and the rest is not sent.
 * - **Bound to the account.** The user id is taken at the start; before every part the host is
 *   asked again, and a different (or missing) user cancels the rest.
 * - **Cancellable.** `cancel()` from the sheet, from the plugin's stop, or from the host (logout)
 *   stops before the next part. A part already handed to the host is awaited, not abandoned.
 * - **Truthful.** `progress` says what has been confirmed; the final state says how it ended and
 *   which parts were not sent, so the caller can put them back in the message box.
 */

export interface Host {
	/** Hands one part to Discord's own send. Resolves to whatever it returns. */
	send(part: string, index: number): Promise<unknown> | unknown
	/** Whether a send result means Discord accepted the message. Anything else stops the operation. */
	confirmed(result: unknown): boolean
	/** The signed-in user's id right now, or undefined when nobody is. */
	currentUserId(): string | undefined
	/** Waits between parts; resolves early when the operation is cancelled. */
	sleep(ms: number, cancelled: () => boolean): Promise<void>
}

export type Outcome =
	| 'sent' // every part confirmed
	| 'cancelled' // stopped by the user, the plugin or an account change before the next part
	| 'rejected' // Discord said no to a part
	| 'uncertain' // a part's result could not be confirmed (timeout, unknown shape, throw)

export interface Progress {
	/** Parts confirmed so far. */
	sent: number
	total: number
	/** The part being sent right now (1-based), or 0 between parts and once finished. */
	sending: number
	/** Set once the operation has ended. */
	outcome?: Outcome
	/** Which 1-based part the operation stopped on; the parts from here on were not confirmed. */
	stoppedAt?: number
	/** Why, in one sanitized line (an HTTP status, "cancelled", "account changed"). Never message text. */
	reason?: string
}

export interface Operation {
	readonly channelId: string
	readonly parts: readonly string[]
	readonly progress: () => Progress
	/** Runs every time the progress changes. Returns the unsubscribe. */
	readonly onChange: (fn: (p: Progress) => void) => () => void
	readonly cancel: (reason?: string) => void
	/** Resolves when the operation has ended, with the final progress. Never rejects. */
	readonly done: Promise<Progress>
}

let active: Operation | undefined

/** The running operation, if any. */
export function activeOperation(): Operation | undefined {
	return active
}

/** Cancels the running operation, if any: the plugin's stop and the host's logout call this. */
export function cancelActive(reason = 'cancelled') {
	active?.cancel(reason)
}

/**
 * Starts sending [parts] to [channelId], one after another with [delayMs] between them. Returns
 * undefined when another operation is running or when there is nobody signed in.
 */
export function startOperation(host: Host, channelId: string, parts: readonly string[], delayMs: number): Operation | undefined {
	if (active) return undefined
	const userId = host.currentUserId()
	if (!userId || parts.length === 0) return undefined

	const listeners = new Set<(p: Progress) => void>()
	let state: Progress = { sent: 0, total: parts.length, sending: 0 }
	let cancelRequested: string | undefined
	let finish!: (p: Progress) => void
	const done = new Promise<Progress>(resolve => {
		finish = resolve
	})

	const set = (patch: Partial<Progress>) => {
		state = { ...state, ...patch }
		for (const listener of listeners) {
			try {
				listener(state)
			} catch {
				/* one broken listener must not stop the operation's bookkeeping */
			}
		}
	}
	const cancelled = () => cancelRequested !== undefined
	const end = (outcome: Outcome, stoppedAt: number | undefined, reason?: string) => {
		set({ sending: 0, outcome, stoppedAt, reason })
		if (active === operation) active = undefined
		finish(state)
	}

	const operation: Operation = {
		channelId,
		parts,
		progress: () => state,
		onChange: fn => {
			listeners.add(fn)
			return () => {
				listeners.delete(fn)
			}
		},
		cancel: (reason = 'cancelled') => {
			if (state.outcome) return
			cancelRequested ??= reason
		},
		done,
	}
	active = operation

	void (async () => {
		for (let i = 0; i < parts.length; i++) {
			// Checked before every part, after the wait: a cancel or an account change during the
			// wait stops here, and nothing more is handed to the host.
			if (cancelled()) return end('cancelled', i + 1, cancelRequested)
			if (host.currentUserId() !== userId) return end('cancelled', i + 1, 'account changed')

			set({ sending: i + 1 })
			let result: unknown
			try {
				// Exactly one send per part. Whatever happens from here on, this part is never resent.
				result = await host.send(parts[i], i)
			} catch (error) {
				return end(rejectedBy(error) ? 'rejected' : 'uncertain', i + 1, describe(error))
			}
			if (!host.confirmed(result)) return end(rejectedBy(result) ? 'rejected' : 'uncertain', i + 1, describe(result))
			set({ sent: i + 1, sending: 0 })

			if (i + 1 < parts.length) await host.sleep(delayMs, cancelled)
		}
		end('sent', undefined)
	})()

	return operation
}

/** An HTTP-shaped result or error with a status Discord uses to refuse (as opposed to a lost reply). */
function rejectedBy(value: unknown): boolean {
	const status = statusOf(value)
	return typeof status === 'number' && status >= 400 && status < 600
}

function statusOf(value: unknown): number | undefined {
	if (!value || typeof value !== 'object') return undefined
	const v = value as { status?: unknown; ok?: unknown }
	return typeof v.status === 'number' ? v.status : undefined
}

/** One line for the toast and the sheet: a status code or an error's class, never its body. */
function describe(value: unknown): string {
	const status = statusOf(value)
	if (status !== undefined) return `HTTP ${status}`
	if (value instanceof Error) return value.name === 'Error' ? 'no confirmation' : value.name
	if (value === undefined) return 'no result'
	return 'unconfirmed'
}
