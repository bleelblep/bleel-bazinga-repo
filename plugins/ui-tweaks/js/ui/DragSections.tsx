/**
 * Rows you hold and drag to reorder, across every section on the screen, like Android's own lists.
 *
 * Hold a row: the phone buzzes and a floating copy of it lifts out above all the sections (grown a
 * little, solid background, an outline in the theme's brand colour, a shadow), so no card's edge
 * clips it or keeps it in. Its own place fades to show where it came from, and a line in the brand
 * colour shows where it will land, in whichever section the finger is over. Let go to drop it there.
 *
 * Plain React Native (PanResponder + Animated), no library. A long press on a row arms the drag; the
 * container's PanResponder takes the touch over from the row once the finger moves (capture phase,
 * so the row's own press gives way). Where everything sits is measured on screen when the drag
 * starts (measureInWindow), so the finger's screen position picks the section and the slot. The
 * page has to stop scrolling meanwhile: `onDragging` tells it.
 *
 * Each row element goes through `Item`, so props a TableRowGroup adds to its children (rounded
 * ends, dividers) still reach the row inside the wrapper.
 */

import * as React from 'react'
import * as ReactNative from 'react-native'
import { token } from './theme'

const LIFT_SCALE = 1.03

export interface DragSection {
	id: string
	keys: string[]
	/** Props for this section's Group (title, and so on). */
	groupProps?: Record<string, unknown>
	/** This section's Group, when it differs from the shared one. */
	Group?: any
}

interface DragSectionsProps {
	sections: DragSection[]
	Group: any
	/** The row element. Give it no onPress: taps come through [onPressRow]. */
	renderRow: (key: string, section: string) => any
	onPressRow?: (key: string, section: string) => void
	/** Rows drawn darkened (hidden ones). */
	dimmed?: (key: string, section: string) => boolean
	/** Drop: [key] from [from] into [to], at [index] counted without it. */
	onMove: (key: string, from: string, to: string, index: number) => void
	onDragging?: (dragging: boolean) => void
	/** Space between sections. */
	gap?: number
}

interface Box {
	x: number
	y: number
	width: number
	height: number
}

interface Geometry {
	container: Box
	from: Box
	groups: Array<{ id: string; box: Box; rows: Array<{ key: string; box: Box }> }>
}

interface Drag {
	key: string
	from: string
	geometry?: Geometry
	target?: { section: string; index: number; lineY: number }
}

function buzz() {
	try {
		ReactNative.Vibration.vibrate(15)
	} catch {
		/* no vibration is fine */
	}
}

function measure(ref: any): Promise<Box | undefined> {
	return new Promise(resolve => {
		try {
			if (typeof ref?.measureInWindow !== 'function') return resolve(undefined)
			ref.measureInWindow((x: number, y: number, width: number, height: number) => resolve({ x, y, width, height }))
		} catch {
			resolve(undefined)
		}
	})
}

/** Hands a TableRowGroup's injected props on to the row inside the wrapper. */
function Item({ row, dim, faded, holder, onPress, onLongPress, onPressOut, ...injected }: any) {
	const { View, Pressable } = ReactNative
	return (
		<View ref={holder} collapsable={false} style={faded ? { opacity: 0.25 } : dim ? { opacity: 0.4 } : null}>
			<Pressable
				onPress={onPress}
				onLongPress={onLongPress}
				onPressOut={onPressOut}
				delayLongPress={250}
				android_ripple={{ color: 'rgba(128,128,128,0.2)' }}
			>
				{React.cloneElement(row, injected)}
			</Pressable>
		</View>
	)
}

export function DragSections({ sections, Group, renderRow, onPressRow, dimmed, onMove, onDragging, gap = 0 }: DragSectionsProps) {
	const { Animated, PanResponder, View } = ReactNative
	const [drag, setDrag] = React.useState<Drag | null>(null)
	const dragRef = React.useRef<Drag | null>(null)
	const panActive = React.useRef(false)
	const dy = React.useRef(new Animated.Value(0)).current
	const scale = React.useRef(new Animated.Value(1)).current
	const container = React.useRef<any>(null)
	const groupRefs = React.useRef(new Map<string, any>())
	const rowRefs = React.useRef(new Map<string, any>())
	const latest = React.useRef({ sections, onMove, onDragging })
	latest.current = { sections, onMove, onDragging }

	const put = (next: Drag | null) => {
		dragRef.current = next
		setDrag(next)
	}

	/** The section under the finger and the slot in it, from the geometry measured at the start. */
	const targetAt = (current: Drag, fingerY: number): Drag['target'] => {
		const geometry = current.geometry
		if (!geometry?.groups.length) return undefined
		let group = geometry.groups.find(g => fingerY >= g.box.y && fingerY < g.box.y + g.box.height)
		if (!group) {
			// In a gap between cards: the nearest one.
			let best = Infinity
			for (const g of geometry.groups) {
				const distance = fingerY < g.box.y ? g.box.y - fingerY : fingerY - (g.box.y + g.box.height)
				if (distance < best) {
					best = distance
					group = g
				}
			}
		}
		if (!group) return undefined
		const rows = group.rows.filter(row => !(row.key === current.key && group.id === current.from))
		let index = 0
		while (index < rows.length && rows[index].box.y + rows[index].box.height / 2 < fingerY) index++
		const lineY =
			index < rows.length
				? rows[index].box.y
				: rows.length
					? rows[rows.length - 1].box.y + rows[rows.length - 1].box.height
					: group.box.y + group.box.height
		return { section: group.id, index, lineY: lineY - geometry.container.y }
	}

	const finish = () => {
		const current = dragRef.current
		panActive.current = false
		put(null)
		dy.setValue(0)
		scale.setValue(1)
		latest.current.onDragging?.(false)
		const target = current?.target
		if (!current || !target) return
		// Dropped back on its own place: nothing to save.
		const own = latest.current.sections.find(s => s.id === current.from)?.keys.filter(k => k !== current.key)
		const was = latest.current.sections.find(s => s.id === current.from)?.keys.indexOf(current.key) ?? -1
		if (target.section === current.from && own && target.index === was) return
		latest.current.onMove(current.key, current.from, target.section, target.index)
	}

	const responder = React.useMemo(
		() =>
			PanResponder.create({
				onStartShouldSetPanResponderCapture: () => !!dragRef.current,
				onMoveShouldSetPanResponderCapture: () => !!dragRef.current,
				onPanResponderGrant: () => {
					panActive.current = true
				},
				onPanResponderTerminationRequest: () => false,
				onPanResponderMove: (_event: any, gesture: any) => {
					const current = dragRef.current
					if (!current) return
					dy.setValue(gesture.dy)
					if (!current.geometry) return
					const target = targetAt(current, gesture.moveY)
					const was = current.target
					if (!target) return
					if (!was || was.section !== target.section || was.index !== target.index) put({ ...current, target })
				},
				onPanResponderRelease: finish,
				onPanResponderTerminate: finish,
			}),
		[],
	)

	const start = (key: string, from: string) => {
		const next: Drag = { key, from }
		panActive.current = false
		dy.setValue(0)
		put(next)
		buzz()
		Animated.spring(scale, { toValue: LIFT_SCALE, friction: 6, useNativeDriver: true }).start()
		latest.current.onDragging?.(true)
		// Where everything is right now, on screen.
		void (async () => {
			const box = await measure(container.current)
			const fromBox = await measure(rowRefs.current.get(`${from}\u0000${key}`))
			const groups: Geometry['groups'] = []
			for (const section of latest.current.sections) {
				const groupBox = await measure(groupRefs.current.get(section.id))
				if (!groupBox) continue
				const rows: Array<{ key: string; box: Box }> = []
				for (const rowKey of section.keys) {
					const rowBox = await measure(rowRefs.current.get(`${section.id}\u0000${rowKey}`))
					if (rowBox) rows.push({ key: rowKey, box: rowBox })
				}
				groups.push({ id: section.id, box: groupBox, rows })
			}
			if (dragRef.current !== next || !box || !fromBox) return
			put({ ...next, geometry: { container: box, from: fromBox, groups } })
		})()
	}

	/** Let go without moving: the row kept the touch, so the container never took over. */
	const pressOut = () => {
		setTimeout(() => {
			if (dragRef.current && !panActive.current) finish()
		}, 0)
	}

	const geometry = drag?.geometry
	const brand = token('BACKGROUND_BRAND', '#5865f2')

	return (
		<View ref={container} collapsable={false} style={{ gap }} {...responder.panHandlers}>
			{sections.map(section => {
				const SectionGroup = section.Group ?? Group
				return (
					<View
						key={section.id}
						collapsable={false}
						ref={(ref: any) => {
							if (ref) groupRefs.current.set(section.id, ref)
							else groupRefs.current.delete(section.id)
						}}
					>
						<SectionGroup {...section.groupProps}>
							{section.keys.map((key, index) => (
								<Item
									key={`${key}:${index}`}
									row={renderRow(key, section.id)}
									dim={dimmed?.(key, section.id)}
									faded={drag?.key === key && drag.from === section.id}
									holder={(ref: any) => {
										const id = `${section.id}\u0000${key}`
										if (ref) rowRefs.current.set(id, ref)
										else rowRefs.current.delete(id)
									}}
									onPress={onPressRow ? () => onPressRow(key, section.id) : undefined}
									onLongPress={() => start(key, section.id)}
									onPressOut={pressOut}
								/>
							))}
						</SectionGroup>
					</View>
				)
			})}

			{drag?.target ? (
				<View
					pointerEvents="none"
					style={{
						position: 'absolute',
						left: 8,
						right: 8,
						top: drag.target.lineY - 2,
						height: 4,
						borderRadius: 2,
						backgroundColor: brand,
					}}
				/>
			) : null}

			{drag && geometry ? (
				<Animated.View
					pointerEvents="none"
					style={{
						position: 'absolute',
						left: geometry.from.x - geometry.container.x,
						top: geometry.from.y - geometry.container.y,
						width: geometry.from.width,
						transform: [{ translateY: dy }, { scale }],
						backgroundColor: token('BACKGROUND_SURFACE_HIGHEST', token('BACKGROUND_BASE_LOW', '#2b2d31')),
						borderRadius: 12,
						borderWidth: 2,
						borderColor: brand,
						overflow: 'hidden',
						elevation: 12,
						shadowColor: '#000',
						shadowOpacity: 0.35,
						shadowRadius: 10,
						shadowOffset: { width: 0, height: 4 },
					}}
				>
					{renderRow(drag.key, drag.from)}
				</Animated.View>
			) : null}
		</View>
	)
}
