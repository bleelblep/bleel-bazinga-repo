/**
 * The favourites tile, and the grid that lays four of them out as a 2×2 block.
 *
 * ## Icons
 *
 * Tiles want a bigger icon than a settings row, but the row icon (`TableRow.Icon`, via `rowIcon`)
 * is the one that already gets the theme's tint right in light and dark mode. Drawing icons
 * directly would mean resolving theme colours by hand, which is exactly the kind of guess that
 * rendered `text-normal` black in this repository. So the row icon is reused and scaled up, and
 * sits in a circle washed with a neutral translucent grey -- a colour that reads on both themes
 * without resolving any theme token.
 *
 * ## Sizing
 *
 * Tiles are sized from the measured width of the container rather than from percentages. The one
 * favourite left without a partner on its row is drawn wide, spanning both columns and the gap.
 *
 * Every `valenced.*` read happens inside a render, never at module scope (coding rule 1).
 */

import { rowIcon } from '../icon'
import type { Entry } from '../../types'
import { Design } from '@valenced/discord/design'
import { lookupModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import * as React from 'react'
import * as ReactNative from 'react-native'

/** Fixed colours for a re-skinned hub (Cornhub); without one, the theme's own colours are used. */
export interface TilePalette {
	card: string
	white: string
	grey: string
	orange: string
}

export interface TileState {
	openable: boolean
	note?: string
}

/** Space between tiles. Exported so a wide card can span two tiles and the gap between them. */
export const GRID_GAP = 10
const GAP = GRID_GAP
const CIRCLE = 52
/** Neutral on both themes: grey at low alpha lightens a dark card and darkens a light one. */
const CIRCLE_WASH = 'rgba(128, 132, 142, 0.18)'

/** The tinted circle with the plugin's icon in it. Smaller on the wide card, which sits among rows. */
function IconCircle({ icon, size = CIRCLE, wash = CIRCLE_WASH }: { icon?: string; size?: number; wash?: string }) {
	const { View } = ReactNative
	return (
		<View
			style={{
				width: size,
				height: size,
				borderRadius: size / 2,
				backgroundColor: wash,
				alignItems: 'center',
				justifyContent: 'center',
			}}
		>
			<View style={{ transform: [{ scale: size === CIRCLE ? 1.5 : 1.2 }] }}>
				{rowIcon(icon ?? 'PuzzlePieceIcon', 'PuzzlePieceIcon') ?? null}
			</View>
		</View>
	)
}

const WIDE_CIRCLE = 40
const ARROW_PATH = 'design/components/TableRow/native/TableRowArrow.native.tsx'

/**
 * The chevron Discord's own rows end in (`TableRowArrow`), so the wide card's › is the same glyph,
 * size and colour as the list under it. Found by its source path; if that ever moves, a chevron
 * icon by name stands in, and failing that there is simply no arrow.
 */
let TableRowArrow: any
function RowArrow() {
	if (TableRowArrow === undefined) {
		try {
			const [exports] =
				lookupModuleWithImportedPath<any>(ARROW_PATH)
			TableRowArrow = typeof exports?.TableRowArrow === 'function' ? exports.TableRowArrow : null
		} catch {
			TableRowArrow = null
		}
	}
	if (TableRowArrow) return <TableRowArrow />
	return rowIcon('ChevronSmallRightIcon', 'ArrowSmallRightIcon') ?? null
}

/**
 * A favourite: the icon in a tinted circle, the name under it, a note if it cannot open.
 *
 * `wide` is for a favourite with no partner on its row -- the only one, or the last of an odd
 * number. It spans the row as a card shaped like the list below it, only a little taller: a
 * smaller circle on the left, the name with the plugin's one-line description under it, and the
 * same chevron the rows end in. A square tile there left half the row empty; a first attempt at a
 * wide card was twice a row's height with nothing on its right, and read as unfinished.
 */
export function Tile({
	entry,
	state,
	onPress,
	width,
	wide,
	description,
	palette,
}: {
	entry: Entry
	state: TileState
	onPress: () => void
	width: number
	wide?: boolean
	/** Shown under the name on the wide card only. */
	description?: string
	palette?: TilePalette
}) {
	const { View, Pressable } = ReactNative
	const { Text, Card: ThemedCard } = Design

	// A palette swaps the themed card and text colours for fixed ones; the layout is unchanged.
	const Card = palette
		? ({ children, style }: { children: any; style?: any }) => (
				<View style={[{ backgroundColor: palette.card, borderRadius: 16 }, style]}>{children}</View>
			)
		: ThemedCard
	const nameStyle = palette ? { color: palette.white } : undefined
	const mutedStyle = palette ? { color: palette.grey } : undefined
	const wash = palette ? 'rgba(255, 163, 26, 0.18)' : undefined

	if (wide) {
		const detail = state.note ?? description
		return (
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={`Open ${entry.name} settings`}
				disabled={!state.openable}
				onPress={onPress}
				style={({ pressed }: { pressed: boolean }) => ({
					width,
					opacity: state.openable ? (pressed ? 0.6 : 1) : 0.4,
				})}
			>
				<Card variant="secondary" border="none">
					<View
						style={{
							flexDirection: 'row',
							alignItems: 'center',
							paddingVertical: 10,
							paddingLeft: 12,
							gap: 12,
						}}
					>
						<IconCircle icon={entry.icon} size={WIDE_CIRCLE} wash={wash} />
						<View style={{ flex: 1, gap: 2 }}>
							<Text color="text-default" variant="text-md/semibold" numberOfLines={1} style={nameStyle}>
								{entry.name}
							</Text>
							{detail ? (
								<Text color="text-muted" variant="text-sm/normal" numberOfLines={1} style={mutedStyle}>
									{detail}
								</Text>
							) : null}
						</View>
						{state.openable ? <RowArrow /> : null}
					</View>
				</Card>
			</Pressable>
		)
	}

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`Open ${entry.name} settings`}
			disabled={!state.openable}
			onPress={onPress}
			style={({ pressed }: { pressed: boolean }) => ({
				width,
				opacity: state.openable ? (pressed ? 0.6 : 1) : 0.4,
			})}
		>
			<Card variant="secondary" border="none" style={{ flex: 1 }}>
				<View
					style={{
						alignItems: 'center',
						paddingTop: 18,
						paddingBottom: 16,
						paddingHorizontal: 8,
						gap: 12,
					}}
				>
					<IconCircle icon={entry.icon} wash={wash} />
					<Text
						color="text-default"
						variant="text-md/semibold"
						style={[{ textAlign: 'center' }, nameStyle]}
						numberOfLines={1}
					>
						{entry.name}
					</Text>
					{state.note ? (
						<Text color="text-muted" variant="text-xs/normal" numberOfLines={1} style={mutedStyle}>
							{state.note}
						</Text>
					) : null}
				</View>
			</Card>
		</Pressable>
	)
}

/**
 * Lays children out in `columns` equal columns, sized from the measured width.
 *
 * Renders nothing until the first layout pass reports a width -- one frame, and far better than
 * one frame of tiles at the wrong size.
 */
export function Grid({
	columns,
	children,
}: {
	columns: number
	children: (tileWidth: number) => any
}) {
	const { View } = ReactNative
	const [width, setWidth] = React.useState(0)
	const tile = width ? Math.floor((width - GAP * (columns - 1)) / columns) : 0

	return (
		<View
			onLayout={(event: any) => setWidth(event.nativeEvent.layout.width)}
			style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}
		>
			{tile ? children(tile) : null}
		</View>
	)
}
