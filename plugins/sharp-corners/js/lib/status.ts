/**
 * Status dots, squared. Neither part goes through an Android shape call, so Corners.kt misses them:
 *
 * - The dot itself is a round PNG. `design/void/Status/native/Status.tsx` renders an `<Image
 *   resizeMode="stretch">` of the status asset (351.3 hasm). It's swapped for a plain View in the
 *   status colour: filled for online / idle / do not disturb / streaming, a hollow square for
 *   offline. Mobile and VR statuses keep Discord's icon (they're phone and headset shapes).
 * - The hole cut in the avatar around it is a native `ClipView` cutout. `getAvatarStatusCutout`
 *   (StatusUtils.tsx) returns `{ nativeCutouts: [{ shape: 'circle', x, y, size }] }`, where x/y are
 *   the top-left of the cutout's square. It becomes a `'rounded-rect'` of the same square with no
 *   corner. Existing rounded-rect cutouts (mobile, typing) lose their corner too.
 *   On 352.2 `getAvatarStatusCutout` is private to Avatar.tsx, so the same rewrite runs on the
 *   `cutout` prop Avatar hands its image element.
 */

import { getModuleByPath } from '../../../../shared/modules'
import { reportError } from '../../../../shared/report'
import { after, before } from '@valenced/patcher'
import * as react from '@valenced/react'
import * as ReactNative from 'react-native'
import { rawColors } from './tokens'

const TAG = '[Sharp Corners]'
const STATUS_PATH = 'design/void/Status/native/Status.tsx'
const UTILS_PATH = 'design/void/Status/native/StatusUtils.tsx'
const AVATAR_PATH = 'design/void/Avatar/native/Avatar.tsx'

/** Discord's own dot colours (Status.tsx reads these raw colours). */
function colourFor(status: string, streaming: boolean): { colour?: string; hollow: boolean } {
	const raw = rawColors()
	if (streaming || status === 'streaming') return { colour: raw?.PLATFORM_TWITCH, hollow: false }
	switch (status) {
		case 'online':
			return { colour: raw?.GREEN_360, hollow: false }
		case 'idle':
			return { colour: raw?.YELLOW_300, hollow: false }
		case 'dnd':
			return { colour: raw?.RED_400, hollow: false }
		default:
			return { colour: raw?.PRIMARY_400, hollow: true }
	}
}

function isDotImage(node: any): boolean {
	const props = node?.props
	return Boolean(props && props.source != null && props.resizeMode === 'stretch')
}

/** Replaces the dot Image in a rendered tree, a few levels deep at most. */
function swapDot(node: any, make: (image: any) => any, depth = 0): any {
	const { React } = react
	if (node == null || depth > 6) return node
	if (Array.isArray(node)) {
		let changed = false
		const next = node.map(child => {
			const swapped = swapDot(child, make, depth + 1)
			if (swapped !== child) changed = true
			return swapped
		})
		return changed ? next : node
	}
	if (!React.isValidElement(node)) return node
	if (isDotImage(node)) return make(node)
	const children = (node as any).props?.children
	if (children == null || typeof children !== 'object') return node
	const next = swapDot(children, make, depth + 1)
	return next === children ? node : React.cloneElement(node as any, { children: next } as any)
}

function squareDot(tree: any, props: any): any {
	if (!props || props.isMobileOnline || props.isVROnline) return tree
	const { React } = react
	const { View, StyleSheet } = ReactNative
	const status = String(props.status ?? '').toLowerCase()
	const { colour, hollow } = colourFor(status, Boolean(props.streaming))
	if (!colour) return tree
	return swapDot(tree, image => {
		const flat: any = StyleSheet.flatten(image.props.style) ?? {}
		const width = typeof flat.width === 'number' ? flat.width : typeof props.size === 'number' ? props.size : 10
		const shape = hollow
			? { backgroundColor: 'transparent', borderColor: colour, borderWidth: Math.max(1, Math.round(width * 0.25)) }
			: { backgroundColor: colour }
		return React.createElement(View, { key: image.key, style: [image.props.style, shape, { borderRadius: 0 }] })
	})
}

function squareCutouts(result: any, sharpenRects: boolean): any {
	const cutouts = result?.nativeCutouts
	if (!Array.isArray(cutouts)) return result
	let changed = false
	const next = cutouts.map((cutout: any) => {
		if (cutout?.shape === 'circle' && typeof cutout.size === 'number') {
			changed = true
			return { shape: 'rounded-rect', x: cutout.x, y: cutout.y, width: cutout.size, height: cutout.size, cornerRadius: 0 }
		}
		if (sharpenRects && cutout?.shape === 'rounded-rect' && cutout.cornerRadius) {
			changed = true
			return { ...cutout, cornerRadius: 0 }
		}
		return cutout
	})
	return changed ? { ...result, nativeCutouts: next } : result
}

/** Rewrites every `cutout` prop in Avatar's rendered tree, a few levels deep at most. */
function squareCutoutProps(node: any, sharpenRects: boolean, depth = 0): any {
	const { React } = react
	if (node == null || depth > 6) return node
	if (Array.isArray(node)) {
		let changed = false
		const next = node.map(child => {
			const squared = squareCutoutProps(child, sharpenRects, depth + 1)
			if (squared !== child) changed = true
			return squared
		})
		return changed ? next : node
	}
	if (!React.isValidElement(node)) return node
	const props: any = (node as any).props
	const extra: any = {}
	if (props?.cutout?.nativeCutouts) {
		const cutout = squareCutouts(props.cutout, sharpenRects)
		if (cutout !== props.cutout) extra.cutout = cutout
	}
	const children = props?.children
	if (children != null && typeof children === 'object') {
		const next = squareCutoutProps(children, sharpenRects, depth + 1)
		if (next !== children) extra.children = next
	}
	return Object.keys(extra).length ? React.cloneElement(node as any, extra) : node
}

/** Avatar is a plain function, a memo(fn) or a forwardRef depending on the build. */
function componentTarget(exported: any, ns: any): [any, string] | undefined {
	return typeof exported === 'function'
		? [ns, 'default']
		: typeof exported?.type === 'function'
			? [exported, 'type']
			: typeof exported?.render === 'function'
				? [exported, 'render']
				: undefined
}

/** 352.2+: the cutout is computed inside Avatar, so square it on the way out. */
function hookAvatarCutouts(ovals: () => boolean, app: () => boolean, cleanups: Array<() => void>): () => void {
	return getModuleByPath(
		AVATAR_PATH,
		null,
		(ns: any) => {
			const target = componentTarget(ns?.default, ns)
			if (!target) throw new Error(`${AVATAR_PATH}: default is not a component`)
			cleanups.push(
				after(target[0], target[1], (tree: any) => {
					if (!ovals()) return tree
					try {
						return squareCutoutProps(tree, app())
					} catch (error) {
						reportError(`${TAG} avatar cutout failed:`, error)
						return tree
					}
				}),
			)
		},
		TAG,
	)
}

/** Installs both hooks while `ovals()` says so. Returns a cleanup. */
export function squareStatus(ovals: () => boolean, app: () => boolean): () => void {
	const cleanups: Array<() => void> = []
	const guard = (what: string, fn: () => void) => {
		try {
			fn()
		} catch (error) {
			reportError(`${TAG} ${what} failed:`, error)
		}
	}

	cleanups.push(
		getModuleByPath(
			STATUS_PATH,
			null,
			(ns: any) => {
				// Status is a plain function, a memo(fn) or a forwardRef depending on the build.
				const target = componentTarget(ns?.default, ns)
				if (!target) throw new Error(`${STATUS_PATH}: default is not a component`)
				let props: any
				cleanups.push(
					before(target[0], target[1], (args: any[]) => {
						props = args?.[0]
						return args // before-hooks must hand the args back
					}),
					after(target[0], target[1], (tree: any) => {
						if (!ovals()) return tree
						try {
							return squareDot(tree, props)
						} catch (error) {
							reportError(`${TAG} status dot failed:`, error)
							return tree
						}
					}),
				)
			},
			TAG,
		),
		getModuleByPath(
			UTILS_PATH,
			null,
			(ns: any) => {
				if (typeof ns?.getAvatarStatusCutout !== 'function') {
					cleanups.push(hookAvatarCutouts(ovals, app, cleanups))
					return
				}
				cleanups.push(
					after(ns, 'getAvatarStatusCutout', (result: any) => {
						if (!ovals()) return result
						let out = result
						guard('status cutout', () => {
							out = squareCutouts(result, app())
						})
						return out
					}),
				)
			},
			TAG,
		),
	)

	return () => {
		for (const cleanup of cleanups.splice(0).reverse()) {
			try {
				cleanup()
			} catch {
				/* already gone */
			}
		}
	}
}
