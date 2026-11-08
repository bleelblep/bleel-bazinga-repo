/**
 * The rows of the log screens, in the grouped-box look (Boxes.tsx):
 *
 * - Recent: compact, one line of text, a tag only when it matters.
 * - One conversation: the full text, media in a grid, "sent → deleted", earlier text struck through.
 * - Conversations: one row per channel or person, with a preview and a count.
 *
 * Every row is crash-safe on missing fields: the log holds entries from every older version.
 */

import { Design } from "@valenced/discord/design";
import * as react from "@valenced/react";
import * as ReactNative from "react-native";
import type { EditRecord } from "../../lib/edits";
import { formatContent } from "../../lib/formatContent";
import type { SavedMedia } from "../../lib/media";
import { savedMedia } from "../../lib/media";
import { Glyph, GuildIcon, UserAvatar } from "../native";
import { openDeletedSheet, openEditSheet, pressMedia } from "../sheets";
import type { DeletedMessage } from "../state";
import { token } from "../theme";
import {
	BoxRow,
	ChannelTile,
	CountPill,
	plural,
	shortWhen,
	span,
	Tag,
} from "./Boxes";
import type { Conversation, LogKind, Placed } from "./conversation";
import { placeLabel } from "./conversation";
import { clock, MediaGrid, MediaTile, validDate } from "./Message";
import type { Selection } from "./Select";

// ── What a deleted entry says ─────────────────────────────────────────────────────────────────────

/** The text the message had when it was deleted. */
export function realText(entry: DeletedMessage): string {
	const raw = entry?.content;
	return typeof raw === "string" ? raw : "";
}

/** Attachments with no saved copy (their CDN links died with the message). */
export function unsavedCount(
	entry: DeletedMessage,
	media: SavedMedia[],
): number {
	const attachments = Array.isArray(entry?.attachments)
		? entry.attachments.length
		: 0;
	return Math.max(
		0,
		attachments - media.filter((m) => m.key.includes(":a")).length,
	);
}

/** "2 photos", "1 video", "3 files", or "4 attachments" for a mix. */
export function mediaLabel(media: SavedMedia[]): string {
	const kinds = new Set(media.map((m) => m.kind));
	const word =
		kinds.size > 1
			? "attachment"
			: kinds.has("image")
				? "photo"
				: kinds.has("video")
					? "video"
					: "file";
	return plural(media.length, word);
}

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

const lower = (value: unknown) =>
	typeof value === "string" ? value.toLowerCase() : "";

/** Search over the raw stored text (an id or a markdown word still finds it), names and files. */
export function matchesDeleted(entry: DeletedMessage, query: string): boolean {
	if (!query) return true;
	const haystack = [
		entry?.content,
		entry?.authorName,
		entry?.channelName,
		entry?.guildName,
		...(Array.isArray(entry?.attachments) ? entry.attachments : []).map(
			(attachment) => attachment?.filename,
		),
	];
	return haystack.some((text) => lower(text).includes(query));
}

export const versionsOf = (record: EditRecord) =>
	Array.isArray(record?.versions) ? record.versions : [];

export function matchesEdit(record: EditRecord, query: string): boolean {
	if (!query) return true;
	const haystack = [
		record?.current,
		record?.authorName,
		record?.channelName,
		record?.guildName,
		...versionsOf(record).map((version) => version?.content),
	];
	return haystack.some((text) => lower(text).includes(query));
}

// ── Pieces ────────────────────────────────────────────────────────────────────────────────────────

/** Name, where (or nothing), and a time on the right. */
function NameLine({
	name,
	where,
	time,
}: {
	name?: string;
	where?: string;
	time?: string;
}) {
	const { View } = ReactNative;
	const { Text } = Design as any;
	return (
		<View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
			<Text
				variant="text-md/semibold"
				color="text-strong"
				lineClamp={1}
				style={{ flexShrink: 1 }}
			>
				{name || "Unknown user"}
			</Text>
			<Text
				variant="text-sm/medium"
				color="text-muted"
				lineClamp={1}
				style={{ flex: 1 }}
			>
				{where ?? ""}
			</Text>
			{time ? (
				<Text variant="text-xs/medium" color="text-muted">
					{time}
				</Text>
			) : null}
		</View>
	);
}

/** "was ~~old text~~" (or "edited first, was"), muted. */
function WasLine({
	text,
	prefix = "was",
	full,
}: {
	text: string;
	prefix?: string;
	full?: boolean;
}) {
	const { Text } = Design as any;
	return (
		<Text
			variant="text-sm/normal"
			color="text-muted"
			lineClamp={full ? undefined : 1}
		>
			{`${prefix} `}
			<Text
				variant="text-sm/normal"
				color="text-muted"
				style={{ textDecorationLine: "line-through" }}
			>
				{(full ? text.trim() : oneLine(text)) || "(no text)"}
			</Text>
		</Text>
	);
}

function Tags({ entry, unsaved }: { entry: DeletedMessage; unsaved: number }) {
	const { View } = ReactNative;
	if (!entry?.byYou && !unsaved) return null;
	return (
		<View
			style={{
				flexDirection: "row",
				flexWrap: "wrap",
				alignItems: "center",
				gap: 8,
				marginTop: 3,
			}}
		>
			{entry.byYou ? <Tag tone="muted" text="Deleted by you" /> : null}
			{unsaved ? (
				<Tag
					tone="critical"
					text={`${plural(unsaved, "attachment")} not saved`}
				/>
			) : null}
		</View>
	);
}

type RowProps<T> = {
	first: boolean;
	last: boolean;
	selection: Selection;
	item: T;
};

function pressHandlers(
	selection: Selection,
	id: string,
	open: () => void,
): { onPress: () => void; onLongPress: () => void } {
	return {
		onPress: () => (selection.active ? selection.toggle(id) : open()),
		onLongPress: () =>
			selection.active ? selection.toggle(id) : selection.startWith(id),
	};
}

// ── Deleted ───────────────────────────────────────────────────────────────────────────────────────

/** Recent: avatar, name, channel, time, one line (or "2 photos" and a thumbnail), tags. */
export function DeletedRecentRow({
	item: entry,
	first,
	last,
	selection,
}: RowProps<DeletedMessage>) {
	const { React } = react;
	const { View } = ReactNative;
	const { Text } = Design as any;
	const media = React.useMemo(() => savedMedia(entry), [entry]);
	const text = React.useMemo(
		() =>
			oneLine(
				formatContent(realText(entry), {
					guildId: entry?.guildId,
					mentions: entry?.mentions,
				}),
			),
		[entry],
	);
	const unsaved = unsavedCount(entry, media);
	const id = String(entry?.id ?? "");
	const handlers = pressHandlers(selection, id, () => openDeletedSheet(entry));
	const date = validDate(entry?.deletedAt);
	const thumb = media.find((m) => m.kind !== "file");
	const muted = token("TEXT_MUTED", "#949ba4");
	return (
		<BoxRow
			first={first}
			last={last}
			selected={selection.active ? selection.has(id) : undefined}
			accessibilityLabel={`${entry?.authorName ?? "Unknown user"}: ${text || (media.length ? mediaLabel(media) : "no text")}`}
			{...handlers}
		>
			<UserAvatar
				userId={String(entry?.authorId ?? "")}
				hash={entry?.authorAvatar}
			/>
			<View style={{ flex: 1, minWidth: 0, gap: 2 }}>
				<NameLine
					name={entry?.authorName}
					where={placeLabel(entry ?? {})}
					time={date ? clock(date) : undefined}
				/>
				{media.length ? (
					<View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
						<Glyph name="ImageIcon" color={muted} size={14} />
						<Text
							variant="text-sm/normal"
							color="text-default"
							lineClamp={1}
							style={{ flexShrink: 1 }}
						>
							{mediaLabel(media)}
							{text ? (
								<Text
									variant="text-sm/normal"
									color="text-muted"
								>{` · ${text}`}</Text>
							) : null}
						</Text>
					</View>
				) : (
					<Text
						variant="text-sm/normal"
						color={text ? "text-default" : "text-muted"}
						lineClamp={1}
					>
						{text || "(no text)"}
					</Text>
				)}
				<Tags entry={entry} unsaved={unsaved} />
			</View>
			{thumb ? (
				<MediaTile
					item={thumb}
					size={44}
					onPress={() =>
						selection.active
							? selection.toggle(id)
							: pressMedia(media, media.indexOf(thumb))
					}
					onLongPress={handlers.onLongPress}
				/>
			) : null}
		</BoxRow>
	);
}

/** One conversation: the full text, media two to a row, "sent → deleted", earlier text. */
export function DeletedFullRow({
	item: entry,
	first,
	last,
	selection,
}: RowProps<DeletedMessage>) {
	const { React } = react;
	const { View } = ReactNative;
	const { Text } = Design as any;
	const format = React.useMemo(
		() => ({ guildId: entry?.guildId, mentions: entry?.mentions }),
		[entry],
	);
	const media = React.useMemo(() => savedMedia(entry), [entry]);
	const text = React.useMemo(
		() => formatContent(realText(entry), format).trim(),
		[entry, format],
	);
	const replyAuthor = entry?.referencedMessage?.author;
	const replyName =
		replyAuthor?.global_name ??
		replyAuthor?.globalName ??
		replyAuthor?.username;
	const unsaved = unsavedCount(entry, media);
	const id = String(entry?.id ?? "");
	const handlers = pressHandlers(selection, id, () => openDeletedSheet(entry));
	return (
		<BoxRow
			first={first}
			last={last}
			selected={selection.active ? selection.has(id) : undefined}
			accessibilityLabel={`${entry?.authorName ?? "Unknown user"}: ${text || "no text"}`}
			{...handlers}
		>
			<UserAvatar
				userId={String(entry?.authorId ?? "")}
				hash={entry?.authorAvatar}
			/>
			<View style={{ flex: 1, minWidth: 0, gap: 3 }}>
				<NameLine
					name={entry?.authorName}
					time={span(entry?.sentAt, entry?.deletedAt)}
				/>
				{replyName ? (
					<Text variant="text-xs/medium" color="text-muted" lineClamp={1}>
						{`Replying to @${replyName}`}
					</Text>
				) : null}
				{text ? (
					<Text variant="text-sm/normal" color="text-default">
						{text}
					</Text>
				) : media.length ? null : (
					<Text variant="text-sm/normal" color="text-muted">
						(no text)
					</Text>
				)}
				{media.length ? (
					<MediaGrid
						media={media}
						onPressMedia={(index) =>
							selection.active ? selection.toggle(id) : pressMedia(media, index)
						}
					/>
				) : null}
				<Tags entry={entry} unsaved={unsaved} />
			</View>
		</BoxRow>
	);
}

// ── Edited ────────────────────────────────────────────────────────────────────────────────────────

function editWhere(record: EditRecord): string {
	const place = placeLabel(record ?? {});
	return record?.guildId && record.guildName
		? `${record.guildName} · ${place}`
		: place;
}

/** Recent: the text now, "was ~~before~~" on one line each, and how many versions there are. */
export function EditedRecentRow({
	item: record,
	first,
	last,
	selection,
}: RowProps<EditRecord>) {
	const { React } = react;
	const { View } = ReactNative;
	const { Text } = Design as any;
	const versions = versionsOf(record);
	const format = React.useMemo(() => ({ guildId: record?.guildId }), [record]);
	const now = React.useMemo(
		() => oneLine(formatContent(record?.current, format)),
		[record, format],
	);
	const before = React.useMemo(
		() => formatContent(versions[versions.length - 1]?.content, format),
		[versions, format],
	);
	const id = String(record?.id ?? "");
	const handlers = pressHandlers(selection, id, () => openEditSheet(record));
	const date = validDate(record?.editedAt);
	const count = versions.length + 1;
	return (
		<BoxRow
			first={first}
			last={last}
			selected={selection.active ? selection.has(id) : undefined}
			accessibilityLabel={`${record?.authorName ?? "Unknown user"}: ${now || "no text"}, ${count} versions`}
			{...handlers}
		>
			<UserAvatar
				userId={String(record?.authorId ?? "")}
				hash={record?.authorAvatar}
			/>
			<View style={{ flex: 1, minWidth: 0, gap: 3 }}>
				<NameLine
					name={record?.authorName}
					where={editWhere(record)}
					time={date ? clock(date) : undefined}
				/>
				<Text
					variant="text-sm/normal"
					color={now ? "text-default" : "text-muted"}
					lineClamp={1}
				>
					{now || "(no text)"}
				</Text>
				{versions.length ? <WasLine text={before} /> : null}
			</View>
			<View style={{ alignSelf: "center" }}>
				<CountPill count={count} label={plural(count, "version")} />
			</View>
		</BoxRow>
	);
}

/** One conversation: the full text now, then every earlier version, newest first, struck through. */
export function EditedFullRow({
	item: record,
	first,
	last,
	selection,
}: RowProps<EditRecord>) {
	const { React } = react;
	const { View } = ReactNative;
	const { Text } = Design as any;
	const versions = versionsOf(record);
	const format = React.useMemo(() => ({ guildId: record?.guildId }), [record]);
	const now = React.useMemo(
		() => formatContent(record?.current, format).trim(),
		[record, format],
	);
	const earlier = React.useMemo(
		() =>
			[...versions]
				.reverse()
				.map((version) => formatContent(version?.content, format)),
		[versions, format],
	);
	const id = String(record?.id ?? "");
	const handlers = pressHandlers(selection, id, () => openEditSheet(record));
	const count = versions.length + 1;
	return (
		<BoxRow
			first={first}
			last={last}
			selected={selection.active ? selection.has(id) : undefined}
			accessibilityLabel={`${record?.authorName ?? "Unknown user"}: ${now || "no text"}, ${count} versions`}
			{...handlers}
		>
			<UserAvatar
				userId={String(record?.authorId ?? "")}
				hash={record?.authorAvatar}
			/>
			<View style={{ flex: 1, minWidth: 0, gap: 3 }}>
				<NameLine
					name={record?.authorName}
					time={span(record?.sentAt, record?.editedAt)}
				/>
				<Text
					variant="text-sm/normal"
					color={now ? "text-default" : "text-muted"}
				>
					{now || "(no text)"}
				</Text>
				{earlier.map((text, index) => (
					<WasLine key={index} text={text} full />
				))}
			</View>
			<View style={{ alignSelf: "center" }}>
				<CountPill count={count} label={plural(count, "version")} />
			</View>
		</BoxRow>
	);
}

// ── Conversations ─────────────────────────────────────────────────────────────────────────────────

/** A channel or person: its tile, name, "Author: last text", when, and how many were caught. */
export function ConversationRow<T extends Placed>({
	convo,
	kind,
	first,
	last,
	onPress,
}: {
	convo: Conversation<T>;
	kind: LogKind;
	first: boolean;
	last: boolean;
	onPress: () => void;
}) {
	const { React } = react;
	const { View } = ReactNative;
	const { Text } = Design as any;
	const latest = convo.items[0] as unknown as DeletedMessage & EditRecord;
	const preview = React.useMemo(() => {
		if (!latest) return "";
		if (kind === "edited")
			return oneLine(
				formatContent(latest.current, { guildId: latest.guildId }),
			);
		const text = oneLine(
			formatContent(realText(latest), {
				guildId: latest.guildId,
				mentions: latest.mentions,
			}),
		);
		if (text) return text;
		const media = savedMedia(latest);
		return media.length ? mediaLabel(media) : "";
	}, [latest, kind]);
	const line = `${latest?.authorName || "Unknown user"}: ${preview || "(no text)"}`;
	const count = convo.items.length;
	const noun = kind === "edited" ? "edited" : "deleted";
	return (
		<BoxRow
			first={first}
			last={last}
			onPress={onPress}
			accessibilityLabel={`${convo.title}, ${count} ${noun}. ${line}`}
		>
			<View style={{ alignSelf: "center" }}>
				{convo.person ? (
					<UserAvatar userId={convo.person.id} hash={convo.person.avatar} />
				) : convo.guildId && convo.guildIcon ? (
					<GuildIcon
						id={convo.guildId}
						hash={convo.guildIcon}
						name={convo.guildName ?? "Server"}
						size={40}
					/>
				) : (
					<ChannelTile />
				)}
			</View>
			<View style={{ flex: 1, minWidth: 0, gap: 2, justifyContent: "center" }}>
				<Text variant="text-md/semibold" color="text-strong" lineClamp={1}>
					{convo.title.replace(/^#/, "") || "channel"}
				</Text>
				<Text variant="text-sm/normal" color="text-muted" lineClamp={1}>
					{line}
				</Text>
			</View>
			<View
				style={{ alignItems: "flex-end", justifyContent: "center", gap: 4 }}
			>
				<Text variant="text-xs/medium" color="text-muted">
					{shortWhen(convo.latestAt)}
				</Text>
				<CountPill count={count} label={`${count} ${noun}`} />
			</View>
		</BoxRow>
	);
}
