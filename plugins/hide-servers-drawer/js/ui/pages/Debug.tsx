import { instant, setInstant } from "../../lib/hidden"
import { dmAvatarHome, setDmAvatarHome, setStaticIcons, staticIcons } from "../../lib/prefs"
import { armDump, probeDmNavigation, probeSortedGuildStore, setStockBar, stockBar } from "../../lib/probe"
import { refresh } from "../../patches/sortedGuilds"
import { rowIcon } from "../icon"
import { useBottomPadding } from "../safeArea"
import { showToast as sharedToast } from "../../../../../shared/toast"
import * as components from "@valenced/components"
import { Design } from "@valenced/discord/design"
import * as react from "@valenced/react"
import * as ReactNative from "react-native"
import { reportError } from "../../../../../shared/report"

// Same shared/toast.ts helper as GuildRow/FolderRow -- valenced.utils.toast.show doesn't exist.
function showToast(content: string) {
	sharedToast(content, "HideServersDrawerToast")
}

/**
 * The legacy custom bar and the stock-bar probes, tucked away on their own route. The
 * probes print to `adb logcat -s ReactNativeJS` and none of it logs user data -- shapes,
 * key names and counts only.
 */
export default function Debug() {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { Page } = components
	const { React } = react
	const { ScrollView } = ReactNative
	const { Stack, TableRowGroup, TableRow, TableSwitchRow } = Design

	const [, bump] = React.useReducer((n: number) => n + 1, 0)

	const run = (label: string, probe: () => string) => {
		try {
			showToast(probe())
		} catch (error) {
			reportError(`[HideServersDrawer] ${label} failed:`, error)
			showToast("Probe failed — see the log.")
		}
	}

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup
						title="Legacy custom bar"
						description="A fallback in case a Discord update breaks stock-bar filtering. While it's on, the server bar is replaced with a rebuilt version: no drag-to-reorder, custom unread-DM rows. Its settings only matter while it's on."
						hasIcons
					>
						<TableSwitchRow
							label="Use the legacy custom bar"
							subLabel="Replaces the stock server bar while anything is hidden."
							icon={rowIcon("ClockIcon")}
							value={instant()}
							onValueChange={(v: boolean) => {
								setInstant(v)
								refresh()
								bump()
							}}
						/>
						<TableSwitchRow
							label="Disable animated server icons"
							subLabel="Show the still frame of animated (GIF) server icons instead."
							icon={rowIcon("ImageIcon", "ic_image")}
							value={staticIcons()}
							onValueChange={(v: boolean) => {
								setStaticIcons(v)
								refresh()
								bump()
							}}
						/>
						<TableSwitchRow
							label="Recent DM avatar on Home"
							subLabel="Show the most recent DM's avatar on the Home button instead of the stock icon."
							icon={rowIcon("ChatIcon")}
							value={dmAvatarHome()}
							onValueChange={(v: boolean) => {
								setDmAvatarHome(v)
								refresh()
								bump()
							}}
						/>
					</TableRowGroup>

					<TableRowGroup title="Stock bar" hasIcons>
						<TableSwitchRow
							label="Force untouched stock bar"
							subLabel="Ignore the legacy-bar setting and always render Discord's own bar — what the store filter already produces. Session only."
							icon={rowIcon("EyeSlashIcon")}
							value={stockBar()}
							onValueChange={(v: boolean) => {
								setStockBar(v)
								refresh()
								bump()
							}}
						/>
						<TableRow
							label="Dump stock bar structure"
							subLabel="Prints the stock bar's props and rendered component tree to the log on its next render. Shapes and key names only — never server data."
							icon={rowIcon("ListIcon", "SearchIcon")}
							onPress={() => {
								armDump()
								refresh()
								showToast("Armed — stock bar dumps on next render.")
							}}
						/>
					</TableRowGroup>

					<TableRowGroup title="Modules" hasIcons>
						<TableRow
							label="Probe DM navigation"
							subLabel="Dumps every navigation-action module's export names to the log, to find what the Home button should call."
							icon={rowIcon("SearchIcon", "MagnifyingGlassIcon", "ic_search")}
							onPress={() => run("nav probe", probeDmNavigation)}
						/>
						<TableRow
							label="Probe SortedGuildStore"
							subLabel="Lists the store's method names in the log."
							icon={rowIcon("SearchIcon", "ic_search")}
							onPress={() => run("store probe", probeSortedGuildStore)}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
