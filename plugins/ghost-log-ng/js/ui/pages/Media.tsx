import * as components from "@valenced/components";
import { Design } from "@valenced/discord/design";
import * as react from "@valenced/react";
import * as ReactNative from "react-native";
import type { MediaKind, SavedMedia } from "../../lib/media";
import { allSavedMedia, formatBytes } from "../../lib/media";
import { FilterBar, MediaTile } from "../components/Message";
import { Empty } from "../native";
import { useBottomPadding } from "../safeArea";
import { openMediaSheet, pressMedia } from "../sheets";
import { useLog } from "../state";

type Filter = "all" | MediaKind;

const FILTERS: Array<{ id: Filter; label: string }> = [
	{ id: "all", label: "All" },
	{ id: "image", label: "Images" },
	{ id: "video", label: "Videos" },
	{ id: "file", label: "Files" },
];

const COLUMNS = 3;
const GAP = 4;
const SIDE = 16;

/**
 * Every saved image, video and file from deleted messages, as a grid like a channel's Media tab.
 * Tap opens it in Discord's own viewer; long-press says who sent it and where, with a jump to the
 * message.
 */
export default function Media() {
	const { Page } = components;
	const { React } = react;
	const { FlatList, View, useWindowDimensions } = ReactNative as any;
	const { Text } = Design as any;

	const entries = useLog();
	const bottomPadding = useBottomPadding();
	const { width } = useWindowDimensions();
	const [filter, setFilter] = React.useState<Filter>("all");

	const all = React.useMemo(() => allSavedMedia(entries), [entries]);
	const shown = React.useMemo(
		() => (filter === "all" ? all : all.filter((item) => item.kind === filter)),
		[all, filter],
	);
	const bytes = all.reduce((sum, item) => sum + (item.size ?? 0), 0);
	const tile = Math.floor((width - SIDE * 2 - GAP * (COLUMNS - 1)) / COLUMNS);

	const header = (
		<View style={{ gap: 12, paddingBottom: 12 }}>
			<FilterBar filters={FILTERS} filter={filter} onFilter={setFilter} />
			{all.length ? (
				<Text
					variant="text-xs/medium"
					color="text-muted"
					style={{ paddingHorizontal: SIDE }}
				>
					{`${all.length} saved${bytes ? ` · ${formatBytes(bytes)}` : ""} · encrypted on this device`}
				</Text>
			) : null}
		</View>
	);

	return (
		<Page>
			<FlatList
				key={`grid-${COLUMNS}`}
				data={shown}
				numColumns={COLUMNS}
				keyExtractor={(item: SavedMedia) => item.key}
				renderItem={({ item, index }: { item: SavedMedia; index: number }) => (
					<MediaTile
						item={item}
						size={tile}
						onPress={() => pressMedia(shown, index)}
						onLongPress={() => openMediaSheet(shown, index)}
					/>
				)}
				columnWrapperStyle={{ gap: GAP, paddingHorizontal: SIDE }}
				ItemSeparatorComponent={() => <View style={{ height: GAP }} />}
				ListHeaderComponent={header}
				ListEmptyComponent={
					all.length ? (
						<Empty title="Nothing here" body="No saved media of this kind." />
					) : (
						<Empty
							title="No saved media yet"
							body="Images, videos and files from deleted messages are saved here, encrypted, when Save attachments and embeds is on (Logging)."
						/>
					)
				}
				contentContainerStyle={{ paddingBottom: bottomPadding }}
				initialNumToRender={18}
				windowSize={5}
				removeClippedSubviews
			/>
		</Page>
	);
}
