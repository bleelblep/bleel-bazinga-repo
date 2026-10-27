import type { ReactNode } from "react"
import { SELECTED_RADIUS } from "../layout"
import * as react from "@valenced/react"
import * as ReactNative from "react-native"

// borderRadius and backgroundColor can't run on the native driver (only opacity and
// transforms can), so this one is JS-driven. It's a single small view per row and only
// animates on an actual selection change, so the cost is acceptable.
const SPRING = { friction: 9, tension: 140, useNativeDriver: false }

/**
 * Wraps a row's icon and animates the stock circle <-> rounded-square morph, optionally
 * cross-fading a background colour at the same time (used where the icon is a glyph or
 * initials on a filled backdrop rather than an image).
 *
 * Children are clipped to the animated shape, so pass images/glyphs without their own
 * borderRadius. Anything that must *not* be clipped -- unread badges, for instance -- belongs
 * outside this component, as a sibling.
 */
export default function MorphIcon({
	size,
	selected,
	background,
	selectedBackground,
	children,
}: {
	size: number
	selected: boolean
	background?: string
	selectedBackground?: string
	children: ReactNode
}) {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { React } = react
	const { Animated } = ReactNative

	const progress = React.useRef(new Animated.Value(selected ? 1 : 0)).current

	React.useEffect(() => {
		Animated.spring(progress, { toValue: selected ? 1 : 0, ...SPRING }).start()
	}, [selected])

	const borderRadius = progress.interpolate({
		inputRange: [0, 1],
		outputRange: [size / 2, SELECTED_RADIUS],
		extrapolate: "clamp",
	})

	// Springs overshoot past 1, which would push a colour interpolation outside its range --
	// hence the clamp on both interpolations.
	const backgroundColor =
		background && selectedBackground
			? progress.interpolate({
					inputRange: [0, 1],
					outputRange: [background, selectedBackground],
					extrapolate: "clamp",
				})
			: background

	return (
		<Animated.View
			style={{
				width: size,
				height: size,
				borderRadius,
				backgroundColor: backgroundColor as any,
				overflow: "hidden",
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			{children}
		</Animated.View>
	)
}
