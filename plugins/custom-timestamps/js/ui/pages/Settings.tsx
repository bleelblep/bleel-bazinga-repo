import type { ReactElement } from "react"
import renderTimestamp, { DEFAULTS, type Mode, type TimestampStorage } from "../../lib/renderTimestamp"
import { CustomTimeInputRow } from "../components/CustomTimeInputRow"
import { FormatHelp } from "../components/FormatHelp"
import { SelectableRow } from "../components/SelectableRow"
import { useChangelog } from "../../../../../shared/changelog"
import * as components from "@valenced/components"
import { Design } from "@valenced/discord/design"
import * as ReactNative from "react-native"

interface ModeOption {
	label: string
	key: Mode
	renderExtra?: (selected: boolean) => ReactElement
}

export default function Settings({
	api,
}: {
	api: ValencedPluginStartApi<TimestampStorage>
}) {
	// The changelog icon at the top right, and "What's new" once after an update.
	useChangelog()
	// Read per-render, never at module scope -- see the "Never touch valenced.* at module scope"
	// section in the README.
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, TableRow, TableRowGroup, TableSwitchRow } = Design

	const { selected, customFormat, todayFormat, separateMessages, hour24 } =
		api.jsonStorage.use() ?? DEFAULTS

	const modes: ModeOption[] = [
		{ label: "Calendar", key: "calendar" },
		{ label: "Relative", key: "relative" },
		{ label: "ISO 8601", key: "iso" },
		{
			label: "Custom",
			key: "custom",
			renderExtra: selectedNow => (
				<>
					<CustomTimeInputRow
						value={customFormat}
						onChangeText={text => api.jsonStorage.set({ customFormat: text })}
						placeholder="dddd, MMMM Do YYYY, h:mm:ss a"
						disabled={!selectedNow}
					/>
					<TableRow
						label="Today's messages"
						subLabel={
							todayFormat?.trim()
								? renderTimestamp(new Date(), "custom", customFormat, !!hour24, todayFormat)
								: "Leave empty to use the format above. Try h:mm A for just the time, or {day} [at] h:mm A to also cover yesterday"
						}
						disabled={!selectedNow}
					/>
					<CustomTimeInputRow
						value={todayFormat ?? ""}
						onChangeText={text => api.jsonStorage.set({ todayFormat: text })}
						placeholder="h:mm a"
						disabled={!selectedNow}
					/>
				</>
			),
		},
	]

	return (
		<Page>
			<ScrollView>
				<Stack spacing={24}>
					<TableRowGroup title="Mode">
						{modes.map(({ label, key, renderExtra }) => (
							<>
								<SelectableRow
									key={key}
									label={label}
									subLabel={renderTimestamp(new Date(), key, customFormat, !!hour24)}
									selected={selected === key}
									onPress={() => api.jsonStorage.set({ selected: key })}
								/>
								{renderExtra?.(selected === key)}
							</>
						))}
					</TableRowGroup>
					{selected === "custom" ? (
						<FormatHelp onPick={preset => api.jsonStorage.set(preset)} />
					) : null}
					<TableRowGroup>
						<TableSwitchRow
							label="24-hour time"
							subLabel="For Calendar. Custom follows its own format: use H or HH for 24-hour"
							value={!!hour24}
							onValueChange={value => api.jsonStorage.set({ hour24: value })}
						/>
					</TableRowGroup>
					<TableRowGroup>
						<TableSwitchRow
							label="Separate messages"
							subLabel="Always shows username, avatar and timestamp for each message"
							value={!!separateMessages}
							onValueChange={value => api.jsonStorage.set({ separateMessages: value })}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
