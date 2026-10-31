package com.bleelblep.livemarkdown

import android.text.Editable
import android.view.ActionMode
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.ContextWrapper
import android.graphics.Rect
import android.widget.EditText
import android.widget.TextView

/**
 * Markdown options in the message box's text-selection menu (the Cut / Copy / Paste bar).
 *
 * Discord gives DCDChatInput its own selection callback (`ChatInputRootView$actionModeListener$1`,
 * 349.5): it adds nothing and only tracks whether the menu is open, for the keyboard layout. Ours
 * wraps it: Discord's half still runs for every call, and ours adds the items and handles their taps.
 *
 * Edits go through the box's Editable, so Discord's own `afterTextChanged` watcher picks them up
 * and syncs the draft to JS exactly as if they were typed.
 */

internal enum class Format(val id: String, val title: String) {
	BOLD("bold", "Bold"),
	ITALIC("italic", "Italic"),
	UNDERLINE("underline", "Underline"),
	STRIKE("strike", "Strikethrough"),
	SPOILER("spoiler", "Spoiler"),
	CODE("code", "Code"),
	CODE_BLOCK("codeBlock", "Code block"),
	LINK("link", "Link"),
	H1("h1", "Big heading"),
	H2("h2", "Medium heading"),
	H3("h3", "Small heading"),
	SUBTEXT("subtext", "Subtext"),
	QUOTE("quote", "Quote"),
	ANSI("ansi", "ANSI colour"),
}

/** Discord's ANSI codes and how its ```ansi blocks draw them. */
private val ANSI_CHOICES = listOf(
	"Red" to "31", "Green" to "32", "Yellow" to "33", "Blue" to "34", "Pink" to "35", "Cyan" to "36",
	"White" to "37", "Grey" to "30", "Bold" to "1", "Underline" to "4",
	"Dark blue background" to "40", "Orange background" to "41", "Grey-blue background" to "42",
	"Teal background" to "43", "Grey background" to "44", "Indigo background" to "45",
	"Light grey background" to "46", "White background" to "47",
)
private const val ESC = "\u001b"

/** Our menu items' group; Android's own items use group 0. */
private const val GROUP = 0x4C4D // "LM"
private const val ITEM_BASE = 0x4C4D00

/** Line prefixes that are headings: applying one replaces whichever of these a line has. */
private val HEADING_PREFIXES = listOf("### ", "## ", "# ", "-# ")

private fun linePrefix(format: Format) = when (format) {
	Format.H1 -> "# "
	Format.H2 -> "## "
	Format.H3 -> "### "
	Format.SUBTEXT -> "-# "
	Format.QUOTE -> "> "
	else -> null
}

private fun wrapMarkers(format: Format): Pair<String, String>? = when (format) {
	Format.BOLD -> "**" to "**"
	Format.ITALIC -> "*" to "*"
	Format.UNDERLINE -> "__" to "__"
	Format.STRIKE -> "~~" to "~~"
	Format.SPOILER -> "||" to "||"
	Format.CODE -> "`" to "`"
	Format.CODE_BLOCK -> "```\n" to "\n```"
	else -> null
}

/** Applies [format] to the selection in [view]. */
internal fun applyFormat(view: TextView, format: Format) {
	val text = view.text as? Editable ?: return
	var start = minOf(view.selectionStart, view.selectionEnd).coerceAtLeast(0)
	var end = maxOf(view.selectionStart, view.selectionEnd).coerceAtMost(text.length)
	if (start > end) start = end

	if (format == Format.ANSI) return pickAnsi(view, start, end)
	linePrefix(format)?.let { return applyLinePrefix(view, text, start, end, it, format == Format.QUOTE) }
	if (format == Format.LINK) {
		// [selection](|) with the cursor where the address goes.
		text.insert(end, "]()")
		text.insert(start, "[")
		val cursor = end + 3
		(view as? EditText)?.setSelection(cursor.coerceAtMost(text.length))
		return
	}
	val (open, close) = wrapMarkers(format) ?: return
	toggleWrap(view, text, start, end, open, close)
}

/** The activity behind [context]: the box's context is a React wrapper, not the activity itself. */
private fun activityOf(context: Context): Activity? {
	var c: Context? = context
	while (c != null) {
		if (c is Activity) return c
		runCatching { (c.javaClass.getMethod("getCurrentActivity").invoke(c) as? Activity)?.let { return it } }
		c = (c as? ContextWrapper)?.baseContext
	}
	return null
}

/** Asks for a colour, then colours [start]..[end]. */
private fun pickAnsi(view: TextView, start: Int, end: Int) {
	val activity = activityOf(view.context) ?: return
	AlertDialog.Builder(activity)
		.setTitle("ANSI colour")
		.setItems(ANSI_CHOICES.map { it.first }.toTypedArray()) { _, which -> applyAnsi(view, start, end, ANSI_CHOICES[which].second) }
		.setNegativeButton(android.R.string.cancel, null)
		.show()
}

/**
 * Inside an existing ```ansi block only the codes go in; anywhere else the selection also gets its
 * own ```ansi block, since Discord colours nothing outside one.
 */
private fun applyAnsi(view: TextView, start: Int, end: Int, code: String) {
	val text = view.text as? Editable ?: return
	val s = start.coerceIn(0, text.length)
	val e = end.coerceIn(s, text.length)
	val before = text.subSequence(0, s).toString()
	val open = before.lastIndexOf("```ansi")
	val inside = open >= 0 && before.indexOf("```", open + 7) < 0
	val color = "$ESC[${code}m"
	val reset = "$ESC[0m"
	val prefix = if (inside) color else "```ansi\n$color"
	val suffix = if (inside) reset else "$reset\n```"
	text.insert(e, suffix)
	text.insert(s, prefix)
	(view as? EditText)?.setSelection(s + prefix.length, e + prefix.length)
}

/** Whether [text] has [marker] at [at], and (for a single `*`) isn't part of a `**`. */
private fun hasMarker(text: CharSequence, at: Int, marker: String): Boolean {
	if (at < 0 || at + marker.length > text.length) return false
	if (text.subSequence(at, at + marker.length).toString() != marker) return false
	if (marker == "*") {
		val before = at > 0 && text[at - 1] == '*'
		val after = at + 1 < text.length && text[at + 1] == '*'
		// ***x*** counts: italic inside bold. **x** alone doesn't.
		if (before != after) return false
	}
	return true
}

private fun toggleWrap(view: TextView, text: Editable, start: Int, end: Int, open: String, close: String) {
	val edit = view as? EditText
	val selected = text.subSequence(start, end).toString()
	// The markers are inside the selection: **text** selected whole.
	if (selected.length >= open.length + close.length && selected.startsWith(open) && selected.endsWith(close) &&
		(open != "*" || !selected.startsWith("**") || selected.startsWith("***"))
	) {
		text.delete(end - close.length, end)
		text.delete(start, start + open.length)
		edit?.setSelection(start, end - open.length - close.length)
		return
	}
	// The markers are just outside it: only "text" selected inside **text**.
	if (hasMarker(text, start - open.length, open) && hasMarker(text, end, close)) {
		text.delete(end, end + close.length)
		text.delete(start - open.length, start)
		edit?.setSelection(start - open.length, end - open.length)
		return
	}
	text.insert(end, close)
	text.insert(start, open)
	edit?.setSelection(start + open.length, end + open.length)
}

/** Toggles [prefix] on every line the selection touches. Headings replace each other. */
private fun applyLinePrefix(view: TextView, text: Editable, start: Int, end: Int, prefix: String, quote: Boolean) {
	val content = text.toString()
	// The line the selection starts on, then every line that starts inside the selection.
	val lineStarts = arrayListOf(content.lastIndexOf('\n', start - 1) + 1)
	var i = content.indexOf('\n', start)
	while (i != -1 && i + 1 < end) {
		lineStarts += i + 1
		i = content.indexOf('\n', i + 1)
	}
	val all = lineStarts.all { content.startsWith(prefix, it) }
	var shift = 0
	// Last line first, so earlier offsets stay right.
	for (lineStart in lineStarts.asReversed()) {
		val existing = if (quote) null else HEADING_PREFIXES.firstOrNull { content.startsWith(it, lineStart) }
		when {
			all -> {
				text.delete(lineStart, lineStart + prefix.length)
				shift -= prefix.length
			}
			existing != null -> {
				text.replace(lineStart, lineStart + existing.length, prefix)
				shift += prefix.length - existing.length
			}
			else -> {
				text.insert(lineStart, prefix)
				shift += prefix.length
			}
		}
	}
	(view as? EditText)?.let {
		val newEnd = (end + shift).coerceIn(0, text.length)
		it.setSelection(lineStarts.first().coerceAtMost(newEnd), newEnd)
	}
}

/** Wraps Discord's selection callback with the format items. [enabled] is read on every open. */
internal class FormatCallback(
	private val view: TextView,
	val inner: ActionMode.Callback?,
	private val enabled: () -> List<Format>,
) : ActionMode.Callback2() {
	override fun onCreateActionMode(mode: ActionMode, menu: Menu): Boolean {
		val result = inner?.onCreateActionMode(mode, menu) ?: true
		runCatching {
			// Secondary category: after Android's own Cut/Copy/Paste, mostly in the ⋮ overflow.
			for ((index, format) in enabled().withIndex()) {
				menu.add(GROUP, ITEM_BASE + format.ordinal, Menu.CATEGORY_SECONDARY or index, format.title)
					.setShowAsAction(MenuItem.SHOW_AS_ACTION_IF_ROOM)
			}
		}
		return result
	}

	override fun onPrepareActionMode(mode: ActionMode, menu: Menu): Boolean = inner?.onPrepareActionMode(mode, menu) ?: false

	override fun onActionItemClicked(mode: ActionMode, item: MenuItem): Boolean {
		if (item.groupId == GROUP) {
			val format = Format.entries.getOrNull(item.itemId - ITEM_BASE) ?: return false
			runCatching { applyFormat(view, format) }
			mode.finish()
			return true
		}
		return inner?.onActionItemClicked(mode, item) ?: false
	}

	override fun onDestroyActionMode(mode: ActionMode) {
		inner?.onDestroyActionMode(mode)
	}

	override fun onGetContentRect(mode: ActionMode, view: View, outRect: Rect) {
		if (inner is ActionMode.Callback2) inner.onGetContentRect(mode, view, outRect) else super.onGetContentRect(mode, view, outRect)
	}
}
