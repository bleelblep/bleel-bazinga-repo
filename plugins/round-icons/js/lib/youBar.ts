/**
 * The You bar's fill, YouBarMaskedBackground (props: barWidth, backgroundColor, avatarSize). It
 * renders <MaskedView maskElement={...}><View fill /></MaskedView>; see targets.ts for why the mask
 * is replaced and the colour swapped.
 */

import * as finders from '@valenced/modules/finders'
import * as filters from '@valenced/modules/finders/filters'
import { createElement } from 'react'
import { View } from 'react-native'
import { reportError } from '../../../../shared/report'

const PILL = { borderTopLeftRadius: 9999, borderTopRightRadius: 9999, borderBottomLeftRadius: 9999, borderBottomRightRadius: 9999 }

const wrapped = new WeakMap<object, (props: any) => any>()

function colourTables(): any {
	try {
		const found: any = finders.lookupModule<any>(filters.withProps('unsafe_rawColors', 'colors'))?.[0]
		return found?.colors ? found : found?.default
	} catch {
		return undefined
	}
}

/**
 * The floating bar colour for whichever theme gave Discord `nameplate` as its nameplate colour, so
 * the swap follows the bar's own theme (it renders inside its own ThemeContextProvider). Unchanged
 * when nothing matches.
 */
function themedFill(nameplate: unknown): unknown {
	if (typeof nameplate !== 'string') return nameplate
	try {
		const t = colourTables()
		const resolve = t?.internal?.resolveSemanticColor
		const from = t?.colors?.MOBILE_FLOATINGBAR_BACKGROUND_NAMEPLATE
		const to = t?.colors?.MOBILE_FLOATINGBAR_BACKGROUND
		if (typeof resolve !== 'function' || !from || !to) return nameplate
		const want = nameplate.toLowerCase()
		for (const theme of Object.keys(t.themes ?? {}).map(k => t.themes[k]).filter((x: unknown) => typeof x === 'string')) {
			try {
				if (String(resolve(theme, from)).toLowerCase() === want) return resolve(theme, to) ?? nameplate
			} catch {
				/* theme not resolvable */
			}
		}
	} catch (error) {
		reportError('[Round Corners] You bar colour failed:', error)
	}
	return nameplate
}

export function maskedBackground(original: (props: any) => any): (props: any) => any {
	let component = wrapped.get(original)
	if (component) return component
	component = (props: any) => {
		const out = original({ ...props, backgroundColor: themedFill(props?.backgroundColor) })
		try {
			const mask = out?.props?.maskElement
			if (!mask?.props) return out
			const whole = createElement(View, { style: [mask.props.style, { backgroundColor: 'black' }] })
			// The fill's left corners are a fixed 28 next to the token's 9999. Android shrinks every
			// corner by the same factor when a side's corners add up to more than its length (28 + 9999
			// on a 388 dp top edge: about 4%), so the left end came out square. Equal corners shrink
			// evenly into a pill.
			const fill = out.props.children
			const children =
				fill?.props && !Array.isArray(fill)
					? { ...fill, props: { ...fill.props, style: [fill.props.style, PILL] } }
					: fill
			return { ...out, props: { ...out.props, maskElement: whole, children } }
		} catch (error) {
			reportError('[Round Corners] You bar mask failed:', error)
			return out
		}
	}
	wrapped.set(original, component)
	return component
}


/** The nameplate layer's outer view, widened to the whole bar with round left corners. */
export function pillNameplate(tree: any, props: any): any {
	try {
		const style = tree?.props?.style
		if (!Array.isArray(style) || !style[0] || typeof style[0] !== 'object') return tree
		const width = typeof props?.barWidth === 'number' ? props.barWidth : undefined
		const first = { ...style[0], left: 0, ...PILL, ...(width ? { width } : {}) }
		return { ...tree, props: { ...tree.props, style: [first, ...style.slice(1)] } }
	} catch (error) {
		reportError('[Round Corners] You bar nameplate failed:', error)
		return tree
	}
}
