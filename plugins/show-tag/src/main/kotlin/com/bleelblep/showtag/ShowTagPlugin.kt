@file:JvmName("ShowTagPlugin")

package com.bleelblep.showtag

import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.AbsoluteSizeSpan
import android.text.style.ForegroundColorSpan
import android.util.TypedValue
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import app.valenced.plugins.PluginScope
import app.valenced.plugins.plugin
import app.valenced.xposed.api.registerNativeMethod
import java.lang.reflect.Method
import java.util.WeakHashMap

/**
 * Show Tag's native half, for "Below the name": the username on its own small, dim line under the
 * author's name.
 *
 * The JS half (patches/rowManager.ts) puts the username in the row's tag slot (`tagText`, drawn by `MessageTagView` after
 * the name) and, when "Below the name" is on, marks it with `tagType = "show-tag-below"`. After each
 * bind of `com.discord.chat.presentation.message.MessageView` this hides that tag and shows the same
 * text, in the same colour, on a line under the name. Where this half doesn't run (iOS, or a Discord
 * build whose row it can't find) the tag just stays next to the name.
 *
 * Layout (352.2 APK, `res/layout/message_view.xml`): the header is a horizontal LinearLayout (id
 * `header`) holding the role icon, the role dot and a ConstraintLayout with the name, its chips, the
 * tag and the time, all centred on the name. A second line can't go inside that ConstraintLayout
 * without its (minified) layout params, so the ConstraintLayout is moved into a vertical
 * LinearLayout of ours, in the same place with the same layout params, with our line under it.
 * Discord's binding keeps direct references to its views, so nothing it reads moves. The row is
 * wrapped once and reused as Discord recycles it; on stop every row is put back as it was.
 *
 * When another plugin's tag already holds the slot (Staff Tags, Pronouns), the JS half leaves that
 * tag alone and sends the username in `tagType` instead: `show-tag-extra|<inline|below>|<argb>|<text>`.
 * `below` uses the same line under the name, without hiding the other tag. `inline` appends the
 * username, small and in the given colour, to the end of the name's own text, before the tag.
 *
 * Purely local UI: no network, no dispatch, no store writes. Status never holds message text.
 */

private const val MESSAGE_VIEW = "com.discord.chat.presentation.message.MessageView"
private const val MESSAGE = "com.discord.chat.bridge.Message"
private const val MARKER = "show-tag-below"
private const val EXTRA = "show-tag-extra|"
private const val TEXT_SP = 12f

/** One wrapped row: our stack, our line, and where the name row came from, to put it back. */
private class Wrap(
	val outer: ViewGroup,
	val stack: LinearLayout,
	val nameRow: View,
	val line: TextView,
	val originalParams: ViewGroup.LayoutParams,
)

internal class BelowHooks(private val scope: PluginScope) {
	private val messageViewClass: Class<*> = load(MESSAGE_VIEW)
	private val messageClass: Class<*> = load(MESSAGE)

	private val bind: Method = findBind()
	private val tagType: Method = getter("getTagType")
	private val tagText: Method = getter("getTagText")
	private val tagTextColor: Method = getter("getTagTextColor")

	private val wraps = WeakHashMap<ViewGroup, Wrap>()

	/**
	 * Names we appended to: what Discord set, and what we set. If Discord skips setting the same
	 * name again on a recycled row, the text is still ours, and is put back before appending again.
	 */
	private class Appended(val original: CharSequence, val ours: CharSequence)
	private val appended = WeakHashMap<TextView, Appended>()

	@Volatile private var shown = 0
	@Volatile private var lastSkip: String? = null
	@Volatile private var lastError: String? = null

	private val unhook: Unhook = hookMethod(bind, after = ::afterBind)

	val signature: String = bind.toGenericString()

	fun status(): Map<String, Any?> = mapOf(
		"hooked" to true,
		// Understands show-tag-extra (1.3.6+); the JS half only sends it when this is true.
		"extras" to true,
		"method" to signature,
		"rowsWrapped" to wraps.size,
		"linesShown" to shown,
		"lastSkip" to lastSkip,
		"lastError" to lastError,
	)

	private fun load(name: String): Class<*> = runCatching { scope.classLoader.loadClass(name) }
		.getOrElse { error("$name not found on this Discord version") }

	private fun getter(name: String): Method = messageClass.methods.firstOrNull {
		it.parameterTypes.isEmpty() && it.name == name
	} ?: error("Message.$name not found on this Discord version")

	/** The row bind: first parameter Message, more than six parameters, one a Function0 (as Speech Bubbles finds it). */
	private fun findBind(): Method {
		val matches = messageViewClass.declaredMethods.filter { m ->
			val p = m.parameterTypes
			p.size > 6 && p[0].name == messageClass.name && p.any { it.name == "kotlin.jvm.functions.Function0" }
		}
		if (matches.isEmpty()) error("MessageView bind (Message, …, Function0, …) not found on this Discord version")
		if (matches.size > 1) scope.log.w("${matches.size} MessageView bind candidates; using the first")
		return matches.first().apply { isAccessible = true }
	}

	private fun id(row: View, name: String): Int {
		val res = row.resources
		val own = res.getIdentifier(name, "id", row.context.packageName)
		return if (own != 0) own else res.getIdentifier(name, "id", "com.discord")
	}

	private fun fail(where: String, e: Throwable) {
		val msg = "$where: ${e.javaClass.simpleName}"
		if (lastError != msg) scope.log.w(msg)
		lastError = msg
	}

	private fun afterBind(param: HookParam) {
		val row = param.thisObject as? ViewGroup ?: return
		try {
			val message = param.args.getOrNull(0)
			val type = if (message != null) tagType.invoke(message) as? String else null
			val name = row.findViewById<TextView>(id(row, "author_name"))
			name?.let(::restoreName)

			// Our own tag, to move under the name.
			val own = type == MARKER
			// Someone else's tag holds the slot: the username comes in the tagType.
			val extra = if (type != null && type.startsWith(EXTRA)) parseExtra(type) else null

			if (name != null && extra != null && !extra.below) {
				appendToName(name, extra)
				wraps[row]?.line?.visibility = View.GONE
				return
			}

			val text = when {
				own -> tagText.invoke(message) as? String
				extra != null -> extra.text
				else -> null
			}
			if (text.isNullOrEmpty() || name == null) {
				wraps[row]?.line?.visibility = View.GONE
				return
			}
			val wrap = wraps[row] ?: wrap(row, name) ?: return
			// Discord sets the tag's visibility on every bind, so hiding it here lasts for this bind only.
			if (own) row.findViewById<View>(id(row, "message_tag_view"))?.visibility = View.GONE
			wrap.line.text = text
			val color = if (own) tagTextColor.invoke(message) as? Int else extra?.color
			color?.let(wrap.line::setTextColor)
			wrap.line.visibility = if (name.visibility == View.VISIBLE) View.VISIBLE else View.GONE
			shown++
		} catch (e: Throwable) {
			fail("bind", e)
		}
	}

	private class Extra(val below: Boolean, val color: Int?, val text: String)

	/** `show-tag-extra|<inline|below>|<argb>|<text>`; null when it doesn't parse. */
	private fun parseExtra(type: String): Extra? {
		val parts = type.removePrefix(EXTRA).split('|', limit = 3)
		if (parts.size != 3 || parts[2].isEmpty()) return null
		return Extra(parts[0] == "below", parts[1].toLongOrNull()?.toInt(), parts[2])
	}

	/** Puts back the name Discord set, if the text is still the one we appended to. */
	private fun restoreName(name: TextView) {
		val last = appended.remove(name) ?: return
		if (name.text === last.ours) name.text = last.original
	}

	/** "Name @user": the username small and dim at the end of the name's own text. */
	private fun appendToName(name: TextView, extra: Extra) {
		val original = name.text ?: return
		val size = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, TEXT_SP, name.resources.displayMetrics).toInt()
		val ours = SpannableStringBuilder(original).apply {
			append(' ')
			val start = length
			append(extra.text)
			setSpan(AbsoluteSizeSpan(size), start, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
			extra.color?.let { setSpan(ForegroundColorSpan(it), start, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE) }
		}
		name.text = ours
		// Read back: a TextView may copy what it is given, and restoreName compares by identity.
		appended[name] = Appended(original, name.text)
		shown++
	}

	/** Moves the name row into a vertical stack of ours with the line under it. Null if the layout isn't the expected one. */
	private fun wrap(row: ViewGroup, name: TextView): Wrap? {
		val nameRow = name.parent as? ViewGroup ?: return skip("name has no parent")
		val outer = nameRow.parent as? LinearLayout ?: return skip("name row not in a LinearLayout")
		if (outer.id != id(row, "header")) return skip("name row not in the header")
		val index = outer.indexOfChild(nameRow)
		val params = nameRow.layoutParams ?: return skip("name row has no layout params")

		val context = row.context
		val line = TextView(context).apply {
			setTextSize(TypedValue.COMPLEX_UNIT_SP, TEXT_SP)
			maxLines = 1
			ellipsize = android.text.TextUtils.TruncateAt.END
			includeFontPadding = false
			importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
			visibility = View.GONE
		}
		val stack = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }

		outer.removeViewAt(index)
		stack.addView(nameRow, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
		stack.addView(line, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT))
		outer.addView(stack, index, params)
		return Wrap(outer, stack, nameRow, line, params).also { wraps[row] = it }
	}

	private fun skip(reason: String): Wrap? {
		lastSkip = reason
		return null
	}

	/** Unhooks and puts every row back as Discord built it. Main thread (plugin stop). */
	fun dispose() {
		unhook.unhook()
		for (name in appended.keys.toList()) runCatching { restoreName(name) }
		appended.clear()
		for (wrap in wraps.values) {
			runCatching {
				val index = wrap.outer.indexOfChild(wrap.stack)
				if (index < 0) return@runCatching
				wrap.outer.removeViewAt(index)
				wrap.stack.removeView(wrap.nameRow)
				wrap.outer.addView(wrap.nameRow, index, wrap.originalParams)
			}
		}
		wraps.clear()
	}
}

val showTagPlugin = plugin {
	var hooks: BelowHooks? = null
	var startError: String? = null

	start {
		registerNativeMethod("${manifest.id}.status") { _ ->
			hooks?.status() ?: mapOf("hooked" to false, "error" to startError)
		}
		// Never throws: throwing here would disable the whole plugin, JS half included. If the row
		// bind or a Message getter is missing, "Below the name" just stays next to the name.
		try {
			hooks = BelowHooks(this)
			log.i("hooked ${hooks?.signature}")
		} catch (e: Throwable) {
			startError = e.message ?: e.javaClass.simpleName
			log.w("Below the name unavailable: $startError")
		}
	}

	stop {
		hooks?.dispose()
		hooks = null
	}
}
