/**
 * Re-rounds the corners in one component's render output.
 *
 * The redesign kept Discord's shared corner tokens and hardcoded smaller corners per component
 * instead, usually assembled from several style pieces, so no single style object or token can be
 * patched. What's always there is the element tree a component returns: every view's final `style`
 * is on it. So each target component gets an after-hook on its render, and its output is walked
 * with a rule that says what corner a view of this size should have. The rule sees only that
 * component's views, so "a square up to 40 dp is a circle" can't leak into anything else, and if a
 * component is renamed or removed only that target stops working.
 *
 * The tree is copied, never mutated: React Compiler caches element trees between renders, and
 * editing a cached tree in place is how the old You bar patch broke other renders.
 *
 * Some views only exist inside components a module doesn't export (the send button on 350.2+ is
 * `ChatInputSendButton` -> TransitionGroup -> an inner function that draws the actual button). A
 * render hook on the export sees only the outer elements, so `roundTree` also replaces the type of
 * any function component it meets with a wrapper that renders the original and re-rounds what it
 * returns, a few levels down. Wrappers are cached per original so React keeps the same identity.
 */

import * as ReactNative from 'react-native'

export interface Box {
	width?: number
	height?: number
	radius: number
}

/** What corner a view with this box should get, or undefined to leave it as Discord drew it. */
export type Rule = (box: Box, props: any) => number | undefined

function flatten(style: any): any {
	try {
		return ReactNative.StyleSheet.flatten(style)
	} catch {
		return undefined
	}
}

/** A Pressable's style can be a function of the press state; the corner is read off the resting state. */
function resting(style: any): any {
	if (typeof style !== 'function') return style
	try {
		return style({ pressed: false, hovered: false, focused: false })
	} catch {
		return undefined
	}
}

function boxOf(style: any): Box | undefined {
	const flat = flatten(resting(style))
	if (!flat || typeof flat !== 'object') return undefined
	const radius = flat.borderRadius
	if (typeof radius !== 'number' || radius <= 0) return undefined
	return {
		width: typeof flat.width === 'number' ? flat.width : undefined,
		height: typeof flat.height === 'number' ? flat.height : undefined,
		radius,
	}
}

/**
 * How many component levels below the hooked one get wrapped. The send button needs five
 * (351.3, seen on device 2026-10-18): ChatInputSendButton -> FloatingSlot/TransitionGroup ->
 * ChatInputSendButtonInner -> ChatInputActionButtonTransitionItem -> the shared Button, whose own
 * styles carry the corner.
 */
const MAX_LEVELS = 6

const wrappers = new WeakMap<any, Map<Rule, any>>()

/**
 * The render function of a component element's type: a plain function or a memo(fn). Class
 * components, hosts and forwardRef are left alone (a wrapper can't pass a ref through, and
 * `ChatInputSendButton` hands one to `useImperativeHandle`).
 */
function renderOf(type: any): ((props: any) => any) | undefined {
	if (typeof type === 'function') return type.prototype?.isReactComponent ? undefined : type
	if (type && typeof type === 'object' && typeof type.type === 'function' && !type.render) return renderOf(type.type)
	return undefined
}

/**
 * Reanimated's animated components (REAWorkaroundView, AnimatedComponent, createAnimatedComponent
 * output) apply their animated styles through their own instance; called through a plain wrapper
 * they lose them. On 351.3 that stripped the message box's rounding and fill (2026-10-19).
 */
function isAnimated(type: any): boolean {
	const name = String(type?.displayName || type?.name || type?.type?.displayName || type?.type?.name || '')
	return /REA|Animated|Reanimated|Workaround/i.test(name)
}

function wrapperFor(type: any, rule: Rule, level: number): any {
	if (isAnimated(type)) return undefined
	const render = renderOf(type)
	if (!render) return undefined
	let byRule = wrappers.get(type)
	if (!byRule) wrappers.set(type, (byRule = new Map()))
	let Wrapped = byRule.get(rule)
	if (!Wrapped) {
		Wrapped = function RoundedInner(props: any) {
			return roundTree(render(props), rule, 0, level + 1, props, true)
		}
		Wrapped.displayName = `RoundCorners(${type.displayName || type.name || type.type?.name || 'inner'})`
		byRule.set(rule, Wrapped)
	}
	return Wrapped
}

/** A copy of `node` with every matching corner re-rounded. The same tree back when nothing matched. */
export function roundTree(node: any, rule: Rule, depth = 0, level = 0, ownerProps?: any, deep = false): any {
	if (depth > 14 || !node || typeof node !== 'object') return node
	if (Array.isArray(node)) {
		let changed = false
		const out = node.map(child => {
			const next = roundTree(child, rule, depth + 1, level, ownerProps, deep)
			if (next !== child) changed = true
			return next
		})
		return changed ? out : node
	}
	const props = node.props
	if (!props || typeof props !== 'object') return node
	let style = props.style
	const box = boxOf(style)
	if (box) {
		// Discord's "round" (2^31 - 1) draws square on Android: cap it wherever a target sees it.
		const next = box.radius > FULL ? FULL : rule(box, ownerProps ?? props)
		if (typeof next === 'number' && next !== box.radius) {
			const raw = props.style
			// Keep a function style a function (Pressable calls it with the press state), with our
			// corner layered over whatever it returns.
			style = typeof raw === 'function' ? (state: any) => [raw(state), { borderRadius: next }] : [raw, { borderRadius: next }]
		}
	}
	const children = roundTree(props.children, rule, depth + 1, level, ownerProps, deep)
	// Another plugin's wrapper may carry the real element as a prop (Send Tweaks: `<SwipeButton element>`).
	const element = props.element && typeof props.element === 'object' && props.element.props ? roundTree(props.element, rule, depth + 1, level, ownerProps, deep) : props.element
	// Reach into components the module doesn't export, a few levels down.
	const type = deep && level < MAX_LEVELS && typeof node.type !== 'string' ? wrapperFor(node.type, rule, level) : undefined
	if (style === props.style && children === props.children && element === props.element && !type) return node
	return { ...node, ...(type ? { type } : {}), props: { ...props, style, children, ...(element !== props.element ? { element } : {}) } }
}

/** A radius React Native clamps to "as round as it can be". */
export const FULL = 9999

/** Rules that targets share. */
export const rules = {
	/** A square up to `max` dp becomes a circle. */
	circleIfSquare:
		(max: number): Rule =>
		({ width, height, radius }) =>
			width !== undefined && height !== undefined && Math.abs(width - height) < 1 && width <= max && radius < width / 2 ? width / 2 : undefined,
	/** A bar between `min` and `max` dp tall (wider than tall, or of unknown width) becomes a pill. */
	pillIfBar:
		(min: number, max: number): Rule =>
		({ width, height, radius }) =>
			height !== undefined && height >= min && height <= max && (width === undefined || width > height) && radius < height / 2 ? height / 2 : undefined,
	/**
	 * Any corner of at least `min` becomes fully round: React Native clamps a huge radius to half the
	 * smaller side, so a square becomes a circle and a bar a pill without knowing the size. For views
	 * whose size isn't in their style (sized by their children or an animated style).
	 */
	fullRoundIf:
		(min: number): Rule =>
		({ radius }) =>
			radius >= min && radius < FULL ? FULL : undefined,
	/** Several rules; the first that answers wins. */
	any:
		(...all: Rule[]): Rule =>
		(box, props) => {
			for (const rule of all) {
				const next = rule(box, props)
				if (next !== undefined) return next
			}
			return undefined
		},
}
