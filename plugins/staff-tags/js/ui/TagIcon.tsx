/**
 * The little icon a tag can carry.
 *
 * Three ways to draw one, in order: a built-in path, pasted `<svg>` markup, and -- when
 * react-native-svg cannot be resolved on this build -- the icon's text glyph, so a tag never
 * renders as an empty gap.
 *
 * Every lookup happens at render time. Resolving modules at module scope during a plugin's
 * preInit can permanently cache a miss (docs/coding-rules.md rule 1).
 */

import * as ReactNative from 'react-native'
import {
	CUSTOM_ICON,
	iconById,
	isValidCustomSvg,
	svgModule,
	svgXml,
} from '../lib/icons'

export interface TagIconProps {
	/** Icon id, or `custom` when `customSvg` holds the markup. */
	icon?: string
	customSvg?: string
	color: string
	size?: number
}

export default function TagIcon({
	icon,
	customSvg,
	color,
	size = 12,
}: TagIconProps) {
	const { Text } = ReactNative

	if (!icon || icon === 'none') return null

	if (icon === CUSTOM_ICON) {
		const Xml = svgXml()
		if (typeof Xml === 'function' && isValidCustomSvg(customSvg)) {
			return <Xml xml={customSvg} width={size} height={size} color={color} />
		}
		return null
	}

	const def = iconById(icon)
	if (!def) return null

	const svg = svgModule()
	const Svg = svg?.default ?? svg?.Svg
	const Path = svg?.Path
	// Functions only: a string here would be an unknown host component, not a drawable icon.
	if (typeof Svg !== 'function' || typeof Path !== 'function' || !def.path) {
		// No SVG support on this build: the glyph says the same thing in one character.
		return def.fallback ? (
			<Text style={{ color, fontSize: size, marginRight: 2 }}>
				{def.fallback}
			</Text>
		) : null
	}

	return (
		<Svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			style={{ marginRight: 2 }}
		>
			<Path d={def.path} fill={color} />
		</Svg>
	)
}
