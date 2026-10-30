import renderTimestamp from "../../lib/renderTimestamp"
import { Design } from "@valenced/discord/design"

interface Preset {
	label: string
	customFormat: string
	todayFormat: string
}

// Tapping one fills both boxes, so someone new can start from a working setup
const PRESETS: Preset[] = [
	{ label: "Date, but only the time today", customFormat: "MMM D YYYY, HH:mm", todayFormat: "HH:mm" },
	{ label: "Today at and Yesterday at", customFormat: "MMM D YYYY, h:mm A", todayFormat: "{day} [at] h:mm A" },
	{ label: "Day before month", customFormat: "DD/MM/YYYY HH:mm", todayFormat: "{day} [at] HH:mm" },
	{ label: "Full date and time", customFormat: "dddd, MMMM Do YYYY, h:mm:ss a", todayFormat: "" },
]

const LETTERS: [token: string, meaning: string][] = [
	["{day}", "Today, Yesterday, or the weekday"],
	["[text]", "Shown as written"],
	["dddd", "Weekday"],
	["ddd", "Short weekday"],
	["MMMM", "Month"],
	["MMM", "Short month"],
	["MM", "Month number, 2 digits"],
	["M", "Month number"],
	["Do", "Day with th, st or nd"],
	["DD", "Day, 2 digits"],
	["D", "Day"],
	["YYYY", "Year"],
	["YY", "Short year"],
	["HH", "Hour, 24-hour, 2 digits"],
	["H", "Hour, 24-hour"],
	["hh", "Hour, 12-hour, 2 digits"],
	["h", "Hour, 12-hour"],
	["mm", "Minutes"],
	["ss", "Seconds"],
	["A", "AM or PM"],
	["a", "am or pm"],
]

const DAY = 86_400_000

export function FormatHelp({
	onPick,
}: {
	onPick: (preset: { customFormat: string; todayFormat: string }) => void
}) {
	// Read per-render, never at module scope
	const { TableRow, TableRowGroup } = Design
	const now = new Date()
	const older = new Date(now.getTime() - 3 * DAY)
	const sample = (token: string) =>
		renderTimestamp(now, "custom", token === "[text]" ? "[at]" : token)

	return (
		<>
			<TableRowGroup title="Ready-made formats (tap to use, replaces both boxes)">
				{PRESETS.map(preset => (
					<TableRow
						key={preset.label}
						label={preset.label}
						subLabel={[
							renderTimestamp(now, "custom", preset.customFormat, false, preset.todayFormat),
							renderTimestamp(older, "custom", preset.customFormat, false, preset.todayFormat),
						].join("  ·  ")}
						onPress={() =>
							onPick({ customFormat: preset.customFormat, todayFormat: preset.todayFormat })
						}
					/>
				))}
			</TableRowGroup>
			<TableRowGroup
				title="Format letters"
				description="Letters inside words get swapped too, so put words in [brackets]: [Today at] h:mm A. The box for today's messages also covers yesterday when it has {day}."
			>
				{LETTERS.map(([token, meaning]) => (
					<TableRow key={token} label={token} subLabel={`${meaning}: ${sample(token)}`} />
				))}
			</TableRowGroup>
		</>
	)
}
