package com.bleelblep.uitweaks

import android.content.res.ColorStateList
import android.content.res.Resources
import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.PorterDuff
import android.graphics.PorterDuffColorFilter
import android.graphics.RectF
import android.graphics.drawable.Drawable
import java.lang.reflect.Method

/**
 * The message-swipe stage icons, drawn natively.
 *
 * Discord's native message list draws the two swipe stages from Android vector drawables
 * (`res/drawable/ic_swipe_reply.xml`, 32 dp viewport, and `ic_swipe_edit.xml`, 24 dp; verified in the
 * 350.4 base.apk) chosen by the row's `SwipeActionsType` enum. Nothing JS puts on the row reaches
 * them (proven live on 351.3: custom `swipeToReplyIconUrl`s and asset overrides changed nothing).
 * So the icons are swapped where Android hands them out: `Resources.getDrawable(id, theme)` and
 * `getDrawableForDensity(id, density, theme)`, hooked for just those two resource ids, resolved per
 * build by name. When a stage's action is Discord's own, the stock drawable goes through untouched.
 *
 * The replacement is a [PathIconDrawable]: a Material icon path (Apache-2.0) drawn into whatever
 * bounds the list gives it, honouring tint and alpha the way the vector did.
 */
internal object SwipeIcons {
	/** JS action id per stage, 'stock' meaning Discord's icon. */
	@Volatile var shortAction = "stock"
	@Volatile var longAction = "stock"

	private var replyId = 0
	private var editId = 0
	private val unhooks = mutableListOf<XC_MethodHook.Unhook>()

	// Material Symbols / Material Icons paths (Apache-2.0), 24 dp viewport, plus Discord's own two.
	private const val REPLY = "M3.185,15.103L13.842,8.152C13.963,8.069 14.108,8.018 14.26,8.004C14.413,7.99 14.568,8.014 14.705,8.073C14.843,8.132 14.958,8.224 15.038,8.338C15.118,8.453 15.159,8.584 15.157,8.718V12.379C26.772,12.379 28.974,19.388 29.332,23.137C29.341,23.287 29.297,23.436 29.205,23.562C29.112,23.689 28.977,23.788 28.818,23.846C28.658,23.903 28.482,23.916 28.314,23.882C28.146,23.849 27.994,23.771 27.878,23.659C22.722,18.422 15.157,19.63 15.157,19.63V23.292C15.157,23.423 15.116,23.552 15.036,23.664C14.957,23.776 14.843,23.867 14.708,23.926C14.573,23.984 14.421,24.009 14.271,23.997C14.12,23.985 13.977,23.937 13.856,23.857L3.185,16.909C3.024,16.803 2.894,16.667 2.804,16.51C2.714,16.354 2.667,16.181 2.667,16.006C2.667,15.831 2.714,15.658 2.804,15.501C2.894,15.345 3.024,15.208 3.185,15.103Z"
	private const val EDIT = "M19.2929,9.83L19.9409,9.1828C21.353,7.7707 21.353,5.472 19.9409,4.059C18.5287,2.6468 16.2292,2.6468 14.817,4.059L14.1699,4.707L19.2929,9.83ZM12.8962,5.9769L5.1847,13.6907L10.3085,18.813L18.0201,11.0993L12.8962,5.9769ZM4.1185,20.9705L8.7591,19.8112L4.1869,15.2391L3.0268,19.8796C2.9503,20.1856 3.0403,20.5105 3.2635,20.7338C3.4867,20.957 3.8116,21.0461 4.1185,20.9705Z"
	private const val REACT = "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"
	private const val COPY = "M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
	private const val MENTION = "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10h5v-2h-5c-4.34 0-8-3.66-8-8s3.66-8 8-8 8 3.66 8 8v1.43c0 .79-.71 1.57-1.5 1.57s-1.5-.78-1.5-1.57V12c0-2.76-2.24-5-5-5s-5 2.24-5 5 2.24 5 5 5c1.38 0 2.64-.56 3.54-1.47.65.89 1.77 1.47 2.96 1.47 1.97 0 3.5-1.6 3.5-3.57V12c0-5.52-4.48-10-10-10zm0 13c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"
	private const val MENU = "M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"
	private const val UNREAD = "M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"
	private const val NOTHING = "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9C4.63 15.55 4 13.85 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1C19.37 8.45 20 10.15 20 12c0 4.42-3.58 8-8 8z"
	private const val LINK = "M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"
	private const val QUOTE = "M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z"
	private const val PIN = "M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"
	private const val FORWARD = "M12 8V4l8 8-8 8v-4H4V8z"
	private const val THREAD = "M21 6h-2v9H6v2c0 .55.45 1 1 1h11l4 4V7c0-.55-.45-1-1-1zm-4 6V3c0-.55-.45-1-1-1H3c-.55 0-1 .45-1 1v14l4-4h10c.55 0 1-.45 1-1z"
	private const val PROFILE = "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
	private const val USER_ID = "M20 10V8h-4V4h-2v4h-4V4H8v4H4v2h4v4H4v2h4v4h2v-4h4v4h2v-4h4v-2h-4v-4h4zm-6 4h-4v-4h4v4z"
	private const val PALETTE = "M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"
	private const val DELETE = "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"

	/** Path and viewport for an action, or null for Discord's own icon. */
	private fun iconFor(action: String): Pair<String, Float>? = when (action) {
		"reply" -> REPLY to 32f
		"edit" -> EDIT to 24f
		"react", "react2" -> REACT to 24f
		"link" -> LINK to 24f
		"quote" -> QUOTE to 24f
		"pin" -> PIN to 24f
		"forward" -> FORWARD to 24f
		"thread" -> THREAD to 24f
		"profile" -> PROFILE to 24f
		"delete" -> DELETE to 24f
		"copy" -> COPY to 24f
		"userId" -> USER_ID to 24f
		"roleColor" -> PALETTE to 24f
		"mention" -> MENTION to 24f
		"menu" -> MENU to 24f
		"unread" -> UNREAD to 24f
		"nothing" -> NOTHING to 24f
		else -> null
	}

	fun install(res: Resources, packageName: String, log: (String) -> Unit) {
		replyId = res.getIdentifier("ic_swipe_reply", "drawable", packageName)
		editId = res.getIdentifier("ic_swipe_edit", "drawable", packageName)
		if (replyId == 0 || editId == 0) {
			log("swipe icon drawables not found in this build (reply=$replyId edit=$editId); icons stay Discord's")
			return
		}
		val hook = object : XC_MethodHook() {
			override fun afterHookedMethod(param: MethodHookParam) {
				val id = param.args[0] as? Int ?: return
				val action = when (id) { replyId -> shortAction; editId -> longAction; else -> return }
				val (path, viewport) = iconFor(action) ?: return
				val density = (param.thisObject as? Resources)?.displayMetrics?.density ?: 1f
				val stockSize = if (id == replyId) 32f else 24f
				param.result = PathIconDrawable(path, viewport, (stockSize * density).toInt())
			}
		}
		val methods = listOf<Method>(
			Resources::class.java.getMethod("getDrawable", Int::class.javaPrimitiveType, Resources.Theme::class.java),
			Resources::class.java.getMethod("getDrawableForDensity", Int::class.javaPrimitiveType, Int::class.javaPrimitiveType, Resources.Theme::class.java),
		)
		for (m in methods) runCatching { unhooks += XposedBridge.hookMethod(m, hook) }.onFailure { log("could not hook ${m.name}: ${it.message}") }
	}

	fun uninstall() {
		for (u in unhooks) runCatching { u.unhook() }
		unhooks.clear()
	}
}

/** A single-path icon, scaled from its viewport into its bounds; tint, alpha and colour filter as a vector drawable. */
internal class PathIconDrawable(pathData: String, private val viewport: Float, private val intrinsic: Int) : Drawable() {
	private val path = SvgPath.parse(pathData)
	private val scaled = Path()
	private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL; color = -1 }
	private var tint: ColorStateList? = null
	private var tintMode: PorterDuff.Mode = PorterDuff.Mode.SRC_IN

	override fun getIntrinsicWidth() = intrinsic
	override fun getIntrinsicHeight() = intrinsic

	override fun onBoundsChange(bounds: android.graphics.Rect) {
		val m = Matrix()
		val size = minOf(bounds.width(), bounds.height()).toFloat()
		val s = if (viewport > 0f) size / viewport else 1f
		m.setScale(s, s)
		m.postTranslate(bounds.left + (bounds.width() - size) / 2f, bounds.top + (bounds.height() - size) / 2f)
		path.transform(m, scaled)
	}

	override fun draw(canvas: Canvas) {
		if (scaled.isEmpty) onBoundsChange(bounds)
		canvas.drawPath(scaled, paint)
	}

	override fun setAlpha(alpha: Int) { paint.alpha = alpha; invalidateSelf() }
	override fun getAlpha() = paint.alpha
	override fun setColorFilter(colorFilter: ColorFilter?) { paint.colorFilter = colorFilter; invalidateSelf() }
	override fun getColorFilter(): ColorFilter? = paint.colorFilter
	@Deprecated("Deprecated in Java") override fun getOpacity() = PixelFormat.TRANSLUCENT

	override fun setTintList(tint: ColorStateList?) { this.tint = tint; applyTint() }
	override fun setTintMode(tintMode: PorterDuff.Mode?) { this.tintMode = tintMode ?: PorterDuff.Mode.SRC_IN; applyTint() }
	override fun isStateful() = tint?.isStateful == true
	override fun onStateChange(state: IntArray): Boolean { applyTint(); return tint?.isStateful == true }

	private fun applyTint() {
		val t = tint
		paint.colorFilter = if (t != null) PorterDuffColorFilter(t.getColorForState(state, t.defaultColor), tintMode) else null
		invalidateSelf()
	}
}

/** Enough of SVG path data for icon fonts: M L H V C S Q T Z, absolute and relative (no arcs). */
internal object SvgPath {
	fun parse(d: String): Path {
		val path = Path()
		val tokens = tokenize(d)
		var i = 0
		var cmd = 'M'
		var cx = 0f; var cy = 0f; var sx = 0f; var sy = 0f
		var lcx = 0f; var lcy = 0f // last control point, for S/T
		var lastCmd = 'M'
		fun num(): Float = (tokens[i++] as Float)
		while (i < tokens.size) {
			val t = tokens[i]
			if (t is Char) { cmd = t; i++; if (cmd == 'Z' || cmd == 'z') { path.close(); cx = sx; cy = sy; lastCmd = 'Z'; continue } }
			val rel = cmd.isLowerCase()
			when (cmd.uppercaseChar()) {
				'M' -> { var x = num(); var y = num(); if (rel) { x += cx; y += cy }; path.moveTo(x, y); cx = x; cy = y; sx = x; sy = y; cmd = if (rel) 'l' else 'L' }
				'L' -> { var x = num(); var y = num(); if (rel) { x += cx; y += cy }; path.lineTo(x, y); cx = x; cy = y }
				'H' -> { var x = num(); if (rel) x += cx; path.lineTo(x, cy); cx = x }
				'V' -> { var y = num(); if (rel) y += cy; path.lineTo(cx, y); cy = y }
				'C' -> { var x1 = num(); var y1 = num(); var x2 = num(); var y2 = num(); var x = num(); var y = num(); if (rel) { x1 += cx; y1 += cy; x2 += cx; y2 += cy; x += cx; y += cy }; path.cubicTo(x1, y1, x2, y2, x, y); lcx = x2; lcy = y2; cx = x; cy = y }
				'S' -> { var x2 = num(); var y2 = num(); var x = num(); var y = num(); if (rel) { x2 += cx; y2 += cy; x += cx; y += cy }; val x1 = if (lastCmd.uppercaseChar() == 'C' || lastCmd.uppercaseChar() == 'S') 2 * cx - lcx else cx; val y1 = if (lastCmd.uppercaseChar() == 'C' || lastCmd.uppercaseChar() == 'S') 2 * cy - lcy else cy; path.cubicTo(x1, y1, x2, y2, x, y); lcx = x2; lcy = y2; cx = x; cy = y }
				'Q' -> { var x1 = num(); var y1 = num(); var x = num(); var y = num(); if (rel) { x1 += cx; y1 += cy; x += cx; y += cy }; path.quadTo(x1, y1, x, y); lcx = x1; lcy = y1; cx = x; cy = y }
				'T' -> { var x = num(); var y = num(); if (rel) { x += cx; y += cy }; val x1 = if (lastCmd.uppercaseChar() == 'Q' || lastCmd.uppercaseChar() == 'T') 2 * cx - lcx else cx; val y1 = if (lastCmd.uppercaseChar() == 'Q' || lastCmd.uppercaseChar() == 'T') 2 * cy - lcy else cy; path.quadTo(x1, y1, x, y); lcx = x1; lcy = y1; cx = x; cy = y }
				else -> { i++ }
			}
			lastCmd = cmd
		}
		path.fillType = Path.FillType.WINDING
		return path
	}

	private fun tokenize(d: String): List<Any> {
		val out = ArrayList<Any>()
		var i = 0
		val n = d.length
		while (i < n) {
			val c = d[i]
			when {
				c.isLetter() -> { out += c; i++ }
				c == ',' || c.isWhitespace() -> i++
				else -> {
					val start = i
					if (d[i] == '-' || d[i] == '+') i++
					var dot = false; var exp = false
					while (i < n) {
						val ch = d[i]
						if (ch.isDigit()) i++
						else if (ch == '.' && !dot && !exp) { dot = true; i++ }
						else if ((ch == 'e' || ch == 'E') && !exp) { exp = true; i++; if (i < n && (d[i] == '-' || d[i] == '+')) i++ }
						else break
					}
					if (i == start) { i++; continue }
					out += d.substring(start, i).toFloat()
				}
			}
		}
		return out
	}
}
