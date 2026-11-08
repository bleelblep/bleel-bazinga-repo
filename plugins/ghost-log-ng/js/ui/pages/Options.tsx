import * as components from "@valenced/components";
import { Design } from "@valenced/discord/design";
import * as ReactNative from "react-native";
import { confirmDestructive } from "../../../../../shared/ui/confirm";
import { DEFAULTS } from "../../defaults";
import { native } from "../../lib/bridge";
import { useEdits } from "../../lib/edits";
import { setSettings, useSettings } from "../../settings";
import type { GhostLogSettings } from "../../types";
import { rowIcon } from "../icon";
import { useBottomPadding } from "../safeArea";
import { useLog } from "../state";

const SIZES = [100, 500, 1000, 5000];
const UNLIMITED = "unlimited";

/** Logging: what gets caught, notifications and how many are kept. Look is on Visual style, backup on Backup & encryption. */
export default function Options() {
	const { Page } = components;
	const { ScrollView } = ReactNative;
	const {
		Stack,
		TableRowGroup,
		TableSwitchRow,
		TableRadioGroup,
		TableRadioRow,
	} = Design;

	const s = useSettings();
	const deletedCount = useLog().length;
	const editedCount = useEdits().length;
	const set = (patch: Partial<GhostLogSettings>) => void setSettings(patch);

	const max = s.maxEntries ?? DEFAULTS.maxEntries;
	// A size set before this picker existed (or by hand) stays selectable rather than vanishing.
	const sizes = SIZES.includes(max)
		? SIZES
		: [...SIZES, max].sort((a, b) => a - b);
	const current = s.unlimitedEntries ? UNLIMITED : String(max);

	const applySize = (value: string) => {
		const unlimitedEntries = value === UNLIMITED;
		const maxEntries = unlimitedEntries ? max : Number(value);
		set({ maxEntries, unlimitedEntries });
		void native.setLimits(maxEntries, unlimitedEntries).catch(() => {});
	};

	// Native trims at once, so a smaller size drops the oldest for good: ask first.
	const chooseSize = (value: string) => {
		if (value === current) return;
		const size = value === UNLIMITED ? Infinity : Number(value);
		const over =
			Math.max(deletedCount - size, 0) + Math.max(editedCount - size, 0);
		if (over <= 0) {
			applySize(value);
			return;
		}
		confirmDestructive({
			title: `Keep only ${size}?`,
			body: `The oldest ${over} logged message${over === 1 ? "" : "s"} will be removed for good.`,
			action: "Remove",
			onConfirm: () => applySize(value),
		});
	};

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="What gets caught" hasIcons>
						<TableSwitchRow
							label="Log deletions"
							subLabel="Keep messages other people delete."
							icon={rowIcon("TrashIcon", "ic_trash")}
							value={!!s.logDeletions}
							onValueChange={(v) => set({ logDeletions: v })}
						/>
						<TableSwitchRow
							label="Include my own deleted messages"
							subLabel={
								s.logDeletions
									? "Keep messages you delete yourself too. They stay in chat marked as deleted, like anyone else's."
									: "Turn on Log deletions to use this."
							}
							icon={rowIcon("UserIcon", "ic_profile_24px")}
							disabled={!s.logDeletions}
							value={!!s.countOwnMessages}
							onValueChange={(v) => set({ countOwnMessages: v })}
						/>
						<TableSwitchRow
							label="Log edits"
							subLabel="Keep the earlier versions of edited messages."
							icon={rowIcon("PencilIcon", "ic_edit")}
							value={!!s.logEdits}
							onValueChange={(v) => set({ logEdits: v })}
						/>
						<TableSwitchRow
							label="Include my own edits"
							subLabel={
								s.logEdits
									? "Keep the earlier versions of messages you edit, too."
									: "Turn on Log edits to use this."
							}
							icon={rowIcon("UserIcon", "ic_profile_24px")}
							disabled={!s.logEdits}
							value={!!s.logOwnEdits}
							onValueChange={(v) => set({ logOwnEdits: v })}
						/>
						<TableSwitchRow
							label="Save attachments and embeds"
							subLabel="Keep images, videos, files and link previews from deleted messages."
							icon={rowIcon("ImageIcon", "ic_image")}
							value={!!s.saveEmbeds}
							onValueChange={(v) => set({ saveEmbeds: v })}
						/>
						<TableSwitchRow
							label="Ignore bots"
							subLabel="Don't keep deleted or edited messages from bot accounts."
							icon={rowIcon("ClydeIcon", "RobotIcon", "UserIcon")}
							value={!!s.ignoreBots}
							onValueChange={(v) => set({ ignoreBots: v })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Notifications" hasIcons>
						<TableSwitchRow
							label="Toast when caught"
							subLabel="Show a short notice the moment a deletion is caught."
							icon={rowIcon("BellIcon", "ic_notification")}
							value={!!s.toastOnCatch}
							onValueChange={(v) => set({ toastOnCatch: v })}
						/>
						<TableSwitchRow
							label="Tap the notice to jump"
							subLabel={
								s.toastOnCatch
									? "The notice stays for 6 seconds. Tap it to open the deleted message."
									: "Turn on Toast when caught to use this."
							}
							icon={rowIcon("ArrowSmallRightIcon", "ChatIcon")}
							disabled={!s.toastOnCatch}
							value={!!s.tapToJump}
							onValueChange={(v) => set({ tapToJump: v })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Chat menu" hasIcons>
						<TableSwitchRow
							label="Remove from chat menu"
							subLabel="Long-press a logged message in chat to remove it from Ghost Log. Nothing is sent to Discord."
							icon={rowIcon("TrashIcon", "ic_trash")}
							value={!!s.removeFromChat}
							onValueChange={(v) => set({ removeFromChat: v })}
						/>
					</TableRowGroup>

					{/* Its own top-level group: TableRadioRows nested in another TableRowGroup render
					    as an isolated pill mid-list. */}
					<TableRadioGroup
						title="Log size"
						description="How many deleted messages, and separately how many edited ones, are kept. When full, the oldest go first."
						defaultValue={current}
						value={current}
						onChange={chooseSize}
					>
						{sizes.map((size) => (
							<TableRadioRow
								key={size}
								label={`Newest ${size.toLocaleString()}`}
								value={String(size)}
							/>
						))}
						<TableRadioRow
							label="Unlimited"
							subLabel="Keep everything until you clear it."
							value={UNLIMITED}
						/>
					</TableRadioGroup>
				</Stack>
			</ScrollView>
		</Page>
	);
}
