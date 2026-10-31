/**
 * The icons a tag can carry.
 *
 * Each is a single SVG path drawn in a 24x24 box, plus a text glyph used when react-native-svg
 * cannot be resolved -- so a tag never renders as a blank square. `react-native-svg` is bundled
 * with Discord (confirmed on 348.1: the module exports `Svg`, `Path`, `SvgXml` and `parse`), but
 * it is looked up lazily, never at module scope, because a miss is cached permanently
 * (docs/coding-rules.md rule 1).
 */

import * as finders from '@valenced/modules/finders'
import * as filters from '@valenced/modules/finders/filters'
import { whenFound } from './discord'
import type { ComponentType, ReactNode } from 'react'

interface SvgProps {
	width: number
	height: number
	viewBox?: string
	style?: unknown
	children?: ReactNode
}

/** react-native-svg: the components and parser this plugin uses. */
export interface SvgModule {
	default?: ComponentType<SvgProps>
	Svg?: ComponentType<SvgProps>
	Path: ComponentType<{ d: string; fill: string }>
	parse?(xml: string): unknown
}

interface SvgXmlProps {
	xml: string
	width: number
	height: number
	color: string
}

export interface IconDef {
	id: string
	name: string
	/** 24x24 path data. Empty for "none". */
	path: string
	/** Drawn instead when the SVG module is unavailable. */
	fallback: string
}

export const CUSTOM_ICON = 'custom'
export const MAX_CUSTOM_SVG_LENGTH = 20000

export const ICONS: IconDef[] = [
	{ id: 'none', name: 'No icon', path: '', fallback: '' },
	{
		id: 'star',
		name: 'Star',
		path: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
		fallback: '★',
	},
	{
		id: 'crown',
		name: 'Crown',
		path: 'M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z',
		fallback: '♛',
	},
	{
		id: 'shield',
		name: 'Shield',
		path: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z',
		fallback: '🛡',
	},
	{
		id: 'check',
		name: 'Check',
		path: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
		fallback: '✓',
	},
	{
		id: 'bolt',
		name: 'Bolt',
		path: 'M11 21h-1l1-7H7.5c-.58 0-.57-.32-.38-.66.19-.34.05-.08.07-.12C8.48 10.94 11.07 6 13.5 6c.46 0 .85.33.96.79L15 10h3.5c.49 0 .64.32.45.66-.19.34-.05.08-.07.12C17.52 14.06 15.07 19 13 19l-1 2z',
		fallback: '⚡',
	},
	{
		id: 'flame',
		name: 'Flame',
		path: 'M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73 0-2.15.74-4.8.74-4.8C5.26 3.12 2 7.05 2 12c0 5.52 4.48 10 10 10s10-4.48 10-10c0-4.95-3.26-8.88-7.5-11.33z',
		fallback: '🔥',
	},
	{
		id: 'gem',
		name: 'Gem',
		path: 'M12 2l8 5-8 15-8-15 8-5z',
		fallback: '♦',
	},
	{
		id: 'heart',
		name: 'Heart',
		path: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
		fallback: '♥',
	},
	{
		id: 'lock',
		name: 'Lock',
		path: 'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z',
		fallback: '🔒',
	},
	{
		id: 'key',
		name: 'Key',
		path: 'M12.65 10a5.998 5.998 0 0 0-6.88-3.88c-2.29.46-4.15 2.29-4.63 4.58A6.006 6.006 0 0 0 7 18a5.99 5.99 0 0 0 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z',
		fallback: '🔑',
	},
	{
		id: 'eye',
		name: 'Eye',
		path: 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z',
		fallback: '👁',
	},
	{
		id: 'bell',
		name: 'Bell',
		path: 'M18 16v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z',
		fallback: '🔔',
	},
	{
		id: 'flag',
		name: 'Flag',
		path: 'M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z',
		fallback: '⚑',
	},
	{
		id: 'tag',
		name: 'Tag',
		path: 'M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z',
		fallback: '🏷',
	},
	{
		id: 'robot',
		name: 'Robot',
		path: 'M20 9V7c0-1.1-.9-2-2-2h-3.2c-.5-1.9-2.2-3.3-4.2-3.3S7.9 3.1 7.4 5H4.2C3 5 2 6 2 7.2v9.6C2 18 3 19 4.2 19h.2v1c0 .6.4 1 1 1h1c.6 0 1-.4 1-1v-1h8v1c0 .6.4 1 1 1h1c.6 0 1-.4 1-1v-1h.2c1.2 0 2.2-1 2.2-2.2V9h-2zm-4 7H8v-2h8v2zm0-4H8V9h8v3z',
		fallback: '🤖',
	},
	{
		id: 'moon',
		name: 'Moon',
		path: 'M9 2c-1.05 0-2.05.16-3 .46 1.69 1.23 2.8 3.24 2.8 5.54 0 3.87-3.13 7-7 7-1.04 0-2.02-.23-2.9-.64C2.24 18.24 6.36 22 11.5 22c5.5 0 10-4.5 10-10S17 2 11.5 2c-.83 0-1.63.1-2.39.29C9.32 2.1 9.16 2 9 2z',
		fallback: '🌙',
	},
	{
		id: 'music',
		name: 'Music',
		path: 'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z',
		fallback: '♪',
	},
	{
		id: 'gamepad',
		name: 'Gamepad',
		path: 'M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4-3c-.83 0-1.5-.67-1.5-1.5S18.67 9 19.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
		fallback: '🎮',
	},
	{
		id: 'leaf',
		name: 'Leaf',
		path: 'M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-3 5-5 5z',
		fallback: '🍃',
	},
	{
		id: 'anchor',
		name: 'Anchor',
		path: 'M12 2a3 3 0 0 0-1 5.83V10H8v2h3v6.92A7.01 7.01 0 0 1 5.08 13H7l-3-4-3 4h2.06A9.01 9.01 0 0 0 12 21a9.01 9.01 0 0 0 8.94-8H23l-3-4-3 4h1.92A7.01 7.01 0 0 1 13 18.92V12h3v-2h-3V7.83A3 3 0 0 0 12 2zm0 2a1 1 0 1 1 0 2 1 1 0 0 1 0-2z',
		fallback: '⚓',
	},
]

export function iconById(id: string | undefined): IconDef | undefined {
	if (!id || id === 'none') return undefined
	return ICONS.find(icon => icon.id === id)
}

/**
 * react-native-svg, or undefined on a build that does not bundle it.
 *
 * The first module matching a prop name is not necessarily the one with the components: on 348.1
 * a `LinearGradient` lookup matches a module whose export is the *string* view-config name first.
 * So every candidate is checked until one holds real functions -- a string handed to
 * `createElement` asks React for an unknown host component, which is a native-side failure.
 */
export const svgModule = whenFound<SvgModule>(() => {
	try {
		const { lookupModules } = finders
		const { withProps } = filters
		for (const [exports] of lookupModules(
			withProps<SvgModule>('Svg', 'Path'),
		)) {
			const module = exports as SvgModule
			const Svg = module.default ?? module.Svg
			if (typeof Svg === 'function' && typeof module.Path === 'function')
				return module
		}
		return undefined
	} catch {
		return undefined
	}
})

/** The `SvgXml` component, for pasted markup. */
export const svgXml = whenFound<ComponentType<SvgXmlProps>>(() => {
	try {
		const { lookupModules } = finders
		const { withProps } = filters
		for (const [exports] of lookupModules(
			withProps<{ SvgXml: unknown }>('SvgXml'),
		)) {
			const SvgXml = (exports as { SvgXml?: unknown }).SvgXml
			if (typeof SvgXml === 'function')
				return SvgXml as ComponentType<SvgXmlProps>
		}
		return undefined
	} catch {
		return undefined
	}
})

/**
 * Whether pasted markup is worth trying to draw. Checked before it is stored, so a typo cannot
 * take the chat list down on every row: the parser is the same one the renderer uses.
 */
export function isValidCustomSvg(markup: string | undefined): markup is string {
	const trimmed = markup?.trim()
	if (
		!trimmed ||
		trimmed.length > MAX_CUSTOM_SVG_LENGTH ||
		!/^<svg/i.test(trimmed)
	)
		return false
	try {
		const parse = svgModule()?.parse
		if (typeof parse === 'function') parse(trimmed)
		return true
	} catch {
		return false
	}
}
