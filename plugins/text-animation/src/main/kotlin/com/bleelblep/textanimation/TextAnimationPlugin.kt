@file:JvmName("TextAnimationPlugin")

package com.bleelblep.textanimation

import android.graphics.Canvas
import android.widget.EditText
import android.widget.TextView
import app.valenced.plugins.plugin
import app.valenced.xposed.api.registerNativeMethod
import org.json.JSONObject
import java.io.File

/**
 * Letters fade, slide and unblur into the message box as you type, deleted ones fall away, and the
 * caret glides between positions. Discord's message box is `DCDChatInput`, a plain
 * `AppCompatEditText` that doesn't override `onDraw` (checked on 348), so everything hangs off
 * `TextView.onDraw` -- see TypingFx.kt.
 *
 * Inspired by the exteraGram "Text Animation" plugin (@mihailkotovski, @mishabotov, @private_let);
 * no code from it is used.
 */

internal object Settings {
	@Volatile var typing = true
	/** Milliseconds a letter takes to arrive, 120-900. */
	@Volatile var duration = 320
	@Volatile var slide = true
	/** How far below its spot a letter starts, in dp, 2-30. */
	@Volatile var slideDp = 10
	@Volatile var blur = true
	@Volatile var pop = false
	@Volatile var tilt = false
	/** "off", "drop" (letters fall away) or "dust". */
	@Volatile var deleteFx = "drop"
	@Volatile var cursor = true
	@Volatile var cursorTrail = true
	/** How quickly the caret catches up, per second, 6-40. */
	@Volatile var cursorSpeed = 18
	/** Every text field, not just the message box. */
	@Volatile var everywhere = false
	/** On while the settings page is open, so its try-it field animates. Not saved. */
	@Volatile var preview = false
}

private const val SETTINGS_FILE = "settings.json"
private const val CHAT_INPUT = "com.discord.chat.input.views.DCDChatInput"
private val DELETE_FX = setOf("off", "drop", "dust")
private val unhooks = mutableListOf<XC_MethodHook.Unhook>()
private val mainHandler = android.os.Handler(android.os.Looper.getMainLooper())

private fun settingsMap() = mapOf(
	"cursorSupported" to (android.os.Build.VERSION.SDK_INT >= 29),
	"typing" to Settings.typing,
	"duration" to Settings.duration,
	"slide" to Settings.slide,
	"slideDp" to Settings.slideDp,
	"blur" to Settings.blur,
	"pop" to Settings.pop,
	"tilt" to Settings.tilt,
	"deleteFx" to Settings.deleteFx,
	"cursor" to Settings.cursor,
	"cursorTrail" to Settings.cursorTrail,
	"cursorSpeed" to Settings.cursorSpeed,
	"everywhere" to Settings.everywhere,
)

/** Applies a JSON object or a map from JS; unknown or out-of-range values are ignored or clamped. */
private fun applySettings(get: (String) -> Any?) {
	(get("typing") as? Boolean)?.let { Settings.typing = it }
	(get("duration") as? Number)?.let { Settings.duration = it.toInt().coerceIn(120, 900) }
	(get("slide") as? Boolean)?.let { Settings.slide = it }
	(get("slideDp") as? Number)?.let { Settings.slideDp = it.toInt().coerceIn(2, 30) }
	(get("blur") as? Boolean)?.let { Settings.blur = it }
	(get("pop") as? Boolean)?.let { Settings.pop = it }
	(get("tilt") as? Boolean)?.let { Settings.tilt = it }
	(get("deleteFx") as? String)?.takeIf { it in DELETE_FX }?.let { Settings.deleteFx = it }
	(get("cursor") as? Boolean)?.let { Settings.cursor = it }
	(get("cursorTrail") as? Boolean)?.let { Settings.cursorTrail = it }
	(get("cursorSpeed") as? Number)?.let { Settings.cursorSpeed = it.toInt().coerceIn(6, 40) }
	(get("everywhere") as? Boolean)?.let { Settings.everywhere = it }
}

private val drawHook = object : XC_MethodHook() {
	override fun beforeHookedMethod(param: MethodHookParam) {
		val view = param.thisObject as? EditText ?: return
		runCatching {
			if (TypingFx.handles(view)) TypingFx.beforeDraw(view) else TypingFx.release(view)
		}.onFailure { XposedBridge.log("[TextAnimation] before draw failed: $it") }
	}

	override fun afterHookedMethod(param: MethodHookParam) {
		val view = param.thisObject as? EditText ?: return
		val canvas = param.args[0] as? Canvas ?: return
		runCatching { if (TypingFx.handles(view)) TypingFx.afterDraw(view, canvas) }
			.onFailure { XposedBridge.log("[TextAnimation] after draw failed: $it") }
	}
}

val textAnimationPlugin = plugin {
	start {
		val file = File(storageDir, SETTINGS_FILE)
		if (file.exists()) {
			runCatching {
				val json = JSONObject(file.readText())
				applySettings { key -> if (json.has(key)) json.get(key) else null }
			}.onFailure { log.w("could not read settings: ${it.message}") }
		}

		fun save() = runCatching {
			val json = JSONObject()
			for ((key, value) in settingsMap()) if (key != "cursorSupported") json.put(key, value)
			file.writeText(json.toString())
		}.onFailure { log.w("could not save settings: ${it.message}") }

		TypingFx.chatInputClass = runCatching { classLoader.loadClass(CHAT_INPUT) }
			.onFailure { log.w("$CHAT_INPUT not found; only 'every text field' will animate") }
			.getOrNull()

		runCatching {
			val onDraw = TextView::class.java.getDeclaredMethod("onDraw", Canvas::class.java)
			unhooks += XposedBridge.hookMethod(onDraw, drawHook)
		}.onFailure {
			log.e("could not hook TextView.onDraw", it)
			errors.tryEmit(it)
		}

		registerNativeMethod("${manifest.id}.getSettings") { _ -> settingsMap() }
		registerNativeMethod("${manifest.id}.setSettings") { args ->
			val patch = args.firstOrNull() as? Map<*, *> ?: emptyMap<Any, Any>()
			applySettings { patch[it] }
			save()
			mainHandler.post { runCatching { TypingFx.invalidateAll() } }
			settingsMap()
		}
		registerNativeMethod("${manifest.id}.setPreview") { args ->
			Settings.preview = args.firstOrNull() as? Boolean ?: false
			true
		}
	}

	stop {
		unhooks.forEach { it.unhook() }
		unhooks.clear()
		Settings.preview = false
		mainHandler.post { runCatching { TypingFx.releaseAll() } }
	}
}
