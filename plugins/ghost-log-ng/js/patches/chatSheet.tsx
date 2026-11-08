/*
 * Ghost Log's row in the message long-press sheet: "Remove from Ghost Log" (Logging > Remove
 * from chat menu, on messages in the log). Nothing is added to any other message.
 *
 * Same openLazy technique as Veil's patches/messageSheet.tsx and Translate's messageActionSheet:
 * the sheet is found by its key and `props` carries the message; `before`/`after` compose safely
 * (coding rule 2).
 */

import * as assets from "@valenced/assets";
import * as actions from "@valenced/discord/actions";
import { Design } from "@valenced/discord/design";
import * as finders from "@valenced/modules/finders";
import * as filters from "@valenced/modules/finders/filters";
import { after, before } from "@valenced/patcher";
import { findMessageSheetGroupParent } from "../../../../shared/messageSheet";
import { reportError } from "../../../../shared/report";
import { showToast } from "../../../../shared/toast";
import { confirmDestructive } from "../../../../shared/ui/confirm";
import { getEditRecord, removeEditRecord } from "../lib/edits";
import { redrawMessage } from "../lib/keep";
import { getSettings } from "../settings";
import { isLoggedId, removeFromLog } from "../ui/state";

const TAG = "[GhostLogNG:chatSheet]";
const SYM_PATCHED = Symbol.for("GhostLogNG chat sheet");

function isMessageSheet(key: string) {
	return /message/i.test(key) && !/channel|forum|guild|thread/i.test(key);
}

let actionSheetRow: any;
function ActionSheetRowComponent() {
	if (!actionSheetRow) {
		const { lookupModule } = finders;
		const { withProps } = filters;
		actionSheetRow = lookupModule<any>(
			(withProps as any)("ActionSheetRow"),
		)?.[0]?.ActionSheetRow;
	}
	return actionSheetRow;
}

function closeSheet() {
	try {
		actions.ActionSheetActionCreators.hideActionSheet();
	} catch {
		/* rows usually close the sheet themselves */
	}
}

interface Target {
	channelId: string;
	messageId?: string;
	message?: any;
}

/** Which Ghost Log record this message has, when Remove from chat menu is on. */
function removable(
	messageId: string | undefined,
): "deleted" | "edited" | undefined {
	if (!messageId || !getSettings().removeFromChat) return undefined;
	if (isLoggedId(messageId)) return "deleted";
	if (getEditRecord(messageId)) return "edited";
	return undefined;
}

function buildGroup(target: Target): any {
	const record = removable(target.messageId);
	if (!record) return null;
	const ActionSheetRow = ActionSheetRowComponent();
	if (!ActionSheetRow || !target.messageId) return null;
	const { getAssetIdByName } = assets;

	const rows: any[] = [];
	// Discord's rows know `danger`, not `destructive`: an unknown variant makes ActionSheetRowIcon read
	// colours that don't exist and crash the sheet ("Cannot read property 'color' of undefined").
	const act = (
		label: string,
		subLabel: string,
		icon: string,
		danger: boolean,
		run: () => void,
	) =>
		rows.push(
			<ActionSheetRow
				key={label}
				label={label}
				subLabel={subLabel}
				variant={danger ? "danger" : undefined}
				icon={
					<ActionSheetRow.Icon
						source={getAssetIdByName(icon)}
						variant={danger ? "danger" : undefined}
					/>
				}
				onPress={() => {
					closeSheet();
					try {
						run();
					} catch (error) {
						reportError(`${TAG} sheet action failed:`, error);
					}
				}}
			/>,
		);

	if (record) {
		const messageId = target.messageId;
		act(
			"Remove from Ghost Log",
			record === "deleted"
				? "Delete it from your log. Nothing is sent."
				: "Delete its edit history from your log.",
			"TrashIcon",
			true,
			() =>
				confirmDestructive({
					title: "Remove from Ghost Log?",
					body:
						record === "deleted"
							? "This deleted message and its saved media are removed from your log for good. It leaves chat after a reload."
							: "This message's earlier versions are removed from your log for good.",
					action: "Remove",
					onConfirm: () => {
						void (
							record === "deleted"
								? removeFromLog(messageId)
								: removeEditRecord(messageId)
						).then((removed) => {
							// Only claim it when native confirmed it (a locked log refuses).
							if (!removed) {
								showToast("Couldn't remove it from Ghost Log.", "glng-remove");
								return;
							}
							redrawMessage(target.channelId, messageId);
							showToast("Removed from Ghost Log.", "glng-remove");
						});
					},
				}),
		);
	}

	if (!rows.length) return null;
	return (
		<ActionSheetRow.Group key="ghost-log-ng-remove">
			{rows}
		</ActionSheetRow.Group>
	);
}

function inject(rendered: any, target: Target): boolean {
	const group = buildGroup(target);
	if (!group) return false;
	const Group = ActionSheetRowComponent()?.Group;
	const holder = findMessageSheetGroupParent(
		rendered,
		Design.ActionSheet,
		Group,
	);
	const children = holder?.props?.children;
	if (Array.isArray(children)) {
		// Near the bottom: just above Discord's last section (Report / Delete), not second from the
		// top where 0.2.11 put it.
		let last = -1;
		for (let i = children.length - 1; i >= 0; i--) {
			if (children[i]?.type === Group) {
				last = i;
				break;
			}
		}
		children.splice(last >= 0 ? last : children.length, 0, group);
		return true;
	}
	if (children) {
		holder.props.children = [children, group];
		return true;
	}
	return false;
}

let patchedModules = new WeakSet<any>();
let current: Target | undefined;

function patchSheetModule(mod: any, patches: Array<() => void>) {
	if (!mod || typeof mod.default !== "function" || patchedModules.has(mod))
		return mod;
	const applyTo = (rendered: any) => {
		try {
			if (
				current &&
				rendered != null &&
				!rendered[SYM_PATCHED] &&
				inject(rendered, current)
			) {
				rendered[SYM_PATCHED] = true;
			}
		} catch (error) {
			reportError(`${TAG} sheet injection failed:`, error);
		}
		return rendered;
	};
	try {
		patches.push(after(mod, "default", applyTo));
		patchedModules.add(mod);
	} catch (error) {
		reportError(`${TAG} could not patch sheet module:`, error);
	}
	return mod;
}

export default function patchChatSheet(): () => void {
	const { ActionSheetActionCreators } = actions;
	const patches: Array<() => void> = [];

	patches.push(
		before(ActionSheetActionCreators as any, "openLazy", (args: any[]) => {
			try {
				const [sheet, key, props] = args;
				current = undefined;
				const message = props?.message;
				const channelId = message?.channel_id ?? props?.channel?.id;
				// Only for a logged message with Remove from chat menu on. Otherwise we don't even arm
				// the sheet.
				if (
					removable(typeof message?.id === "string" ? message.id : undefined) &&
					typeof key === "string" &&
					isMessageSheet(key) &&
					typeof channelId === "string" &&
					sheet &&
					typeof sheet.then === "function"
				) {
					current = {
						channelId,
						messageId: typeof message?.id === "string" ? message.id : undefined,
						message,
					};
					args[0] = sheet.then((mod: any) => patchSheetModule(mod, patches));
				}
			} catch (error) {
				reportError(`${TAG} openLazy hook failed:`, error);
			}
			return args; // a before-hook must return the args array (coding rule 2)
		}),
	);

	return () => {
		for (const unpatch of patches) {
			try {
				unpatch();
			} catch {
				/* already gone */
			}
		}
		patches.length = 0;
		// The `after` hooks on the sheet modules are gone, so a restart has to be able to add them
		// again: a module left in this set would never be patched in the next session.
		patchedModules = new WeakSet<any>();
		current = undefined;
	};
}
