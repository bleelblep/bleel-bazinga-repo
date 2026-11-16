/**
 * The ignore lists: servers, and people or bots, nothing is logged from (Logging > Ignored).
 *
 * The lists live in the settings (`ignoredGuilds`, `ignoredUsers`) and are read by `shouldLog` in
 * sanitize.ts, the one check deletes, edits and keep-in-chat all go through. This file is the
 * writing side: add, remove, and the offer to clear out what was already logged from them.
 *
 * Local only: an ignore changes what this phone keeps, never anything on Discord.
 */

import { showToast } from "../../../../shared/toast";
import { confirmDestructive } from "../../../../shared/ui/confirm";
import { getSettings, setSettings } from "../settings";
import type { IgnoredItem } from "../types";
import { getCachedLog, removeManyFromLog } from "../ui/state";
import { getEdits, removeEditRecords } from "./edits";

/** A list can't grow without bound: it is read on every delete and edit. */
const MAX_IGNORED = 200;

type Kind = "user" | "guild";

const key = (kind: Kind) =>
	kind === "user" ? ("ignoredUsers" as const) : ("ignoredGuilds" as const);

function list(kind: Kind): IgnoredItem[] {
	const value = getSettings()[key(kind)];
	return Array.isArray(value) ? value : [];
}

function toast(content: string) {
	showToast(content, "GhostLogNgIgnoreToast");
}

export const isIgnoredUser = (id: string) =>
	list("user").some((item) => item?.id === id);
export const isIgnoredGuild = (id: string) =>
	list("guild").some((item) => item?.id === id);

/** Logged deletions and edits that the new ignore covers. */
function alreadyLogged(kind: Kind, id: string): string[] {
	const match = (item: { authorId?: string; guildId?: string }) =>
		kind === "user" ? item?.authorId === id : item?.guildId === id;
	const ids = new Set<string>();
	for (const entry of getCachedLog()) if (match(entry)) ids.add(entry.id);
	for (const record of getEdits()) if (match(record)) ids.add(record.id);
	return [...ids];
}

/** After an ignore: offers to remove what the log already holds from them. Never without asking. */
function offerCleanup(kind: Kind, item: IgnoredItem) {
	const ids = alreadyLogged(kind, item.id);
	if (!ids.length) return;
	const count = `${ids.length} logged message${ids.length === 1 ? "" : "s"}`;
	confirmDestructive({
		title: "Remove what's already logged?",
		body: `${count} from ${item.name} ${ids.length === 1 ? "is" : "are"} still in your log. Remove ${ids.length === 1 ? "it" : "them"} for good, with any saved media?`,
		action: "Remove",
		onConfirm: () =>
			void Promise.all([
				removeManyFromLog(ids).catch(() => false),
				removeEditRecords(ids).catch(() => false),
			]).then(() => toast(`Removed what was logged from ${item.name}.`)),
	});
}

function add(kind: Kind, item: IgnoredItem) {
	if (!item.id) return;
	const current = list(kind);
	if (current.some((have) => have.id === item.id)) return;
	if (current.length >= MAX_IGNORED) {
		toast(`The ignore list is full (${MAX_IGNORED}). Remove one first.`);
		return;
	}
	const entry: IgnoredItem = {
		id: item.id,
		name: String(item.name || "Unknown").slice(0, 100),
		...(item.bot ? { bot: true } : {}),
	};
	// A new array, never a push: the settings object is shared with every reader.
	void setSettings({ [key(kind)]: [...current, entry] });
	toast(`Ignoring ${entry.name}. Nothing new from them is logged.`);
	offerCleanup(kind, entry);
}

function remove(kind: Kind, id: string) {
	const current = list(kind);
	const item = current.find((have) => have.id === id);
	if (!item) return;
	void setSettings({ [key(kind)]: current.filter((have) => have.id !== id) });
	toast(`No longer ignoring ${item.name}.`);
}

export const ignoreUser = (item: IgnoredItem) => add("user", item);
export const ignoreGuild = (item: IgnoredItem) => add("guild", item);
export const unignoreUser = (id: string) => remove("user", id);
export const unignoreGuild = (id: string) => remove("guild", id);
