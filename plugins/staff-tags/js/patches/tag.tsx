import { lookupModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { cloneElement, createElement } from 'react'
import { reportError } from '../../../../shared/report'
import { whenFound } from '../lib/discord'
import { childList, findInTree, isElement, replaceInTree } from '../lib/tree'
import TagIcon from '../ui/TagIcon'
import type { ComponentType, ReactNode } from 'react'
import type { TagModule, TagProps } from '../lib/discord'

/**
 * Paints the resolved tag on profiles and member lists: its text, colours, optional icon and
 * optional gradient. Every change is a copy of what Discord rendered, never an edit of it.
 */

interface GradientProps {
	colors: string[]
	start: { x: number; y: number }
	end: { x: number; y: number }
	style?: unknown
	children?: ReactNode
}

/**
 * `react-native-linear-gradient`. Several modules carry a `LinearGradient` export and the first
 * match is not always the component: on 348.1 one exports the *string* "LinearGradient" (the
 * native view-config name), and handing a string to createElement asks React for an unknown host
 * component. Only a function is a component, so keep looking until one turns up. Optional:
 * without it a gradient tag keeps its solid first colour.
 */
const linearGradient = whenFound<ComponentType<GradientProps>>(() => {
	try {
		for (const [exports] of lookupModules(
			withProps<{ LinearGradient: unknown }>('LinearGradient'),
		)) {
			const module = exports as { LinearGradient?: unknown; default?: unknown }
			const candidate = module.LinearGradient ?? module.default
			if (typeof candidate === 'function')
				return candidate as ComponentType<GradientProps>
		}
	} catch {
		/* no gradient support on this build */
	}
	return undefined
})

function paint(rendered: ReactNode, props: TagProps | undefined): ReactNode {
	const {
		text,
		textColor,
		backgroundColor,
		gradientColor,
		icon,
		customSvg,
		iconOnly,
	} = props ?? {}
	if (!isElement(rendered)) return rendered
	const label = findInTree(
		rendered,
		node => typeof node.props.children === 'string',
	)
	if (!label) return rendered

	let out = rendered
	if (text || textColor) {
		const next = replaceInTree(
			out,
			node => node === label,
			node =>
				cloneElement(node, {
					...(text ? { children: iconOnly && icon ? '' : text } : {}),
					...(textColor
						? { style: [node.props.style, { color: textColor }] }
						: {}),
				}),
		)
		if (isElement(next)) out = next
	}
	if (backgroundColor)
		out = cloneElement(out, { style: [out.props.style, { backgroundColor }] })

	// The icon goes in the tag's own row, not inside the label: an SVG nested in a Text does not
	// render on Android.
	if (icon) {
		const iconElement = (
			<TagIcon
				key="staff-tags-icon"
				icon={icon}
				customSvg={customSvg}
				color={textColor ?? '#FFFFFF'}
			/>
		)
		out = cloneElement(out, {
			children: [iconElement, ...childList(out.props.children)],
		})
	}

	// A gradient replaces the tag's background, so the element becomes one that can draw it: same
	// style and children, different host component.
	if (gradientColor && backgroundColor) {
		const Gradient = linearGradient()
		if (Gradient)
			return createElement(
				Gradient,
				{
					colors: [backgroundColor, gradientColor],
					start: { x: 0, y: 0.5 },
					end: { x: 1, y: 0.5 },
					style: out.props.style,
				},
				out.props.children,
			)
	}

	return out
}

/** Hooks Discord's tag component. Returns the unpatch. */
export default function patchTag(module: TagModule): () => void {
	return instead(module, 'default', function (args, original) {
		const rendered = Reflect.apply(original, this, args)
		try {
			return paint(rendered, args[0])
		} catch (error) {
			reportError('[StaffTags] tag paint failed:', error)
			return rendered
		}
	})
}
