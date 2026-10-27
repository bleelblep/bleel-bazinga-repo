export type Mode = "calendar" | "relative" | "custom" | "iso"

export interface TimestampStorage {
	selected: Mode
	customFormat: string
	separateMessages?: boolean
}

/** Also the fallback for every read -- see the note in hide-call-buttons' DEFAULTS. */
export const DEFAULTS: TimestampStorage = {
	selected: "calendar",
	customFormat: "dddd, MMMM Do YYYY, h:mm:ss a",
	separateMessages: false,
}

// `revenge.discord.common.moment` doesn't exist -- confirmed from revenge-bundle-next's own
// source (lib/discord/src/common/index.ts only exports Logger, Tokens, flux, utils,
// Constants), and was a bad guess by analogy with classic Revenge's moment.js binding (same
// mistake as the chroma one in the staff-tags plugin). Every mode below is implemented with
// plain Date math instead, matching moment's default English output closely enough for a
// chat timestamp -- not a full moment.js replacement.

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const MONTHS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
]

function toDate(value: unknown): Date | undefined {
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value
	if (typeof value === "number" || typeof value === "string") {
		const date = new Date(value)
		return Number.isNaN(date.getTime()) ? undefined : date
	}
	return undefined
}

function pad(n: number): string {
	return String(n).padStart(2, "0")
}

function ordinal(n: number): string {
	const suffixes = ["th", "st", "nd", "rd"]
	const v = n % 100
	return `${n}${suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]}`
}

function time12(d: Date): string {
	const h = d.getHours() % 12 || 12
	return `${h}:${pad(d.getMinutes())} ${d.getHours() >= 12 ? "PM" : "AM"}`
}

function startOfDay(d: Date): number {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** Mirrors moment's default `calendar()` output closely enough for a chat timestamp. */
function calendar(d: Date, now: Date): string {
	const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000)

	if (diffDays === 0) return `Today at ${time12(d)}`
	if (diffDays === 1) return `Yesterday at ${time12(d)}`
	if (diffDays === -1) return `Tomorrow at ${time12(d)}`
	if (diffDays > 1 && diffDays < 7) return `Last ${WEEKDAYS[d.getDay()]} at ${time12(d)}`
	if (diffDays < -1 && diffDays > -7) return `${WEEKDAYS[d.getDay()]} at ${time12(d)}`
	return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`
}

/** Mirrors moment's default `fromNow()` output closely enough for a chat timestamp. */
function relative(d: Date, now: Date): string {
	const diffMs = now.getTime() - d.getTime()
	const future = diffMs < 0
	const sec = Math.round(Math.abs(diffMs) / 1000)
	const min = Math.round(sec / 60)
	const hr = Math.round(min / 60)
	const day = Math.round(hr / 24)
	const month = Math.round(day / 30)
	const year = Math.round(day / 365)

	let text: string
	if (sec < 45) text = "a few seconds"
	else if (sec < 90) text = "a minute"
	else if (min < 45) text = `${min} minutes`
	else if (min < 90) text = "an hour"
	else if (hr < 22) text = `${hr} hours`
	else if (hr < 36) text = "a day"
	else if (day < 26) text = `${day} days`
	else if (day < 46) text = "a month"
	else if (day < 320) text = `${month} months`
	else if (day < 548) text = "a year"
	else text = `${year} years`

	return future ? `in ${text}` : `${text} ago`
}

// Longest tokens first so e.g. "dddd" matches before "ddd" -- a single regex pass means the
// replacement text is never re-scanned for further token matches (unlike sequential global
// replaces, which can cascade into already-substituted text).
const TOKEN_RE = /dddd|ddd|dd|d|MMMM|MMM|MM|M|YYYY|YY|Do|DD|D|HH|H|hh|h|mm|m|ss|s|A|a/g

/** Supports the common moment.js tokens; not the full moment format-string language. */
function applyCustomFormat(d: Date, fmt: string): string {
	const weekday = WEEKDAYS[d.getDay()]
	const month = MONTHS[d.getMonth()]
	const day = d.getDate()
	const h24 = d.getHours()
	const h12 = h24 % 12 || 12

	const replacements: Record<string, string> = {
		dddd: weekday,
		ddd: weekday.slice(0, 3),
		dd: weekday.slice(0, 2),
		d: String(d.getDay()),
		MMMM: month,
		MMM: month.slice(0, 3),
		MM: pad(d.getMonth() + 1),
		M: String(d.getMonth() + 1),
		Do: ordinal(day),
		DD: pad(day),
		D: String(day),
		YYYY: String(d.getFullYear()),
		YY: String(d.getFullYear()).slice(-2),
		HH: pad(h24),
		H: String(h24),
		hh: pad(h12),
		h: String(h12),
		mm: pad(d.getMinutes()),
		m: String(d.getMinutes()),
		ss: pad(d.getSeconds()),
		s: String(d.getSeconds()),
		A: h24 >= 12 ? "PM" : "AM",
		a: h24 >= 12 ? "pm" : "am",
	}

	return fmt.replace(TOKEN_RE, token => replacements[token] ?? token)
}

/** Format a message timestamp. Never throws -- an unparseable timestamp falls back to the
 *  raw string rather than taking down the whole chat view render. */
export default function renderTimestamp(timestamp: unknown, mode: Mode, customFormat?: string): string {
	const date = toDate(timestamp)
	if (!date) return typeof timestamp === "string" ? timestamp : ""

	try {
		const now = new Date()
		switch (mode) {
			case "relative":
				return relative(date, now)
			case "iso":
				return date.toISOString()
			case "custom":
				return applyCustomFormat(date, customFormat ?? "dddd, MMMM Do YYYY, h:mm:ss a")
			case "calendar":
			default:
				return calendar(date, now)
		}
	} catch {
		return typeof timestamp === "string" ? timestamp : ""
	}
}
