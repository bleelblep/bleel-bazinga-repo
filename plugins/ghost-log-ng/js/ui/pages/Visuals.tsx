import * as components from "@valenced/components";
import { Design } from "@valenced/discord/design";
import * as ReactNative from "react-native";
import { DEFAULTS } from "../../defaults";
import { setSettings, useSettings } from "../../settings";
import type { DeleteStyle, GhostLogSettings } from "../../types";
import { rowIcon } from "../icon";
import { useBottomPadding } from "../safeArea";

const STYLE_OPTIONS: Array<{
	value: DeleteStyle;
	label: string;
	subLabel: string;
	icons: string[];
}> = [
	{
		value: "overlay",
		label: "Red highlight",
		subLabel: "A red background and a red bar beside the message.",
		icons: ["PaintPaletteIcon", "PaintbrushThinIcon"],
	},
	{
		value: "text",
		label: "Deleted tag",
		subLabel: 'A small "deleted" tag on the message.',
		icons: ["TagIcon", "PencilIcon", "ic_edit"],
	},
	{
		value: "off",
		label: "Hide them",
		subLabel:
			"Deleted messages leave chat as usual. They're still kept in the log.",
		icons: ["EyeSlashIcon"],
	},
];

/**
 * In chat: everything Ghost Log shows outside its own screens. How a deleted message is marked,
 * whether edit history is drawn above a message, and the notice when one is deleted.
 */
export default function Visuals() {
	const { Page } = components;
	const { ScrollView } = ReactNative;
	const {
		Stack,
		TableRadioGroup,
		TableRadioRow,
		TableRowGroup,
		TableSwitchRow,
	} = Design;

	const s = useSettings();
	const set = (patch: Partial<GhostLogSettings>) => void setSettings(patch);

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRadioGroup
						title="Deleted messages"
						description="How a deleted message is marked when it stays in chat."
						hasIcons
						value={s.deleteStyle ?? DEFAULTS.deleteStyle}
						onChange={(deleteStyle: DeleteStyle) => set({ deleteStyle })}
					>
						{STYLE_OPTIONS.map((option) => (
							<TableRadioRow
								key={option.value}
								label={option.label}
								subLabel={option.subLabel}
								icon={rowIcon(...option.icons)}
								value={option.value}
							/>
						))}
					</TableRadioGroup>

					<TableRowGroup title="Edited messages" hasIcons>
						<TableSwitchRow
							label="Show edit history"
							subLabel={
								s.logEdits
									? "Earlier versions appear as small grey lines above the message."
									: "Turn on Edited messages (in Logging) to use this."
							}
							icon={rowIcon("ClockIcon", "ic_timer")}
							disabled={!s.logEdits}
							value={!!s.showEditHistory}
							onValueChange={(v) => set({ showEditHistory: v })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Notices" hasIcons>
						<TableSwitchRow
							label="Notify me when a message is deleted"
							subLabel="A short notice says who deleted a message and where. Tap it to open the message."
							icon={rowIcon("BellIcon", "ic_notification")}
							value={!!s.toastOnCatch}
							onValueChange={(v) => set({ toastOnCatch: v })}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	);
}
