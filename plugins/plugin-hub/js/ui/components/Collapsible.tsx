import { getStorage, settings } from '../../lib/state'
import { rowIcon } from '../icon'
import { Design } from '@valenced/discord/design'
import * as ReactNative from 'react-native'

/**
 * Sections that fold away. Tapping a section's header hides its rows and leaves only the header,
 * with a count, so a long list of plugins collapses to a few lines. What is folded is saved (by a
 * key per page and section, in `collapsed`), so it stays folded next time.
 *
 * Read `valenced.*` only inside renders and handlers (coding rule 1).
 */

export function isCollapsed(key: string): boolean {
	return !!settings().collapsed?.includes(key)
}

export function toggleCollapsed(key: string) {
	const list = settings().collapsed ?? []
	// A gentle open/close instead of a jump. Best effort: some builds ignore layout animation.
	try {
		const { LayoutAnimation } = ReactNative as any
		LayoutAnimation?.configureNext?.(LayoutAnimation.Presets.easeInEaseOut)
	} catch {
		/* no animation then */
	}
	// Arrays are written whole (see the note on `entries` in types.ts).
	getStorage()?.set({ collapsed: list.includes(key) ? list.filter(k => k !== key) : [...list, key] })
}

/**
 * A section title you can tap: the title, how many plugins are in it, and a chevron pointing down
 * when open and sideways when folded. [color] overrides the theme's muted text (Cornhub).
 */
export function SectionHeader({
	title,
	count,
	collapsed,
	onPress,
	color,
}: {
	title: string
	count: number
	collapsed: boolean
	onPress: () => void
	color?: string
}) {
	const { Pressable, View } = ReactNative
	const { Text } = Design
	const style = color ? { color } : undefined

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`${title}, ${count} plugins, ${collapsed ? 'folded' : 'open'}`}
			accessibilityState={{ expanded: !collapsed }}
			hitSlop={8}
			onPress={onPress}
			style={({ pressed }: { pressed: boolean }) => ({
				flexDirection: 'row',
				alignItems: 'center',
				gap: 6,
				opacity: pressed ? 0.6 : 1,
			})}
		>
			<Text color="text-muted" variant="text-sm/semibold" style={style}>
				{title}
			</Text>
			<Text color="text-muted" variant="text-sm/normal" style={style}>
				{count}
			</Text>
			<View style={{ flex: 1 }} />
			<View style={{ transform: [{ rotate: collapsed ? '-90deg' : '0deg' }] }}>
				{rowIcon('ChevronSmallDownIcon', 'ChevronLargeDownIcon') ?? null}
			</View>
		</Pressable>
	)
}

/** A titled group of rows that folds away, remembered under [id]. */
export function CollapsibleGroup({
	id,
	title,
	count,
	children,
}: {
	id: string
	title: string
	count: number
	children: any
}) {
	const { View } = ReactNative
	const { TableRowGroup } = Design
	const collapsed = isCollapsed(id)

	return (
		<View style={{ gap: 8 }}>
			<SectionHeader title={title} count={count} collapsed={collapsed} onPress={() => toggleCollapsed(id)} />
			{collapsed ? null : <TableRowGroup hasIcons>{children}</TableRowGroup>}
		</View>
	)
}
