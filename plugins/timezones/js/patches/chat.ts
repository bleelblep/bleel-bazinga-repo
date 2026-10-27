/**
 * Their local time after the timestamp on their messages: "Today at 2:02 PM · 3:02 AM Tue".
 *
 * Chat rows are native data built by `RowManager.generate`; the timestamp the native renderer draws
 * is the string at `row.message.timestamp` in its result (what Custom Timestamps rewrites, see
 * `plugins/custom-timestamps/js/patches/rowManager.ts`). The author header with the timestamp only
 * draws on the first message of a block, so the time comes out once per block.
 *
 * `before` + `after`, never `instead`: Custom Timestamps already `instead`-hooks generate, and two
 * `instead` hooks on one method recurse until the stack overflows. `after` only gets the return
 * value, so `before` stashes the input row; generate is synchronous, one slot is enough.
 *
 * Works alongside Custom Timestamps in either hook order: their instead-hook replaces the timestamp
 * with `record.__customTimestamp`, which their before-hook rebuilds every generation, so the time is
 * appended there as well as to the result.
 */

import { zoneFor } from '../lib/resolve'
import { onShared } from '../lib/shared'
import { onUpdate, settings } from '../lib/state'
import { redrawMessage } from '../lib/redraw'
import { timeIn } from '../lib/zones'
import { Stores } from '@valenced/discord/flux'
import * as finders from '@valenced/modules/finders'
import * as filters from '@valenced/modules/finders/filters'
import { after, before } from '@valenced/patcher'
import { reportError } from '../../../../shared/report'

const TAG = '[Timezones]'
const SEPARATOR = ' · '

function toMillis(value: any): number | undefined {
	try {
		if (value == null) return undefined
		if (typeof value === 'number') return value
		if (value instanceof Date) return value.getTime()
		if (typeof value === 'string') return Date.parse(value)
		// moment-like objects
		if (typeof value.valueOf === 'function') {
			const n = Number(value.valueOf())
			if (Number.isFinite(n)) return n
		}
	} catch {
		/* unreadable */
	}
	return undefined
}

function myId(): string | undefined {
	try {
		return (Stores as any).UserStore?.getCurrentUser?.()?.id
	} catch {
		return undefined
	}
}

/** The text to append for [authorId]'s message sent at [at], or undefined for none. */
function suffixFor(authorId: string, at: number | undefined): string | undefined {
	const s = settings()
	if (!s.showInChat || at === undefined || authorId === myId()) return undefined
	const found = zoneFor(authorId)
	if (!found) return undefined
	const time = timeIn(found.zone, at, s.hour24)
	if (!time) return undefined
	return `${SEPARATOR}${time.time}${s.showDay && time.otherDay ? ` ${time.otherDay}` : ''}`
}

function withSuffix(text: unknown, suffix: string): unknown {
	if (typeof text !== 'string' || !text || text.endsWith(suffix)) return text
	// A timestamp already carrying an older suffix (zone just changed) gets it replaced.
	const at = text.indexOf(SEPARATOR)
	return `${at > 0 ? text.slice(0, at) : text}${suffix}`
}

// ---------------------------------------------------------------------------------------------
// Recent rows and what they were drawn with, so a landed lookup or a settings change redraws
// exactly the rows whose time changes. Same scheme as Pronouns' patches/chat.ts.

const MAX_RECENT_ROWS = 200

interface Row {
	authorId: string
	at?: number
	shown?: string
}

const recent = new Map<string, Row>()

function track(key: string, row: Row) {
	recent.delete(key)
	recent.set(key, row)
	if (recent.size > MAX_RECENT_ROWS) recent.delete(recent.keys().next().value as string)
}

let refreshTimer: ReturnType<typeof setTimeout> | undefined

export function refresh() {
	if (refreshTimer !== undefined) return
	refreshTimer = setTimeout(() => {
		refreshTimer = undefined
		for (const [key, row] of [...recent]) {
			try {
				if (suffixFor(row.authorId, row.at) === row.shown) continue
				const split = key.indexOf(':')
				if (split > 0) redrawMessage(key.slice(0, split), key.slice(split + 1))
			} catch (error) {
				reportError(`${TAG} refresh failed:`, error)
			}
		}
	}, 50)
}

export default function patchChat(): () => void {
	const { getModules } = finders
	const { withName } = filters
	const unpatches: Array<() => void> = []
	let pendingRow: any

	const unsubscribe = getModules(withName('RowManager'), (RowManager: any) => {
		// A throw in this callback can close the app when the module was already loaded
		// (docs/debugging/api-contracts.md), so all of it is guarded.
		try {
			if (typeof RowManager?.prototype?.generate !== 'function') {
				reportError(`${TAG} RowManager.prototype.generate not found`, new Error('missing'))
				return
			}

			unpatches.push(
				before(RowManager.prototype, 'generate', (args: any[]) => {
					pendingRow = args?.[0]
					// A before-hook must return the args array (coding rule 2).
					return args
				}),
			)

			unpatches.push(
				after(RowManager.prototype, 'generate', (ret: any) => {
					const row = pendingRow
					pendingRow = undefined
					try {
						if (row?.rowType !== 1) return ret
						const record = row.message
						const authorId = record?.author?.id != null ? String(record.author.id) : undefined
						if (!authorId || !record?.id || !record?.channel_id) return ret
						const at = toMillis(record.timestamp)
						const suffix = suffixFor(authorId, at)
						track(`${record.channel_id}:${record.id}`, { authorId, at, shown: suffix })
						if (!suffix) return ret

						const message = ret?.message
						if (message && message.state === 'SENT' && typeof message.timestamp === 'string') {
							message.timestamp = withSuffix(message.timestamp, suffix)
						}
						// Custom Timestamps' instead-hook may run after this and copy its own text over.
						if (typeof record.__customTimestamp === 'string') {
							record.__customTimestamp = withSuffix(record.__customTimestamp, suffix)
						}
					} catch (error) {
						reportError(`${TAG} chat timestamp failed:`, error)
					}
					// The after-hook's return value replaces the result, so it must always come back.
					return ret
				}),
			)
		} catch (error) {
			reportError(`${TAG} could not patch RowManager:`, error)
		}
	})

	const unsubShared = onShared(() => refresh())
	const unsubSettings = onUpdate(() => refresh())

	return () => {
		unsubShared()
		unsubSettings()
		unsubscribe()
		for (const unpatch of unpatches.reverse()) unpatch()
		pendingRow = undefined
		if (refreshTimer !== undefined) clearTimeout(refreshTimer)
		refreshTimer = undefined
		recent.clear()
	}
}
