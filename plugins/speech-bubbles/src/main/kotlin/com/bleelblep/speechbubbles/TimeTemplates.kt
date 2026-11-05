package com.bleelblep.speechbubbles

import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * Discord writes a time only on the first message of a run ("Today at 2:02 PM", with Timezones
 * "Today at 2:02 PM · 3:02 AM Tue"). Later messages of the run have none, so their pop-up would
 * only say "11:58 PM". This remembers, per author and channel, how the first message's time was
 * written and builds the same text for a later message from its own send time (the message id).
 *
 * Only what can be read back is reused: the "Today at " / "Yesterday at " wording (re-decided for
 * the later message's day), the 12/24-hour style of each time, and Timezones' offset between the
 * two times plus its rule of showing their weekday only when it isn't the same day there. Any other
 * prefix (a date, Custom Timestamps' wording) is dropped: later messages get the bare time, still
 * with Timezones' part.
 */

/** How one time was written: 12-hour (with its AM/PM spelling) or 24-hour (padded or not). */
internal data class TimeStyle(val twelve: Boolean, val ampmSpace: Boolean, val ampmLower: Boolean, val padded: Boolean) {
	fun format(minuteOfDay: Int): String {
		val h = (minuteOfDay / 60) % 24
		val m = minuteOfDay % 60
		val mm = m.toString().padStart(2, '0')
		if (!twelve) return (if (padded) h.toString().padStart(2, '0') else h.toString()) + ":" + mm
		val h12 = if (h % 12 == 0) 12 else h % 12
		var ampm = if (h < 12) "AM" else "PM"
		if (ampmLower) ampm = ampm.lowercase()
		return "$h12:$mm" + (if (ampmSpace) " " else "") + ampm
	}
}

internal class TimeTemplate(
	val channel: String,
	/** The main time had Discord's "Today at " / "Yesterday at " wording. */
	val dayWords: Boolean,
	val main: TimeStyle,
	/** Timezones: minutes to add to the main time for theirs, and how theirs was written. */
	val offset: Int?,
	val their: TimeStyle?,
	/** The first message's time was relative ("16 minutes ago", Custom Timestamps): later ones are too. */
	val relative: Boolean = false,
)

internal object TimeTemplates {
	private val time = Regex("""(\d{1,2})[:.](\d{2})(?:(\s?)([AaPp])\.?([Mm])\.?)?""")
	private val zone = Regex("""^(\d{1,2})[:.](\d{2})(?:(\s?)([AaPp])\.?([Mm])\.?)?(?:\s+(\p{L}+)\.?)?$""")
	private const val SEPARATOR = " · "
	/** A relative time with no clock time in it: "16 minutes ago", "just now", "an hour ago". */
	private val relativeWords = Regex("""\b(ago|just now|now|seconds?|minutes?|mins?|hours?|hrs?|days?|yesterday)\b""", RegexOption.IGNORE_CASE)

	private val byAuthor = object : LinkedHashMap<String, TimeTemplate>(64, 0.75f, true) {
		override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, TimeTemplate>?) = size > 300
	}

	fun clear() = synchronized(byAuthor) { byAuthor.clear() }

	/** Splits "main · their" (only when the part after the last separator is a time). */
	fun split(raw: String): Pair<String, String?> {
		val i = raw.lastIndexOf(SEPARATOR)
		if (i <= 0) return raw to null
		val after = raw.substring(i + SEPARATOR.length).trim()
		return if (zone.matches(after)) raw.substring(0, i).trim() to after else raw to null
	}

	private fun style(m: MatchResult): TimeStyle {
		val g = m.groupValues
		val twelve = g[4].isNotEmpty()
		return TimeStyle(twelve, g[3].isNotEmpty(), twelve && g[4][0].isLowerCase(), !twelve && g[1].length == 2)
	}

	private fun minutes(m: MatchResult): Int {
		val g = m.groupValues
		var h = g[1].toInt() % 24
		val min = g[2].toInt()
		if (g[4].isNotEmpty()) {
			val pm = g[4].equals("p", ignoreCase = true)
			h = (h % 12) + if (pm) 12 else 0
		}
		return h * 60 + min
	}

	/** Remembers how [raw] (a first message's short time, sent at [sentAt]) was written. */
	fun learn(author: String, channel: String, raw: String, sentAt: Long) {
		val (main, theirText) = split(raw)
		val mainMatch = time.findAll(main).lastOrNull()
		if (mainMatch == null) {
			if (relativeWords.containsMatchIn(main)) synchronized(byAuthor) {
				byAuthor[author] = TimeTemplate(channel, false, TimeStyle(false, false, false, false), null, null, relative = true)
			}
			return
		}
		val prefix = main.substring(0, mainMatch.range.first)
		// A prefix we can't re-decide (a date, Custom Timestamps' wording) isn't reused, but the
		// time styles and Timezones' offset still are (0.2.11 dropped the whole template).
		val dayWords = prefix == "Today at " || prefix == "Yesterday at "
		if (main.substring(mainMatch.range.last + 1).isNotBlank()) return
		var offset: Int? = null
		var their: TimeStyle? = null
		if (theirText != null) {
			val z = zone.matchEntire(theirText)
			if (z != null) {
				their = style(z)
				val weekday = z.groupValues[6].takeIf { it.isNotEmpty() }
				offset = pickOffset(minutes(mainMatch), minutes(z), sentAt, weekday)
			}
		}
		synchronized(byAuthor) { byAuthor[author] = TimeTemplate(channel, dayWords, style(mainMatch), offset, their) }
	}

	/**
	 * The offset (minutes, -24h..+24h) from the main time to theirs: of the two that give their
	 * clock time, the one whose day matches what Timezones showed (a weekday means another day),
	 * else the smaller one.
	 */
	private fun pickOffset(mainMin: Int, theirMin: Int, sentAt: Long, weekday: String?): Int {
		val d = Math.floorMod(theirMin - mainMin, 1440)
		val candidates = listOf(d, d - 1440).sortedBy { Math.abs(it) }
		for (c in candidates) {
			val shiftsDay = Math.floorDiv(mainMin + c, 1440) != 0
			if (weekday == null && !shiftsDay) return c
			if (weekday != null && shiftsDay && weekdayOf(sentAt + c * 60_000L).equals(weekday, ignoreCase = true)) return c
		}
		return candidates.first()
	}

	private fun weekdayOf(at: Long) = SimpleDateFormat("EEE", Locale.getDefault()).format(Date(at))

	private fun dayIndex(at: Long): Long {
		val c = Calendar.getInstance().apply { timeInMillis = at }
		return c.get(Calendar.YEAR) * 400L + c.get(Calendar.DAY_OF_YEAR)
	}

	/** Pieces for a later message sent at [sentAt]: (main, full) or null when there's no usable template. */
	fun build(author: String, channel: String, sentAt: Long): Pair<String, String>? {
		val t = synchronized(byAuthor) { byAuthor[author] } ?: return null
		if (t.channel != channel) return null
		if (t.relative) {
			val now = System.currentTimeMillis()
			val text = if (now - sentAt < 60_000L) "just now"
			else android.text.format.DateUtils.getRelativeTimeSpanString(sentAt, now, android.text.format.DateUtils.MINUTE_IN_MILLIS).toString()
			return text to text
		}
		val cal = Calendar.getInstance().apply { timeInMillis = sentAt }
		val minuteOfDay = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)
		var prefix = ""
		if (t.dayWords) {
			val today = dayIndex(System.currentTimeMillis())
			val day = dayIndex(sentAt)
			prefix = when {
				day == today -> "Today at "
				day == dayIndex(System.currentTimeMillis() - 86_400_000L) -> "Yesterday at "
				else -> ""
			}
		}
		val main = prefix + t.main.format(minuteOfDay)
		val offset = t.offset ?: return main to main
		val style = t.their ?: t.main
		val theirAt = sentAt + offset * 60_000L
		val theirMinute = Math.floorMod(minuteOfDay + offset, 1440)
		var their = style.format(theirMinute)
		// Timezones' rule: their weekday only when it isn't the same day for them.
		if (Math.floorDiv(minuteOfDay + offset, 1440) != 0) {
			their += " " + weekdayOf(theirAt)
		}
		return main to "$main$SEPARATOR$their"
	}
}
