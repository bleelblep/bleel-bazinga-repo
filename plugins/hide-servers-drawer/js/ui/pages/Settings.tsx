import { Credit } from "../../../../../shared/ui/credit"
import { hiddenChannelIds, hiddenFolderIds, hiddenIds } from "../../lib/hidden"
import { hideEmoji, setHideEmoji } from "../../lib/prefs"
import { rowIcon } from "../icon"
import { useBottomPadding } from "../safeArea"
import { CHANNELS_ROUTE, DEBUG_ROUTE, SERVERS_ROUTE } from "../routes"
import type { HideServersDrawerStorage } from "../../index"
import { useChangelog } from "../../../../../shared/changelog"
import { showToast as sharedToast } from "../../../../../shared/toast"
import { ReactNavigationNative } from "@valenced/externals/react-navigation"
import { AlertActionCreators } from "@valenced/discord/actions"
import * as components from "@valenced/components"
import { Design } from "@valenced/discord/design"
import * as ReactNative from "react-native"
import { reportError } from "../../../../../shared/report"

const DEBUG: boolean = false

// Same shared/toast.ts helper as GuildRow/FolderRow -- valenced.utils.toast.show doesn't exist.
function showToast(content: string) {
	sharedToast(content, "HideServersDrawerToast")
}

/** "Are you sure?" before the notice goes for good (settings design guide §4.3). */
function confirmHideNotice(onHide: () => void) {
	const { AlertModal, AlertActionButton } = Design as any
	const alerts = AlertActionCreators as any
	const key = `hide-servers-hide-notice-${Date.now()}`
	alerts.openAlert(
		key,
		<AlertModal
			title="Hide this note?"
			content="It won't be shown again, even after updates."
			actions={
				<>
					<AlertActionButton
						text="Hide"
						variant="primary"
						onPress={() => {
							alerts.dismissAlert(key)
							onHide()
						}}
					/>
					<AlertActionButton text="Cancel" variant="secondary" onPress={() => alerts.dismissAlert(key)} />
				</>
			}
		/>,
	)
}

/**
 * The root page, on the shared base layout (see ghost-log): what the plugin does as a
 * notice card first (hideable for good, settings design guide §4.3, with its key fact repeated
 * in the scope line under it), then the Servers toggles (the point of the plugin) in a group of
 * their own, then the Advanced index, and the Reload escape hatch last. The server list
 * itself, the legacy custom bar and the debug probes each live on their own route --
 * inline, the list swamped everything else on the page.
 *
 * The notice is a plain secondary card rather than the yellow warning card ghost-log and
 * anti-ghost-ping use: hiding servers is local and harmless, so it gets information
 * styling, not warning styling.
 */
export default function Settings({
	api,
}: {
	api: ValencedPluginStartApi<HideServersDrawerStorage>
}) {
	// The changelog icon at the top right, and "What's new" once after an update.
	useChangelog()
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { Page } = components
	const { ScrollView, View } = ReactNative
	const { Stack, Text, Card, Button, TableRowGroup, TableRow, TableSwitchRow } = Design as any
	const { useNavigation } = ReactNavigationNative

	const navigation = useNavigation() as { navigate: (route: string) => void }

	// Subscribed for the re-render, not the value: hiddenIds()/hiddenFolderIds() below stay
	// current as toggles flip on the Servers page and persist() writes through.
	const stored = api.jsonStorage.use()

	const servers = hiddenIds().length
	const folders = hiddenFolderIds().length
	const hiddenCount = servers + folders
	const channels = hiddenChannelIds().length

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					{stored?.noticeDismissed ? null : (
						<Card variant="secondary" border="none">
							<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
								<Text variant="text-md/semibold" color="text-default">
									Hiding is local to this device
								</Text>
								<Text color="text-muted" variant="text-sm/normal" style={{ marginTop: 8 }}>
									Nobody else sees any of this. The stock server bar does the hiding itself, so
									folders, unread badges and drag-to-reorder all behave exactly as stock.
								</Text>
								<View style={{ marginTop: 12, alignItems: "flex-start" }}>
									<Button
										text="Don't show again"
										size="sm"
										variant="secondary"
										onPress={() =>
											confirmHideNotice(() => api.jsonStorage.set({ noticeDismissed: true }))
										}
									/>
								</View>
							</View>
						</Card>
					)}
					<Text color="text-muted" variant="text-sm/normal">
						Hiding only changes this phone. Nobody else sees it.
					</Text>

					<TableRowGroup hasIcons>
						<TableRow
							label="Servers"
							subLabel={
								hiddenCount
									? `${servers} server${servers === 1 ? "" : "s"}, ${folders} folder${folders === 1 ? "" : "s"} hidden`
									: "Nothing hidden yet"
							}
							icon={rowIcon("FolderIcon", "ServerIcon", "ic_folder")}
							arrow
							onPress={() => navigation.navigate(SERVERS_ROUTE)}
						/>
						<TableRow
							label="Channels"
							subLabel={
								channels
									? `${channels} channel${channels === 1 ? "" : "s"}, categor${channels === 1 ? "y" : "ies"} or thread${channels === 1 ? "" : "s"} hidden`
									: 'Nothing hidden yet. Long-press a channel and pick "Hide channel"'
							}
							icon={rowIcon("EyeSlashIcon", "ic_hide")}
							arrow
							onPress={() => navigation.navigate(CHANNELS_ROUTE)}
						/>
					</TableRowGroup>

					<TableRowGroup hasIcons>
						<TableSwitchRow
							label="Hide their emoji too"
							subLabel="Leaves hidden servers' emoji out of the emoji picker and autocomplete. Needs a reload."
							icon={rowIcon("ReactionIcon", "EmojiIcon", "ic_emoji_24px")}
							value={hideEmoji()}
							onValueChange={(value: boolean) => {
								setHideEmoji(value)
								// Settings that need a reload use the stock prompt (settings design guide §3.10).
								try {
									api.plugin.requireReload()
								} catch (error) {
									reportError("[HideServersDrawer] requireReload failed:", error)
								}
							}}
						/>
					</TableRowGroup>

					<TableRowGroup title="Developer" hasIcons>
						{DEBUG && (<TableRow
							label="Debug"
							subLabel="Legacy custom bar, stock-bar probes and module dumps"
							icon={rowIcon("BugIcon")}
							arrow
							onPress={() => navigation.navigate(DEBUG_ROUTE)}
						/>)}
						<TableRow
							label="Reload Discord"
							subLabel="Opens Valenced's Reload Required prompt."
							icon={rowIcon("RefreshIcon", "ic_refresh")}
							onPress={() => {
								try {
									api.plugin.requireReload()
								} catch (error) {
									reportError("[HideServersDrawer] requireReload failed:", error)
									showToast("Couldn't mark for reload — see the log.")
								}
							}}
						/>
					</TableRowGroup>
					<Credit />
				</Stack>
			</ScrollView>
		</Page>
	)
}
