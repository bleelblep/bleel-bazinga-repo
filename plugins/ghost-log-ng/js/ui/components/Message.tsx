/**
 * The pieces the log screens are built from, laid out like Discord's own search results: a day
 * divider, a channel header over that day's messages from the channel, then messages drawn the way
 * chat draws them (avatar, name line, text, media). Chat rows themselves are drawn natively and
 * cannot be reused, so this follows their look with Discord's Text, Avatar, BotTag and icons, like
 * ReviewDB's review rows.
 */

import { Design } from "@valenced/discord/design";
import { Stores } from "@valenced/discord/flux";
import * as react from "@valenced/react";
import { lookupGeneratedIconComponent } from "@valenced/utils/discord";
import * as ReactNative from "react-native";
import { reportError } from "../../../../../shared/report";
import type { FormatContext } from "../../lib/formatContent";
import { formatContent } from "../../lib/formatContent";
import type { SavedMedia } from "../../lib/media";
import { usePreviewUri } from "../../lib/media";
import { BotTag, Glyph, GuildIcon, Native, UserAvatar } from "../native";
import { token } from "../theme";

const TAG = "[GhostLogNG]";

export function ago(timestamp: number): string {
	const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
	if (seconds < 60) return "just now";
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
	return `${Math.floor(seconds / 86400)}d ago`;
}

export function validDate(timestamp: unknown): Date | undefined {
	if (
		typeof timestamp !== "number" ||
		!Number.isFinite(timestamp) ||
		timestamp <= 0
	)
		return undefined;
	const date = new Date(timestamp);
	return Number.isNaN(date.getTime()) ? undefined : date;
}

function sameDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

export function dayOffset(date: Date): "today" | "yesterday" | undefined {
	const now = new Date();
	if (sameDay(date, now)) return "today";
	const yesterday = new Date(now);
	yesterday.setDate(now.getDate() - 1);
	return sameDay(date, yesterday) ? "yesterday" : undefined;
}

/** "14:02" (or the locale's form). */
export function clock(date: Date): string {
	try {
		return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
	} catch {
		return `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
	}
}

/** "2 Nov", or "2 Nov 2025" in another year. */
export function shortDate(date: Date): string {
	try {
		const sameYear = date.getFullYear() === new Date().getFullYear();
		return date.toLocaleDateString(
			[],
			sameYear
				? { day: "numeric", month: "short" }
				: { day: "numeric", month: "short", year: "numeric" },
		);
	} catch {
		return date.toDateString();
	}
}

/** "Today at 14:02", "Yesterday at 22:10", or "2 Nov at 14:02", the way chat stamps a message. */
export function stamp(timestamp: number): string {
	const date = validDate(timestamp);
	if (!date) return "";
	const day = dayOffset(date);
	if (day === "today") return `Today at ${clock(date)}`;
	if (day === "yesterday") return `Yesterday at ${clock(date)}`;
	return `${shortDate(date)} at ${clock(date)}`;
}

/** The same stamp for the middle of a sentence: "Deleted today at 14:02", "Edited on 2 Nov at 9:15". */
export function stampInline(timestamp: number): string {
	const date = validDate(timestamp);
	if (!date) return "";
	const day = dayOffset(date);
	if (day) return `${day} at ${clock(date)}`;
	return `on ${shortDate(date)} at ${clock(date)}`;
}

/** A day divider's label: "Today", "Yesterday", or the date. */
export function dayLabel(timestamp: number): string {
	const date = validDate(timestamp);
	if (!date) return "Earlier";
	const day = dayOffset(date);
	if (day === "today") return "Today";
	if (day === "yesterday") return "Yesterday";
	try {
		const sameYear = date.getFullYear() === new Date().getFullYear();
		return date.toLocaleDateString(
			[],
			sameYear
				? { weekday: "long", day: "numeric", month: "long" }
				: { weekday: "long", day: "numeric", month: "long", year: "numeric" },
		);
	} catch {
		return date.toDateString();
	}
}

export function dayKey(timestamp: number): string {
	const date = validDate(timestamp);
	return date
		? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
		: "unknown";
}

export type GroupedRow<T> =
	| { type: "day"; key: string; label: string }
	| { type: "header"; key: string; item: T }
	| { type: "message"; key: string; item: T };

/**
 * List rows for a newest-first log: a divider per day, and within a day one channel header over
 * all of that day's messages from the channel. Channels are ordered by their newest message, so the
 * list still reads newest first, but mixed activity no longer puts a header above every message.
 */
export function groupRows<T>(
	items: T[],
	time: (item: T) => number,
	channel: (item: T) => string | undefined,
	id: (item: T) => string,
): GroupedRow<T>[] {
	const rows: GroupedRow<T>[] = [];
	let index = 0;
	while (index < items.length) {
		const day = dayKey(time(items[index]));
		const buckets = new Map<string, T[]>();
		while (index < items.length && dayKey(time(items[index])) === day) {
			const item = items[index];
			const key = channel(item) ?? "";
			const bucket = buckets.get(key);
			if (bucket) bucket.push(item);
			else buckets.set(key, [item]);
			index++;
		}
		const first = buckets.values().next().value?.[0];
		rows.push({
			type: "day",
			key: `d:${day}`,
			label: first ? dayLabel(time(first)) : "Earlier",
		});
		for (const [key, bucket] of buckets) {
			rows.push({ type: "header", key: `h:${day}:${key}`, item: bucket[0] });
			for (const item of bucket)
				rows.push({ type: "message", key: id(item), item });
		}
	}
	return rows;
}

/** "Today", "Yesterday" or the date, between lines, like chat's own day divider. */
export function DaySeparator({ label }: { label: string }) {
	const { View } = ReactNative;
	const { Text } = Design as any;
	const line = token("BORDER_SUBTLE", "#4e5058");
	return (
		<View
			style={{
				flexDirection: "row",
				alignItems: "center",
				gap: 8,
				paddingHorizontal: 16,
				paddingTop: 20,
			}}
		>
			<View style={{ flex: 1, height: 1, backgroundColor: line }} />
			<Text variant="text-xs/semibold" color="text-muted">
				{label}
			</Text>
			<View style={{ flex: 1, height: 1, backgroundColor: line }} />
		</View>
	);
}

function isBot(userId: string): boolean {
	try {
		return !!(Stores as any).UserStore?.getUser?.(userId)?.bot;
	} catch {
		return false;
	}
}

/** "Server › #channel" above a run of messages from one channel, like search results. */
export function ChannelHeader({
	guildId,
	guildName,
	guildIcon,
	channelName,
}: {
	guildId?: string;
	guildName?: string;
	guildIcon?: string;
	channelName?: string;
}) {
	const { View } = ReactNative;
	const { Text } = Design as any;
	const where = guildId ? (guildName ?? "Server") : "Direct messages";
	const name = channelName || (guildId ? "channel" : "DM");
	return (
		<View
			style={{
				flexDirection: "row",
				alignItems: "center",
				gap: 8,
				paddingHorizontal: 16,
				paddingTop: 12,
				paddingBottom: 4,
			}}
		>
			{guildId ? (
				<GuildIcon id={guildId} hash={guildIcon} name={where} size={18} />
			) : null}
			<Text
				variant="text-sm/semibold"
				color="text-muted"
				lineClamp={1}
				style={{ flexShrink: 1 }}
			>
				{`${where}  ›  ${name === "Direct message" ? "DM" : name}`}
			</Text>
		</View>
	);
}

/** One saved image or video as a square, or a file as its name. `more` covers it with "+N". */
export function MediaTile({
	item,
	size,
	more,
	onPress,
	onLongPress,
}: {
	item: SavedMedia;
	size: number;
	more?: number;
	onPress?: () => void;
	onLongPress?: () => void;
}) {
	const { View, Image, Pressable } = ReactNative;
	const { Text } = Design as any;
	const uri = usePreviewUri(item);
	const surface = token("BACKGROUND_MOD_SUBTLE", "#2e3035");
	const muted = token("TEXT_MUTED", "#949ba4");
	return (
		<Pressable
			onPress={onPress}
			onLongPress={onLongPress}
			delayLongPress={350}
			accessibilityRole="imagebutton"
			accessibilityLabel={
				more ? `${item.filename}, and ${more} more` : item.filename
			}
			style={({ pressed }: { pressed: boolean }) => ({
				width: size,
				height: size,
				borderRadius: 8,
				overflow: "hidden",
				backgroundColor: surface,
				opacity: pressed ? 0.7 : 1,
			})}
		>
			{uri ? (
				<Image
					source={{ uri }}
					resizeMode="cover"
					resizeMethod="resize"
					style={{ width: size, height: size }}
				/>
			) : item.kind === "file" ? (
				<View
					style={{
						flex: 1,
						alignItems: "center",
						justifyContent: "center",
						padding: 8,
						gap: 6,
					}}
				>
					<Glyph name="FileIcon" color={muted} size={24} />
					<Text
						variant="text-xs/medium"
						color="text-muted"
						lineClamp={2}
						style={{ textAlign: "center" }}
					>
						{item.filename}
					</Text>
				</View>
			) : null}
			{item.kind === "video" && !more ? (
				<View
					pointerEvents="none"
					style={{
						position: "absolute",
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						alignItems: "center",
						justifyContent: "center",
					}}
				>
					<View
						style={{
							width: 36,
							height: 36,
							borderRadius: 18,
							backgroundColor: "rgba(0,0,0,0.55)",
							alignItems: "center",
							justifyContent: "center",
						}}
					>
						<Glyph name="PlayIcon" color="#ffffff" size={16} />
					</View>
				</View>
			) : null}
			{more ? (
				<View
					pointerEvents="none"
					style={{
						position: "absolute",
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						alignItems: "center",
						justifyContent: "center",
						backgroundColor: "rgba(0,0,0,0.55)",
					}}
				>
					<Text
						variant="heading-lg/semibold"
						style={{ color: "#ffffff" }}
					>{`+${more}`}</Text>
				</View>
			) : null}
		</Pressable>
	);
}

const MEDIA_GAP = 4;
const MEDIA_COLUMNS = 2;
const MEDIA_SHOWN = 4;

/**
 * Up to four tiles, two to a row, sized from the width the message actually has (measured), so a
 * phone never wraps a lone tile. A fifth and later are a "+N" over the fourth, as chat does.
 */
export function MediaGrid({
	media,
	onPressMedia,
}: {
	media: SavedMedia[];
	onPressMedia?: (index: number) => void;
}) {
	const { React } = react;
	const { View } = ReactNative;
	const [width, setWidth] = React.useState(0);
	const shown = media.slice(0, MEDIA_SHOWN);
	const extra = media.length - shown.length;
	const tile =
		width > 0
			? Math.floor((width - MEDIA_GAP * (MEDIA_COLUMNS - 1)) / MEDIA_COLUMNS)
			: 0;
	return (
		<View
			onLayout={(event: any) => {
				const next = Math.floor(event?.nativeEvent?.layout?.width ?? 0);
				if (next > 0 && Math.abs(next - width) > 1) setWidth(next);
			}}
			style={{
				flexDirection: "row",
				flexWrap: "wrap",
				gap: MEDIA_GAP,
				marginTop: 4,
				minHeight: tile ? undefined : 96,
			}}
		>
			{tile
				? shown.map((item, index) => (
						<MediaTile
							key={item.key}
							item={item}
							size={tile}
							more={index === shown.length - 1 && extra > 0 ? extra : undefined}
							onPress={() => onPressMedia?.(index)}
						/>
					))
				: null}
		</View>
	);
}

export interface EarlierVersion {
	content: string;
	editedAt: number;
}

/** A failed row draws this instead of taking the whole page down. */
function BrokenRow() {
	const { View } = ReactNative;
	const { Text } = Design as any;
	return (
		<View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
			<Text variant="text-sm/normal" color="text-muted">
				Couldn't show this message.
			</Text>
		</View>
	);
}

let RowBoundary: any;
/** Wraps one list row: if it throws while rendering, only that row is replaced. */
export function RowGuard({ children }: { children: any }) {
	const { React } = react;
	if (!RowBoundary) {
		RowBoundary = class extends (
			React.Component<{ children?: any }, { failed: boolean }>
		) {
			state = { failed: false };
			static getDerivedStateFromError() {
				return { failed: true };
			}
			componentDidCatch(error: unknown) {
				reportError(`${TAG} a log row failed to render:`, error);
			}
			render() {
				return this.state.failed ? <BrokenRow /> : this.props.children;
			}
		};
	}
	return <RowBoundary>{children}</RowBoundary>;
}

/**
 * One logged message, drawn like a chat message. `footer` says what happened to it (deleted,
 * edited), muted, with its icon; `problem` is added in red only for something that went wrong.
 * Edited messages pass their earlier versions, newest first; the latest shows, the rest behind
 * "Show older".
 */
export function MessageCard({
	authorId,
	authorName,
	authorAvatar,
	sentAt,
	content,
	format,
	reply,
	media,
	earlier,
	footerIcon,
	footer,
	problem,
	onPress,
	onLongPress,
	onPressMedia,
	selected,
}: {
	authorId?: string;
	authorName?: string;
	authorAvatar?: string;
	sentAt?: number;
	content?: string | null;
	/** Who and where, so mentions in the text read as names. */
	format?: FormatContext;
	reply?: { name?: string; content?: string | null };
	media?: SavedMedia[];
	earlier?: EarlierVersion[];
	footerIcon: string;
	footer: string;
	/** Something that went wrong ("2 attachments not saved"): the one part shown in red. */
	problem?: string;
	onPress?: () => void;
	onLongPress?: () => void;
	onPressMedia?: (index: number) => void;
	/** Select mode: true/false draws a tick circle (and a highlight when ticked); undefined is normal. */
	selected?: boolean;
}) {
	const { React } = react;
	const { View, Pressable } = ReactNative;
	const { Text } = Design as any;
	const [expanded, setExpanded] = React.useState(false);
	const [allVersions, setAllVersions] = React.useState(false);
	const muted = token("TEXT_MUTED", "#949ba4");

	const text = React.useMemo(
		() => formatContent(content, format),
		[content, format],
	);
	const replyText = React.useMemo(
		() => formatContent(reply?.content, format),
		[reply?.content, format],
	);
	const versions = React.useMemo(
		() =>
			(Array.isArray(earlier) ? earlier : []).map((version) => ({
				content: formatContent(version?.content, format),
				editedAt: version?.editedAt,
			})),
		[earlier, format],
	);
	const long = text.length > 400;
	const shownVersions = allVersions ? versions : versions.slice(0, 1);
	const userId = typeof authorId === "string" ? authorId : "";

	return (
		<Pressable
			onPress={onPress}
			onLongPress={onLongPress}
			delayLongPress={350}
			android_ripple={{ color: token("BACKGROUND_MOD_SUBTLE", "#2e3035") }}
			accessibilityState={
				selected === undefined ? undefined : { checked: selected }
			}
			style={{
				paddingHorizontal: 16,
				paddingVertical: 8,
				backgroundColor: selected
					? token("BACKGROUND_MOD_SUBTLE", "#2e3035")
					: undefined,
			}}
		>
			{reply?.name || reply?.content ? (
				<View
					style={{
						flexDirection: "row",
						alignItems: "center",
						gap: 6,
						marginLeft: 20,
						marginBottom: 4,
					}}
				>
					<Glyph name="ArrowAngleLeftUpIcon" color={muted} size={12} />
					<Text
						variant="text-sm/normal"
						color="text-muted"
						lineClamp={1}
						style={{ flexShrink: 1 }}
					>
						{reply.name ? (
							<Text variant="text-sm/semibold" color="text-muted">
								{`@${reply.name} `}
							</Text>
						) : null}
						{replyText.replace(/\s+/g, " ").trim() || "Tap to see attachment"}
					</Text>
				</View>
			) : null}

			<View style={{ flexDirection: "row", gap: 12 }}>
				{selected === undefined ? null : (
					<View
						style={{
							width: 22,
							height: 22,
							borderRadius: 11,
							marginTop: 9,
							borderWidth: 2,
							alignItems: "center",
							justifyContent: "center",
							borderColor: selected
								? token("BACKGROUND_BRAND", "#5865f2")
								: muted,
							backgroundColor: selected
								? token("BACKGROUND_BRAND", "#5865f2")
								: undefined,
						}}
					>
						{selected ? (
							<Glyph name="CheckmarkLargeIcon" color="#ffffff" size={14} />
						) : null}
					</View>
				)}
				<UserAvatar userId={userId} hash={authorAvatar} />
				<View style={{ flex: 1, gap: 2 }}>
					<View
						style={{
							flexDirection: "row",
							alignItems: "center",
							flexWrap: "wrap",
							columnGap: 6,
						}}
					>
						<Text variant="text-md/semibold" color="text-strong" lineClamp={1}>
							{authorName || "Unknown user"}
						</Text>
						{userId && isBot(userId) ? <BotTag /> : null}
						{sentAt ? (
							<Text variant="text-xs/medium" color="text-muted">
								{stamp(sentAt)}
							</Text>
						) : null}
					</View>

					{shownVersions.map((version, index) => (
						<Text
							key={index}
							variant="text-sm/normal"
							color="text-muted"
							lineClamp={allVersions ? undefined : 3}
						>
							{version.content.trim() || "(no text)"}
						</Text>
					))}
					{versions.length > 1 ? (
						<Text
							variant="text-xs/semibold"
							style={{ color: token("TEXT_LINK", "#00a8fc") }}
							onPress={() => setAllVersions(!allVersions)}
						>
							{allVersions
								? "Show less"
								: `Show ${versions.length - 1} older version${versions.length === 2 ? "" : "s"}`}
						</Text>
					) : null}

					{text ? (
						<Text variant="text-md/normal" color="text-default">
							{long && !expanded ? `${text.slice(0, 400).trimEnd()}… ` : text}
							{long && !expanded ? (
								<Text
									variant="text-md/medium"
									style={{ color: token("TEXT_LINK", "#00a8fc") }}
									onPress={() => setExpanded(true)}
								>
									Read more
								</Text>
							) : null}
						</Text>
					) : null}

					{media?.length ? (
						<MediaGrid media={media} onPressMedia={onPressMedia} />
					) : null}

					<View
						style={{
							flexDirection: "row",
							alignItems: "center",
							flexWrap: "wrap",
							gap: 4,
							marginTop: 2,
						}}
					>
						<Glyph name={footerIcon} color={muted} size={12} />
						<Text variant="text-xs/medium" color="text-muted">
							{footer}
						</Text>
						{problem ? (
							<Text variant="text-xs/medium" color="text-feedback-critical">
								{`· ${problem}`}
							</Text>
						) : null}
					</View>
				</View>
			</View>
		</Pressable>
	);
}

/** Discord's search glyph for the TextInput's leading icon, or nothing. */
function searchIcon(): any {
	try {
		return lookupGeneratedIconComponent("MagnifyingGlassIcon", "SearchIcon");
	} catch {
		return undefined;
	}
}

/**
 * Discord's TextInput with its search icon. A leading icon Discord's field rejects costs the icon,
 * not the search box.
 */
export function SearchField({
	query,
	onQuery,
	placeholder,
}: {
	query?: string;
	onQuery: (value: string) => void;
	placeholder?: string;
}) {
	const { TextInput } = Design as any;
	const input = (icon?: any) => (
		<TextInput
			placeholder={placeholder}
			value={query}
			onChange={(value: string) => onQuery(value)}
			leadingIcon={icon}
			isClearable
			returnKeyType="search"
		/>
	);
	const icon = searchIcon();
	return (
		<Native name="TextInput leadingIcon" available={!!icon} fallback={input()}>
			{input(icon)}
		</Native>
	);
}

/**
 * Search and filters over a log: Discord's TextInput with its search icon, then light filter chips
 * (Discord's Buttons: the chosen one `secondary`, the rest `tertiary`, so the row is not a block of
 * brand colour). Not SegmentedControl: its pager inside a scroll view left some phones unable to
 * reach later pages (Shimeji 0.8.x), and these switch plain state with nothing to swipe.
 */
export function FilterBar<T extends string>({
	query,
	onQuery,
	placeholder,
	filters,
	filter,
	onFilter,
}: {
	/** Leave out `onQuery` for filters alone. */
	query?: string;
	onQuery?: (value: string) => void;
	placeholder?: string;
	filters: Array<{ id: T; label: string }>;
	filter: T;
	onFilter: (value: T) => void;
}) {
	const { View } = ReactNative;
	const { Button } = Design as any;
	return (
		<View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 12 }}>
			{onQuery ? (
				<SearchField
					query={query}
					onQuery={onQuery}
					placeholder={placeholder}
				/>
			) : null}
			<View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
				{filters.map((option) => (
					<Button
						key={option.id}
						size="sm"
						variant={option.id === filter ? "secondary" : "tertiary"}
						text={option.id === filter ? `✓ ${option.label}` : option.label}
						onPress={() => onFilter(option.id)}
					/>
				))}
			</View>
		</View>
	);
}
