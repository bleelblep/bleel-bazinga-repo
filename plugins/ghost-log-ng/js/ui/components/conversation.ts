/**
 * The one-conversation page's route, how to open it, and grouping a log into conversations.
 *
 * Kept out of routes.tsx so the pages can import it without an import cycle (routes.tsx imports
 * the pages). The channel travels in route params, with a module variable as the fallback for a
 * navigator that drops them (the same belt and braces as Sparkle's Reaction page).
 */

import { Stores } from "@valenced/discord/flux";
import type { BoxGroup } from "./Boxes";

export const CONVERSATION_ROUTE = "bleelblep.ghost-log-ng.conversation";

export type LogKind = "deleted" | "edited";

export interface ConversationParams {
	channelId: string;
	kind: LogKind;
}

let lastOpened: ConversationParams | undefined;

/** Recent or Conversations, remembered per screen for the rest of the session. */
export type LogView = "recent" | "conversations";
const lastView: Record<LogKind, LogView> = {
	deleted: "recent",
	edited: "recent",
};
export const getLastView = (kind: LogKind): LogView => lastView[kind];
export function setLastView(kind: LogKind, view: LogView) {
	lastView[kind] = view;
}

export const VIEW_OPTIONS: Array<{ id: LogView; label: string }> = [
	{ id: "recent", label: "Recent" },
	{ id: "conversations", label: "Conversations" },
];

/** `push` where the navigator has it, so each conversation is its own back-stack entry. */
export function openConversation(navigation: any, params: ConversationParams) {
	lastOpened = params;
	if (typeof navigation?.push === "function")
		navigation.push(CONVERSATION_ROUTE, params);
	else navigation?.navigate?.(CONVERSATION_ROUTE, params);
}

/** The params the page was opened with, checked; the last opened ones when they didn't arrive. */
export function readParams(raw: unknown): ConversationParams | undefined {
	const params = raw as Partial<ConversationParams> | undefined;
	if (typeof params?.channelId === "string" && params.channelId)
		return {
			channelId: params.channelId,
			kind: params.kind === "edited" ? "edited" : "deleted",
		};
	return lastOpened;
}

/** The fields both logs share, enough to group and label a conversation. */
export interface Placed {
	id: string;
	channelId: string;
	guildId?: string;
	guildName?: string;
	guildIcon?: string;
	channelName: string;
	authorId: string;
	authorName: string;
	authorAvatar?: string;
}

export interface Conversation<T extends Placed> {
	channelId: string;
	guildId?: string;
	guildName?: string;
	guildIcon?: string;
	/** "#general", the DM partner's name, or a group DM's name. */
	title: string;
	/** Who to draw for a DM: the newest author who isn't you. */
	person?: { id: string; name: string; avatar?: string };
	/** Newest first. */
	items: T[];
	latestAt: number;
}

function currentUserId(): string | undefined {
	try {
		return (Stores as any).UserStore?.getCurrentUser?.()?.id;
	} catch {
		return undefined;
	}
}

const DM_NAME = "Direct message";

/** "#general" for a server channel, "DM" for a one-to-one DM, a group DM's name without the "#". */
export function placeLabel(item: Partial<Placed>): string {
	const name = typeof item.channelName === "string" ? item.channelName : "";
	if (item.guildId) return name || "#channel";
	if (!name || name === DM_NAME) return "DM";
	return name.replace(/^#/, "");
}

/**
 * One box per server (named after it), listing its channels, then one "Direct messages" box listing
 * people. Boxes and rows are ordered by their newest message.
 */
export function groupConversations<T extends Placed>(
	items: T[],
	time: (item: T) => number,
): BoxGroup<Conversation<T>>[] {
	const at = (item: T) => {
		const value = time(item);
		return typeof value === "number" && Number.isFinite(value) ? value : 0;
	};
	const byChannel = new Map<string, T[]>();
	for (const item of items) {
		if (!item) continue;
		const key = typeof item.channelId === "string" ? item.channelId : "";
		const list = byChannel.get(key);
		if (list) list.push(item);
		else byChannel.set(key, [item]);
	}
	const me = currentUserId();
	const convos: Conversation<T>[] = [];
	for (const [channelId, list] of byChannel) {
		const sorted = [...list].sort((a, b) => at(b) - at(a));
		const head = sorted[0];
		const dm = !head.guildId;
		let title = placeLabel(head);
		let person: Conversation<T>["person"];
		if (dm) {
			const other = sorted.find((item) => item.authorId !== me) ?? head;
			person = {
				id: String(other.authorId ?? ""),
				name: other.authorName || "Unknown user",
				avatar: other.authorAvatar,
			};
			if (title === "DM") title = person.name;
		}
		convos.push({
			channelId,
			guildId: head.guildId,
			guildName: head.guildName,
			guildIcon: head.guildIcon,
			title,
			person,
			items: sorted,
			latestAt: at(head),
		});
	}
	convos.sort((a, b) => b.latestAt - a.latestAt);

	const servers = new Map<string, BoxGroup<Conversation<T>>>();
	const dms: Conversation<T>[] = [];
	for (const convo of convos) {
		if (!convo.guildId) {
			dms.push(convo);
			continue;
		}
		const group = servers.get(convo.guildId);
		if (group) group.items.push(convo);
		else
			servers.set(convo.guildId, {
				key: `g:${convo.guildId}`,
				label: (convo.guildName || "Server").toUpperCase(),
				items: [convo],
			});
	}
	return [
		...servers.values(),
		{ key: "dms", label: "DIRECT MESSAGES", items: dms },
	];
}
