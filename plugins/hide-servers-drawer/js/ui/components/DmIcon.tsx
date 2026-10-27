import { type RecentDm, dmUnreadState, mostRecentDm, subscribeDmChanges } from "../../lib/dms"
import { dmAvatarHome } from "../../lib/prefs"
import { BAR_WIDTH, ICON_SIZE } from "../layout"
import { avatarFallback, barBackground, mentionBadge, selectedFill, unreadDot } from "../theme"
import MorphIcon from "./MorphIcon"
import Pill from "./Pill"
import * as assets from "@valenced/assets"
import * as react from "@valenced/react"
import * as ReactNative from "react-native"

// getAssetIdByName (lowercase "d"), under valenced.assets not valenced.components -- confirmed
// from revenge-bundle-next's own source. Resolved on first render rather than at module scope:
// module-scope code runs at preInit, before the asset registry exists.
// See docs/coding-rules.md rule 1.
//
// "ClydeIcon" (Discord's own name for their mascot glyph) is confirmed on device as what stock
// actually shows on the Home button when there's no DM avatar to display -- found via
// `valenced.assets.getAssets()`, see docs/coding-rules.md rule 5, rather than guessed.
// "ChatIcon" stays as a fallback in case a future build renames or drops it.
let homeIcon: number | undefined
function homeIconAsset() {
	if (homeIcon === undefined) {
		const { getAssetIdByName } = assets
		homeIcon = getAssetIdByName("ClydeIcon") ?? getAssetIdByName("ChatIcon")
	}
	return homeIcon
}

const SIZE = ICON_SIZE
const GLYPH = 24
const ROW_HEIGHT = SIZE + 20

function avatarUrl(recipient: RecentDm["recipientAvatar"]): string | undefined {
	if (!recipient?.avatar) return undefined
	const ext = recipient.avatar.startsWith("a_") ? "gif" : "png"
	return `https://cdn.discordapp.com/avatars/${recipient.id}/${recipient.avatar}.${ext}?size=64`
}

/**
 * The Home button.
 *
 * This used to show the most recent DM's avatar unconditionally, on the belief that it was
 * mimicking stock. That was wrong — stock keeps a static Home glyph — so the avatar is now
 * behind the `dmAvatarHome` preference and off by default.
 *
 * It still morphs from a circle with a neutral fill to a rounded square in the theme's accent
 * colour when selected, same as every other icon in the bar.
 */
export default function DmIcon({ selected, onPress }: { selected: boolean; onPress: () => void }) {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { React } = react
	const { Pressable, View, Image, Text } = ReactNative

	const [, bump] = React.useReducer((n: number) => n + 1, 0)
	React.useEffect(() => subscribeDmChanges(bump), [])

	const recent = mostRecentDm()
	// Unread state is still wanted on the static icon, so it's read either way -- only the
	// avatar itself is behind the preference.
	const url = dmAvatarHome() && recent?.type === 1 ? avatarUrl(recent.recipientAvatar) : undefined
	const { hasUnread, mentionCount } = recent ? dmUnreadState(recent.channelId) : { hasUnread: false, mentionCount: 0 }

	// Full bar-width row so the pill sits at left: 0 inside it -- see ui/layout.ts.
	return (
		<Pressable onPress={onPress} style={{ width: BAR_WIDTH, height: ROW_HEIGHT, alignItems: "center", justifyContent: "center" }}>
			<Pill rowHeight={ROW_HEIGHT} selected={selected} />

			<View style={{ width: SIZE, height: SIZE }}>
				{url ? (
					<MorphIcon size={SIZE} selected={selected}>
						<Image source={{ uri: url }} style={{ width: SIZE, height: SIZE }} />
					</MorphIcon>
				) : (
					<MorphIcon size={SIZE} selected={selected} background={avatarFallback()} selectedBackground={selectedFill()}>
						<Image source={homeIconAsset() as any} style={{ width: GLYPH, height: GLYPH, tintColor: "#fff" }} />
					</MorphIcon>
				)}

				{mentionCount > 0 ? (
					<View style={[st.pillOutline, { backgroundColor: barBackground() }]}>
						<View style={[st.pill, { backgroundColor: mentionBadge() }]}>
							<Text style={st.pillText}>{mentionCount > 99 ? "99+" : String(mentionCount)}</Text>
						</View>
					</View>
				) : hasUnread ? (
					<View style={[st.dotOutline, { backgroundColor: barBackground() }]}>
						<View style={[st.dot, { backgroundColor: unreadDot() }]} />
					</View>
				) : null}
			</View>
		</Pressable>
	)
}

// Offsets are relative to the 48x48 icon box (matching UnreadDmRow/Badge), not the row.
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
