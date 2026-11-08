/**
 * The grouped-box look of the log screens, like our settings pages: a small uppercase title over a
 * rounded box, rows inside it separated by thin inset dividers.
 *
 * The lists are virtualised, so a box is never one View around its rows: every row draws its own
 * slice of the box (the first gets the top corners, the last the bottom ones, the rest a divider on
 * top). `boxRows` flattens groups into those rows.
 *
 * Colours come from Discord's theme tokens while rendering (coding rule 1, design guide §3.5); the
 * hex values are only fallbacks for a renamed token.
 */

import { Design } from "@valenced/discord/design";
import * as ReactNative from "react-native";
import { Glyph } from "../native";
import { token, withAlpha } from "../theme";
import {
	clock,
	dayKey,
	dayLabel,
	dayOffset,
	shortDate,
	validDate,
} from "./Message";

/** The first of `names` the theme has, else the fallback. */
export function firstToken(names: string[], fallback: string): string {
	for (const name of names) {
		const value = token(name, "");
		if (value) return value;
	}
	return fallback;
}

/** A box's background: the card surface settings rows sit on. */
export const boxSurface = () =>
	firstToken(
		["CARD_BACKGROUND_DEFAULT", "BG_SURFACE_RAISED", "BACKGROUND_SECONDARY"],
		"#2b2d31",
	);

export type BoxItem<T> =
	| { type: "title"; key: string; label: string }
	| { type: "row"; key: string; item: T; first: boolean; last: boolean };

export interface BoxGroup<T> {
	key: string;
	label: string;
	items: T[];
}

/** One title row per group, then its items, each knowing whether it opens or closes the box. */
export function boxRows<T>(
	groups: BoxGroup<T>[],
	id: (item: T) => string,
): BoxItem<T>[] {
	const rows: BoxItem<T>[] = [];
	for (const group of groups) {
		if (!group.items.length) continue;
		rows.push({ type: "title", key: `t:${group.key}`, label: group.label });
		group.items.forEach((item, index) =>
			rows.push({
				type: "row",
				key: `r:${group.key}:${id(item)}`,
				item,
				first: index === 0,
				last: index === group.items.length - 1,
			}),
		);
	}
	return rows;
}

/** Groups by calendar day, in the order the days first appear (the lists are newest first). */
export function byDay<T>(items: T[], time: (item: T) => number): BoxGroup<T>[] {
	const groups = new Map<string, BoxGroup<T>>();
	for (const item of items) {
		const key = dayKey(time(item));
		const group = groups.get(key);
		if (group) group.items.push(item);
		else
			groups.set(key, {
				key,
				label: dayLabel(time(item)).toUpperCase(),
				items: [item],
			});
	}
	return [...groups.values()];
}

/** A list's last-activity time: "14:02" today, "Yesterday", or "2 Nov". */
export function shortWhen(timestamp: unknown): string {
	const date = validDate(timestamp);
	if (!date) return "";
	const day = dayOffset(date);
	if (day === "today") return clock(date);
	if (day === "yesterday") return "Yesterday";
	return shortDate(date);
}

/** "13:58 → 14:02", with the first day added when it differs from the second. */
export function span(from: unknown, to: unknown): string {
	const end = validDate(to);
	const start = validDate(from);
	if (!end) return start ? clock(start) : "";
	if (!start) return clock(end);
	const sameDay = dayKey(start.getTime()) === dayKey(end.getTime());
	return `${sameDay ? "" : `${shortDate(start)} `}${clock(start)} → ${clock(end)}`;
}

export const plural = (n: number, word: string) =>
	`${n} ${word}${n === 1 ? "" : "s"}`;

/** A group title above a box: small, uppercase, muted. */
export function BoxTitle({ label, first }: { label: string; first?: boolean }) {
	const { View } = ReactNative;
	const { Text } = Design as any;
	return (
		<View
			accessibilityRole="header"
			style={{
				paddingHorizontal: 20,
				paddingTop: first ? 12 : 20,
				paddingBottom: 8,
			}}
		>
			<Text
				variant="text-xs/bold"
				color="text-muted"
				lineClamp={1}
				style={{ letterSpacing: 0.5 }}
			>
				{label}
			</Text>
		</View>
	);
}

/**
 * One row's slice of a box: its corners if it is first or last, and the inset divider above it
 * when it isn't first. `inset` is where the divider starts (past the avatar).
 */
export function BoxRow({
	first,
	last,
	inset = 66,
	selected,
	onPress,
	onLongPress,
	accessibilityLabel,
	children,
}: {
	first: boolean;
	last: boolean;
	inset?: number;
	/** Select mode: true/false draws a tick circle (and a highlight when ticked); undefined is normal. */
	selected?: boolean;
	onPress?: () => void;
	onLongPress?: () => void;
	accessibilityLabel?: string;
	children: any;
}) {
	const { View, Pressable } = ReactNative;
	const radius = 16;
	const highlight = token("BACKGROUND_MOD_SUBTLE", "#2e3035");
	return (
		<View
			style={{
				marginHorizontal: 16,
				backgroundColor: boxSurface(),
				borderTopLeftRadius: first ? radius : 0,
				borderTopRightRadius: first ? radius : 0,
				borderBottomLeftRadius: last ? radius : 0,
				borderBottomRightRadius: last ? radius : 0,
				overflow: "hidden",
			}}
		>
			{first ? null : (
				<View
					style={{
						height: 1,
						marginLeft: inset + (selected === undefined ? 0 : 34),
						backgroundColor: token("BORDER_SUBTLE", "#4e5058"),
					}}
				/>
			)}
			<Pressable
				onPress={onPress}
				onLongPress={onLongPress}
				delayLongPress={350}
				android_ripple={{ color: highlight }}
				accessibilityRole="button"
				accessibilityLabel={accessibilityLabel}
				accessibilityState={
					selected === undefined ? undefined : { checked: selected }
				}
				style={{
					flexDirection: "row",
					gap: 12,
					paddingHorizontal: 14,
					paddingVertical: 12,
					backgroundColor: selected ? highlight : undefined,
				}}
			>
				{selected === undefined ? null : <Tick on={selected} />}
				{children}
			</Pressable>
		</View>
	);
}

function Tick({ on }: { on: boolean }) {
	const { View } = ReactNative;
	const brand = token("BACKGROUND_BRAND", "#5865f2");
	return (
		<View
			style={{
				width: 22,
				height: 22,
				borderRadius: 11,
				marginTop: 9,
				borderWidth: 2,
				alignItems: "center",
				justifyContent: "center",
				borderColor: on ? brand : token("TEXT_MUTED", "#949ba4"),
				backgroundColor: on ? brand : undefined,
			}}
		>
			{on ? (
				<Glyph name="CheckmarkLargeIcon" color="#ffffff" size={14} />
			) : null}
		</View>
	);
}

export type TagTone = "warning" | "muted" | "critical";

/**
 * A small note under a message, only when it matters: an amber pill for how a silent delete hid
 * the text, muted text for "Deleted by you", red for attachments that weren't saved.
 */
export function Tag({ tone, text }: { tone: TagTone; text: string }) {
	const { View } = ReactNative;
	const { Text } = Design as any;
	if (tone === "warning") {
		const amber = token("TEXT_FEEDBACK_WARNING", "#f0b232");
		return (
			<View
				style={{
					alignSelf: "flex-start",
					borderRadius: 10,
					paddingHorizontal: 8,
					paddingVertical: 2,
					backgroundColor: withAlpha(amber, "1f", "#f0b2321f"),
				}}
			>
				<Text variant="text-xs/semibold" style={{ color: amber }} lineClamp={1}>
					{text}
				</Text>
			</View>
		);
	}
	return (
		<Text
			variant="text-xs/medium"
			color={tone === "critical" ? "text-feedback-critical" : "text-muted"}
		>
			{text}
		</Text>
	);
}

/** A round count ("12"), for a conversation's messages or an edit's versions. */
export function CountPill({ count, label }: { count: number; label?: string }) {
	const { View } = ReactNative;
	const { Text } = Design as any;
	return (
		<View
			accessibilityLabel={label}
			style={{
				minWidth: 22,
				height: 22,
				borderRadius: 11,
				paddingHorizontal: 7,
				alignItems: "center",
				justifyContent: "center",
				backgroundColor: firstToken(
					["BACKGROUND_MOD_STRONG", "BACKGROUND_SURFACE_HIGHEST"],
					"#3f4147",
				),
			}}
		>
			<Text variant="text-xs/semibold" color="text-default">
				{String(count)}
			</Text>
		</View>
	);
}

/**
 * Two (or more) views of the same log, as plain Pressables in a track. Not Discord's
 * SegmentedControl: its pager inside a scroll view left some phones unable to reach later pages
 * (Shimeji 0.8.x).
 */
export function ViewSwitch<T extends string>({
	options,
	value,
	onChange,
}: {
	options: Array<{ id: T; label: string }>;
	value: T;
	onChange: (value: T) => void;
}) {
	const { View, Pressable } = ReactNative;
	const { Text } = Design as any;
	const track = firstToken(
		["MOBILE_SEGMENTED_CONTROL_BACKGROUND", "BACKGROUND_BASE_LOWEST"],
		"#111214",
	);
	const chosen = firstToken(
		["MOBILE_SEGMENTED_CONTROL_SELECTED_BACKGROUND", "BACKGROUND_MOD_STRONG"],
		"#3f4147",
	);
	return (
		<View
			accessibilityRole="tablist"
			style={{
				flexDirection: "row",
				padding: 3,
				borderRadius: 10,
				backgroundColor: track,
			}}
		>
			{options.map((option) => {
				const on = option.id === value;
				return (
					<Pressable
						key={option.id}
						accessibilityRole="tab"
						accessibilityState={{ selected: on }}
						accessibilityLabel={option.label}
						onPress={() => {
							if (!on) onChange(option.id);
						}}
						style={{
							flex: 1,
							height: 34,
							borderRadius: 8,
							alignItems: "center",
							justifyContent: "center",
							backgroundColor: on ? chosen : undefined,
						}}
					>
						<Text
							variant="text-sm/semibold"
							color={on ? "text-strong" : "text-muted"}
							lineClamp={1}
						>
							{option.label}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

/** A channel's tile in a conversation list: the server's icon, or a "#" on a brand square. */
export function ChannelTile() {
	const { View } = ReactNative;
	const { Text } = Design as any;
	return (
		<View
			style={{
				width: 40,
				height: 40,
				borderRadius: 12,
				alignItems: "center",
				justifyContent: "center",
				backgroundColor: token("BACKGROUND_BRAND", "#5865f2"),
			}}
		>
			<Text variant="heading-lg/bold" style={{ color: "#ffffff" }}>
				#
			</Text>
		</View>
	);
}
