import type { ReactElement } from "react"
import renderTimestamp, { DEFAULTS, type Mode, type TimestampStorage } from "../../lib/renderTimestamp"
import { CustomTimeInputRow } from "../components/CustomTimeInputRow"
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
	const { Stack, TableRowGroup, TableSwitchRow } = Design

	const { selected, customFormat, separateMessages, hour24 } = api.jsonStorage.use() ?? DEFAULTS

	const modes: ModeOption[] = [
		{ label: "Calendar", key: "calendar" },
		{ label: "Relative", key: "relative" },
		{ label: "ISO 8601", key: "iso" },
		{
			label: "Custom",
			key: "custom",
			renderExtra: selectedNow => (
				<CustomTimeInputRow
					value={customFormat}
					onChangeText={text => api.jsonStorage.set({ customFormat: text })}
					placeholder="dddd, MMMM Do YYYY, h:mm:ss a"
					disabled={!selectedNow}
				/>
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
