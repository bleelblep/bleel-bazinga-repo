import type { UnreadDm } from "../../lib/dms"
import { BAR_WIDTH, ICON_SIZE } from "../layout"
import { avatarFallback, barBackground, mentionBadge, selectedFill, unreadDot } from "../theme"
import MorphIcon from "./MorphIcon"
import Pill from "./Pill"
import { getModules } from "@valenced/modules/finders"
import { withProps } from "@valenced/modules/finders/filters"
import * as react from "@valenced/react"
import * as ReactNative from "react-native"

// getModules, not lookupModule: confirmed on-device (staff-tags plugin) that a lazily-loaded
// module can still be unregistered even from inside start() -- this file's top-level code
// runs at preInit (the whole plugin bundle executes together), before Discord's module
// registry is populated. lookupModule gives up immediately and permanently caches a false
// "not found"; getModules subscribes and calls back whenever the module actually loads.
let channelActions: any
getModules(withProps("selectPrivateChannel"), (mod: any) => {
	channelActions = mod
})

const SIZE = ICON_SIZE

// Group DMs read as two overlapping member avatars, not a sparse 2x2 grid of tiny icons.
// Each avatar is large enough to actually recognise, with the front one ringed in the bar's
// own background colour to separate the two.
const STACK = 32
const RING = 2

function acronym(name: string): string {
	return String(name ?? "")
		.replace(/\w+/g, word => word[0] ?? "")
		.replace(/\s/g, "")
		.slice(0, 2)
		.toUpperCase()
}

function MemberAvatar({ member, size, fontSize }: { member: { url?: string; username: string }; size: number; fontSize: number }) {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { View, Image, Text } = ReactNative

	if (member.url) {
		return <Image source={{ uri: member.url }} style={{ width: size, height: size, borderRadius: size / 2 }} />
	}
	return (
		<View
			style={{
				width: size,
				height: size,
				borderRadius: size / 2,
				backgroundColor: avatarFallback(),
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<Text style={{ color: "#fff", fontSize, fontWeight: "600" }}>{acronym(member.username)}</Text>
		</View>
	)
}

/** Two overlapping avatars: first back/top-left, second front/bottom-right with a ring. */
function GroupAvatars({ members }: { members: Array<{ id: string; url?: string; username: string }> }) {
	const { View } = ReactNative

	const [back, front] = members

	return (
		<View style={{ width: SIZE, height: SIZE }}>
			<View style={{ position: "absolute", top: 0, left: 0 }}>
				<MemberAvatar member={back} size={STACK} fontSize={12} />
			</View>
			{front ? (
				<View
					style={{
						position: "absolute",
						bottom: 0,
						right: 0,
						padding: RING,
						borderRadius: (STACK + RING * 2) / 2,
						backgroundColor: barBackground(),
					}}
				>
					<MemberAvatar member={front} size={STACK} fontSize={12} />
				</View>
			) : null}
		</View>
	)
}

/**
 * Same shape/size as GuildRow, one per unread DM/group-DM -- see lib/dms.ts. Memoised for
 * the same reason GuildRow is: the bar re-renders on every DM store emit, and rebuilding
 * every row's avatar each time flashes the bar.
 */
function UnreadDmRow({ dm, selected }: { dm: UnreadDm; selected: boolean }) {
	const { React } = react
	const { Pressable, View, Image, Text } = ReactNative

	const navigate = React.useCallback(() => {
		try {
			channelActions?.selectPrivateChannel?.(dm.channelId)
		} catch {
			/* ignore */
		}
	}, [dm.channelId])

	return (
		<Pressable onPress={navigate}>
			{/* Full bar-width row, icon centred, pill at left: 0 inside it -- see ui/layout.ts. */}
			<View style={{ width: BAR_WIDTH, height: SIZE, alignItems: "center", justifyContent: "center" }}>
				<Pill rowHeight={SIZE} selected={selected} />

				<View style={{ width: SIZE, height: SIZE }}>
					{dm.avatarUrl ? (
						<MorphIcon size={SIZE} selected={selected}>
							<Image source={{ uri: dm.avatarUrl }} style={{ width: SIZE, height: SIZE }} />
						</MorphIcon>
					) : dm.memberAvatars?.length ? (
						<MorphIcon size={SIZE} selected={selected}>
							<GroupAvatars members={dm.memberAvatars.slice(0, 2)} />
						</MorphIcon>
					) : (
						<MorphIcon size={SIZE} selected={selected} background={avatarFallback()} selectedBackground={selectedFill()}>
							<Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>{acronym(dm.name)}</Text>
						</MorphIcon>
					)}

					{dm.mentionCount > 0 ? (
						<View style={[st.pillOutline, { backgroundColor: barBackground() }]}>
							<View style={[st.pill, { backgroundColor: mentionBadge() }]}>
								<Text style={st.pillText}>{dm.mentionCount > 99 ? "99+" : String(dm.mentionCount)}</Text>
							</View>
						</View>
					) : dm.hasUnread ? (
						<View style={[st.dotOutline, { backgroundColor: barBackground() }]}>
							<View style={[st.dot, { backgroundColor: unreadDot() }]} />
						</View>
					) : null}
				</View>
			</View>
		</Pressable>
	)
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

// React.memo can't run at module scope -- `valenced.react.React` is an ESM live binding that is
// still undefined at preInit, when this file is evaluated. The wrapper builds the memo on first
// render and reuses it, so the component type stays stable from render 2 onward, which is what
// reconciliation needs. Memoization still works: the inner memo shallow-compares the spread
// props and skips UnreadDmRow when they're unchanged.
let Memoized: any

export default function UnreadDmRowMemo(props: { dm: UnreadDm; selected: boolean }) {
	const { React } = react
	Memoized ??= React.memo(UnreadDmRow)
	return <Memoized {...props} />
}
