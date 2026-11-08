import * as components from "@valenced/components";
import { Design } from "@valenced/discord/design";
import * as react from "@valenced/react";
import * as ReactNative from "react-native";
import { showToast } from "../../../../../shared/toast";
import { DEFAULT_BACKUP_PATH } from "../../defaults";
import { native } from "../../lib/bridge";
import { fillWithFakeEntries } from "../../lib/debug";
import {
	dumpMessageStore,
	dumpRoutingModules,
	inspectCurrentChannel,
	inspectMessageInstance,
	isProbeRunning,
	probeNavigationModules,
	setProbeRunning,
} from "../../lib/probe";
import { setSettings, useSettings } from "../../settings";
import type { GhostLogSettings } from "../../types";
import { rowIcon } from "../icon";
import { useBottomPadding } from "../safeArea";
import { useStorageStatus } from "../state";

/**
 * Debug page. Phase note: the probe rows (message-load probe, getMessages watch, navigation and
 * routing dumps) return with lib/probe.ts; until then this page covers testing and storage health.
 */
export default function Debug() {
	const { Page } = components;
	const { React } = react;
	const { ScrollView, Alert } = ReactNative;
	const {
		Stack,
		TableRowGroup,
		TableRow,
		TableSwitchRow,
		TableRadioGroup,
		TableRadioRow,
	} = Design;

	const s = useSettings();
	const set = (patch: Partial<GhostLogSettings>) => void setSettings(patch);
	const status = useStorageStatus();
	const backupPath = s.backupFilePath?.trim() || DEFAULT_BACKUP_PATH;

	const toast = (content: string) => showToast(content, "ghost-log-ng-debug");

	const [probing, setProbing] = React.useState(isProbeRunning("messageLoad"));
	const [watching, setWatching] = React.useState(isProbeRunning("getMessages"));

	const seedFake = () => {
		Alert.alert(
			"Fill with fake deleted messages",
			"Add 200 fake entries across fake servers, users and channels. For UI testing.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Fill 200",
					onPress: () => {
						void (async () => {
							const added = await fillWithFakeEntries(200);
							toast(`Added ${added} fake deleted messages.`);
						})();
					},
				},
			],
		);
	};

	// The saved-video hook's own record (LocalVideoHook.Status): whether it installed, and what the
	// player last tried to open -- enough to tell a missing hook from a missing or refused file.
	const showVideoStatus = () => {
		void (async () => {
			try {
				const raw = await native.getVideoStatus();
				const v = typeof raw === "string" ? JSON.parse(raw) : raw;
				const hooked =
					v.hooked < 0
						? "Not installed (never ran)"
						: v.hooked === 0
							? `Not installed: ${v.installError ?? "unknown"}`
							: `Hooked ${v.hooked} player method(s)`;
				const recent: string[] = Array.isArray(v.recent) ? v.recent : [];
				Alert.alert(
					"Video playback",
					[
						hooked,
						`Saved videos served: ${v.served}`,
						v.lastError ? `Last error: ${v.lastError}` : "No errors",
						"",
						"Last opened by the player (newest last):",
						...(recent.length
							? recent
							: ["nothing yet: play a saved video, then check again"]),
					].join("\n"),
				);
			} catch (error) {
				toast(`Could not read the video status: ${String(error)}`);
			}
		})();
	};

	// Both probes live in lib/probe's registry, which the plugin's cleanup tears down. Keeping the
	// stop handles here meant a disabled plugin left its hooks installed.
	const toggleProbe = (on: boolean) => {
		const running = setProbeRunning("messageLoad", on);
		setProbing(running);
		toast(
			running ? "Probe on — switch channels, then check logcat." : "Probe off.",
		);
	};

	const toggleGetMessages = (on: boolean) => {
		const running = setProbeRunning("getMessages", on);
		setWatching(running);
		toast(
			running
				? "Watching getMessages — open a channel, then check logcat."
				: "getMessages watch off.",
		);
	};

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Testing" hasIcons>
						<TableSwitchRow
							label="Count my own messages"
							subLabel="For testing only: lets you delete your own message and verify capture."
							icon={rowIcon("UserIcon")}
							value={!!s.countOwnMessages}
							onValueChange={(v) => set({ countOwnMessages: v })}
						/>
						<TableRow
							label="Fill log with 200 fake entries"
							subLabel="For UI testing: multiple servers, users, channels and attachments. Adds to the current log."
							icon={rowIcon("BugIcon", "ic_debug")}
							onPress={seedFake}
						/>
						<TableRow
							label="Backup target path"
							subLabel={backupPath}
							icon={rowIcon("PinIcon", "ic_pin")}
						/>
					</TableRowGroup>

					<TableRowGroup title="Storage" hasIcons>
						<TableRow
							label="Base directory"
							subLabel={status?.baseDir ?? "Not read yet"}
							icon={rowIcon("FolderIcon", "ic_folder")}
						/>
						<TableRow
							label="Entries"
							subLabel={
								status ? `${status.entries} in the native log` : "Not read yet"
							}
							icon={rowIcon("ListIcon", "ic_list")}
						/>
						<TableRow
							label="Using fallback"
							subLabel={status?.usingFallback ? `Yes — ${status.error}` : "No"}
							icon={rowIcon("WarningIcon", "ic_warning")}
						/>
					</TableRowGroup>

					{/* Moved here from Logging: how the rich-content shards are split is a storage detail. */}
					<TableRadioGroup
						title="Rich content file size"
						defaultValue={String(s.embedsPerFile)}
						onChange={(v: string) =>
							set({ embedsPerFile: Number(v) === 50 ? 50 : 100 })
						}
					>
						<TableRadioRow label="50 records per file" value="50" />
						<TableRadioRow label="100 records per file" value="100" />
					</TableRadioGroup>

					<TableRowGroup title="Media" hasIcons>
						<TableRow
							label="Video playback"
							subLabel="Play a saved video first, then tap: shows whether the player hook is in and what the player tried to open."
							icon={rowIcon("PlayIcon", "VideoIcon")}
							onPress={showVideoStatus}
						/>
					</TableRowGroup>

					<TableRowGroup title="Restore research" hasIcons>
						<TableSwitchRow
							label="Message-load probe"
							subLabel="Logs message/channel-load events and the channel's MessageStore shape to logcat. Shapes and counts only."
							icon={rowIcon("SearchIcon", "MagnifyingGlassIcon", "ic_search")}
							value={probing}
							onValueChange={toggleProbe}
						/>
						<TableSwitchRow
							label="Watch getMessages"
							subLabel="Logs what getMessages returns when a channel renders — the render-layer injection point."
							icon={rowIcon("EyeIcon")}
							value={watching}
							onValueChange={toggleGetMessages}
						/>
						<TableRow
							label="Inspect current channel"
							subLabel="Dump the open channel's cached MessageStore structure to logcat."
							icon={rowIcon("ListIcon", "ic_list")}
							onPress={() => toast(inspectCurrentChannel())}
						/>
						<TableRow
							label="Dump MessageStore methods"
							subLabel="Lists every method/property on MessageStore to logcat."
							icon={rowIcon("ListBulletsIcon", "ic_list")}
							onPress={() => toast(dumpMessageStore())}
						/>
						<TableRow
							label="Inspect a real message"
							subLabel="Logs a real message's constructor, field types, and methods."
							icon={rowIcon("SearchIcon", "ic_search")}
							onPress={() => toast(inspectMessageInstance())}
						/>
						<TableRow
							label="Probe navigation modules"
							subLabel="Sweeps for a module that can open/jump to a message. Logs candidates to logcat."
							icon={rowIcon("SearchIcon", "ic_search")}
							onPress={() => toast(probeNavigationModules())}
						/>
						<TableRow
							label="Dump routing modules"
							subLabel="Logs the full key list of the transitionToGuild/selectPrivateChannel/jumpToMessage modules."
							icon={rowIcon("SearchIcon", "ic_search")}
							onPress={() => toast(dumpRoutingModules())}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	);
}
