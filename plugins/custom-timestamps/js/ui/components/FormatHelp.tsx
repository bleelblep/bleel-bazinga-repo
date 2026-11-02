import { Design } from "@valenced/discord/design"
import * as React from "react"
import { confirmDestructive } from "../../../../../shared/ui/confirm"
import { rowIcon } from "../../../../../shared/ui/icon"
import renderTimestamp from "../../lib/renderTimestamp"

interface Preset {
	id: string
	label: string
	customFormat: string
	todayFormat: string
}

// Tapping one fills both boxes, so someone new can start from a working setup
const PRESETS: Preset[] = [
	{ id: "time-today", label: "Just the time today", customFormat: "MMM D YYYY, HH:mm", todayFormat: "HH:mm" },
	{ id: "today-at", label: "Today at, Yesterday at", customFormat: "MMM D YYYY, h:mm A", todayFormat: "{day} [at] h:mm A" },
	{ id: "day-first", label: "Day before month", customFormat: "DD/MM/YYYY HH:mm", todayFormat: "{day} [at] HH:mm" },
	{ id: "full", label: "Full date and time", customFormat: "dddd, MMMM Do YYYY, h:mm:ss a", todayFormat: "" },
]

/** Not one of the presets: what's in the boxes was typed by hand. */
const OWN = "own"

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

/**
 * Ready-made formats as a choice list, above the boxes: the one in use is ticked, and "Your own"
 * is ticked when the boxes hold something else. Picking one over a format typed by hand asks
 * first, since it replaces both boxes.
 */
export function Presets({
	customFormat,
	todayFormat,
	onPick,
}: {
	customFormat: string
	todayFormat: string
	onPick: (preset: { customFormat: string; todayFormat: string }) => void
}) {
	// Read per-render, never at module scope
	const { TableRadioGroup, TableRadioRow } = Design as any
	const now = new Date()
	const older = new Date(now.getTime() - 3 * DAY)
	const current =
		PRESETS.find(p => p.customFormat === customFormat && p.todayFormat === (todayFormat ?? ""))?.id ??
		OWN

	const choose = (id: string) => {
		const preset = PRESETS.find(p => p.id === id)
		if (!preset || id === current) return
		const apply = () => onPick({ customFormat: preset.customFormat, todayFormat: preset.todayFormat })
		if (current !== OWN) return apply()
		confirmDestructive({
			title: "Replace your format?",
			body: `What you typed in both boxes is replaced with "${preset.label}".`,
			action: "Replace",
			onConfirm: apply,
		})
	}

	return (
		<TableRadioGroup
			// Remounts when the saved format changes, so a cancelled replace keeps the old tick.
			key={`preset-${current}-${customFormat}-${todayFormat}`}
			title="Start from"
			hasIcons
			defaultValue={current}
			onChange={choose}
		>
			{PRESETS.map(preset => (
				<TableRadioRow
					key={preset.id}
					label={preset.label}
					subLabel={[
						renderTimestamp(now, "custom", preset.customFormat, false, preset.todayFormat),
						renderTimestamp(older, "custom", preset.customFormat, false, preset.todayFormat),
					].join("\n")}
					icon={rowIcon("ClockIcon")}
					value={preset.id}
				/>
			))}
			{current === OWN ? (
				<TableRadioRow
					label="Your own"
					subLabel="What you typed below"
					icon={rowIcon("PencilIcon", "TextIcon")}
					value={OWN}
				/>
			) : null}
		</TableRadioGroup>
	)
}

/** Every format letter with an example, folded away behind one row until opened. */
export function FormatLetters() {
	// Read per-render, never at module scope
	const { TableRow, TableRowGroup } = Design as any
	const [open, setOpen] = React.useState(false)
	const now = new Date()
	const sample = (token: string) =>
		renderTimestamp(now, "custom", token === "[text]" ? "[at]" : token)

	return (
		<TableRowGroup
			title="Format letters"
			description={
				open
					? "Letters inside words get swapped too, so put words in [brackets]: [Today at] h:mm A. The box for today's messages also covers yesterday when it has {day}."
					: undefined
			}
			hasIcons
		>
			<TableRow
				label={open ? "Hide the letters" : "Show the letters"}
				subLabel={open ? undefined : "What each letter in a format stands for, with examples"}
				icon={rowIcon("CircleQuestionIcon", "CircleInformationIcon")}
				onPress={() => setOpen(!open)}
			/>
			{open
				? LETTERS.map(([token, meaning]) => (
						<TableRow key={token} label={token} subLabel={`${meaning}: ${sample(token)}`} />
					))
				: null}
		</TableRowGroup>
	)
}
