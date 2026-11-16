/**
 * Every rule for data crossing the JS<->native bridge or entering a rebuilt MessageRecord, in one
 * file. The old plugin kept these inline in index.ts and visuals.ts, and each missed application
 * was a crash or a poisoned log:
 *
 * - epochMs: finite-clamp timestamps. A NaN crossing the bridge reaches org.json as a Double it
 *   refuses to serialize, so ONE bad timestamp made every later write and every getLog throw.
 * - plainUser: read UserRecord fields by NAME. They are non-enumerable getters, so `{ ...user }`
 *   is an empty object and every id/username is silently lost.
 * - mentionUsers: only complete users (id + username). A rebuilt record that mentions a user
 *   without both crashes Discord's user-search worker with an NPE (0.5.0-beta22 history), and old
 *   entries store `{id: ''}` mentions that must be filtered the same way.
 * - clip: text caps matching what native stores (content 2000, referenced 500, versions 300).
 *
 * Nothing here may throw: every input is untrusted data from a live message or an old log entry.
 */
import type { GhostLogSettings, IgnoredItem } from "../types";
import { getStores } from "./stores";

/** Longest name kept on an entry. */
const MAX_NAME = 100;

const name = (value: unknown) =>
	typeof value === "string" && value ? value.slice(0, MAX_NAME) : undefined;

/**
 * Channel, server and author details for one message, read from the stores at capture time. The
 * one place an entry's "who and where" is built: capture.ts and edits.ts each had a copy, so a new
 * field had to be added twice.
 *
 * `authorNick` and `authorColor` are the server nickname and role colour as they were then
 * (`GuildMemberStore.getMember`); `accountId` is the account that caught it.
 */
export function describeMessage(message: any, channelId: string) {
	const s = getStores();
	const channel = s.ChannelStore?.getChannel?.(channelId);
	const guildId = channel?.guild_id as string | undefined;
	const guild = guildId ? s.GuildStore?.getGuild?.(guildId) : undefined;
	const author = message?.author;
	let member: any;
	try {
		member =
			guildId && author?.id
				? s.GuildMemberStore?.getMember?.(guildId, author.id)
				: undefined;
	} catch {
		member = undefined;
	}
	const colour = member?.colorString;
	return {
		channelName: channel?.name ? `#${channel.name}` : "Direct message",
		guildId,
		guildName: guild?.name as string | undefined,
		guildIcon: guild?.icon as string | undefined,
		authorName: (author?.globalName ??
			author?.global_name ??
			author?.username ??
			"Unknown") as string,
		authorUsername: name(author?.username),
		authorBot: author?.bot ? true : undefined,
		authorNick: name(member?.nick),
		authorColor:
			typeof colour === "string" && /^#[0-9a-f]{6}$/i.test(colour)
				? colour
				: undefined,
		accountId: name(s.UserStore?.getCurrentUser?.()?.id),
	};
}

const listed = (list: IgnoredItem[] | undefined, id: string) =>
	Array.isArray(list) && list.some((item) => item?.id === id);

/**
 * Whether a message's deletions and edits are logged at all: not your own (unless `includeOwn`),
 * not a bot's with Ignore bots on, not from an ignored person, bot or server. The one copy of a
 * check that was written out in capture.ts, edits.ts and keep.ts; a message that fails it is not
 * logged, not kept in chat and gets no edit history.
 */
export function shouldLog(
	message: any,
	channelId: string,
	includeOwn: boolean,
	cfg: Pick<GhostLogSettings, "ignoreBots" | "ignoredGuilds" | "ignoredUsers">,
): boolean {
	const s = getStores();
	const authorId = message?.author?.id;
	if (!includeOwn) {
		const me = s.UserStore?.getCurrentUser?.()?.id;
		if (me && authorId === me) return false;
	}
	if (cfg.ignoreBots && message?.author?.bot) return false;
	if (authorId && listed(cfg.ignoredUsers, String(authorId))) return false;
	if (cfg.ignoredGuilds?.length) {
		const guildId = s.ChannelStore?.getChannel?.(channelId)?.guild_id;
		if (guildId && listed(cfg.ignoredGuilds, String(guildId))) return false;
	}
	return true;
}

/** A timestamp as finite epoch milliseconds, or `fallback`. */
export function epochMs(value: unknown, fallback: number): number {
	if (value == null || value === "") return fallback;
	const ms =
		value instanceof Date ? value.getTime() : new Date(value as any).getTime();
	return Number.isFinite(ms) ? ms : fallback;
}

/** A user as plain data, safe to store and safe to rebuild a record from. */
export function plainUser(user: any): any | undefined {
	if (!user) return undefined;
	return {
		id: String(user.id ?? ""),
		username: user.username ?? user.globalName ?? user.global_name ?? "Unknown",
		global_name: user.globalName ?? user.global_name ?? undefined,
		avatar: user.avatar ?? undefined,
		discriminator: String(user.discriminator ?? "0"),
		bot: !!user.bot,
	};
}

/** Mentioned users, each resolved to a complete user or dropped. */
export function mentionUsers(mentions: unknown): any[] {
	if (!Array.isArray(mentions)) return [];
	const UserStore = getStores().UserStore;
	return mentions
		.map((m) => (typeof m === "string" ? UserStore?.getUser?.(m) : m))
		.filter((user) => user?.id && user?.username);
}

/** Discord's EPHEMERAL message flag: "Only you can see this", removed locally when dismissed. */
const EPHEMERAL = 1 << 6;

export function isEphemeral(message: any): boolean {
	return (
		typeof message?.flags === "number" && (message.flags & EPHEMERAL) !== 0
	);
}

/** Plain-text cap for stored fields. */
export function clip(text: unknown, max: number): string {
	return String(text ?? "").slice(0, max);
}

/** An edit version as one display line. */
export function clipVersion(text: string): string {
	const flat = text.replace(/\s+/g, " ").trim();
	if (!flat) return "(no text)";
	return flat.length > 300 ? `${flat.slice(0, 299)}…` : flat;
}
