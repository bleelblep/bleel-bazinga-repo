import { PILL_SELECTED_HEIGHT, PILL_WIDTH } from "../layout"
import { selectedPill } from "../theme"
import * as ReactNative from "react-native"

/**
 * Stock's left-edge indicator for the *selected* row. Positioned at left: 0 inside a full
 * bar-width row (see ui/layout.ts for why it must stay inside its parent's bounds).
 *
 * Deliberately not animated -- it just appears and disappears. The shape morph in MorphIcon
 * already carries the transition, and a native-driven transform here proved a persistent
 * source of bugs on classic Revenge (stale position surviving a rapid re-render).
 */
export default function Pill({ rowHeight, selected }: { rowHeight: number; selected: boolean }) {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { View } = ReactNative

	if (!selected) return null

	return (
		<View
			style={{
				position: "absolute",
				left: 0,
				top: (rowHeight - PILL_SELECTED_HEIGHT) / 2,
				width: PILL_WIDTH,
				height: PILL_SELECTED_HEIGHT,
				// Square against the bar's edge, rounded on the inner side only -- see layout.ts.
				borderTopRightRadius: PILL_WIDTH,
				borderBottomRightRadius: PILL_WIDTH,
				backgroundColor: selectedPill(),
			}}
		/>
	)
}
