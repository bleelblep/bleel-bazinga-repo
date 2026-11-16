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

/**
 * Logging: what gets logged and how much of it is kept. Nothing else: how it looks in chat and
 * the notice are on In chat, who is left out is on Ignored, copies are on Backup & encryption.
 * The page used to hold all of the first three (ten switches and a size picker).
 */
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

	// One switch for "my own messages". It is still two keys underneath (deletes and edits are
	// caught by different code), always written together; index.ts evens out a pair left uneven by
	// an older version.
	const own = !!s.countOwnMessages || !!s.logOwnEdits;

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

	// Native trims at once, so a smaller size drops the oldest: ask first.
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
			body: `The oldest ${over} logged message${over === 1 ? "" : "s"} will be removed.`,
			action: "Remove",
			onConfirm: () => applySize(value),
		});
	};

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="What gets logged" hasIcons>
						<TableSwitchRow
							label="Deleted messages"
							subLabel="Keep messages other people delete."
							icon={rowIcon("TrashIcon", "ic_trash")}
							value={!!s.logDeletions}
							onValueChange={(v) => set({ logDeletions: v })}
						/>
						<TableSwitchRow
							label="Edited messages"
							subLabel="Keep the earlier versions of edited messages."
							icon={rowIcon("PencilIcon", "ic_edit")}
							value={!!s.logEdits}
							onValueChange={(v) => set({ logEdits: v })}
						/>
						<TableSwitchRow
							label="My own messages"
							subLabel="Also log messages you delete or edit yourself. Ones you delete stay in chat marked as deleted, like anyone else's."
							icon={rowIcon("UserIcon", "ic_profile_24px")}
							value={own}
							onValueChange={(v) =>
								set({ countOwnMessages: v, logOwnEdits: v })
							}
						/>
						<TableSwitchRow
							label="Attachments and link previews"
							subLabel="Keep images, videos, files, stickers and link previews from deleted messages."
							icon={rowIcon("ImageIcon", "ic_image")}
							value={!!s.saveEmbeds}
							onValueChange={(v) => set({ saveEmbeds: v })}
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
