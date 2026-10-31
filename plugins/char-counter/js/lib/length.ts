/**
 * The message's length, handed from Discord's counter (`lib/counter.tsx`, which hears every change)
 * to the square above the message box (`lib/badge.tsx`, drawn by the chat input). One chat input is
 * on screen at a time, so module state is enough.
 */

import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { useEffect, useReducer } from 'react'

let length = 0
const listeners = new Set<() => void>()

export function setLength(value: number) {
	const next = typeof value === 'number' && value > 0 ? value : 0
	if (next === length) return
	length = next
	for (const listener of listeners) {
		try {
			listener()
		} catch {
			/* one broken listener must not stop the rest */
		}
	}
}

/** The current length, re-rendering on change. Call like a hook. */
export function useLength(): number {
	const [, redraw] = useReducer((n: number) => n + 1, 0)
	useEffect(() => {
		listeners.add(redraw)
		return () => {
			listeners.delete(redraw)
		}
	}, [])
	return length
}

/** The module `getMaxMessageLength` lives in. The function is on the namespace or on `default` (rule 3). */
export interface MaxLengthModule {
	getMaxMessageLength?(): number
	default?: { getMaxMessageLength?(): number }
}

export function maxLengthHostOf(
	exports: MaxLengthModule,
): { getMaxMessageLength(): number } | undefined {
	const host =
		typeof exports.getMaxMessageLength === 'function'
			? exports
			: exports.default
	return typeof host?.getMaxMessageLength === 'function'
		? (host as { getMaxMessageLength(): number })
		: undefined
}

let maxLength: (() => number) | undefined

/**
 * The real `getMaxMessageLength`, captured by `lib/sender.ts` before it patches the export: with
 * splitting on, the export itself reports a raised limit so Discord's send validation lets long
 * text through, and that must not move where this plugin cuts.
 */
let realLimit: (() => number) | undefined

export function setRealLimit(fn: (() => number) | undefined) {
	realLimit = fn
}

/** Discord's own limit for this account: 2000, or 4000 with Nitro. */
export function limit(): number {
	if (!maxLength) {
		try {
			const [exports] = lookupModule(
				withProps<MaxLengthModule>('getMaxMessageLength'),
			)
			const host = exports && maxLengthHostOf(exports)
			if (host) maxLength = () => host.getMaxMessageLength()
		} catch {
			/* fall back below */
		}
	}
	try {
		const value = (realLimit ?? maxLength)?.()
		if (typeof value === 'number' && value > 0) return value
	} catch {
		/* fall back below */
	}
	return 2000
}
