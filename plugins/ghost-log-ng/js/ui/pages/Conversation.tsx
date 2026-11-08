import * as components from "@valenced/components";
import { Design } from "@valenced/discord/design";
import { ReactNavigationNative } from "@valenced/externals/react-navigation";
import * as react from "@valenced/react";
import * as ReactNative from "react-native";
import { showToast } from "../../../../../shared/toast";
import { confirmDestructive } from "../../../../../shared/ui/confirm";
import type { EditRecord } from "../../lib/edits";
import { refreshEdits, removeEditRecords, useEdits } from "../../lib/edits";
import type { BoxItem } from "../components/Boxes";
import { BoxTitle, boxRows, byDay, plural } from "../components/Boxes";
import type { Placed } from "../components/conversation";
import { groupConversations, readParams } from "../components/conversation";
import { DeletedFullRow, EditedFullRow } from "../components/LogRows";
import { RowGuard } from "../components/Message";
import type { Selection } from "../components/Select";
import { SelectBar, SelectToggle, useSelection } from "../components/Select";
import { blockReason, logBlock } from "../components/StatusCard";
import { dangerIcon } from "../icon";
import { Empty } from "../native";
import { useBottomPadding } from "../safeArea";
import type { DeletedMessage } from "../state";
import {
	getStorageStatus,
	refreshLog,
	removeManyFromLog,
	useLog,
	useStorageStatus,
} from "../state";

function refusal(action: string): string {
	const block = logBlock(getStorageStatus());
	return block
		? `Couldn't ${action}: ${blockReason(block)}.`
		: `Couldn't ${action}. Try again.`;
}

interface Spec<T extends Placed> {
	time: (item: T) => number;
	noun: string;
	/** "deleted messages" / "edit history for N messages", for the Remove button. */
	describe: (n: number) => string;
	removeBody: string;
	remove: (ids: string[]) => Promise<boolean | void>;
	refresh: () => Promise<unknown>;
	clearLabel: string;
	clearSub: string;
	clearTitle: string;
	clearBody: (n: number) => string;
	cleared: string;
	Row: (props: {
		item: T;
		first: boolean;
		last: boolean;
		selection: Selection;
	}) => any;
	emptyBody: string;
}

/**
 * One channel or DM's whole history: "#channel" as the title, "Server · N deleted" with Select
 * above, the messages by day in full, and its own clear at the bottom (it asks first).
 */
function ConversationList<T extends Placed>({
	channelId,
	items,
	spec,
}: {
	channelId: string;
	items: T[];
	spec: Spec<T>;
}) {
	const { React } = react;
	const { FlatList, RefreshControl, View } = ReactNative as any;
	const { TableRowGroup, TableRow } = Design as any;
	const { useNavigation } = ReactNavigationNative as any;
	const navigation = useNavigation?.();

	const status = useStorageStatus();
	const block = logBlock(status);
	const bottomPadding = useBottomPadding();
	const [refreshing, setRefreshing] = React.useState(false);
	const selection = useSelection();

	const convo = React.useMemo(() => {
		const mine = (Array.isArray(items) ? items : []).filter(
			(item) => item && item.channelId === channelId,
		);
		return groupConversations(mine, spec.time).flatMap(
			(group) => group.items,
		)[0];
	}, [items, channelId, spec]);
	const shown = convo?.items ?? [];
	const shownIds = React.useMemo(() => shown.map((item) => item.id), [shown]);
	const rows: BoxItem<T>[] = React.useMemo(
		() => boxRows(byDay(shown, spec.time), (item) => item.id),
		[shown, spec],
	);

	const title = convo
		? convo.guildId
			? convo.title
			: convo.title.replace(/^#/, "")
		: "Conversation";
	React.useEffect(() => {
		navigation?.setOptions?.({ title });
	}, [title]);

	const where = convo
		? convo.guildId
			? convo.guildName || "Server"
			: "Direct message"
		: "";
	const summary = `${where} · ${shown.length} ${spec.noun}`;

	const refresh = () => {
		setRefreshing(true);
		void spec.refresh().finally(() => setRefreshing(false));
	};

	const clear = () => {
		const ids = shownIds.slice();
		confirmDestructive({
			title: spec.clearTitle,
			body: spec.clearBody(ids.length),
			action: "Clear",
			onConfirm: () =>
				void spec
					.remove(ids)
					.catch(() => false)
					.then((result) => {
						if (result === false) {
							showToast(refusal("clear it"), "ghost-log-ng-clear");
							return;
						}
						showToast(spec.cleared, "ghost-log-ng-clear");
						navigation?.goBack?.();
					}),
		});
	};

	const { Row } = spec;
	const renderItem = ({ item, index }: { item: BoxItem<T>; index: number }) =>
		item.type === "title" ? (
			<BoxTitle label={item.label} first={index === 0} />
		) : (
			<RowGuard>
				<Row
					item={item.item}
					first={item.first}
					last={item.last}
					selection={selection}
				/>
			</RowGuard>
		);

	const footer =
		shown.length && !selection.active ? (
			<View style={{ paddingHorizontal: 16, paddingTop: 24 }}>
				<TableRowGroup hasIcons>
					<TableRow
						variant="danger"
						label={spec.clearLabel}
						subLabel={
							block ? `Not available: ${blockReason(block)}.` : spec.clearSub
						}
						icon={dangerIcon("TrashIcon", "ic_trash")}
						disabled={!!block}
						onPress={clear}
					/>
				</TableRowGroup>
			</View>
		) : null;

	return (
		<>
			<FlatList
				data={rows}
				keyExtractor={(row: BoxItem<T>) => row.key}
				renderItem={renderItem}
				ListHeaderComponent={
					shown.length ? (
						<SelectToggle
							selection={selection}
							shownIds={shownIds}
							summary={summary}
						/>
					) : null
				}
				ListFooterComponent={footer}
				ListEmptyComponent={
					<Empty title="Nothing here now" body={spec.emptyBody} />
				}
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={refresh} />
				}
				contentContainerStyle={{
					paddingBottom: bottomPadding + (selection.active ? 72 : 0),
				}}
				initialNumToRender={8}
				windowSize={7}
				extraData={selection.version}
			/>
			<SelectBar
				selection={selection}
				shownIds={shownIds}
				describe={spec.describe}
				body={spec.removeBody}
				onRemove={spec.remove}
				failure={() => refusal("remove them")}
			/>
		</>
	);
}

let deletedSpec: Spec<DeletedMessage> | undefined;
let editedSpec: Spec<EditRecord> | undefined;

// Built on first use, not at module scope (coding rule 1: nothing here may run at preInit).
function getDeletedSpec(): Spec<DeletedMessage> {
	if (!deletedSpec)
		deletedSpec = {
			time: (entry) => entry?.deletedAt,
			noun: "deleted",
			describe: (n) => plural(n, "deleted message"),
			removeBody:
				"They're removed from your log for good, with their saved media.",
			remove: (ids) => removeManyFromLog(ids),
			refresh: refreshLog,
			clearLabel: "Clear this conversation's log",
			clearSub: "Removes its deleted messages and their saved media.",
			clearTitle: "Clear this conversation's log?",
			clearBody: (n) =>
				`${plural(n, "deleted message")} from here and their saved media are removed for good.`,
			cleared: "Conversation's log cleared.",
			Row: DeletedFullRow,
			emptyBody: "No deleted messages from this conversation are in the log.",
		};
	return deletedSpec;
}

function getEditedSpec(): Spec<EditRecord> {
	if (!editedSpec)
		editedSpec = {
			time: (record) => record?.editedAt,
			noun: "edited",
			describe: (n) => `edit history for ${plural(n, "message")}`,
			removeBody:
				"Their earlier versions are removed from your log for good. The messages themselves aren't touched.",
			remove: (ids) => removeEditRecords(ids),
			refresh: refreshEdits,
			clearLabel: "Clear this conversation's edit history",
			clearSub: "Deleted messages are not affected.",
			clearTitle: "Clear this conversation's edit history?",
			clearBody: (n) =>
				`The earlier versions of ${plural(n, "edited message")} from here are removed for good.`,
			cleared: "Conversation's edit history cleared.",
			Row: EditedFullRow,
			emptyBody: "No edited messages from this conversation are in the log.",
		};
	return editedSpec;
}

function DeletedConversation({ channelId }: { channelId: string }) {
	const entries = useLog();
	return (
		<ConversationList
			channelId={channelId}
			items={entries}
			spec={getDeletedSpec()}
		/>
	);
}

function EditedConversation({ channelId }: { channelId: string }) {
	const records = useEdits();
	return (
		<ConversationList
			channelId={channelId}
			items={records}
			spec={getEditedSpec()}
		/>
	);
}

/** Opened from a conversation row; the channel comes in route params (see components/conversation). */
export default function Conversation() {
	const { Page } = components;
	const { useRoute } = ReactNavigationNative as any;
	const route = useRoute?.() as { params?: unknown } | undefined;
	const params = readParams(route?.params);
	return (
		<Page>
			{!params ? (
				<Empty
					title="Conversation not found"
					body="Go back and pick a conversation again."
				/>
			) : params.kind === "edited" ? (
				<EditedConversation channelId={params.channelId} />
			) : (
				<DeletedConversation channelId={params.channelId} />
			)}
		</Page>
	);
}
