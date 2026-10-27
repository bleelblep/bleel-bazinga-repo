/**
 * Things floating just above the message box (Character Counter's square, Read All's pill...)
 * tell each other where they are, so they don't draw on top of one another.
 *
 * React Native gives JS no way to ask what's on screen under a point, so this is cooperative:
 * every floater puts a `<FloaterProbe id>` inside itself, which reports its rectangle in window
 * coordinates. A floater that should move out of the way reads `useFloaters(id)` and runs
 * `clearOf(rect, obstacles)`.
 *
 * Who moves: each floater has a priority. It avoids every floater with a lower one, and among
 * equal ones those that showed up first (a Map keeps insertion order). So two floaters never push
 * each other back and forth, and a fixed one (Character Counter's square, priority 0) stays put
 * even when it appears after the one that has to move.
 *
 * The registry lives on `globalThis`, so it's shared by every plugin's bundled copy of this file.
 */

import * as React from 'react'
import * as ReactNative from 'react-native'

export interface Rect {
	x: number
	y: number
	width: number
	height: number
}

interface Entry {
	rect: Rect
	priority: number
}

interface Registry {
	rects: Map<string, Entry>
	listeners: Set<() => void>
}

const KEY = '__valencedChatFloaters'

function registry(): Registry {
	const g = globalThis as any
	g[KEY] ??= { rects: new Map(), listeners: new Set() }
	return g[KEY]
}

function same(a: Rect | undefined, b: Rect | undefined) {
	return !!a && !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

/** Sets (or with `undefined`, removes) where floater `id` is. */
export function reportFloater(id: string, rect: Rect | undefined, priority = 0) {
	const r = registry()
	if (rect ? same(r.rects.get(id)?.rect, rect) : !r.rects.has(id)) return
	if (rect) r.rects.set(id, { rect, priority })
	else r.rects.delete(id)
	for (const listener of r.listeners) listener()
}

/** The floaters `id` (with `priority`) has to stay clear of. */
export function useFloaters(id: string, priority: number): Rect[] {
	const [, setTick] = React.useState(0)
	React.useEffect(() => {
		const r = registry()
		const listener = () => setTick(n => n + 1)
		r.listeners.add(listener)
		return () => {
			r.listeners.delete(listener)
		}
	}, [])
	const obstacles: Rect[] = []
	let reachedSelf = false
	for (const [key, entry] of registry().rects) {
		if (key === id) {
			reachedSelf = true
			continue
		}
		if (entry.priority < priority || (entry.priority === priority && !reachedSelf)) obstacles.push(entry.rect)
	}
	return obstacles
}

function overlaps(a: Rect, b: Rect, gap: number) {
	return a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap
}

/** `rect` moved up just enough to clear every obstacle (with `gap` between). */
export function clearOf(rect: Rect, obstacles: Rect[], gap = 6): Rect {
	let y = rect.y
	for (let i = 0; i <= obstacles.length; i++) {
		const hit = obstacles.find(o => overlaps({ ...rect, y }, o, gap))
		if (!hit) break
		y = hit.y - gap - rect.height
	}
	return { ...rect, y }
}

/**
 * Put inside a floater: fills it, measures it on layout and every 500 ms (the floater moves with
 * the keyboard without re-laying out), and removes it from the registry when it unmounts.
 */
export function FloaterProbe({ id, priority = 0 }: { id: string; priority?: number }) {
	const { View, StyleSheet } = ReactNative
	const ref = React.useRef<any>(null)
	const measure = React.useCallback(() => {
		try {
			ref.current?.measureInWindow?.((x: number, y: number, width: number, height: number) => {
				if (width > 0 && height > 0) reportFloater(id, { x, y, width, height }, priority)
			})
		} catch {}
	}, [id, priority])
	React.useEffect(() => {
		const poll = setInterval(measure, 500)
		return () => {
			clearInterval(poll)
			reportFloater(id, undefined)
		}
	}, [id])
	return <View ref={ref} pointerEvents="none" collapsable={false} onLayout={measure} style={StyleSheet.absoluteFill} />
}
