/**
 * Stored message text made readable for the log screens: mentions as names, custom emoji as
 * `:name:`, timestamps as dates, and markdown markers stripped without losing the words.
 *
 * Display only. Search, Copy text and the restored chat records keep the raw stored text.
 *
 * Every store lookup happens inside a call (coding rule 1) and is guarded: a missing store or a
 * renamed method costs the name, never the screen.
 */
import { getStores } from "./stores";

export interface FormatContext {
	guildId?: string;
	/** The entry's captured `mentions` (user objects), checked before the stores. */
	mentions?: unknown[];
}

function attempt<T>(fn: () => T): T | undefined {
	try {
		return fn();
	} catch {
		return undefined;
	}
}

function text(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value : undefined;
}

function userName(id: string, context: FormatContext): string {
	const stored = Array.isArray(context.mentions)
		? (context.mentions.find((m) => (m as any)?.id === id || m === id) as any)
		: undefined;
	if (stored && typeof stored === "object") {
		const name =
			text(stored.member?.nick) ??
			text(stored.global_name) ??
			text(stored.globalName) ??
			text(stored.username);
		if (name) return name;
	}
	const stores = attempt(getStores);
	if (context.guildId) {
		const nick = attempt(() =>
			stores?.GuildMemberStore?.getNick?.(context.guildId, id),
		);
		if (text(nick)) return nick as string;
	}
	const user = attempt(() => stores?.UserStore?.getUser?.(id));
	return (
		text(user?.globalName) ??
		text(user?.global_name) ??
		text(user?.username) ??
		"unknown-user"
	);
}

function roleName(id: string, context: FormatContext): string {
	const stores = attempt(getStores);
	const guildId = context.guildId;
	const role =
		(guildId &&
			(attempt(() => stores?.GuildRoleStore?.getRole?.(guildId, id)) ??
				attempt(
					() => stores?.GuildRoleStore?.getUnsafeMutableRoles?.(guildId)?.[id],
				) ??
				attempt(() => stores?.GuildStore?.getRole?.(guildId, id)) ??
				attempt(() => stores?.GuildStore?.getRoles?.(guildId)?.[id]) ??
				attempt(() => stores?.GuildStore?.getGuild?.(guildId)?.roles?.[id]))) ||
		undefined;
	return text(role?.name) ?? "role";
}

function channelName(id: string): string {
	const channel = attempt(() => getStores()?.ChannelStore?.getChannel?.(id));
	return text(channel?.name) ?? "channel";
}

function timestamp(seconds: string, style?: string): string {
	const date = new Date(Number(seconds) * 1000);
	if (Number.isNaN(date.getTime())) return seconds;
	const formatted = attempt(() => {
		switch (style) {
			case "t":
				return date.toLocaleTimeString([], {
					hour: "numeric",
					minute: "2-digit",
				});
			case "T":
				return date.toLocaleTimeString([], {
					hour: "numeric",
					minute: "2-digit",
					second: "2-digit",
				});
			case "d":
				return date.toLocaleDateString();
			case "D":
				return date.toLocaleDateString([], {
					day: "numeric",
					month: "long",
					year: "numeric",
				});
			case "F":
				return `${date.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" })} ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
			case "R":
				return relative(date.getTime());
			default:
				return `${date.toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" })} ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
		}
	});
	return formatted || date.toISOString();
}

function relative(ms: number): string {
	const diff = ms - Date.now();
	const abs = Math.abs(diff);
	const units: Array<[number, string]> = [
		[365 * 86400000, "year"],
		[30 * 86400000, "month"],
		[86400000, "day"],
		[3600000, "hour"],
		[60000, "minute"],
	];
	for (const [size, name] of units) {
		if (abs >= size) {
			const n = Math.floor(abs / size);
			const unit = `${n} ${name}${n === 1 ? "" : "s"}`;
			return diff < 0 ? `${unit} ago` : `in ${unit}`;
		}
	}
	return diff < 0 ? "just now" : "in a moment";
}

/** Mentions, emoji and timestamps as names; markdown markers removed. Not for code spans. */
function formatPlain(input: string, context: FormatContext): string {
	// Escaped characters (\*, \_) are parked out of the way first, so no rule below eats them, and
	// come back at the end without their backslash, as chat shows them.
	let out = input
		.replace(/\\([*_~`|>\\#[\]()<:-])/g, (_, c: string) =>
			String.fromCharCode(0xe000 + c.charCodeAt(0)),
		)
		// Mentions and the other angle-bracket forms Discord renders.
		.replace(/<@!?(\d+)>/g, (_, id: string) => `@${userName(id, context)}`)
		.replace(/<@&(\d+)>/g, (_, id: string) => `@${roleName(id, context)}`)
		.replace(/<#(\d+)>/g, (_, id: string) => `#${channelName(id)}`)
		.replace(/<a?:(\w+):\d+>/g, (_, name: string) => `:${name}:`)
		.replace(
			/<t:(-?\d+)(?::([tTdDfFR]))?>/g,
			(_, seconds: string, style?: string) => timestamp(seconds, style),
		)
		.replace(/<\/([\w -]+):\d+>/g, (_, name: string) => `/${name}`)
		.replace(/<(https?:\/\/[^\s>]+)>/g, "$1")
		// Masked links keep both halves, so a log never hides where a link went.
		.replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)");

	// Line starts: quotes, headings, subtext.
	out = out
		.split("\n")
		.map((line) =>
			line
				.replace(/^>>> ?/, "")
				.replace(/^> ?/, "")
				.replace(/^#{1,3} (?=\S)/, "")
				.replace(/^-# (?=\S)/, ""),
		)
		.join("\n");

	// Inline markers, paired only, so a lone * or _ (5 * 3, snake_case) is left alone.
	out = out
		.replace(/\*\*\*([^*\n][\s\S]*?)\*\*\*/g, "$1")
		.replace(/\*\*([^*\n][\s\S]*?)\*\*/g, "$1")
		.replace(/__([^_\n][\s\S]*?)__/g, "$1")
		.replace(/~~([\s\S]+?)~~/g, "$1")
		.replace(/\|\|([\s\S]+?)\|\|/g, "$1")
		.replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)\*(?![\w*])/g, "$1$2")
		.replace(/(^|[^\w])_(?!\s)([^_\n]+?)_(?!\w)/g, "$1$2")
		.replace(
			new RegExp(
				`[${String.fromCharCode(0xe000)}-${String.fromCharCode(0xe07f)}]`,
				"g",
			),
			(ch) => String.fromCharCode(ch.charCodeAt(0) - 0xe000),
		);
	return out;
}

/**
 * Readable text for a stored message. Tolerates null, undefined and non-strings (returns '').
 * Code spans and blocks are kept verbatim apart from their backticks, as chat shows them.
 */
export function formatContent(
	raw: unknown,
	context: FormatContext = {},
): string {
	if (typeof raw !== "string" || !raw) return "";
	try {
		const parts: string[] = [];
		// Fenced blocks first (dropping the language tag), then inline code.
		const pattern = /```(?:[\w+-]*\n)?([\s\S]*?)```|``([^`]+?)``|`([^`\n]+?)`/g;
		let last = 0;
		for (let match = pattern.exec(raw); match; match = pattern.exec(raw)) {
			parts.push(formatPlain(raw.slice(last, match.index), context));
			parts.push((match[1] ?? match[2] ?? match[3] ?? "").replace(/\n$/, ""));
			last = match.index + match[0].length;
		}
		parts.push(formatPlain(raw.slice(last), context));
		return parts.join("");
	} catch {
		return raw;
	}
}
