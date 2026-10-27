import { hiddenChannelIds, isChannelHidden, setChannelHidden } from "../../lib/hidden"
import { rowIcon } from "../icon"
import { useBottomPadding } from "../safeArea"
import * as components from "@valenced/components"
import { Design } from "@valenced/discord/design"
import { Stores } from "@valenced/discord/flux"
import * as react from "@valenced/react"
import * as ReactNative from "react-native"

const GUILD_CATEGORY = 4

type Row = { id: string; name: string; category: boolean }
type Group = { title: string; rows: Row[] }

/**
 * Hidden channels, grouped by server, each with a switch to show it again. Channels are hidden
 * from their long-press sheet ("Hide channel"); this page is the way back. A channel Discord no
 * longer knows (left the server, deleted) is listed by id so it can still be cleared.
 */
function groups(): Group[] {
	const channels = (Stores as any).ChannelStore
	const guilds = (Stores as any).GuildStore
	const byGuild = new Map<string, Group>()
	for (const id of hiddenChannelIds()) {
		let channel: any
		try {
			channel = channels?.getChannel?.(id)
		} catch {
			/* unknown */
		}
		const guildId: string = channel?.guild_id ?? "unknown"
		let group = byGuild.get(guildId)
		if (!group) {
			let title = "Not in your servers"
			try {
				if (channel?.guild_id) title = guilds?.getGuild?.(channel.guild_id)?.name ?? "Server"
			} catch {
				/* keep the fallback */
			}
			group = { title, rows: [] }
			byGuild.set(guildId, group)
		}
		const category = channel?.type === GUILD_CATEGORY
		group.rows.push({ id, name: channel?.name ? (category ? channel.name : `#${channel.name}`) : id, category })
	}
	return [...byGuild.values()]
}

export default function Channels() {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { Page } = components
	const { React } = react
	const { ScrollView } = ReactNative
	const { Stack, Text, TableRowGroup, TableRow, TableSwitchRow } = Design as any

	// Switches read isChannelHidden(), so re-render after a flip.
	const [, bump] = React.useReducer((n: number) => n + 1, 0)
	const list = groups()

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup hasIcons>
						<TableRow
							label="Hiding a channel"
							subLabel='Long-press a channel or category in a server and pick "Hide channel". Turn a switch off here to show it again.'
							icon={rowIcon("EyeSlashIcon")}
						/>
					</TableRowGroup>
					{list.length === 0 ? (
						<Text color="text-muted" variant="text-sm/normal">
							No channels hidden.
						</Text>
					) : (
						list.map((group, index) => (
							<TableRowGroup key={`${group.title}-${index}`} title={group.title}>
								{group.rows.map(row => (
									<TableSwitchRow
										key={row.id}
										label={row.name}
										subLabel={row.category ? "Category, with its channels" : undefined}
										value={isChannelHidden(row.id)}
										onValueChange={(v: boolean) => {
											setChannelHidden(row.id, v)
											bump()
										}}
									/>
								))}
							</TableRowGroup>
						))
					)}
				</Stack>
			</ScrollView>
		</Page>
	)
}
