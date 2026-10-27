import { useGuildIndicator } from "../useGuildIndicator"
import { barBackground, mentionBadge, unreadDot } from "../theme"
import * as ReactNative from "react-native"

/**
 * Mention-count pill, or a plain unread dot when there are no mentions -- but only ever what
 * the guild's own notification setting allows, via useGuildIndicator (shared with GuildRow's
 * left-edge pill so both agree on what counts as "this guild has something to show").
 */
export default function Badge({ guildId }: { guildId: string }) {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { View, Text } = ReactNative

	const { mentionCount, showDot } = useGuildIndicator(guildId)

	// Resolved per render, not module-level -- the user can switch themes without reloading.
	const outlineColor = barBackground()

	if (mentionCount > 0) {
		return (
			<View style={[st.pillOutline, { backgroundColor: outlineColor }]}>
				<View style={[st.pill, { backgroundColor: mentionBadge() }]}>
					<Text style={st.pillText}>{mentionCount > 99 ? "99+" : String(mentionCount)}</Text>
				</View>
			</View>
		)
	}

	if (showDot) {
		return (
			<View style={[st.dotOutline, { backgroundColor: outlineColor }]}>
				<View style={[st.dot, { backgroundColor: unreadDot() }]} />
			</View>
		)
	}

	return null
}

const st = {
	pillOutline: {
		position: "absolute" as const,
		bottom: -3,
		right: -3,
		minWidth: 23,
		minHeight: 23,
		borderRadius: 12,
		alignItems: "center" as const,
		justifyContent: "center" as const,
	},
	pill: {
		minWidth: 19,
		height: 19,
		borderRadius: 9,
		paddingHorizontal: 5,
		alignItems: "center" as const,
		justifyContent: "center" as const,
	},
	pillText: { color: "#fff", fontSize: 10, fontWeight: "700" as const, lineHeight: 19 },
	dotOutline: {
		position: "absolute" as const,
		bottom: -2,
		right: -2,
		width: 14,
		height: 14,
		borderRadius: 7,
		alignItems: "center" as const,
		justifyContent: "center" as const,
	},
	dot: { width: 10, height: 10, borderRadius: 5 },
}
