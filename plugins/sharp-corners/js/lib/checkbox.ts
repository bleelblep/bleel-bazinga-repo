/**
 * Checkboxes, squared. `design/void/Checkbox/native/Checkbox.tsx` (352.2 hasm) is `Checkbox({ style,
 * selected })` rendering an `<Image style source>` of a round PNG: an empty ring, or a filled circle
 * with a tick. It's a picture, so no shape hook in Corners.kt can square it. FormCheckbox (22 x 22)
 * and FormCheckboxRow use it, e.g. "Trust <site> links from now on" in the Leaving Discord alert.
 *
 * The picture is swapped for a View of the same size: a hollow square when off, a filled square
 * with Discord's tick when on, in the theme's colours.
 */

import { getModuleByPath } from '../../../../shared/modules'
import { reportError } from '../../../../shared/report'
import * as assets from '@valenced/assets'
import { Tokens } from '@valenced/discord/common/tokens'
import { Stores } from '@valenced/discord/flux'
import { after, before } from '@valenced/patcher'
import * as react from '@valenced/react'
import * as ReactNative from 'react-native'
import { componentTarget } from './status'

const TAG = '[Sharp Corners]'
const PATH = 'design/void/Checkbox/native/Checkbox.tsx'

/** A colour by token name through the theme in use (as Char Counter's badge resolves its colours). */
function token(name: string, fallback: string): string {
	try {
		const tokens: any = Tokens
		const theme = (Stores as any).ThemeStore?.theme
		const color = tokens.default.colors[name]
		const resolved = color ? tokens.default.internal.resolveSemanticColor(theme, color) : undefined
		return typeof resolved === 'string' ? resolved : fallback
	} catch {
		return fallback
	}
}

function tickSource(): any {
	try {
		return assets.getAssetIdByName('CheckmarkSmallIcon') ?? assets.getAssetIdByName('CheckmarkLargeIcon')
	} catch {
		return undefined
	}
}

function squareBox(image: any, selected: boolean): any {
	const { React } = react
	const { View, Image, StyleSheet } = ReactNative
	const flat: any = StyleSheet.flatten(image.props.style) ?? {}
	const size = typeof flat.width === 'number' ? flat.width : 22
	const border = Math.max(2, Math.round(size / 11))
	const base = [image.props.style, { borderRadius: 0, alignItems: 'center', justifyContent: 'center' }]
	if (!selected) {
		return React.createElement(View, {
			key: image.key,
			style: [...base, { backgroundColor: 'transparent', borderWidth: border, borderColor: token('INTERACTIVE_TEXT_DEFAULT', '#b5bac1') }],
		})
	}
	const tick = tickSource()
	const inner = Math.round(size * 0.75)
	return React.createElement(
		View,
		{ key: image.key, style: [...base, { backgroundColor: token('CONTROL_BRAND_FOREGROUND', '#5865f2') }] },
		tick != null
			? React.createElement(Image, { source: tick, style: { width: inner, height: inner, tintColor: '#ffffff' } })
			: null,
	)
}

/** Swaps the round checkbox picture while `active()` says so. Returns a cleanup. */
export function squareCheckbox(active: () => boolean): () => void {
	const cleanups: Array<() => void> = []
	cleanups.push(
		getModuleByPath(
			PATH,
			null,
			(ns: any) => {
				const target = componentTarget(ns?.default, ns)
				if (!target) throw new Error(`${PATH}: default is not a component`)
				let props: any
				cleanups.push(
					before(target[0], target[1], (args: any[]) => {
						props = args?.[0]
						return args // before-hooks must hand the args back
					}),
					after(target[0], target[1], (tree: any) => {
						if (!active()) return tree
						try {
							const { React } = react
							// Only the bare picture is swapped; anything else is a new Checkbox we don't know.
							if (!React.isValidElement(tree) || (tree as any).props?.source == null) return tree
							return squareBox(tree, Boolean(props?.selected))
						} catch (error) {
							reportError(`${TAG} checkbox failed:`, error)
							return tree
						}
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
