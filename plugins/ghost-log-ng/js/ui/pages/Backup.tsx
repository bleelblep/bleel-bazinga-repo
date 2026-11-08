import * as components from "@valenced/components";
import { Design } from "@valenced/discord/design";
import * as react from "@valenced/react";
import * as ReactNative from "react-native";
import { showToast } from "../../../../../shared/toast";
import { confirmDestructive } from "../../../../../shared/ui/confirm";
import {
	DEFAULT_BACKUP_PATH,
	DEFAULT_BUNDLE_PATH,
	SHARED_BACKUP_PATH,
	SHARED_BUNDLE_PATH,
} from "../../defaults";
import {
	BUNDLE_DAMAGED,
	BUNDLE_NEEDS_PASSWORD,
	BUNDLE_WRONG_PASSWORD,
	MIN_RECOVERY_PASSWORD,
	native,
} from "../../lib/bridge";
import { refreshEdits, useEdits } from "../../lib/edits";
import { canPickFiles, pickFile } from "../../lib/picker";
import { showTextPrompt } from "../../lib/prompt";
import { setSettings, useSettings } from "../../settings";
import type { GhostLogSettings } from "../../types";
import { blockReason, logBlock, StatusCard } from "../components/StatusCard";
import { dangerIcon, rowIcon } from "../icon";
import { useBottomPadding } from "../safeArea";
import {
	refreshLog,
	refreshStorageStatus,
	useLog,
	useStorageStatus,
} from "../state";

function ago(timestamp: number): string {
	const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
	if (seconds < 60) return "just now";
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
	return `${Math.floor(seconds / 86400)}d ago`;
}

/** A hidden one-line prompt for the recovery password. Empty input counts as cancel. */
function askPassword(
	title: string,
	content: string,
	submitText: string,
	onSubmit: (password: string) => void,
) {
	showTextPrompt({
		title,
		content,
		placeholder: "Recovery password",
		submitText,
		secure: true,
		onSubmit: (text) => {
			if (text) onSubmit(text);
		},
	});
}

/**
 * Backup & encryption, in the order people come here for: what's wrong (only when something is),
 * automatic backup, backing up and restoring now, moving to another phone, the recovery password,
 * and bringing in the old plugin's data.
 */
export default function Backup() {
	const { Page } = components;
	const { React } = react;
	const { ScrollView, Alert } = ReactNative;
	const { Stack, TableRowGroup, TableRow, TableSwitchRow } = Design;

	const s = useSettings();
	const count = useLog().length;
	// Edit history rides in the same encrypted backup (version 2 of the file).
	const editCount = useEdits().length;
	const anything = count + editCount;
	const status = useStorageStatus();
	const locked = !!status?.locked;
	// Locked, or there but unreadable: nothing may write to it (backup over it, import, clear).
	const block = logBlock(status);
	const blocked = block ? `Not available: ${blockReason(block)}.` : undefined;
	// Where things really are. Native reports the log's folder; the backup file's own path comes
	// from a newer status (read defensively) or from the last backup made on this screen.
	const [lastBackupPath, setLastBackupPath] = React.useState<
		string | undefined
	>();
	// "Start a new log" moves folders around; a second tap must not start a second move.
	const settingAside = React.useRef(false);

	const toast = (content: string) => showToast(content, "ghost-log-ng-backup");

	const path = s.backupFilePath?.trim() || DEFAULT_BACKUP_PATH;
	const shared = path.startsWith("/");
	const bundlePath = shared ? SHARED_BUNDLE_PATH : DEFAULT_BUNDLE_PATH;
	const extra = status as unknown as Record<string, unknown> | undefined;
	const backupFile =
		(typeof extra?.backupFile === "string" && extra.backupFile) ||
		(typeof extra?.backupPath === "string" && extra.backupPath) ||
		lastBackupPath ||
		(shared ? path : `${path} (in app storage)`);
	const logFolder =
		typeof status?.baseDir === "string" && status.baseDir
			? status.baseDir
			: undefined;
	const portable = !!status?.recoverySet && status.recoveryCurrent !== false;

	// ---- location ----

	// Writing the setting is not enough: the whole base dir (log, shards, media) lives at this path
	// on the native side, and nothing re-pointed it. Export and import would immediately use the new
	// location while getLog still read the old one, so the log appeared to empty itself.
	const setPath = (backupFilePath: string) => {
		void (async () => {
			await setSettings({ backupFilePath } as Partial<GhostLogSettings>);
			await native.setBaseDir(backupFilePath).catch(() => {});
			const next = await refreshStorageStatus();
			await refreshLog();
			await refreshEdits();
			setLastBackupPath(undefined);
			toast(
				next?.usingFallback
					? "Android refused that folder. Still saving to app storage."
					: "Location changed.",
			);
		})();
	};

	// ("App docs" and "App cache" used to be offered too; both resolve inside app storage now, so
	// they were the default under another name. A path already set to one keeps working.)
	const choosePath = () => {
		Alert.alert(
			"Where to keep the log",
			"App storage always works, but it's erased if Discord is uninstalled. The Download folder survives that, but Android 11 and later usually refuse it. If the new folder already has a log, the logs in both folders are merged. To move to another phone, use Export bundle.",
			[
				{ text: "Cancel", style: "cancel" },
				{ text: "App storage", onPress: () => setPath(DEFAULT_BACKUP_PATH) },
				{ text: "Download folder", onPress: () => setPath(SHARED_BACKUP_PATH) },
			],
		);
	};

	// ---- backup and restore ----

	const backupNow = (quiet = false) => {
		void (async () => {
			const res = await native.exportBackup(path).catch(() => null);
			const after = await refreshStorageStatus();
			if (res) {
				void setSettings({
					lastBackupAt: Date.now(),
				} as Partial<GhostLogSettings>);
				if (typeof res.path === "string" && res.path)
					setLastBackupPath(res.path);
				if (quiet) return;
				const edited =
					typeof res.edits === "number" && res.edits > 0
						? ` and ${res.edits} edited`
						: "";
				const where =
					res.portable === false
						? " Set a recovery password to open it on another phone."
						: "";
				toast(`Backup saved (${res.count} deleted${edited}).${where}`);
			} else {
				const now = logBlock(after);
				toast(
					now
						? `Couldn't back up: ${blockReason(now)}.`
						: "Backup failed. Check the location.",
				);
			}
		})();
	};

	const setAutoBackup = (on: boolean) => {
		void setSettings({ autoBackupEnabled: on } as Partial<GhostLogSettings>);
		// Write one straight away, so "Last backup" is true from the moment it's on.
		if (on && anything > 0 && !block) backupNow(true);
	};

	// `uri` is a file from Android's picker; without one, the backup at the location above.
	const restore = (password?: string, uri?: string) => {
		void (async () => {
			const result: any = await (uri
				? native.importBackupUri(uri, password)
				: native.importBackup(path, password)
			).catch(() => -1);
			if (result?.needsPassword) {
				askPassword(
					"Backup from another phone",
					"Type the recovery password that was set on the phone this backup came from.",
					"Restore",
					(typed) => restore(typed, uri),
				);
				return;
			}
			if (result?.wrongPassword) {
				toast("That password doesn't open this backup.");
				return;
			}
			const after = await refreshStorageStatus();
			await refreshLog();
			await refreshEdits();
			// Older native builds answer with a number; this one with { added, edits }.
			const added =
				typeof result === "number" ? result : Number(result?.added ?? -1);
			const edits = typeof result === "number" ? 0 : Number(result?.edits ?? 0);
			if (added > 0 || edits > 0) {
				const parts = [
					added > 0 && `${added} deleted message${added === 1 ? "" : "s"}`,
					edits > 0 &&
						`history for ${edits} edited message${edits === 1 ? "" : "s"}`,
				].filter(Boolean);
				toast(`Restored ${parts.join(" and ")}.`);
			} else if (added === 0) {
				// Found and opened, but nothing new: the merge skips ids already in the log.
				toast("Backup found. Everything in it is already in the log.");
			} else if (
				result?.locked ||
				result?.refused ||
				result === false ||
				added < -1 ||
				logBlock(after)
			) {
				// Refused rather than failed: native will not write into a locked or unreadable log.
				const now = logBlock(after);
				toast(
					now
						? `Couldn't restore: ${blockReason(now)}.`
						: "Restore was refused. Nothing was changed.",
				);
			} else if (uri) {
				toast(
					"Couldn't restore: that file isn't a Ghost Log backup, or it's damaged.",
				);
			} else {
				toast(`No backup found at ${backupFile}, or it's damaged.`);
			}
		})();
	};

	const askAndRestore = () => {
		const fromFile = async () => {
			const file = await pickFile();
			if (file) restore(undefined, file.uri);
		};
		Alert.alert(
			"Restore backup",
			"Add the messages from a backup to the current log? Nothing here is removed to make way for it, but if the log is at its size limit, its oldest entries are dropped to fit.",
			canPickFiles()
				? [
						{ text: "Cancel", style: "cancel" },
						{ text: "Choose a file", onPress: () => void fromFile() },
						{ text: "From backup location", onPress: () => restore() },
					]
				: [
						{ text: "Cancel", style: "cancel" },
						{ text: "Restore", onPress: () => restore() },
					],
		);
	};

	// ---- another phone ----

	const exportBundle = () => {
		void (async () => {
			// Download/GhostLogNG through MediaStore first (Android 10+); the old location if that fails.
			const saved = await native.exportBundleToDownloads().catch(() => null);
			const res =
				saved ?? (await native.exportBundle(bundlePath).catch(() => null));
			if (!res) {
				const now = logBlock(await refreshStorageStatus());
				toast(
					now
						? `Couldn't export: ${blockReason(now)}.`
						: "Export failed. Check the location.",
				);
			} else if (res.portable === false)
				toast(
					`Bundle saved to ${res.path}. It opens on this phone only until you set a recovery password.`,
				);
			else toast(`Bundle saved to ${res.path} (${res.count} messages).`);
		})();
	};

	// `uri` is a .zip from Android's picker; without one, the bundle at the old fixed location.
	const importBundle = (password?: string, uri?: string) => {
		void (async () => {
			const restored = await (uri
				? native.importBundleUri(uri, password)
				: native.importBundle(bundlePath, password)
			).catch(() => -1);
			if (restored === BUNDLE_NEEDS_PASSWORD) {
				askPassword(
					"Bundle from another phone",
					"Type the recovery password that was set on the phone this bundle came from.",
					"Import",
					(typed) => importBundle(typed, uri),
				);
				return;
			}
			await refreshLog();
			await refreshEdits();
			const after = await refreshStorageStatus();
			if (restored === BUNDLE_WRONG_PASSWORD)
				toast("That password doesn't open this bundle.");
			else if (typeof restored === "number" && restored >= 0)
				toast(
					`Imported ${restored} message${restored === 1 ? "" : "s"} from the bundle.`,
				);
			else if (restored === BUNDLE_DAMAGED)
				toast("Couldn't import: that bundle is damaged. Nothing was changed.");
			else if (
				restored === false ||
				(typeof restored === "number" && restored < -1) ||
				logBlock(after)
			) {
				// Any other negative answer is a refusal: a locked or unreadable log is never replaced.
				const now = logBlock(after);
				toast(
					now
						? `Couldn't import: ${blockReason(now)}.`
						: "Import was refused. Nothing was changed.",
				);
			} else if (uri)
				toast(
					"Couldn't import: that file isn't a Ghost Log bundle, or it's damaged.",
				);
			else toast(`No bundle found at ${bundlePath}, or it's damaged.`);
		})();
	};

	const askAndImportBundle = () => {
		if (block) {
			toast(`Couldn't import: ${blockReason(block)}.`);
			return;
		}
		const here = logFolder ? ` in ${logFolder}` : "";
		confirmDestructive({
			title: "Replace the log?",
			body: canPickFiles()
				? `Pick a bundle (.zip). The current log${here}, edit history and saved media are replaced with it.`
				: `The current log${here}, edit history and saved media are replaced with the bundle at ${bundlePath}.`,
			action: canPickFiles() ? "Choose file" : "Replace",
			onConfirm: () => {
				if (!canPickFiles()) {
					importBundle();
					return;
				}
				void pickFile().then((file) => {
					if (file) importBundle(undefined, file.uri);
				});
			},
		});
	};

	// ---- recovery password ----

	// The password is handed straight to native and never stored or logged on the JS side.
	const setRecovery = () => {
		const replacing = !!status?.recoverySet;
		askPassword(
			replacing ? "Change recovery password" : "Set recovery password",
			`At least ${MIN_RECOVERY_PASSWORD} characters. You need it to open backups and bundles on another phone or after reinstalling Discord. It can't be recovered if you forget it.${replacing ? " Backups made before the change still need the old password." : ""}`,
			"Next",
			(first) => {
				if (first.length < MIN_RECOVERY_PASSWORD) {
					toast(`Use at least ${MIN_RECOVERY_PASSWORD} characters.`);
					return;
				}
				askPassword(
					"Type it again",
					"Type the same password once more.",
					"Set",
					(second) => {
						if (second !== first) {
							toast("The passwords didn't match. Nothing was changed.");
							return;
						}
						void (async () => {
							const res = await native
								.setRecoveryPassword(first)
								.catch(() => null);
							await refreshStorageStatus();
							if (res?.ok)
								toast(
									"Recovery password set. Backups and bundles now open on another phone with it.",
								);
							else toast("Could not set the recovery password.");
						})();
					},
				);
			},
		);
	};

	const unlock = () => {
		askPassword(
			"Unlock this log",
			"Type the recovery password from the install that wrote this log.",
			"Unlock",
			(password) => {
				void (async () => {
					const res = await native.unlock(password).catch(() => null);
					await refreshStorageStatus();
					await refreshLog();
					await refreshEdits();
					if (!res) toast("Unlock failed.");
					else if (!res.matched) toast("That password doesn't open this log.");
					else if (res.locked)
						toast("Password accepted, but part of this log needs another key.");
					else
						toast(
							`Unlocked. ${res.entries} deleted message${res.entries === 1 ? "" : "s"} in the log.`,
						);
				})();
			},
		);
	};

	const askAndSetAside = () => {
		if (settingAside.current) return;
		Alert.alert(
			"Start a new log",
			locked
				? "Moves the locked log into a folder beside it, untouched, and starts saving again. If you find the password later, move its files back and unlock it."
				: "Moves the damaged log into a folder beside it, untouched, and starts saving again.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Start new log",
					style: "destructive",
					onPress: () => {
						if (settingAside.current) return;
						settingAside.current = true;
						void (async () => {
							try {
								const aside = await native.setAsideLocked().catch(() => null);
								await refreshStorageStatus();
								await refreshLog();
								toast(
									aside
										? `Old log kept in ${aside}.`
										: "Could not move the locked log.",
								);
							} finally {
								settingAside.current = false;
							}
						})();
					},
				},
			],
		);
	};

	const recoveryLabel = !status?.recoverySet
		? "Not set. Backups and bundles open on this phone only."
		: status.recoveryCurrent === false
			? "Set it again: it doesn't cover this phone's current key."
			: "Set. Backups and bundles open on another phone with it.";

	// ---- old plugin ----

	const askAndImportOld = () => {
		Alert.alert(
			"Import from Revenge Next",
			"Copies Ghost Log Native Beta's log (and Ghost Log NG's from before Valenced) out of Revenge Next's folder on this Discord: deleted messages, edits, embeds and media. Their files are left as they are. Anything over your log size is dropped, so raise it first if needed.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Import",
					onPress: () => {
						void (async () => {
							const res = await native.importOldPlugin().catch(() => null);
							await refreshLog();
							await refreshEdits();
							if (!res) toast("Import failed.");
							else if (!res.found)
								toast(
									"No Revenge Next log found in this Discord. If Revenge Next was a separate app, export a bundle there and use Import bundle.",
								);
							else if (!res.added && !res.edits && !res.rich && !res.media)
								toast("Found the old log. Everything in it is already here.");
							else {
								const parts = [
									res.added &&
										`${res.added} deleted message${res.added === 1 ? "" : "s"}`,
									res.edits &&
										`history for ${res.edits} edited message${res.edits === 1 ? "" : "s"}`,
									res.media &&
										`${res.media} saved file${res.media === 1 ? "" : "s"}`,
								].filter(Boolean);
								toast(
									parts.length
										? `Imported ${parts.join(", ")}.`
										: "Imported embeds from the old log.",
								);
							}
						})();
					},
				},
			],
		);
	};

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					{/* Fail loudly: a problem here used to be invisible while every catch was lost. */}
					{locked ? (
						<StatusCard
							tone="critical"
							title="This log is locked"
							body="It was written by another install (before a reinstall, or on another phone). Nothing in it is changed until you unlock it. New catches are held safely in the meantime and added once it's sorted out."
						/>
					) : null}
					{!locked && block === "unreadable" ? (
						<StatusCard
							tone="critical"
							title="This log couldn't be read"
							body="Its files are there, but they couldn't be opened, so nothing is written to them. Backups, imports and clearing are paused so a good backup isn't overwritten. New catches are held safely in the meantime. Restore a backup, or start a new log (the damaged one is moved aside, not deleted)."
						/>
					) : null}
					{status?.usingFallback ? (
						<StatusCard
							tone="critical"
							title="Location unusable"
							body={`Android refused ${status.requestedDir}, and Discord has no permission that would allow it, so the log is being saved to app storage instead. Pick App storage below, and use Export bundle to keep a copy you can move.`}
						/>
					) : null}
					{status?.lastWriteError && !block ? (
						<StatusCard
							tone="warning"
							title="Last save failed"
							body={status.lastWriteError}
						/>
					) : null}

					{!locked && block === "unreadable" ? (
						<TableRowGroup title="Unreadable log" hasIcons>
							<TableRow
								label="Start a new log"
								subLabel="The damaged log is moved aside, not deleted, and saving starts again."
								icon={rowIcon("FolderIcon", "ic_folder")}
								onPress={askAndSetAside}
							/>
						</TableRowGroup>
					) : null}
					{locked ? (
						<TableRowGroup title="Locked log" hasIcons>
							<TableRow
								label="Unlock with recovery password"
								subLabel="Opens the old log and keeps what was caught since."
								icon={rowIcon("LockIcon", "ic_lock")}
								onPress={unlock}
							/>
							<TableRow
								label="Start a new log"
								subLabel="For a lost password. The old log is moved aside, not deleted."
								icon={rowIcon("FolderIcon", "ic_folder")}
								onPress={askAndSetAside}
							/>
						</TableRowGroup>
					) : null}

					<TableRowGroup title="Automatic backup" hasIcons>
						<TableSwitchRow
							label="Back up automatically"
							subLabel={
								block
									? `Paused: ${blockReason(block)}.`
									: "Updates an encrypted backup a moment after each new catch or edit."
							}
							icon={rowIcon("RefreshIcon", "ic_sync")}
							value={!!s.autoBackupEnabled}
							onValueChange={setAutoBackup}
						/>
						<TableRow
							label="Last backup"
							subLabel={s.lastBackupAt ? ago(s.lastBackupAt) : "None yet."}
							icon={rowIcon("ClockIcon", "ic_clock")}
						/>
						<TableRow
							label="Location"
							subLabel={
								shared
									? "Download folder. Survives uninstalling Discord, if Android allows it."
									: "App storage. Always works, but it's erased if Discord is uninstalled."
							}
							icon={rowIcon("FolderIcon", "ic_folder")}
							arrow
							onPress={choosePath}
						/>
						<TableRow
							label="Where it's saved"
							subLabel={`${logFolder ? `Log: ${logFolder}\n` : ""}Backup file: ${backupFile}`}
							icon={rowIcon("FileIcon", "ic_file")}
						/>
					</TableRowGroup>

					<TableRowGroup title="Back up now" hasIcons>
						<TableRow
							label="Back up now"
							subLabel={
								locked
									? "Unlock the log first."
									: blocked
										? blocked
										: anything > 0
											? `Saves ${count} deleted and ${editCount} edited message${editCount === 1 ? "" : "s"}.`
											: "Nothing to back up yet."
							}
							icon={rowIcon("DownloadIcon", "ic_download")}
							disabled={anything <= 0 || !!block}
							onPress={() => backupNow()}
						/>
						<TableRow
							label="Restore backup"
							subLabel="Pick a backup file, or use the one at the backup location. If the log is full, its oldest entries make way."
							icon={rowIcon("UploadIcon", "ic_upload")}
							onPress={askAndRestore}
						/>
					</TableRowGroup>

					<TableRowGroup title="Move to another phone" hasIcons>
						<TableRow
							label="Export bundle"
							subLabel={
								portable
									? "Saves the whole log, edits and media as one .zip file in Download/GhostLogNG. Opens on another phone with the recovery password."
									: "Saves the whole log, edits and media as one .zip file in Download/GhostLogNG. It opens only on this phone until you set a recovery password."
							}
							icon={rowIcon("DownloadIcon", "ic_download")}
							disabled={anything <= 0}
							onPress={exportBundle}
						/>
						<TableRow
							variant="danger"
							label="Import bundle"
							subLabel={blocked ?? "Pick a bundle file. It replaces this log."}
							icon={dangerIcon("UploadIcon", "ic_upload")}
							disabled={!!block}
							onPress={askAndImportBundle}
						/>
					</TableRowGroup>

					<TableRowGroup
						title="Encryption"
						description="Everything is encrypted with a key made for this phone. Copied anywhere else, it can't be opened without the recovery password."
						hasIcons
					>
						<TableRow
							label={
								status?.recoverySet
									? "Change recovery password"
									: "Set recovery password"
							}
							subLabel={recoveryLabel}
							icon={rowIcon("LockIcon", "ic_lock")}
							arrow
							onPress={setRecovery}
						/>
						<TableRow
							label="Device protection"
							subLabel={
								status?.deviceKey === "file"
									? "Android's secure key storage isn't available, so the key is kept in app storage."
									: "The key is kept in Android's secure key storage and never leaves this phone."
							}
							icon={rowIcon("ShieldIcon", "ic_shield")}
						/>
					</TableRowGroup>

					<TableRowGroup title="Revenge Next" hasIcons>
						<TableRow
							label="Import from Revenge Next"
							subLabel="Brings in Ghost Log Native Beta's log from Revenge Next, if it ran in this Discord. No export needed."
							icon={rowIcon("DownloadIcon", "ic_download")}
							onPress={askAndImportOld}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	);
}
