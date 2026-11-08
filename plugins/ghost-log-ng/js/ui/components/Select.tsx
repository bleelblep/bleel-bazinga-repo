/*
 * Select mode for Deleted messages, Edited messages and one conversation: a Select button (or a
 * long-press on a message) above the list, then tap messages to tick them, and a red Remove button
 * pinned to the bottom (it asks first).
 *
 * Only messages the list is showing count: a tick hidden by a later search or filter is never
 * removed, and never counted.
 *
 * Removal is local only: it takes records out of Ghost Log's own files. Nothing is sent to Discord.
 */

import { Design } from "@valenced/discord/design";
import * as react from "@valenced/react";
import * as ReactNative from "react-native";
import { showToast } from "../../../../../shared/toast";
import { confirmDestructive } from "../../../../../shared/ui/confirm";
import { useBottomPadding } from "../safeArea";
import { token } from "../theme";

export interface Selection {
	active: boolean;
	/** Bumped on every change, for FlatList's extraData so ticked rows redraw. */
	version: number;
	count: number;
	has(id: string): boolean;
	toggle(id: string): void;
	setAll(ids: string[]): void;
	start(): void;
	/** Long-press: start selecting with this one already ticked. */
	startWith(id: string): void;
	stop(): void;
	ids(): string[];
	/** The ticked ids among `shownIds`, in list order. */
	visible(shownIds: string[]): string[];
}

export function useSelection(): Selection {
	const { React } = react;
	const [active, setActive] = React.useState(false);
	const [picked, setPicked] = React.useState<Set<string>>(() => new Set());
	const [version, setVersion] = React.useState(0);

	const update = (next: Set<string>) => {
		setPicked(next);
		setVersion((v) => v + 1);
	};

	return {
		active,
		version,
		count: picked.size,
		has: (id) => picked.has(id),
		toggle: (id) => {
			const next = new Set(picked);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			update(next);
		},
		setAll: (ids) => update(new Set(ids)),
		start: () => {
			update(new Set());
			setActive(true);
		},
		startWith: (id) => {
			update(new Set([id]));
			setActive(true);
		},
		stop: () => {
			update(new Set());
			setActive(false);
		},
		ids: () => [...picked],
		visible: (shownIds) => shownIds.filter((id) => picked.has(id)),
	};
}

/**
 * The list header's top line: the count ("12 deleted messages", "3 of 12") with Select, or while
 * selecting, how many are ticked with All shown / None and Cancel.
 */
export function SelectToggle({
	selection,
	shownIds,
	summary,
}: {
	selection: Selection;
	shownIds: string[];
	summary?: string;
}) {
	const { View } = ReactNative;
	const { Button, Text } = Design as any;
	if (!selection.active) {
		return (
			<View
				style={{
					paddingHorizontal: 16,
					paddingTop: 12,
					flexDirection: "row",
					alignItems: "center",
					gap: 8,
				}}
			>
				<Text
					variant="text-sm/medium"
					color="text-muted"
					style={{ flex: 1 }}
					lineClamp={1}
				>
					{summary ?? ""}
				</Text>
				<Button
					size="sm"
					variant="secondary"
					text="Select"
					onPress={selection.start}
				/>
			</View>
		);
	}
	const ticked = selection.visible(shownIds).length;
	const allShown = shownIds.length > 0 && ticked === shownIds.length;
	return (
		<View
			style={{
				paddingHorizontal: 16,
				paddingTop: 12,
				flexDirection: "row",
				alignItems: "center",
				gap: 8,
			}}
		>
			<Text variant="text-sm/semibold" color="text-default" style={{ flex: 1 }}>
				{ticked ? `${ticked} selected` : "Tap messages to select them"}
			</Text>
			<Button
				size="sm"
				variant="secondary"
				text={allShown ? "None" : "All shown"}
				onPress={() => selection.setAll(allShown ? [] : shownIds)}
			/>
			<Button
				size="sm"
				variant="secondary"
				text="Cancel"
				onPress={selection.stop}
			/>
		</View>
	);
}

/** The pinned Remove button while selecting. */
export function SelectBar({
	selection,
	shownIds,
	describe,
	body,
	onRemove,
	failure,
}: {
	selection: Selection;
	/** What the list is showing now; ticks outside it are left alone. */
	shownIds: string[];
	/** "3 deleted messages", "edit history for 3 messages". */
	describe: (count: number) => string;
	body: string;
	/** Resolves true only when the records really went (false: refused, e.g. a locked log). */
	onRemove: (ids: string[]) => Promise<boolean | void>;
	/** The toast when removal is refused or fails. */
	failure: () => string;
}) {
	const { View } = ReactNative;
	const { Button } = Design as any;
	const bottom = useBottomPadding();
	if (!selection.active) return null;
	const count = selection.visible(shownIds).length;
	return (
		<View
			style={{
				position: "absolute",
				left: 0,
				right: 0,
				bottom: 0,
				paddingHorizontal: 16,
				paddingTop: 12,
				paddingBottom: Math.max(bottom, 12),
				backgroundColor: token("BACKGROUND_SURFACE_HIGHEST", "#3f4147"),
				borderTopColor: token("BORDER_SUBTLE", "#4e5058"),
				borderTopWidth: 1,
			}}
		>
			<Button
				size="md"
				variant="destructive"
				disabled={!count}
				text={count ? `Remove ${describe(count)}` : "Remove"}
				onPress={() =>
					confirmDestructive({
						title: `Remove ${describe(count)}?`,
						body,
						action: "Remove",
						onConfirm: () => {
							const ids = selection.visible(shownIds);
							if (!ids.length) return;
							void onRemove(ids)
								.catch(() => false)
								.then((result) => {
									// Older state.ts resolved nothing; only an explicit false is a refusal.
									if (result === false) {
										showToast(failure(), "ghost-log-ng-select");
										return;
									}
									selection.stop();
									showToast(
										`Removed ${describe(ids.length)}.`,
										"ghost-log-ng-select",
									);
								});
						},
					})
				}
			/>
		</View>
	);
}
