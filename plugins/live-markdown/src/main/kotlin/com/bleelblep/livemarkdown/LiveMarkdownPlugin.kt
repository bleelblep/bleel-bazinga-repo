@file:JvmName("LiveMarkdownPlugin")

package com.bleelblep.livemarkdown

import android.graphics.Typeface
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.Spanned
import android.text.TextWatcher
import android.view.ActionMode
import android.widget.TextView
import app.valenced.plugins.PluginScope
import app.valenced.plugins.plugin
import app.valenced.xposed.api.registerNativeMethod
import java.util.WeakHashMap

/**
 * Styles markdown in the message box as you type it. Discord's box is `DCDChatInput`; its own
 * styling (mentions, emoji) arrives from JS as "chat nodes" that become `DCDInputSpan`s, and
 * `ChatInputRootView.clearAndApplyChatNodes` only ever removes those (checked on 348), so spans
 * of ours survive alongside. Only spans are added: the text Discord reads and sends is untouched.
 *
 * A TextWatcher is attached the first time a box changes (hooked through `TextView.onTextChanged`,
 * which DCDChatInput doesn't override) and re-parses the whole text after every edit; messages are
 * at most a few thousand characters, so that's cheap.
 *
 * JS owns the settings: `start` and every write push them through `setSettings`, and nothing
 * here is saved to disk.
 */

internal object Settings {
	@Volatile var headings = true
	@Volatile var dimMarkers = true
	@Volatile var monoCode = true
	/** The selection-menu formats that are switched on (Format ids). */
	@Volatile var menu: Set<String> = Format.entries.map { it.id }.toSet()
}

private fun enabledFormats() = Format.entries.filter { it.id in Settings.menu }

private const val CHAT_INPUT = "com.discord.chat.input.views.DCDChatInput"
/** Discord's link blue. */
private const val LINK_COLOR = 0xFF00A8FC.toInt()

private fun withAlpha(color: Int, alpha: Int) = (color and 0x00FFFFFF) or (alpha shl 24)

private class Wanted(val start: Int, val end: Int, val span: MdSpan) {
	val id = "${span.key}@$start-$end"
}

private fun wantedSpans(view: TextView, text: String): List<Wanted> {
	val color = view.currentTextColor
	val out = ArrayList<Wanted>()
	fun add(run: Run, span: MdSpan) { out += Wanted(run.start, run.end, span) }
	for (run in Markdown.parse(text)) {
		when (run.kind) {
			Kind.MARKER -> if (Settings.dimMarkers) add(run, ColorMd(withAlpha(color, 0x66)))
			Kind.BOLD -> add(run, StyleMd(Typeface.BOLD))
			Kind.ITALIC -> add(run, StyleMd(Typeface.ITALIC))
			Kind.UNDERLINE -> add(run, UnderlineMd())
			Kind.STRIKE -> add(run, StrikeMd())
			Kind.SPOILER -> add(run, BackgroundMd(withAlpha(color, 0x38)))
			Kind.CODE -> {
				add(run, BackgroundMd(withAlpha(color, 0x1F)))
				if (Settings.monoCode) add(run, MonoMd())
			}
			Kind.LINK -> add(run, ColorMd(LINK_COLOR))
			Kind.H1, Kind.H2, Kind.H3 -> {
				add(run, StyleMd(Typeface.BOLD))
				if (Settings.headings) add(run, SizeMd(when (run.kind) { Kind.H1 -> 1.5f; Kind.H2 -> 1.3f; else -> 1.15f }))
			}
			Kind.SUBTEXT -> {
				add(run, ColorMd(withAlpha(color, 0xA6)))
				if (Settings.headings) add(run, SizeMd(0.85f))
			}
			Kind.QUOTE -> add(run, ColorMd(withAlpha(color, 0x80)))
		}
	}
	return out
}

/**
 * The hooks and the boxes they have attached to, made in `start` and thrown away in `stop`, so a
 * restart begins from nothing. Hooks go through `XposedCompat.kt`, never `de.robv` by name (see
 * that file). Main thread only for [watchers]: the hook runs where the text changes, and
 * [setSettings] and [dispose] post there.
 */
internal class MarkdownHooks(private val scope: PluginScope) {
	private val mainHandler = Handler(Looper.getMainLooper())
	private val watchers = WeakHashMap<TextView, TextWatcher>()

	/** The one Discord name this plugin depends on. Missing means a Discord build we don't know. */
	private val chatInputClass: Class<*> = runCatching { scope.classLoader.loadClass(CHAT_INPUT) }
		.getOrElse { error("$CHAT_INPUT not found on this Discord version") }

	private val unhooks: List<Unhook> = listOf(
		hookMethod(
			TextView::class.java.getDeclaredMethod(
				"onTextChanged",
				CharSequence::class.java,
				Int::class.javaPrimitiveType,
				Int::class.javaPrimitiveType,
				Int::class.javaPrimitiveType,
			),
			after = ::onTextChanged,
		),
		hookMethod(
			TextView::class.java.getMethod("setCustomSelectionActionModeCallback", ActionMode.Callback::class.java),
			before = ::onSetSelectionCallback,
		),
	)

	/** Takes the settings JS sent and restyles every open box with them. */
	fun setSettings(settings: Map<*, *>) {
		(settings["headings"] as? Boolean)?.let { Settings.headings = it }
		(settings["dimMarkers"] as? Boolean)?.let { Settings.dimMarkers = it }
		(settings["monoCode"] as? Boolean)?.let { Settings.monoCode = it }
		when (val menu = settings["menu"]) {
			is List<*> -> Settings.menu = menu.filterIsInstance<String>().toSet()
			is Array<*> -> Settings.menu = menu.filterIsInstance<String>().toSet()
		}
		mainHandler.post {
			for (view in watchers.keys.toList()) (view.text as? Editable)?.let { restyle(view, it) }
		}
	}

	/** Unhooks, detaches from every box, strips our spans and puts Discord's own menu callback back. */
	fun dispose() {
		for (unhook in unhooks) unhook.unhook()
		mainHandler.post {
			for ((view, watcher) in watchers.entries.toList()) {
				runCatching {
					view.removeTextChangedListener(watcher)
					clear(view)
					(view.customSelectionActionModeCallback as? FormatCallback)?.let { view.customSelectionActionModeCallback = it.inner }
				}
			}
			watchers.clear()
		}
	}

	/** Brings the box's spans in line with its text, adding and removing only what changed. */
	private fun restyle(view: TextView, text: Editable) {
		runCatching {
			val wanted = wantedSpans(view, text.toString()).associateBy { it.id }
			val have = HashMap<String, Any>()
			for (span in text.getSpans(0, text.length, MdSpan::class.java)) {
				val id = "${span.key}@${text.getSpanStart(span)}-${text.getSpanEnd(span)}"
				if (id in wanted && id !in have) have[id] = span else text.removeSpan(span)
			}
			for ((id, w) in wanted) {
				if (id in have || w.end > text.length) continue
				text.setSpan(w.span, w.start, w.end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
			}
		}.onFailure { scope.log.w("restyle failed: $it") }
	}

	private fun clear(view: TextView) {
		val text = view.text as? Editable ?: return
		for (span in text.getSpans(0, text.length, MdSpan::class.java)) text.removeSpan(span)
	}

	/** Wraps whatever selection callback the box has with ours, once. */
	private fun ensureMenu(view: TextView) {
		val current = view.customSelectionActionModeCallback
		if (current is FormatCallback) return
		view.customSelectionActionModeCallback = FormatCallback(view, current, ::enabledFormats)
	}

	/** Discord sets its callback in ChatInputRootView's constructor; wrap it as it's set. */
	private fun onSetSelectionCallback(param: HookParam) {
		val view = param.thisObject as? TextView ?: return
		if (view.javaClass !== chatInputClass) return
		val callback = param.args.getOrNull(0) as? ActionMode.Callback
		if (callback !is FormatCallback) param.args[0] = FormatCallback(view, callback, ::enabledFormats)
	}

	private fun onTextChanged(param: HookParam) {
		val view = param.thisObject as? TextView ?: return
		if (view.javaClass !== chatInputClass) return
		// Boxes made before the plugin started missed the setter hook.
		runCatching { ensureMenu(view) }
		if (watchers.containsKey(view)) return
		val watcher = object : TextWatcher {
			override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
			override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) = Unit
			override fun afterTextChanged(s: Editable) = restyle(view, s)
		}
		view.addTextChangedListener(watcher)
		watchers[view] = watcher
		(view.text as? Editable)?.let { restyle(view, it) }
	}
}

val liveMarkdownPlugin = plugin {
	var hooks: MarkdownHooks? = null

	start {
		// Throws when the message box class or a hook is missing, which disables the plugin with the reason.
		hooks = MarkdownHooks(this)

		registerNativeMethod("${manifest.id}.setSettings") { args ->
			(args.firstOrNull() as? Map<*, *>)?.let { hooks?.setSettings(it) }
			null
		}
	}

	stop {
		hooks?.dispose()
		hooks = null
	}
}
