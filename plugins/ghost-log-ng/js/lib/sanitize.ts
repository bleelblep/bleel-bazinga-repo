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
import { getStores } from "./stores";

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
