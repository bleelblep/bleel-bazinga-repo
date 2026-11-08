import * as components from "@valenced/components";
import { AlertActionCreators } from "@valenced/discord/actions";
import { Design } from "@valenced/discord/design";
import { ReactNavigationNative } from "@valenced/externals/react-navigation";
import * as React from "react";
import * as ReactNative from "react-native";
import { useChangelog } from "../../../../../shared/changelog";
import { Credit } from "../../../../../shared/ui/credit";
import { useEdits } from "../../lib/edits";
import { allSavedMedia, formatBytes } from "../../lib/media";
import { setSettings, useSettings } from "../../settings";
import type { GhostLogSettings } from "../../types";
import { logBlock, StatusCard } from "../components/StatusCard";
import { rowIcon } from "../icon";
import {
	BACKUP_ROUTE,
	DEBUG_ROUTE,
	EDITS_ROUTE,
	LICENSE_ROUTE,
	LOG_ROUTE,
	MEDIA_ROUTE,
	OPTIONS_ROUTE,
	VISUALS_ROUTE,
} from "../routes";
import { useBottomPadding } from "../safeArea";
import { useLog, useStorageStatus } from "../state";

const DEBUG: boolean = false;

/** "Are you sure?" before the warning goes for good. Not destructive, so the action isn't red. */
function confirmHideWarning() {
	const { AlertModal, AlertActionButton } = Design as any;
	const alerts = AlertActionCreators as any;
	const key = `glng-hide-warning-${Date.now()}`;
	alerts.openAlert(
		key,
		<AlertModal
			title="Hide this warning?"
			content="It won't be shown again, even after updates."
			actions={
				<>
					<AlertActionButton
						text="Hide"
						variant="primary"
						onPress={() => {
							alerts.dismissAlert(key);
							void setSettings({
								warningDismissed: true,
							} as Partial<GhostLogSettings>);
						}}
					/>
					<AlertActionButton
						text="Cancel"
						variant="secondary"
						onPress={() => alerts.dismissAlert(key)}
					/>
				</>
			}
		/>,
	);
}

/**
 * Root page (settings design guide §2.2): the warning card (§4.1, this is a message logger) until
 * it is hidden, problem cards, one scope sentence, what has been caught, the settings pages, then
 * the licence and the developer page.
 */
export default function Settings() {
	const { Page } = components;
	const { ScrollView, View } = ReactNative;
	const { Stack, Text, TableRowGroup, TableRow, Button } = Design as any;

	const { useNavigation } = ReactNavigationNative;

	const navigation = useNavigation() as { navigate: (route: string) => void };
	// The changelog icon at the top right, and "What's new" once after an update.
	useChangelog();
	const s = useSettings();
	const entries = useLog();
	const edited = useEdits();
	const status = useStorageStatus();
	const media = allSavedMedia(entries);
	const mediaBytes = media.reduce((sum, item) => sum + (item.size ?? 0), 0);

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					{s.warningDismissed ? null : (
						<StatusCard
							tone="warning"
							title="This is a message logger"
							body="It keeps messages other people deleted or edited, encrypted on this phone where only you can see them. Client mods break Discord's Terms of Service, and message loggers are the kind most linked to accounts being actioned. The risk is yours."
						>
							<View style={{ marginTop: 4, alignItems: "flex-start" }}>
								<Button
									text="Don't show again"
									size="sm"
									variant="secondary"
									onPress={confirmHideWarning}
								/>
							</View>
						</StatusCard>
					)}

					{/* Fail loudly, on the page users actually land on. Silently losing every catch is
					    the worst failure this plugin has. These can't be hidden (guide §4.3). */}
					{status?.locked ? (
						<StatusCard
							tone="critical"
							title="Log locked"
							body="This log was written by another install and needs your recovery password. Open Backup & encryption to unlock it."
						/>
					) : logBlock(status) === "unreadable" ? (
						<StatusCard
							tone="critical"
							title="Log couldn't be read"
							body="The log file is there but damaged or unreadable, so it's left untouched and nothing new is written over it. Open Backup & encryption to restore a backup or start a new log."
						/>
					) : status?.usingFallback ? (
						<StatusCard
							tone="critical"
							title="Backup location unusable"
							body="Android refused the folder you picked, so everything is being saved to app storage instead. Open Backup & encryption to choose another."
						/>
					) : null}

					<Text
						color="text-muted"
						variant="text-sm/normal"
						style={{ paddingHorizontal: 16 }}
					>
						Only messages Discord had loaded can be caught. One deleted in a
						channel you never opened was never on this phone.
					</Text>

					<TableRowGroup title="Caught" hasIcons>
						<TableRow
							label="Deleted messages"
							subLabel={
								entries.length
									? `${entries.length} caught`
									: "Nothing caught yet"
							}
							icon={rowIcon("TrashIcon", "ic_trash")}
							arrow
							onPress={() => navigation.navigate(LOG_ROUTE)}
						/>
						<TableRow
							label="Edited messages"
							subLabel={
								edited.length
									? `${edited.length} with earlier versions`
									: "Nothing caught yet"
							}
							icon={rowIcon("PencilIcon", "ic_edit")}
							arrow
							onPress={() => navigation.navigate(EDITS_ROUTE)}
						/>
						<TableRow
							label="Deleted media"
							subLabel={
								media.length
									? `${media.length} saved${mediaBytes ? ` · ${formatBytes(mediaBytes)}` : ""}`
									: "Nothing saved yet"
							}
							icon={rowIcon("ImagesIcon", "ImageIcon")}
							arrow
							onPress={() => navigation.navigate(MEDIA_ROUTE)}
						/>
					</TableRowGroup>

					<TableRowGroup title="Settings" hasIcons>
						<TableRow
							label="Logging"
							subLabel="What gets caught, notifications, log size"
							icon={rowIcon("SettingsIcon", "ic_settings")}
							arrow
							onPress={() => navigation.navigate(OPTIONS_ROUTE)}
						/>
						<TableRow
							label="Visual style"
							subLabel="How deleted and edited messages look in chat"
							icon={rowIcon("PaintPaletteIcon", "PaintbrushThinIcon")}
							arrow
							onPress={() => navigation.navigate(VISUALS_ROUTE)}
						/>
						<TableRow
							label="Backup & encryption"
							subLabel="Automatic backup, restore, moving to another phone, recovery password"
							icon={rowIcon("LockIcon", "ic_lock")}
							arrow
							onPress={() => navigation.navigate(BACKUP_ROUTE)}
						/>
					</TableRowGroup>

					<TableRowGroup title="About" hasIcons>
						<TableRow
							label="Licence"
							subLabel="CC0-1.0, with parts under BSD-3-Clause"
							icon={rowIcon("BookCheckIcon", "InformationIcon", "ic_info")}
							arrow
							onPress={() => navigation.navigate(LICENSE_ROUTE)}
						/>
					</TableRowGroup>

					{DEBUG && (
						<TableRowGroup title="Developer" hasIcons>
							<TableRow
								label="Debug"
								subLabel="Testing tools and message-load probes"
								icon={rowIcon("BugIcon", "ic_debug")}
								arrow
								onPress={() => navigation.navigate(DEBUG_ROUTE)}
							/>
						</TableRowGroup>
					)}

					<Credit />
				</Stack>
			</ScrollView>
		</Page>
	);
}
