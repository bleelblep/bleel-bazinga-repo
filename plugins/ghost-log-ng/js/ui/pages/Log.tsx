import * as components from "@valenced/components";
import { Design } from "@valenced/discord/design";
import { ReactNavigationNative } from "@valenced/externals/react-navigation";
import * as react from "@valenced/react";
import * as ReactNative from "react-native";
import { showToast } from "../../../../../shared/toast";
import { confirmDestructive } from "../../../../../shared/ui/confirm";
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
	DeletedRecentRow,
	matchesDeleted,
} from "../components/LogRows";
import { RowGuard, SearchField } from "../components/Message";
import { SelectBar, SelectToggle, useSelection } from "../components/Select";
import { blockReason, logBlock } from "../components/StatusCard";
import { dangerIcon } from "../icon";
import { Empty } from "../native";
import { useBottomPadding } from "../safeArea";
import type { DeletedMessage } from "../state";
import {
	clearNativeLog,
	getStorageStatus,
	refreshLog,
	removeManyFromLog,
	useLog,
	useStorageStatus,
} from "../state";

type Row = BoxItem<DeletedMessage> | BoxItem<Conversation<DeletedMessage>>;

/** Why a change to the log didn't happen, for a toast. */
function refusal(action: string): string {
	const block = logBlock(getStorageStatus());
	return block
		? `Couldn't ${action}: ${blockReason(block)}.`
		: `Couldn't ${action}. Try again.`;
}

const deletedAt = (entry: DeletedMessage) => entry?.deletedAt;

/**
 * Every caught deletion, two ways: Recent (compact rows by day; tap for the full message and its
 * actions, long-press to select) and Conversations (a box per server listing its channels, and one
 * for DMs; tap one for its whole history).
 */
export default function Log() {
	const { Page } = components;
	const { React } = react;
	const { FlatList, RefreshControl, View } = ReactNative as any;
	const { TableRowGroup, TableRow } = Design as any;
	const { useNavigation } = ReactNavigationNative as any;
	const navigation = useNavigation?.();

	const entries = useLog();
	const status = useStorageStatus();
	const block = logBlock(status);
	const bottomPadding = useBottomPadding();
	const [query, setQuery] = React.useState("");
	const [view, setView] = React.useState<LogView>(() => getLastView("deleted"));
	const [refreshing, setRefreshing] = React.useState(false);
	const selection = useSelection();
	const recent = view === "recent";

	const needle = query.trim().toLowerCase();
	const shown = React.useMemo(
		() =>
			(Array.isArray(entries) ? entries : []).filter(
				(entry) => entry && matchesDeleted(entry, needle),
			),
		[entries, needle],
	);
	const shownIds = React.useMemo(
		() => (recent ? shown.map((entry) => entry.id) : []),
		[shown, recent],
	);
	const rows: Row[] = React.useMemo(
		() =>
			recent
				? boxRows(byDay(shown, deletedAt), (entry) => entry.id)
				: boxRows(
						groupConversations(shown, deletedAt),
						(convo) => convo.channelId,
					),
		[shown, recent],
	);

	const switchView = (next: LogView) => {
		setLastView("deleted", next);
		if (selection.active) selection.stop();
		setView(next);
	};

	const refresh = () => {
		setRefreshing(true);
		void refreshLog().finally(() => setRefreshing(false));
	};

	const renderItem = ({ item, index }: { item: Row; index: number }) => {
		if (item.type === "title")
			return <BoxTitle label={item.label} first={index === 0} />;
		return (
			<RowGuard>
				{recent ? (
					<DeletedRecentRow
						item={item.item as DeletedMessage}
						first={item.first}
						last={item.last}
						selection={selection}
					/>
				) : (
					<ConversationRow
						convo={item.item as Conversation<DeletedMessage>}
						kind="deleted"
						first={item.first}
						last={item.last}
						onPress={() =>
							openConversation(navigation, {
								channelId: (item.item as Conversation<DeletedMessage>)
									.channelId,
								kind: "deleted",
							})
						}
					/>
				)}
			</RowGuard>
		);
	};

	const summary =
		shown.length === entries.length
			? plural(entries.length, "deleted message")
			: `${shown.length} of ${plural(entries.length, "deleted message")}`;

	const header = (
		<View>
			<View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 12 }}>
				<ViewSwitch options={VIEW_OPTIONS} value={view} onChange={switchView} />
				<SearchField
					query={query}
					onQuery={setQuery}
					placeholder={
						recent
							? `Search ${plural(entries.length, "deleted message")}`
							: "Find a server, channel or person"
					}
				/>
			</View>
			{entries.length && recent ? (
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
			title: "Clear log?",
			body: `All ${plural(entries.length, "deleted message")} and their saved media are removed for good.`,
			action: "Clear",
			onConfirm: () =>
				void clearNativeLog()
					.catch(() => false)
					.then((result) =>
						showToast(
							result === false ? refusal("clear the log") : "Log cleared.",
							"ghost-log-ng-clear",
						),
					),
		});

	const footer =
		entries.length && !selection.active ? (
			<View style={{ paddingHorizontal: 16, paddingTop: 24 }}>
				<TableRowGroup hasIcons>
					<TableRow
						variant="danger"
						label="Clear log"
						subLabel={
							block
								? `Not available: ${blockReason(block)}.`
								: "Removes every deleted message and its saved media."
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
					entries.length ? (
						<Empty
							title="No matches"
							body="Nothing in the log matches that search."
						/>
					) : (
						<Empty
							title="No deleted messages yet"
							body="When someone deletes a message Discord had loaded, it shows up here."
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
				describe={(n) => plural(n, "deleted message")}
				body="They're removed from your log for good, with their saved media."
				onRemove={(ids) => removeManyFromLog(ids)}
				failure={() => refusal("remove them")}
			/>
		</Page>
	);
}
