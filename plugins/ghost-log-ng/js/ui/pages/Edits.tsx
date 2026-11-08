import * as components from "@valenced/components";
import { Design } from "@valenced/discord/design";
import { ReactNavigationNative } from "@valenced/externals/react-navigation";
import * as react from "@valenced/react";
import * as ReactNative from "react-native";
import { showToast } from "../../../../../shared/toast";
import { confirmDestructive } from "../../../../../shared/ui/confirm";
import type { EditRecord } from "../../lib/edits";
import {
	clearEdits,
	refreshEdits,
	removeEditRecords,
	useEdits,
} from "../../lib/edits";
import type { BoxItem } from "../components/Boxes";
import {
	BoxTitle,
	boxRows,
	byDay,
	plural,
	ViewSwitch,
} from "../components/Boxes";
import type { Conversation, LogView } from "../components/conversation";
import {
	getLastView,
	groupConversations,
	openConversation,
	setLastView,
	VIEW_OPTIONS,
} from "../components/conversation";
import {
	ConversationRow,
	EditedRecentRow,
	matchesEdit,
} from "../components/LogRows";
import { RowGuard, SearchField } from "../components/Message";
import { SelectBar, SelectToggle, useSelection } from "../components/Select";
import { blockReason, logBlock } from "../components/StatusCard";
import { dangerIcon } from "../icon";
import { Empty } from "../native";
import { useBottomPadding } from "../safeArea";
import { getStorageStatus, useStorageStatus } from "../state";

type Row = BoxItem<EditRecord> | BoxItem<Conversation<EditRecord>>;

function refusal(action: string): string {
	const block = logBlock(getStorageStatus());
	return block
		? `Couldn't ${action}: ${blockReason(block)}.`
		: `Couldn't ${action}. Try again.`;
}

const editedAt = (record: EditRecord) => record?.editedAt;

/**
 * Every edited message caught, laid out like Deleted messages: Recent (the text now, "was" and the
 * text it replaced, and how many versions) or Conversations. Tap a message for all its versions.
 */
export default function Edits() {
	const { Page } = components;
	const { React } = react;
	const { FlatList, RefreshControl, View } = ReactNative as any;
	const { TableRowGroup, TableRow } = Design as any;
	const { useNavigation } = ReactNavigationNative as any;
	const navigation = useNavigation?.();

	const records = useEdits();
	const status = useStorageStatus();
	const block = logBlock(status);
	const bottomPadding = useBottomPadding();
	const [query, setQuery] = React.useState("");
	const [view, setView] = React.useState<LogView>(() => getLastView("edited"));
	const [refreshing, setRefreshing] = React.useState(false);
	const selection = useSelection();
	const recent = view === "recent";

	const needle = query.trim().toLowerCase();
	const shown = React.useMemo(
		() =>
			(Array.isArray(records) ? records : []).filter(
				(record) => record && matchesEdit(record, needle),
			),
		[records, needle],
	);
	const shownIds = React.useMemo(
		() => (recent ? shown.map((record) => record.id) : []),
		[shown, recent],
	);
	const rows: Row[] = React.useMemo(
		() =>
			recent
				? boxRows(byDay(shown, editedAt), (record) => record.id)
				: boxRows(
						groupConversations(shown, editedAt),
						(convo) => convo.channelId,
					),
		[shown, recent],
	);

	const switchView = (next: LogView) => {
		setLastView("edited", next);
		if (selection.active) selection.stop();
		setView(next);
	};

	const refresh = () => {
		setRefreshing(true);
		void refreshEdits().finally(() => setRefreshing(false));
	};

	const renderItem = ({ item, index }: { item: Row; index: number }) => {
		if (item.type === "title")
			return <BoxTitle label={item.label} first={index === 0} />;
		return (
			<RowGuard>
				{recent ? (
					<EditedRecentRow
						item={item.item as EditRecord}
						first={item.first}
						last={item.last}
						selection={selection}
					/>
				) : (
					<ConversationRow
						convo={item.item as Conversation<EditRecord>}
						kind="edited"
						first={item.first}
						last={item.last}
						onPress={() =>
							openConversation(navigation, {
								channelId: (item.item as Conversation<EditRecord>).channelId,
								kind: "edited",
							})
						}
					/>
				)}
			</RowGuard>
		);
	};

	const summary =
		shown.length === records.length
			? plural(records.length, "edited message")
			: `${shown.length} of ${plural(records.length, "edited message")}`;

	const header = (
		<View>
			<View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 12 }}>
				<ViewSwitch options={VIEW_OPTIONS} value={view} onChange={switchView} />
				<SearchField
					query={query}
					onQuery={setQuery}
					placeholder={
						recent
							? `Search ${plural(records.length, "edited message")}`
							: "Find a server, channel or person"
					}
				/>
			</View>
			{records.length && recent ? (
				<SelectToggle
					selection={selection}
					shownIds={shownIds}
					summary={summary}
				/>
			) : null}
		</View>
	);

	const clear = () =>
		confirmDestructive({
			title: "Clear edit history?",
			body: `The earlier versions of all ${plural(records.length, "edited message")} are removed for good.`,
			action: "Clear",
			onConfirm: () =>
				void (clearEdits() as Promise<boolean | void>)
					.catch(() => false)
					.then((result) =>
						showToast(
							result === false
								? refusal("clear the edit history")
								: "Edit history cleared.",
							"ghost-log-ng-clear",
						),
					),
		});

	const footer =
		records.length && !selection.active ? (
			<View style={{ paddingHorizontal: 16, paddingTop: 24 }}>
				<TableRowGroup hasIcons>
					<TableRow
						variant="danger"
						label="Clear edit history"
						subLabel={
							block
								? `Not available: ${blockReason(block)}.`
								: "Deleted messages are not affected."
						}
						icon={dangerIcon("TrashIcon", "ic_trash")}
						disabled={!!block}
						onPress={clear}
					/>
				</TableRowGroup>
			</View>
		) : null;

	return (
		<Page>
			<FlatList
				data={rows}
				keyExtractor={(row: Row) => row.key}
				renderItem={renderItem}
				ListHeaderComponent={header}
				ListFooterComponent={footer}
				ListEmptyComponent={
					records.length ? (
						<Empty
							title="No matches"
							body="Nothing in the edit history matches that search."
						/>
					) : (
						<Empty
							title="No edited messages yet"
							body="When someone edits a message Discord had loaded, its earlier version is kept here."
						/>
					)
				}
				keyboardShouldPersistTaps="handled"
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={refresh} />
				}
				contentContainerStyle={{
					paddingBottom: bottomPadding + (selection.active ? 72 : 0),
				}}
				initialNumToRender={14}
				windowSize={7}
				extraData={selection.version}
			/>
			<SelectBar
				selection={selection}
				shownIds={shownIds}
				describe={(n) => `edit history for ${plural(n, "message")}`}
				body="Their earlier versions are removed from your log for good. The messages themselves aren't touched."
				onRemove={(ids) => removeEditRecords(ids)}
				failure={() => refusal("remove the edit history")}
			/>
		</Page>
	);
}
