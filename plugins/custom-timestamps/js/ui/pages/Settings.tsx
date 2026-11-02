import * as components from "@valenced/components"
import { Design } from "@valenced/discord/design"
import * as React from "react"
import * as ReactNative from "react-native"
import { useChangelog } from "../../../../../shared/changelog"
import { Credit } from "../../../../../shared/ui/credit"
import { FieldRow } from "../../../../../shared/ui/fieldGroup"
import { rowIcon } from "../../../../../shared/ui/icon"
import { useBottomPadding } from "../../../../../shared/ui/safeArea"
import renderTimestamp, { DEFAULTS, type Mode, type TimestampStorage } from "../../lib/renderTimestamp"
import { FormatLetters, Presets } from "../components/FormatHelp"

const DAY = 86_400_000

const MODES: { key: Mode; label: string; icon: [string, ...string[]] }[] = [
	{ key: "calendar", label: "Calendar", icon: ["CalendarIcon", "ClockIcon"] },
	{ key: "relative", label: "Relative", icon: ["TimerIcon", "ClockIcon"] },
	{ key: "iso", label: "ISO 8601", icon: ["CodeIcon", "TextIcon"] },
	{ key: "custom", label: "Custom", icon: ["PencilIcon", "TextIcon"] },
]

/**
 * A format box in a row (settings design guide §3.6). Keeps its own draft so typing isn't
 * interrupted while storage catches up, and saves every change.
 */
function FormatField({
	label,
	description,
	value,
	placeholder,
	example,
	onChange,
}: {
	label: string
	description: string
	/** What this box gives right now, shown under it as you type. */
	example: string
	value: string
	placeholder: string
	onChange: (text: string) => void
}) {
	const { TextInput, Text } = Design as any
	const [draft, setDraft] = React.useState(value)
	// A ready-made format replaces the saved value: follow it.
	React.useEffect(() => setDraft(value), [value])
	return (
		<FieldRow label={label} description={description}>
			<TextInput
				placeholder={placeholder}
				value={draft}
				returnKeyType="done"
				isClearable
				onChange={(next: string) => {
					setDraft(next)
					onChange(next)
				}}
			/>
			<Text variant="text-sm/semibold" color="text-default">
				{example}
			</Text>
		</FieldRow>
	)
}

/**
 * One page (settings design guide §2.1): the mode (each with its example), then (while Custom is picked) a ready-made start, the two boxes and the letters,
 * then the options.
 */
export default function Settings({
	api,
}: {
	api: ValencedPluginStartApi<TimestampStorage>
}) {
	// The changelog icon at the top right, and "What's new" once after an update.
	useChangelog()
	// Read per-render, never at module scope (docs/coding-rules.md rule 1).
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, TableRowGroup, TableSwitchRow, TableRadioGroup, TableRadioRow } = Design as any

	const s = { ...DEFAULTS, ...(api.jsonStorage.use() ?? {}) }
	const set = (patch: Partial<TimestampStorage>) => api.jsonStorage.set(patch)
	const now = new Date()
	const yesterday = new Date(now.getTime() - DAY)
	const earlier = new Date(now.getTime() - 3 * DAY)
	const show = (date: Date, mode: Mode = s.selected) =>
		renderTimestamp(date, mode, s.customFormat, !!s.hour24, s.todayFormat)

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRadioGroup
						key={`mode-${s.selected}`}
						title="Mode"
						hasIcons
						defaultValue={s.selected}
						onChange={(selected: Mode) => set({ selected })}
					>
						{MODES.map(mode => (
							<TableRadioRow
								key={mode.key}
								label={mode.label}
								subLabel={show(earlier, mode.key)}
								icon={rowIcon(...mode.icon)}
								value={mode.key}
							/>
						))}
					</TableRadioGroup>

					{s.selected === "custom" ? (
						<Presets
							customFormat={s.customFormat}
							todayFormat={s.todayFormat ?? ""}
							onPick={preset => set(preset)}
						/>
					) : null}
					{s.selected === "custom" ? (
						<TableRowGroup title="Custom format">
							<FormatField
								label="Format"
								description="Format letters are listed below. Put words in [brackets]."
								value={s.customFormat}
								example={`3 days ago: ${show(earlier, "custom")}`}
								placeholder="dddd, MMMM Do YYYY, h:mm:ss a"
								onChange={customFormat => set({ customFormat })}
							/>
							<FormatField
								label="Today's messages"
								description="Leave empty to use the format above. Try h:mm A for just the time, or {day} [at] h:mm A to cover yesterday too."
								value={s.todayFormat ?? ""}
								example={`Today: ${show(now, "custom")}  ·  Yesterday: ${show(yesterday, "custom")}`}
								placeholder="h:mm a"
								onChange={todayFormat => set({ todayFormat })}
							/>
						</TableRowGroup>
					) : null}
					{s.selected === "custom" ? <FormatLetters /> : null}

					<TableRowGroup title="Options" hasIcons>
						<TableSwitchRow
							label="24-hour time"
							subLabel={
								s.selected === "custom"
									? "For Calendar. Custom follows its own format: use H or HH for 24-hour"
									: "Shows 14:05 instead of 2:05 PM in Calendar"
							}
							icon={rowIcon("ClockIcon")}
							value={!!s.hour24}
							onValueChange={(value: boolean) => set({ hour24: value })}
						/>
						<TableSwitchRow
							label="Separate messages"
							subLabel="Shows the name, avatar and time on every message, not just the first of a run"
							icon={rowIcon("ListBulletsIcon", "ChatIcon")}
							value={!!s.separateMessages}
							onValueChange={(value: boolean) => set({ separateMessages: value })}
						/>
					</TableRowGroup>

					<Credit author="Fiery" />
				</Stack>
			</ScrollView>
		</Page>
	)
}
