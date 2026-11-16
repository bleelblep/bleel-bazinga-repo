/**
 * Text snapshots of the parts of a message that aren't text or files: its reactions, its poll and
 * a bot message's buttons and menus, as they stood when it was deleted.
 *
 * Plain data only, read defensively and capped: every input is a live Discord record whose field
 * names differ between the API's snake_case and the client's camelCase, and one odd message must
 * not bloat the log (AS-07). Nothing here may throw. These are for reading in the log; nothing
 * rebuilds a working poll or button from them.
 */

const MAX_REACTIONS = 20;
const MAX_ANSWERS = 10;
const MAX_BUTTONS = 25;

const text = (value: unknown, max: number): string =>
	typeof value === "string" ? value.trim().slice(0, max) : "";

const count = (value: unknown): number | undefined =>
	typeof value === "number" && Number.isFinite(value) && value >= 0
		? Math.floor(value)
		: undefined;

export interface ReactionSnapshot {
	/** The emoji itself, or a custom emoji's name. */
	name: string;
	/** Set for a custom emoji. */
	id?: string;
	count: number;
}

/** Each reaction and how many it had. Who reacted is not known without asking Discord. */
export function reactionsOf(message: any): ReactionSnapshot[] | undefined {
	if (!Array.isArray(message?.reactions)) return undefined;
	const out: ReactionSnapshot[] = [];
	for (const reaction of message.reactions.slice(0, MAX_REACTIONS)) {
		const name = text(reaction?.emoji?.name, 64);
		const total =
			count(reaction?.count) ??
			(count(reaction?.count_details?.normal) ?? 0) +
				(count(reaction?.count_details?.burst) ?? 0);
		if (!name || !total) continue;
		const id = reaction?.emoji?.id;
		out.push({
			name,
			...(id ? { id: String(id) } : {}),
			count: total,
		});
	}
	return out.length ? out : undefined;
}

export interface PollSnapshot {
	question: string;
	answers: Array<{ text: string; votes?: number }>;
	multiselect?: boolean;
	/** Voting had closed. */
	ended?: boolean;
}

export function pollOf(message: any): PollSnapshot | undefined {
	const poll = message?.poll;
	if (!poll || typeof poll !== "object") return undefined;
	const question = text(poll.question?.text ?? poll.question, 300);
	const results = poll.results;
	const counts = results?.answer_counts ?? results?.answerCounts;
	const votesFor = (id: unknown): number | undefined => {
		if (!Array.isArray(counts)) return undefined;
		const match = counts.find((entry: any) => entry?.id === id);
		return count(match?.count);
	};
	const answers = (Array.isArray(poll.answers) ? poll.answers : [])
		.slice(0, MAX_ANSWERS)
		.map((answer: any) => {
			const media = answer?.poll_media ?? answer?.pollMedia;
			const emoji = text(media?.emoji?.name, 64);
			const label = text(media?.text, 100);
			const votes = votesFor(answer?.answer_id ?? answer?.answerId);
			return {
				text: [media?.emoji?.id ? "" : emoji, label].filter(Boolean).join(" "),
				...(votes === undefined ? {} : { votes }),
			};
		})
		.filter((answer: { text: string }) => answer.text);
	if (!question && !answers.length) return undefined;
	return {
		question,
		answers,
		...(poll.allow_multiselect || poll.allowMultiselect
			? { multiselect: true }
			: {}),
		...(results?.is_finalized || results?.isFinalized ? { ended: true } : {}),
	};
}

export interface ButtonSnapshot {
	kind: "button" | "menu";
	label: string;
}

/** Discord's component types: 2 is a button, 3 and 5 to 8 are select menus. */
const BUTTON = 2;
const MENUS = new Set([3, 5, 6, 7, 8]);

/** The labels of a message's buttons and menus, in order, through any rows or containers. */
export function buttonsOf(message: any): ButtonSnapshot[] | undefined {
	const out: ButtonSnapshot[] = [];
	const walk = (list: unknown, depth: number) => {
		if (!Array.isArray(list) || depth > 4) return;
		for (const component of list) {
			if (out.length >= MAX_BUTTONS) return;
			if (!component || typeof component !== "object") continue;
			if (component.type === BUTTON) {
				const label =
					text(component.label, 80) || text(component.emoji?.name, 64);
				if (label) out.push({ kind: "button", label });
			} else if (MENUS.has(component.type)) {
				out.push({
					kind: "menu",
					label: text(component.placeholder, 80) || "Menu",
				});
			}
			walk(component.components, depth + 1);
			// A section's side button.
			if (component.accessory) walk([component.accessory], depth + 1);
		}
	};
	walk(message?.components, 0);
	return out.length ? out : undefined;
}
