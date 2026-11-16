/**
 * The rows of the log screens, in the grouped-box look (Boxes.tsx):
 *
 * - Recent: compact, one line of text, a tag only when it matters. Tapping one opens it out in
 *   place: the full message as in a conversation, and a bar of actions under it.
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
import { savedMedia, savedStickers } from "../../lib/media";
import { Glyph, GuildIcon, UserAvatar } from "../native";
import { jumpToDeletedMessage } from "../../lib/navigate";
import {
	copy,
	editHistoryText,
	openDeletedSheet,
	openEditSheet,
	openUserProfile,
	pressMedia,
	removeDeleted,
	removeEdit,
} from "../sheets";
import type { DeletedMessage } from "../state";
import { token } from "../theme";
import {
	BoxRow,
	ChannelTile,
	CountPill,
	firstToken,
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

/** The words of one link preview or bot embed. */
interface EmbedText {
	/** Site or author, then the title: "YouTube · Video name". */
	title: string;
	body: string;
}

const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/**
 * What a message's link previews and bot embeds say. They were saved all along and never drawn,
 * so a message that was only a link preview or a bot's embed read "(no text)". Discord's stored
 * embeds name the text `rawTitle`/`rawDescription`; the API's own names are read too. Capped: an
 * embed can carry 6000 characters, and this is a log row.
 */
export function embedTexts(entry: DeletedMessage): EmbedText[] {
	if (!Array.isArray(entry?.embeds)) return [];
	const out: EmbedText[] = [];
	for (const embed of entry.embeds.slice(0, 5)) {
		if (!embed || typeof embed !== "object") continue;
		const source = str(embed.provider?.name) || str(embed.author?.name);
		const heading = str(embed.rawTitle) || str(embed.title);
		const fields = (Array.isArray(embed.fields) ? embed.fields : [])
			.slice(0, 10)
			.map((field: any) =>
				[str(field?.rawName) || str(field?.name), str(field?.rawValue) || str(field?.value)]
					.filter(Boolean)
					.join(": "),
			)
			.filter(Boolean);
		const body = [
			str(embed.rawDescription) || str(embed.description),
			...fields,
			str(embed.footer?.text),
		]
			.filter(Boolean)
			.join("\n")
			.slice(0, 1000);
		const title = [source, heading].filter(Boolean).join(" · ").slice(0, 200);
		if (title || body) out.push({ title, body });
	}
	return out;
}

/** One line for a compact row: the first embed's title, or the start of its text. */
function embedLine(entry: DeletedMessage): string {
	const first = embedTexts(entry)[0];
	return first ? oneLine(first.title || first.body) : "";
}

const stickerNames = (entry: DeletedMessage): string[] =>
	(Array.isArray(entry?.stickers) ? entry.stickers : [])
		.map((sticker) => str(sticker?.name))
		.filter(Boolean);

/** A forward's text as plain reading text, like the message's own. */
function forwardedText(entry: DeletedMessage): string {
	return formatContent(str(entry?.forwarded?.content), {
		guildId: entry?.guildId,
	}).trim();
}

/**
 * What a message with no text of its own says, on one line: its link preview, the message it
 * forwarded, or its sticker. Empty when it has none of those.
 */
function fallbackLine(entry: DeletedMessage): string {
	const preview = embedLine(entry);
	if (preview) return preview;
	if (entry?.forwarded) {
		const text = oneLine(forwardedText(entry));
		return text ? `Forwarded: ${text}` : "Forwarded message";
	}
	const names = stickerNames(entry);
	if (names.length) return `Sticker: ${names.join(", ")}`;
	const question = str(entry?.poll?.question);
	return entry?.poll ? `Poll: ${question || "(no question)"}` : "";
}

/** A small rounded label: one reaction with its count, or one button's name. Not pressable. */
function Chip({ label }: { label: string }) {
	const { View } = ReactNative;
	const { Text } = Design as any;
	return (
		<View
			style={{
				borderRadius: 8,
				paddingHorizontal: 8,
				paddingVertical: 3,
				backgroundColor: firstToken(
					["BACKGROUND_MOD_STRONG", "BACKGROUND_SURFACE_HIGHEST"],
					"#3f4147",
				),
			}}
		>
			<Text variant="text-xs/medium" color="text-default" lineClamp={1}>
				{label}
			</Text>
		</View>
	);
}

/**
 * What stood on a message besides its text when it was deleted: its poll, a bot message's buttons
 * and menus, and its reactions. All of it is for reading: nothing here can be pressed, voted on or
 * reacted to (the message is gone, and those actions are refused on it in chat too).
 */
function Extras({ entry }: { entry: DeletedMessage }) {
	const { View } = ReactNative;
	const { Text } = Design as any;
	const poll = entry?.poll;
	const answers = Array.isArray(poll?.answers) ? poll.answers : [];
	const buttons = Array.isArray(entry?.buttons) ? entry.buttons : [];
	const reactions = Array.isArray(entry?.reactions) ? entry.reactions : [];
	if (!poll && !buttons.length && !reactions.length) return null;
	const wrap = {
		flexDirection: "row" as const,
		flexWrap: "wrap" as const,
		gap: 6,
	};
	return (
		<View style={{ gap: 6, marginTop: 2 }}>
			{poll ? (
				<View
					style={{
						borderLeftWidth: 3,
						borderLeftColor: token("BORDER_SUBTLE", "#4e5058"),
						paddingLeft: 8,
						gap: 2,
					}}
				>
					<Text variant="text-xs/semibold" color="text-muted">
						{`Poll${poll.ended ? " · ended" : ""}${poll.multiselect ? " · pick several" : ""}`}
					</Text>
					{str(poll.question) ? (
						<Text variant="text-sm/semibold" color="text-default">
							{str(poll.question)}
						</Text>
					) : null}
					{answers.map((answer, index) => (
						<Text
							key={index}
							variant="text-sm/normal"
							color="text-muted"
							lineClamp={2}
						>
							{`• ${str(answer?.text)}${
								typeof answer?.votes === "number"
									? ` · ${plural(answer.votes, "vote")}`
									: ""
							}`}
						</Text>
					))}
				</View>
			) : null}
			{buttons.length ? (
				<View style={wrap} accessibilityLabel="Buttons on the message">
					{buttons.map((button, index) => (
						<Chip
							key={index}
							label={
								button?.kind === "menu"
									? `${str(button?.label)} ▾`
									: str(button?.label)
							}
						/>
					))}
				</View>
			) : null}
			{reactions.length ? (
				<View style={wrap} accessibilityLabel="Reactions on the message">
					{reactions.map((reaction, index) => (
						<Chip
							key={index}
							label={`${reaction?.id ? `:${str(reaction?.name)}:` : str(reaction?.name)} ${reaction?.count ?? ""}`}
						/>
					))}
				</View>
			) : null}
		</View>
	);
}

/** The message a forward carried: a bar down the side, "Forwarded" over its text. */
function ForwardedBlock({ entry }: { entry: DeletedMessage }) {
	const { View } = ReactNative;
	const { Text } = Design as any;
	if (!entry?.forwarded) return null;
	const text = forwardedText(entry);
	return (
		<View
			style={{
				borderLeftWidth: 3,
				borderLeftColor: token("BORDER_SUBTLE", "#4e5058"),
				paddingLeft: 8,
				gap: 2,
				marginTop: 2,
			}}
		>
			<Text variant="text-xs/semibold" color="text-muted">
				↪ Forwarded
			</Text>
			{text ? (
				<Text variant="text-sm/normal" color="text-default">
					{text}
				</Text>
			) : null}
		</View>
	);
}

/** A message's stickers: the saved pictures, and the names of any with none (Lottie, not saved). */
function Stickers({
	entry,
	onPress,
}: {
	entry: DeletedMessage;
	onPress: (items: SavedMedia[], index: number) => void;
}) {
	const { View } = ReactNative;
	const { Text } = Design as any;
	const names = stickerNames(entry);
	if (!names.length) return null;
	const saved = savedStickers(entry);
	return (
		<View style={{ gap: 4, marginTop: 2 }}>
			{saved.length ? (
				<View style={{ flexDirection: "row", gap: 6 }}>
					{saved.map((item, index) => (
						<MediaTile
							key={item.key}
							item={item}
							size={96}
							onPress={() => onPress(saved, index)}
						/>
					))}
				</View>
			) : null}
			<Text variant="text-xs/medium" color="text-muted" lineClamp={1}>
				{`Sticker: ${names.join(", ")}`}
			</Text>
		</View>
	);
}

/** Link previews and embeds under a message: a bar down the side, title over text, like chat. */
function EmbedBlocks({ entry }: { entry: DeletedMessage }) {
	const { View } = ReactNative;
	const { Text } = Design as any;
	const embeds = embedTexts(entry);
	if (!embeds.length) return null;
	return (
		<View style={{ gap: 6, marginTop: 2 }}>
			{embeds.map((embed, index) => (
				<View
					key={index}
					style={{
						borderLeftWidth: 3,
						borderLeftColor: token("BORDER_SUBTLE", "#4e5058"),
						paddingLeft: 8,
						gap: 2,
					}}
				>
					{embed.title ? (
						<Text variant="text-sm/semibold" color="text-default" lineClamp={2}>
							{embed.title}
						</Text>
					) : null}
					{embed.body ? (
						<Text variant="text-sm/normal" color="text-muted" lineClamp={8}>
							{embed.body}
						</Text>
					) : null}
				</View>
			))}
		</View>
	);
}

const lower = (value: unknown) =>
	typeof value === "string" ? value.toLowerCase() : "";

/** Search over the raw stored text (an id or a markdown word still finds it), names and files. */
export function matchesDeleted(entry: DeletedMessage, query: string): boolean {
	if (!query) return true;
	const haystack = [
		entry?.content,
		entry?.authorName,
		entry?.authorUsername,
		entry?.authorNick,
		entry?.channelName,
		entry?.guildName,
		...(Array.isArray(entry?.attachments) ? entry.attachments : []).map(
			(attachment) => attachment?.filename,
		),
		...embedTexts(entry).flatMap((embed) => [embed.title, embed.body]),
		entry?.forwarded?.content,
		...stickerNames(entry),
		entry?.poll?.question,
		...(Array.isArray(entry?.poll?.answers) ? entry.poll.answers : []).map(
			(answer) => answer?.text,
		),
		...(Array.isArray(entry?.buttons) ? entry.buttons : []).map(
			(button) => button?.label,
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
	bot,
}: {
	name?: string;
	where?: string;
	time?: string;
	/** The author is a bot (entries from 0.4.0 on say). */
	bot?: boolean;
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
			{bot ? (
				<Text
					variant="text-xxs/bold"
					color="text-muted"
					style={{ letterSpacing: 0.5 }}
				>
					BOT
				</Text>
			) : null}
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
	/** Recent only: this row is the one opened out, and what a tap does (open or close it). */
	expanded?: boolean;
	onToggle?: () => void;
};

/** What an opened-out row adds to the conversation row it borrows. */
type OpenedProps = {
	/** The channel, which a conversation's own rows don't need to say. */
	where?: string;
	/** A tap closes the row instead of opening the sheet. */
	onPress?: () => void;
	withActions?: boolean;
};

interface Action {
	label: string;
	icon: string;
	danger?: boolean;
	onPress: () => void;
}

/**
 * The actions under an opened-out row: icon over label, evenly spaced, each a full touch target.
 * On a darker strip across the card's full width (the track colour of the Recent/Conversations
 * switch), so it reads as the row's menu and not as more of the message. A tray of raised keys was
 * tried (0.3.7) and looked heavier without being any clearer.
 */
function Actions({ items }: { items: Action[] }) {
	const { View, Pressable } = ReactNative;
	const { Text } = Design as any;
	// The strongest text colour on the darkest surface: muted grey on the strip was hard to read.
	const normal = firstToken(
		["TEXT_STRONG", "HEADER_PRIMARY", "TEXT_DEFAULT"],
		"#f2f3f5",
	);
	const red = token("TEXT_FEEDBACK_CRITICAL", "#f23f43");
	return (
		<View
			accessibilityRole="menu"
			style={{
				flexDirection: "row",
				backgroundColor: firstToken(
					["BACKGROUND_BASE_LOWEST", "MOBILE_SEGMENTED_CONTROL_BACKGROUND"],
					"#111214",
				),
			}}
		>
			{items.map((item) => (
				<Pressable
					key={item.label}
					onPress={item.onPress}
					accessibilityRole="menuitem"
					accessibilityLabel={item.label}
					android_ripple={{ color: token("BACKGROUND_MOD_SUBTLE", "#2e3035") }}
					style={{
						flex: 1,
						minHeight: 56,
						alignItems: "center",
						justifyContent: "center",
						gap: 4,
						paddingVertical: 8,
					}}
				>
					<Glyph
						name={item.icon}
						color={item.danger ? red : normal}
						size={20}
					/>
					<Text
						variant="text-xs/semibold"
						color={item.danger ? "text-feedback-critical" : "text-strong"}
						lineClamp={1}
					>
						{item.label}
					</Text>
				</Pressable>
			))}
		</View>
	);
}

function deletedActions(entry: DeletedMessage): Action[] {
	const text = realText(entry);
	const actions: Action[] = [
		{
			label: "View in chat",
			icon: "ChatIcon",
			onPress: () => jumpToDeletedMessage(entry),
		},
	];
	if (text)
		actions.push({ label: "Copy", icon: "CopyIcon", onPress: () => copy(text) });
	if (entry?.authorId)
		actions.push({
			label: "Profile",
			icon: "UserCircleIcon",
			onPress: () => openUserProfile(String(entry.authorId)),
		});
	actions.push({
		label: "Remove",
		icon: "TrashIcon",
		danger: true,
		onPress: () => removeDeleted(entry),
	});
	return actions;
}

function editActions(record: EditRecord): Action[] {
	const actions: Action[] = [
		{
			label: "View in chat",
			icon: "ChatIcon",
			onPress: () => jumpToDeletedMessage(record),
		},
		{
			label: "Copy all",
			icon: "CopyIcon",
			onPress: () => copy(editHistoryText(record)),
		},
	];
	if (record?.authorId)
		actions.push({
			label: "Profile",
			icon: "UserCircleIcon",
			onPress: () => openUserProfile(String(record.authorId)),
		});
	actions.push({
		label: "Remove",
		icon: "TrashIcon",
		danger: true,
		onPress: () => removeEdit(record),
	});
	return actions;
}

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

/**
 * Recent: the compact row, or the full message with its actions once tapped. Two components, so
 * each keeps the same hooks from one render to the next. Select mode always shows the compact row.
 */
export function DeletedRecentRow(props: RowProps<DeletedMessage>) {
	if (props.expanded && !props.selection.active)
		return (
			<DeletedFullRow
				{...props}
				where={placeLabel(props.item ?? {})}
				onPress={props.onToggle}
				withActions
			/>
		);
	return <DeletedCompactRow {...props} />;
}

/** Avatar, name, channel, time, one line (or "2 photos" and a thumbnail), tags. */
function DeletedCompactRow({
	item: entry,
	first,
	last,
	selection,
	onToggle,
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
	const handlers = pressHandlers(
		selection,
		id,
		onToggle ?? (() => openDeletedSheet(entry)),
	);
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
					bot={entry?.authorBot}
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
						{text || fallbackLine(entry) || "(no text)"}
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
	where,
	onPress,
	withActions,
}: RowProps<DeletedMessage> & OpenedProps) {
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
	const handlers = pressHandlers(
		selection,
		id,
		onPress ?? (() => openDeletedSheet(entry)),
	);
	const replyText = withActions
		? oneLine(
				formatContent(String(entry?.referencedMessage?.content ?? ""), format),
			)
		: "";
	return (
		<BoxRow
			first={first}
			last={last}
			selected={selection.active ? selection.has(id) : undefined}
			accessibilityLabel={`${entry?.authorName ?? "Unknown user"}: ${text || "no text"}`}
			footer={
				withActions && !selection.active ? (
					<Actions items={deletedActions(entry)} />
				) : undefined
			}
			{...handlers}
		>
			<UserAvatar
				userId={String(entry?.authorId ?? "")}
				hash={entry?.authorAvatar}
			/>
			<View style={{ flex: 1, minWidth: 0, gap: 3 }}>
				<NameLine
					name={entry?.authorName}
					bot={entry?.authorBot}
					where={where}
					time={span(entry?.sentAt, entry?.deletedAt)}
				/>
				{replyName ? (
					<Text
						variant="text-xs/medium"
						color="text-muted"
						lineClamp={replyText ? 2 : 1}
					>
						{`Replying to @${replyName}${replyText ? `: ${replyText}` : ""}`}
					</Text>
				) : null}
				{text ? (
					<Text variant="text-sm/normal" color="text-default">
						{text}
					</Text>
				) : media.length || fallbackLine(entry) ? null : (
					<Text variant="text-sm/normal" color="text-muted">
						(no text)
					</Text>
				)}
				<ForwardedBlock entry={entry} />
				<EmbedBlocks entry={entry} />
				<Stickers
					entry={entry}
					onPress={(items, index) =>
						selection.active ? selection.toggle(id) : pressMedia(items, index)
					}
				/>
				<Extras entry={entry} />
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

/** Recent: the compact row, or every version with its actions once tapped. See DeletedRecentRow. */
export function EditedRecentRow(props: RowProps<EditRecord>) {
	if (props.expanded && !props.selection.active)
		return (
			<EditedFullRow
				{...props}
				where={editWhere(props.item)}
				onPress={props.onToggle}
				withActions
			/>
		);
	return <EditedCompactRow {...props} />;
}

/** The text now, "was ~~before~~" on one line each, and how many versions there are. */
function EditedCompactRow({
	item: record,
	first,
	last,
	selection,
	onToggle,
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
	const handlers = pressHandlers(
		selection,
		id,
		onToggle ?? (() => openEditSheet(record)),
	);
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
					bot={record?.authorBot}
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
	where,
	onPress,
	withActions,
}: RowProps<EditRecord> & OpenedProps) {
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
	const handlers = pressHandlers(
		selection,
		id,
		onPress ?? (() => openEditSheet(record)),
	);
	const count = versions.length + 1;
	return (
		<BoxRow
			first={first}
			last={last}
			selected={selection.active ? selection.has(id) : undefined}
			accessibilityLabel={`${record?.authorName ?? "Unknown user"}: ${now || "no text"}, ${count} versions`}
			footer={
				withActions && !selection.active ? (
					<Actions items={editActions(record)} />
				) : undefined
			}
			{...handlers}
		>
			<UserAvatar
				userId={String(record?.authorId ?? "")}
				hash={record?.authorAvatar}
			/>
			<View style={{ flex: 1, minWidth: 0, gap: 3 }}>
				<NameLine
					name={record?.authorName}
					bot={record?.authorBot}
					where={where}
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
		return media.length ? mediaLabel(media) : fallbackLine(latest);
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
