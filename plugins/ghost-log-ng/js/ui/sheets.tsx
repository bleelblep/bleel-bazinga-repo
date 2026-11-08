/**
 * Long-press sheets for the log screens, like a message's own: Discord's ActionSheet with settings
 * rows, destructive actions in red behind Discord's alert dialog.
 */

import { ActionSheetActionCreators } from "@valenced/discord/actions";
import { Design } from "@valenced/discord/design";
import * as finders from "@valenced/discord/utils/modules/finders";
import * as clipboardModule from "@valenced/externals/react-native-clipboard";
import * as ReactNative from "react-native";
import { reportError } from "../../../../shared/report";
import { showToast } from "../../../../shared/toast";
import { confirmDestructive } from "../../../../shared/ui/confirm";
import type { EditRecord } from "../lib/edits";
import { removeEditRecord } from "../lib/edits";
import type { SavedMedia } from "../lib/media";
import { openSavedMedia } from "../lib/media";
import { jumpToDeletedMessage } from "../lib/navigate";
import { blockReason, logBlock } from "./components/StatusCard";
import { dangerIcon, rowIcon } from "./icon";
import type { DeletedMessage } from "./state";
import { getStorageStatus, removeFromLog } from "./state";

const TAG = "[GhostLogNG]";
const SHEET_KEY = "GhostLogNgEntryActions";

function toast(content: string) {
	showToast(content, "GhostLogNgToast");
}

/**
 * Toasts how a removal went. Only an explicit false (the change didn't happen) is a failure;
 * the reason comes from the storage status when the log is locked or unreadable.
 */
function reportRemoval(result: boolean | void, done: string) {
	if (result !== false) return toast(done);
	const block = logBlock(getStorageStatus());
	toast(
		block
			? `Couldn't remove it: ${blockReason(block)}.`
			: "Couldn't remove it. Try again.",
	);
}

function copy(text: string) {
	try {
		// Valenced's bundled clipboard module first: React Native's own Clipboard left core long ago.
		// Same order as Diagnostics' copy.
		const Clipboard =
			(clipboardModule as any)?.Clipboard ?? (ReactNative as any)?.Clipboard;
		if (typeof Clipboard?.setString !== "function")
			throw new Error("no clipboard");
		Clipboard.setString(text);
		toast("Copied to clipboard");
	} catch {
		toast("Couldn't copy.");
	}
}

let profileSheet: any;
function openUserProfile(userId: string) {
	try {
		if (!profileSheet) {
			const mod = (finders as any).lookupModuleWithImportedPath(
				"modules/user_profile/native/showUserProfileActionSheet.tsx",
			)?.[0];
			profileSheet = mod?.default;
		}
		if (typeof profileSheet === "function")
			return void profileSheet({ userId });
	} catch (error) {
		reportError(`${TAG} could not open profile:`, error);
	}
	toast("Couldn't open the profile.");
}

function hide() {
	try {
		ActionSheetActionCreators.hideActionSheet(SHEET_KEY);
	} catch {
		/* already closed */
	}
}

function open(Sheet: (props: any) => any, props: Record<string, unknown>) {
	ActionSheetActionCreators.openLazy(
		Promise.resolve({ default: Sheet }),
		SHEET_KEY,
		props as any,
	);
}

/** Closes the sheet first, so an alert or a navigation does not open underneath it. */
const run = (fn: () => void) => () => {
	hide();
	fn();
};

function Sheet({ title, children }: { title: string; children: any }) {
	const { ActionSheet, BottomSheetTitleHeader, TableRowGroup } = Design as any;
	return (
		<ActionSheet>
			<BottomSheetTitleHeader title={title} />
			<TableRowGroup hasIcons>{children}</TableRowGroup>
		</ActionSheet>
	);
}

function DeletedSheet({ entry }: { entry: DeletedMessage }) {
	const { TableRow } = Design as any;
	return (
		<Sheet title={`Deleted message from ${entry.authorName || "Unknown user"}`}>
			<TableRow
				label="Jump to message"
				icon={rowIcon("ChatIcon", "ArrowSmallRightIcon")}
				onPress={run(() => jumpToDeletedMessage(entry))}
			/>
			{entry.content ? (
				<TableRow
					label="Copy text"
					icon={rowIcon("CopyIcon")}
					onPress={run(() => copy(entry.content))}
				/>
			) : null}
			{entry.authorId ? (
				<TableRow
					label="View profile"
					icon={rowIcon("UserCircleIcon")}
					onPress={run(() => openUserProfile(entry.authorId))}
				/>
			) : null}
			<TableRow
				label="Remove from log"
				variant="danger"
				icon={dangerIcon("TrashIcon")}
				onPress={run(() =>
					confirmDestructive({
						title: "Remove from log?",
						body: "This deleted message and its saved media are removed for good. It stops showing in chat after a reload.",
						action: "Remove",
						onConfirm: () =>
							void (removeFromLog(entry.id) as Promise<boolean | void>)
								.catch(() => false)
								.then((result) => reportRemoval(result, "Removed from log.")),
					}),
				)}
			/>
		</Sheet>
	);
}

function EditSheet({ record }: { record: EditRecord }) {
	const { TableRow } = Design as any;
	const history = () =>
		[
			...(Array.isArray(record.versions) ? record.versions : []).map(
				(version) => version?.content ?? "",
			),
			record.current ?? "",
		]
			.map((text, index, all) =>
				index === all.length - 1 ? `Now: ${text}` : `${index + 1}: ${text}`,
			)
			.join("\n\n");
	return (
		<Sheet title={`Edited message from ${record.authorName || "Unknown user"}`}>
			<TableRow
				label="Jump to message"
				icon={rowIcon("ChatIcon", "ArrowSmallRightIcon")}
				onPress={run(() => jumpToDeletedMessage(record))}
			/>
			<TableRow
				label="Copy current text"
				icon={rowIcon("CopyIcon")}
				onPress={run(() => copy(record.current ?? ""))}
			/>
			<TableRow
				label="Copy every version"
				icon={rowIcon("CopyIcon")}
				onPress={run(() => copy(history()))}
			/>
			{record.authorId ? (
				<TableRow
					label="View profile"
					icon={rowIcon("UserCircleIcon")}
					onPress={run(() => openUserProfile(record.authorId))}
				/>
			) : null}
			<TableRow
				label="Remove from log"
				variant="danger"
				icon={dangerIcon("TrashIcon")}
				onPress={run(() =>
					confirmDestructive({
						title: "Remove edit history?",
						body: "This message's earlier versions are removed for good.",
						action: "Remove",
						onConfirm: () =>
							void (removeEditRecord(record.id) as Promise<boolean | void>)
								.catch(() => false)
								.then((result) =>
									reportRemoval(result, "Edit history removed."),
								),
					}),
				)}
			/>
		</Sheet>
	);
}

function MediaSheet({
	item,
	items,
	index,
}: {
	item: SavedMedia;
	items: SavedMedia[];
	index: number;
}) {
	const { TableRow } = Design as any;
	const where = item.entry.guildName
		? `${item.entry.channelName} in ${item.entry.guildName}`
		: "a direct message";
	return (
		<Sheet
			title={`From ${item.entry.authorName || "Unknown user"} in ${where}`}
		>
			{item.kind !== "file" ? (
				<TableRow
					label={item.kind === "video" ? "Play" : "View"}
					icon={rowIcon(item.kind === "video" ? "PlayIcon" : "EyeIcon")}
					onPress={run(() => {
						void openSavedMedia(items, index).then(
							(result) => result === true || toast(result),
						);
					})}
				/>
			) : null}
			<TableRow
				label="Jump to message"
				icon={rowIcon("ChatIcon", "ArrowSmallRightIcon")}
				onPress={run(() => jumpToDeletedMessage(item.entry))}
			/>
			{item.entry.content ? (
				<TableRow
					label="Copy message text"
					icon={rowIcon("CopyIcon")}
					onPress={run(() => copy(item.entry.content))}
				/>
			) : null}
		</Sheet>
	);
}

export const openDeletedSheet = (entry: DeletedMessage) =>
	open(DeletedSheet, { entry });
export const openEditSheet = (record: EditRecord) =>
	open(EditSheet, { record });
export const openMediaSheet = (items: SavedMedia[], index: number) =>
	open(MediaSheet, { item: items[index], items, index });

/** Tapping a tile: open it in Discord's viewer, or its sheet for a file the viewer can't show. */
export function pressMedia(items: SavedMedia[], index: number) {
	if (items[index]?.kind === "file") return openMediaSheet(items, index);
	void openSavedMedia(items, index).then(
		(result) => result === true || toast(result),
	);
}
