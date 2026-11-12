/**
 * Rows you drag to reorder, across every section on the screen, like Android's own lists.
 *
 * Start a drag by touching a row's grip (the dots on the right) or by holding the row. The phone
 * buzzes and a floating copy lifts out above all the sections (grown a little and tilted, solid
 * background, an outline in the theme's brand colour, a shadow), so no card's edge clips it. The
 * other rows slide apart to open a gap the size of the row where it will land, and the section it
 * is over gets an outline. A light tick marks each new spot, a firmer one each new section. Near the
 * top or bottom of the screen the page scrolls by itself (when the page hands us its scroll view,
 * see useDragScroller), faster the closer the finger is to the edge. Let go and the copy glides into
 * the gap. Drag it sideways off the list, or back to where it was, and it goes back with no change.
 * Hold a row (or touch its grip) and let go without moving to get a "Move to" panel instead: up,
 * down, or the end of any other section, for long jumps.
 *
 * Plain React Native (PanResponder + Animated + LayoutAnimation), no library. The container's
 * PanResponder takes the touch over from the row or grip once the finger moves (capture phase).
 * Where everything sits is measured once, when the drag starts, in the container's own
 * coordinates. From that a small model works out the layout for any drop spot (the dragged row
 * taken out, a gap put in, a section left empty showing its "drop here" space), so hit-testing
 * never has to measure again, and scrolling only shifts the finger's position by the scroll. The
 * dragged row stays mounted, collapsed to nothing, so the touch it started is never lost.
 *
 * Each row element goes through `Item`, so props a TableRowGroup adds to its children (rounded
 * ends, dividers) still reach the row inside the wrapper.
 */

import * as React from 'react'
import * as ReactNative from 'react-native'
import { token } from './theme'

const LIFT_SCALE = 1.03
const TILT_DEG = 1.5
/** The "drop here" space in an empty section. */
const EMPTY_HEIGHT = 56
/** How close to the top or bottom of the scroll view the finger must be to scroll it. */
const EDGE = 96
/** Pixels per frame at the very edge. */
const MAX_SPEED = 18
/** Dragged this share of the list's width sideways: let go to cancel. */
const CANCEL_FRACTION = 0.35
const SETTLE_MS = 180
const GRIP_WIDTH = 44
/** Finger travel before the container takes the touch, so a still hold stays a hold. */
const SLOP = 3

export interface DragSection {
	id: string
	keys: string[]
	/** The section's name in the "Move to" panel. */
	title?: string
	/** Props for this section's Group (title, and so on). */
	groupProps?: Record<string, unknown>
	/** This section's Group, when it differs from the shared one. */
	Group?: any
}

/**
 * The page's scroll view, for scrolling while dragging. Spread `scrollProps` on the ScrollView and
 * pass `scroller` to DragSections.
 */
export interface DragScroller {
	ref: { current: any }
	offset: number
	viewport: number
	content: number
	/** While a drag scrolls the page it keeps `offset` itself; late scroll events would undo it. */
	driving: boolean
}

export function useDragScroller(): { scroller: DragScroller; scrollProps: Record<string, unknown> } {
	const holder = React.useRef<{ scroller: DragScroller; scrollProps: Record<string, unknown> } | null>(null)
	if (!holder.current) {
		const scroller: DragScroller = { ref: { current: null }, offset: 0, viewport: 0, content: 0, driving: false }
		holder.current = {
			scroller,
			scrollProps: {
				ref: (ref: any) => {
					scroller.ref.current = ref
				},
				scrollEventThrottle: 16,
				onScroll: (event: any) => {
					const y = event?.nativeEvent?.contentOffset?.y
					if (typeof y === 'number' && !scroller.driving) scroller.offset = y
				},
				onLayout: (event: any) => {
					const height = event?.nativeEvent?.layout?.height
					if (typeof height === 'number') scroller.viewport = height
				},
				onContentSizeChange: (_width: number, height: number) => {
					if (typeof height === 'number') scroller.content = height
				},
			},
		}
	}
	return holder.current
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
	/** The page's scroll view (useDragScroller), so a drag can scroll it. */
	scroller?: DragScroller
	/** Space between sections. */
	gap?: number
}

interface Box {
	x: number
	y: number
	width: number
	height: number
}

interface RowGeo {
	top: number
	/** Distance to the next row's top (its height, for the last), so dividers are counted. */
	pitch: number
}

interface GroupGeo {
	id: string
	top: number
	height: number
	/** From the group's top to its first row (or its "drop here" space). */
	header: number
	/** From its last row to the group's bottom. */
	footer: number
	/** Space below it, to the next group. */
	after: number
	rows: RowGeo[]
}

/** Measured when a drag starts, in the container's coordinates (0 = its top). */
interface Geometry {
	/** The container on screen. */
	screen: Box
	from: { left: number; top: number; width: number; height: number }
	groups: GroupGeo[]
	/** The scroll view's offset when measured, and where it sits on screen. */
	offset0: number
	viewport?: Box
}

interface Target {
	section: string
	index: number
	/** Where the gap's top is when the row lands here. */
	slotTop: number
}

interface Drag {
	key: string
	from: string
	fromIndex: number
	geometry?: Geometry
	target?: Target
	cancel?: boolean
	settling?: boolean
}

/** A move already dropped but not saved yet: drawn as done, so the row doesn't flick back. */
interface Pending {
	key: string
	from: string
	fromIndex: number
	to: string
	index: number
	base: string
}

let lastBuzz = 0
function buzz(ms: number) {
	const now = Date.now()
	if (now - lastBuzz < 40) return
	lastBuzz = now
	try {
		ReactNative.Vibration.vibrate(ms)
	} catch {
		/* no vibration is fine */
	}
}

function animateLayout() {
	try {
		const { LayoutAnimation } = ReactNative as any
		LayoutAnimation?.configureNext?.({
			duration: 160,
			create: { type: 'easeInEaseOut', property: 'opacity' },
			update: { type: 'easeInEaseOut' },
			delete: { type: 'easeInEaseOut', property: 'opacity' },
		})
	} catch {
		/* rows jump instead of sliding */
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

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

/** The brand colour, faint, for the gap's fill. */
function faint(colour: string): string {
	return /^#[0-9a-f]{6}$/i.test(colour) ? `${colour}26` : 'transparent'
}

// ---- The layout model ---------------------------------------------------------------------------

/** Each group's height with the row out of [from] and a gap at [target] (none: as measured). */
function heightsFor(geo: Geometry, drag: Drag, target?: { section: string }): number[] {
	return geo.groups.map(group => {
		let content = 0
		group.rows.forEach((row, index) => {
			if (!(target && group.id === drag.from && index === drag.fromIndex)) content += row.pitch
		})
		if (target?.section === group.id) content += geo.from.height
		if (content === 0) content = EMPTY_HEIGHT
		return group.header + content + group.footer
	})
}

function topsFor(geo: Geometry, heights: number[]): number[] {
	const tops: number[] = []
	geo.groups.forEach((group, index) => {
		tops.push(index === 0 ? group.top : tops[index - 1] + heights[index - 1] + geo.groups[index - 1].after)
	})
	return tops
}

/**
 * The drop spot for a floating row centred at [y]. The section comes from the layout as drawn
 * now ([current]), which keeps a spot steady at a section's edge: entering a section opens its gap
 * further under the row, never back out. The slot is counted with the gap in that section.
 */
function hitTest(geo: Geometry, drag: Drag, y: number, current?: Target): Target | undefined {
	if (!geo.groups.length) return undefined
	const heights = heightsFor(geo, drag, current)
	const tops = topsFor(geo, heights)
	let found = 0
	let best = Infinity
	tops.forEach((top, index) => {
		const distance = y < top ? top - y : y > top + heights[index] ? y - top - heights[index] : 0
		if (distance < best) {
			best = distance
			found = index
		}
	})
	const group = geo.groups[found]
	const top = topsFor(geo, heightsFor(geo, drag, { section: group.id }))[found]
	const rows = group.rows.filter((_, index) => !(group.id === drag.from && index === drag.fromIndex))
	let slotTop = top + group.header
	let index = 0
	while (index < rows.length && y > slotTop + rows[index].pitch / 2) {
		slotTop += rows[index].pitch
		index++
	}
	return { section: group.id, index, slotTop }
}

function sameTarget(a?: Target, b?: Target) {
	return a?.section === b?.section && a?.index === b?.index
}

function signature(sections: DragSection[]) {
	return JSON.stringify(sections.map(section => [section.id, section.keys]))
}

function withPending(sections: DragSection[], pending: Pending): DragSection[] {
	const out = sections.map(section => ({ ...section, keys: [...section.keys] }))
	const from = out.find(section => section.id === pending.from)
	const to = out.find(section => section.id === pending.to)
	if (!from || !to || from.keys[pending.fromIndex] !== pending.key) return sections
	from.keys.splice(pending.fromIndex, 1)
	to.keys.splice(clamp(pending.index, 0, to.keys.length), 0, pending.key)
	return out
}

// ---- Pieces -------------------------------------------------------------------------------------

function GripDots({ colour }: { colour: string }) {
	const { View } = ReactNative
	const dot = { width: 4, height: 4, borderRadius: 2, backgroundColor: colour }
	return (
		<View style={{ flexDirection: 'row', gap: 4 }}>
			{[0, 1].map(column => (
				<View key={column} style={{ gap: 4 }}>
					<View style={dot} />
					<View style={dot} />
					<View style={dot} />
				</View>
			))}
		</View>
	)
}

/** Hands a TableRowGroup's injected props on to the row inside the wrapper. */
function Item({
	row,
	dim,
	mode,
	holder,
	onPress,
	onLongPress,
	onPressOut,
	onGripStart,
	onGripEnd,
	picker,
	...injected
}: any) {
	const { View, Pressable } = ReactNative
	return (
		<View ref={holder} collapsable={false} style={mode === 'collapsed' ? { height: 0, overflow: 'hidden', opacity: 0 } : null}>
			<View style={mode === 'faded' ? { opacity: 0.25 } : dim ? { opacity: 0.4 } : null}>
				<Pressable
					onPress={onPress}
					onLongPress={onLongPress}
					onPressOut={onPressOut}
					delayLongPress={250}
					android_ripple={{ color: 'rgba(128,128,128,0.2)' }}
				>
					{React.cloneElement(row, injected)}
				</Pressable>
				<View
					style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: GRIP_WIDTH, alignItems: 'center', justifyContent: 'center' }}
					onStartShouldSetResponder={() => true}
					// true keeps the scroll view (a native responder) from taking the touch.
					onResponderGrant={() => {
						onGripStart?.()
						return true
					}}
					onResponderTerminationRequest={() => true}
					onResponderRelease={onGripEnd}
				>
					<GripDots colour={token('INTERACTIVE_NORMAL', '#b5bac1')} />
				</View>
			</View>
			{picker}
		</View>
	)
}

/** The gap a dragged row will land in: its own height, outlined. */
function Gap({ height, colour }: { height: number; colour: string }) {
	const { View } = ReactNative
	return (
		<View style={{ height }}>
			<View
				style={{
					position: 'absolute',
					left: 6,
					right: 6,
					top: 4,
					bottom: 4,
					borderRadius: 10,
					borderWidth: 2,
					borderStyle: 'dashed',
					borderColor: colour,
					backgroundColor: faint(colour),
				}}
			/>
		</View>
	)
}

function Empty({ holder }: { holder?: (ref: any) => void }) {
	const { View, Text } = ReactNative
	return (
		<View ref={holder} collapsable={false} style={{ height: EMPTY_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
			<Text style={{ color: token('TEXT_MUTED', '#949ba4'), fontSize: 14 }}>Empty. Drag an item here.</Text>
		</View>
	)
}

function Chip({ label, onPress, strong }: { label: string; onPress: () => void; strong?: boolean }) {
	const { Pressable, Text } = ReactNative
	const brand = token('BACKGROUND_BRAND', '#5865f2')
	return (
		<Pressable
			onPress={onPress}
			android_ripple={{ color: 'rgba(128,128,128,0.25)', borderless: false }}
			style={{
				paddingHorizontal: 14,
				paddingVertical: 8,
				borderRadius: 16,
				backgroundColor: strong ? brand : token('BACKGROUND_MOD_STRONG', 'rgba(128,128,128,0.24)'),
			}}
		>
			<Text style={{ color: strong ? '#ffffff' : token('TEXT_NORMAL', '#dbdee1'), fontSize: 14, fontWeight: '600' }}>{label}</Text>
		</Pressable>
	)
}

/** "Move to": up, down, or the end of another section. */
function Picker({
	sections,
	section,
	index,
	onPick,
	onClose,
}: {
	sections: DragSection[]
	section: string
	index: number
	onPick: (to: string, index: number) => void
	onClose: () => void
}) {
	const { View, Text } = ReactNative
	const own = sections.find(s => s.id === section)
	const count = own?.keys.length ?? 0
	const others = sections.filter(s => s.id !== section)
	const titleOf = (s: DragSection) => s.title ?? `Section ${sections.indexOf(s) + 1}`
	return (
		<View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 14, gap: 10 }}>
			<Text style={{ color: token('TEXT_MUTED', '#949ba4'), fontSize: 13, fontWeight: '600' }}>MOVE TO</Text>
			<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
				{index > 0 ? <Chip label="Top" onPress={() => onPick(section, 0)} /> : null}
				{index > 0 ? <Chip label="Up" onPress={() => onPick(section, index - 1)} /> : null}
				{index < count - 1 ? <Chip label="Down" onPress={() => onPick(section, index + 1)} /> : null}
				{index < count - 1 ? <Chip label="Bottom" onPress={() => onPick(section, count - 1)} /> : null}
				{others.map(s => (
					<Chip key={s.id} label={titleOf(s)} onPress={() => onPick(s.id, s.keys.length)} />
				))}
				<Chip label="Close" strong onPress={onClose} />
			</View>
		</View>
	)
}

// ---- The list -----------------------------------------------------------------------------------

export function DragSections({ sections, Group, renderRow, onPressRow, dimmed, onMove, onDragging, scroller, gap = 0 }: DragSectionsProps) {
	const { Animated, Easing, PanResponder, View } = ReactNative
	const [drag, setDrag] = React.useState<Drag | null>(null)
	const [pending, setPending] = React.useState<Pending | null>(null)
	const [picking, setPicking] = React.useState<{ key: string; section: string } | null>(null)
	const dragRef = React.useRef<Drag | null>(null)
	const panActive = React.useRef(false)
	const finger = React.useRef<{ dx: number; dy: number; y?: number }>({ dx: 0, dy: 0 })
	const frame = React.useRef<any>(null)
	const tx = React.useRef(new Animated.Value(0)).current
	const ty = React.useRef(new Animated.Value(0)).current
	const lift = React.useRef(new Animated.Value(0)).current
	const container = React.useRef<any>(null)
	const groupRefs = React.useRef(new Map<string, any>())
	const rowRefs = React.useRef(new Map<string, any>())

	// A dropped move is drawn as done until the saved order arrives (or a second passes).
	const sig = signature(sections)
	const shown = pending && pending.base === sig ? withPending(sections, pending) : sections
	React.useEffect(() => {
		if (!pending) return
		if (pending.base !== sig) {
			setPending(null)
			return
		}
		const timer = setTimeout(() => setPending(null), 1000)
		return () => clearTimeout(timer)
	}, [pending, sig])

	const latest = React.useRef({ sections: shown, onMove, onDragging, scroller })
	latest.current = { sections: shown, onMove, onDragging, scroller }

	const put = (next: Drag | null) => {
		dragRef.current = next
		setDrag(next)
	}

	const stopFrames = () => {
		if (frame.current != null) {
			try {
				cancelAnimationFrame(frame.current)
			} catch {
				/* already gone */
			}
		}
		frame.current = null
	}

	const clear = () => {
		stopFrames()
		panActive.current = false
		finger.current = { dx: 0, dy: 0 }
		put(null)
		tx.setValue(0)
		ty.setValue(0)
		lift.setValue(0)
		if (latest.current.scroller) latest.current.scroller.driving = false
		latest.current.onDragging?.(false)
	}

	/** Places the floating row from the finger and the scroll, and picks the drop spot. */
	const step = () => {
		const current = dragRef.current
		if (!current || current.settling) return
		const geo = current.geometry
		if (!geo) {
			ty.setValue(finger.current.dy)
			return
		}
		const s = latest.current.scroller
		const shift = s ? s.offset - geo.offset0 : 0
		// The list's height as drawn now, to keep the row from leaving it.
		const heights = heightsFor(geo, current, current.target)
		const tops = topsFor(geo, heights)
		const height = tops.length ? tops[tops.length - 1] + heights[heights.length - 1] : geo.from.top + geo.from.height
		const t = clamp(finger.current.dy + shift, -geo.from.top, Math.max(-geo.from.top, height - geo.from.top - geo.from.height))
		ty.setValue(t)
		tx.setValue(finger.current.dx * 0.5)
		const cancel = Math.abs(finger.current.dx) > geo.screen.width * CANCEL_FRACTION
		const target = cancel ? undefined : hitTest(geo, current, geo.from.top + geo.from.height / 2 + t, current.target)
		if (sameTarget(target, current.target) && cancel === !!current.cancel) return
		if (cancel !== !!current.cancel) buzz(12)
		else if (target && current.target && target.section !== current.target.section) buzz(20)
		else buzz(8)
		animateLayout()
		put({ ...current, target, cancel })
	}

	/** Scrolls the page while the finger is near its top or bottom edge. */
	const tick = () => {
		frame.current = null
		const current = dragRef.current
		if (!current || current.settling) return
		const s = latest.current.scroller
		const view = current.geometry?.viewport
		const y = finger.current.y
		if (s && view && panActive.current && y !== undefined) {
			const top = view.y
			const bottom = view.y + view.height
			let speed = 0
			if (y < top + EDGE) speed = -MAX_SPEED * Math.min(1, (top + EDGE - y) / EDGE)
			else if (y > bottom - EDGE) speed = MAX_SPEED * Math.min(1, (y - (bottom - EDGE)) / EDGE)
			if (speed) {
				const next = clamp(s.offset + speed, 0, Math.max(0, s.content - s.viewport))
				if (next !== s.offset) {
					try {
						s.ref.current?.scrollTo?.({ y: next, animated: false })
						s.offset = next
						step()
					} catch {
						/* no scrolling then */
					}
				}
			}
		}
		frame.current = requestAnimationFrame(tick)
	}

	const finish = () => {
		const current = dragRef.current
		panActive.current = false
		if (!current || current.settling) return
		stopFrames()
		const geo = current.geometry
		const target = current.cancel ? undefined : current.target
		if (!geo) return clear()
		put({ ...current, settling: true })
		Animated.parallel([
			Animated.timing(ty, {
				toValue: target ? target.slotTop - geo.from.top : 0,
				duration: SETTLE_MS,
				easing: Easing.out(Easing.cubic),
				useNativeDriver: true,
			}),
			Animated.timing(tx, { toValue: 0, duration: SETTLE_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
			Animated.timing(lift, { toValue: 0, duration: SETTLE_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
		]).start(() => {
			const moved = !!target && !(target.section === current.from && target.index === current.fromIndex)
			if (moved) {
				setPending({
					key: current.key,
					from: current.from,
					fromIndex: current.fromIndex,
					to: target.section,
					index: target.index,
					base: signature(latest.current.sections),
				})
			}
			clear()
			if (moved) latest.current.onMove(current.key, current.from, target.section, target.index)
		})
	}

	const responder = React.useMemo(
		() =>
			PanResponder.create({
				onStartShouldSetPanResponderCapture: () => false,
				onMoveShouldSetPanResponderCapture: (_event: any, gesture: any) =>
					!!dragRef.current && !dragRef.current.settling && (Math.abs(gesture.dx) > SLOP || Math.abs(gesture.dy) > SLOP),
				onPanResponderGrant: () => {
					panActive.current = true
				},
				onPanResponderTerminationRequest: () => false,
				onPanResponderMove: (_event: any, gesture: any) => {
					finger.current = { dx: gesture.dx, dy: gesture.dy, y: gesture.moveY }
					step()
				},
				onPanResponderRelease: finish,
				onPanResponderTerminate: finish,
			}),
		[],
	)

	/** Measures everything, in the container's coordinates. */
	const measureAll = async (next: Drag) => {
		const box = await measure(container.current)
		const fromBox = await measure(rowRefs.current.get(`${next.from}\u0000${next.fromIndex}`))
		const s = latest.current.scroller
		const viewport = s ? await measure(s.ref.current) : undefined
		if (!box || !fromBox) return
		const groups: GroupGeo[] = []
		for (const section of latest.current.sections) {
			const groupBox = await measure(groupRefs.current.get(section.id))
			if (!groupBox) continue
			const top = groupBox.y - box.y
			const boxes: Box[] = []
			for (let index = 0; index < section.keys.length; index++) {
				const rowBox = await measure(rowRefs.current.get(`${section.id}\u0000${index}`))
				if (rowBox) boxes.push(rowBox)
			}
			const rows = boxes.map((rowBox, index) => ({
				top: rowBox.y - box.y,
				pitch: index < boxes.length - 1 ? boxes[index + 1].y - rowBox.y : rowBox.height,
			}))
			let header: number
			let footer: number
			if (rows.length) {
				const last = boxes[boxes.length - 1]
				header = rows[0].top - top
				footer = groupBox.y + groupBox.height - (last.y + last.height)
			} else {
				const empty = await measure(rowRefs.current.get(`${section.id}\u0000empty`))
				header = empty ? empty.y - groupBox.y : 0
				footer = groupBox.height - header - EMPTY_HEIGHT
			}
			groups.push({ id: section.id, top, height: groupBox.height, header, footer, after: 0, rows })
		}
		groups.forEach((group, index) => {
			const nextGroup = groups[index + 1]
			group.after = nextGroup ? nextGroup.top - (group.top + group.height) : 0
		})
		if (dragRef.current !== next) return
		const geometry: Geometry = {
			screen: box,
			from: { left: fromBox.x - box.x, top: fromBox.y - box.y, width: fromBox.width, height: fromBox.height },
			groups,
			offset0: s?.offset ?? 0,
			viewport,
		}
		if (s) s.driving = true
		put({ ...next, geometry, target: { section: next.from, index: next.fromIndex, slotTop: fromBox.y - box.y } })
		step()
		frame.current = requestAnimationFrame(tick)
	}

	const start = (key: string, from: string, fromIndex: number) => {
		if (dragRef.current) return
		const next: Drag = { key, from, fromIndex }
		panActive.current = false
		finger.current = { dx: 0, dy: 0 }
		tx.setValue(0)
		ty.setValue(0)
		setPicking(null)
		put(next)
		buzz(20)
		Animated.spring(lift, { toValue: 1, friction: 6, useNativeDriver: true }).start()
		latest.current.onDragging?.(true)
		// After the picker (if one was open) has closed, so nothing measures it.
		requestAnimationFrame(() => {
			void measureAll(next)
		})
	}

	/** Let go without moving: the row or grip kept the touch. Offer "Move to" instead. */
	const releaseStill = () => {
		setTimeout(() => {
			const current = dragRef.current
			if (!current || panActive.current || current.settling) return
			clear()
			setPicking({ key: current.key, section: current.from })
		}, 0)
	}

	const pick = (key: string, from: string, fromIndex: number, to: string, index: number) => {
		setPicking(null)
		if (from === to && index === fromIndex) return
		buzz(12)
		animateLayout()
		setPending({ key, from, fromIndex, to, index, base: signature(latest.current.sections) })
		onMove(key, from, to, index)
	}

	const geometry = drag?.geometry
	const brand = token('BACKGROUND_BRAND', '#5865f2')
	const live = !!(drag && geometry && !drag.cancel && drag.target)

	return (
		<View ref={container} collapsable={false} style={{ gap }} {...responder.panHandlers}>
			{shown.map(section => {
				const SectionGroup = section.Group ?? Group
				const target = live && drag?.target?.section === section.id ? drag.target : undefined
				const children: any[] = []
				const seen = new Map<string, number>()
				let visible = 0
				section.keys.forEach((key, index) => {
					const n = seen.get(key) ?? 0
					seen.set(key, n + 1)
					const isDragged = !!drag && drag.from === section.id && drag.fromIndex === index
					if (!isDragged && target && target.index === visible) {
						children.push(<Gap key={'\u0000gap'} height={geometry!.from.height} colour={brand} />)
					}
					if (!isDragged || !live) visible++
					const isPicking = !drag && picking?.section === section.id && picking.key === key
					children.push(
						<Item
							key={`${key}#${n}`}
							row={renderRow(key, section.id)}
							dim={dimmed?.(key, section.id)}
							mode={isDragged ? (live ? 'collapsed' : 'faded') : 'normal'}
							holder={(ref: any) => {
								const id = `${section.id}\u0000${index}`
								if (ref) rowRefs.current.set(id, ref)
								else rowRefs.current.delete(id)
							}}
							onPress={
								onPressRow
									? () => {
											if (picking) setPicking(null)
											else onPressRow(key, section.id)
										}
									: undefined
							}
							onLongPress={() => start(key, section.id, index)}
							onPressOut={releaseStill}
							onGripStart={() => start(key, section.id, index)}
							onGripEnd={releaseStill}
							picker={
								isPicking ? (
									<Picker
										sections={shown}
										section={section.id}
										index={index}
										onPick={(to, at) => pick(key, section.id, index, to, at)}
										onClose={() => setPicking(null)}
									/>
								) : null
							}
						/>,
					)
				})
				if (target && target.index >= visible) {
					children.push(<Gap key={'\u0000gap'} height={geometry!.from.height} colour={brand} />)
				}
				if (!visible && !target) {
					children.push(
						<Empty
							key={'\u0000empty'}
							holder={(ref: any) => {
								const id = `${section.id}\u0000empty`
								if (ref) rowRefs.current.set(id, ref)
								else rowRefs.current.delete(id)
							}}
						/>,
					)
				}
				return (
					<View
						key={section.id}
						collapsable={false}
						ref={(ref: any) => {
							if (ref) groupRefs.current.set(section.id, ref)
							else groupRefs.current.delete(section.id)
						}}
					>
						<SectionGroup {...section.groupProps}>{children}</SectionGroup>
						{target && !drag?.settling ? (
							<View
								pointerEvents="none"
								style={{
									position: 'absolute',
									left: -4,
									right: -4,
									top: -4,
									bottom: -4,
									borderRadius: 18,
									borderWidth: 2,
									borderColor: brand,
									opacity: 0.45,
								}}
							/>
						) : null}
					</View>
				)
			})}

			{drag && geometry ? (
				<Animated.View
					pointerEvents="none"
					style={{
						position: 'absolute',
						left: geometry.from.left,
						top: geometry.from.top,
						width: geometry.from.width,
						opacity: drag.cancel ? 0.5 : 1,
						transform: [
							{ translateX: tx },
							{ translateY: ty },
							{ scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, LIFT_SCALE] }) },
							{ rotate: lift.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${TILT_DEG}deg`] }) },
						],
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
