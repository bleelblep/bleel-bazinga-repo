import type { DeletedMessage } from "../ui/state";
import { refreshLog } from "../ui/state";
import { native } from "./bridge";

const GUILDS = [
	{ id: "g-01", name: "Night Shift" },
	{ id: "g-02", name: "Art Lab" },
	{ id: "g-03", name: "Raid Corner" },
	{ id: "g-04", name: "Code Garden" },
	{ id: "g-05", name: "Study Hall" },
];
const AUTHORS = [
	"Maya",
	"Jules",
	"Niko",
	"Ari",
	"Lina",
	"Rin",
	"Noel",
	"Skye",
	"Quinn",
	"Zane",
];
const CHANNELS = [
	"general",
	"media",
	"memes",
	"support",
	"clips",
	"off-topic",
	"music",
	"dev-chat",
];
const LINES = [
	"Deleted this right after sending it.",
	"Oops wrong channel, pretend this never happened.",
	"This one had context but then vanished.",
	"Testing how dense rows look on this page.",
	"A longer message preview to test wrapping behavior in table rows.",
	"Attachment removed but metadata should still render.",
	"Quick typo fix that became a delete.",
];

/** Build `count` fake entries across fake servers/users/channels and seed them into the native log. */
export async function fillWithFakeEntries(count = 200): Promise<number> {
	const now = Date.now();
	const fakes: DeletedMessage[] = [];

	for (let i = 0; i < count; i++) {
		const guild = GUILDS[i % GUILDS.length];
		fakes.push({
			id: `fake-${now}-${i}`,
			channelId: `c-${guild.id}-${CHANNELS[i % CHANNELS.length]}`,
			guildId: guild.id,
			authorId: `u-${(i % 80) + 1}`,
			authorName: AUTHORS[i % AUTHORS.length],
			channelName: `#${CHANNELS[i % CHANNELS.length]}`,
			guildName: guild.name,
			content: `${LINES[i % LINES.length]} (#${i + 1})`,
			attachments:
				i % 4 === 0
					? [
							{
								filename: `image-${i + 1}.png`,
								url: `https://example.invalid/f/${i + 1}`,
							},
						]
					: undefined,
			sentAt: now - (count - i) * 120000,
			deletedAt: now - (count - i) * 90000,
		});
	}

	const added = await native.seedEntries(
		fakes as unknown as Record<string, unknown>[],
	);
	await refreshLog();
	return typeof added === "number" ? added : 0;
}
