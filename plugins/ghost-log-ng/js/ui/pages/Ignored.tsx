import * as components from "@valenced/components";
import { Design } from "@valenced/discord/design";
import * as react from "@valenced/react";
import * as ReactNative from "react-native";
import {
	ignoreGuild,
	unignoreGuild,
	unignoreUser,
} from "../../lib/ignore";
import { getStores } from "../../lib/stores";
import { setSettings, useSettings } from "../../settings";
import type { IgnoredItem } from "../../types";
import { rowIcon } from "../icon";
import { useBottomPadding } from "../safeArea";

/** Your servers by name, read once when the page opens. */
function myGuilds(): IgnoredItem[] {
	try {
		const guilds = getStores().GuildStore?.getGuilds?.() ?? {};
		return Object.values(guilds as Record<string, any>)
			.filter((guild) => guild?.id && guild?.name)
			.map((guild) => ({ id: String(guild.id), name: String(guild.name) }))
			.sort((a, b) => a.name.localeCompare(b.name));
	} catch {
		return [];
	}
}

/**
 * Logging > Ignored: servers, and people or bots, nothing is logged from.
 *
 * Servers are a switch each (every server you are in, plus ignored ones you have left), because
 * they can all be listed. People and bots can't, so they are added from one of their messages in
 * a conversation (its sheet's Ignore row; the opened-out row in Recent has no Ignore, by the
 * owner's choice) and only listed here, to be taken off again.
 */
export default function Ignored() {
	const { Page } = components;
	const { React } = react;
	const { ScrollView } = ReactNative;
	const { Stack, Text, TableRowGroup, TableRow, TableSwitchRow } = Design as any;

	const s = useSettings();
	const ignoredGuilds = Array.isArray(s.ignoredGuilds) ? s.ignoredGuilds : [];
	const ignoredUsers = Array.isArray(s.ignoredUsers) ? s.ignoredUsers : [];
	const mine = React.useMemo(myGuilds, []);
	// Re-rendered through a tick as well: the settings object is updated in place.
	const [, tick] = React.useState(0);
	const bump = () => tick((n: number) => n + 1);

	const known = new Set(mine.map((guild) => guild.id));
	const guilds = [
		...mine,
		...ignoredGuilds.filter((guild) => !known.has(guild.id)),
	];
	const isIgnored = (id: string) => ignoredGuilds.some((g) => g.id === id);

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<Text
						color="text-muted"
						variant="text-sm/normal"
						style={{ paddingHorizontal: 16, paddingTop: 16 }}
					>
						Nothing new is logged from what you ignore: no deleted messages, no
						edit history, and nothing kept in chat. It only changes what this
						phone keeps.
					</Text>

					<TableRowGroup title="Bots" hasIcons>
						<TableSwitchRow
							label="All bots"
							subLabel="Don't log deleted or edited messages from any bot."
							icon={rowIcon("ClydeIcon", "RobotIcon", "UserIcon")}
							value={!!s.ignoreBots}
							onValueChange={(on: boolean) => {
								void setSettings({ ignoreBots: on });
								bump();
							}}
						/>
					</TableRowGroup>

					<TableRowGroup title="People and bots" hasIcons>
						{ignoredUsers.length ? (
							ignoredUsers.map((user) => (
								<TableRow
									key={user.id}
									label={user.name}
									subLabel={`${user.bot ? "Bot" : "Person"} · Tap to stop ignoring`}
									icon={rowIcon(
										user.bot ? "ClydeIcon" : "UserIcon",
										"RobotIcon",
										"UserIcon",
									)}
									onPress={() => {
										unignoreUser(user.id);
										bump();
									}}
								/>
							))
						) : (
							<TableRow
								label="Nobody is ignored"
								subLabel="In Deleted or Edited messages, switch to Conversations, open one, tap a message of theirs and choose Ignore."
								icon={rowIcon("UserIcon", "ic_profile_24px")}
								disabled
							/>
						)}
					</TableRowGroup>

					<TableRowGroup
						title="Servers"
						description="Turn a server on to stop logging anything from it."
					>
						{guilds.length ? (
							guilds.map((guild) => (
								<TableSwitchRow
									key={guild.id}
									label={guild.name}
									subLabel={
										known.has(guild.id) ? undefined : "You're no longer in it"
									}
									value={isIgnored(guild.id)}
									onValueChange={(on: boolean) => {
										if (on) ignoreGuild(guild);
										else unignoreGuild(guild.id);
										bump();
									}}
								/>
							))
						) : (
							<TableRow label="No servers found" disabled />
						)}
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	);
}
