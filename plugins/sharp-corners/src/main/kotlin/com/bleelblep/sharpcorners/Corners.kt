package com.bleelblep.sharpcorners

import android.graphics.Canvas
import android.graphics.Outline
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.shapes.RoundRectShape
import android.view.View
import app.valenced.xposed.api.DexFinder
import java.lang.reflect.Member
import java.lang.reflect.Modifier
import java.util.concurrent.atomic.AtomicLong

/**
 * Every corner Discord draws, made sharp, in three groups the settings switch separately:
 *
 * - [app]: React Native. Every view's and image's corner goes through
 *   `BackgroundStyleApplicator.setBorderRadius` (Fabric's view managers and `ReactImageView` both
 *   call it; 349.5 decompile). Passing null there means "no corner", so one hook covers every screen
 *   Discord draws in JS, whatever component or token the corner came from.
 * - [native]: Discord's own Android views (the chat list, embeds, attachments, voice messages). They
 *   round with Android's shapes: `Outline.setRoundRect` (ViewClippingUtilsKt.clipToRoundedRectangle,
 *   39 uses), `GradientDrawable` corners (setBackgroundRectangle, 75 uses), `Canvas.drawRoundRect`
 *   and `Path.addRoundRect` (spans, reactions). Those get radius 0.
 * - [ovals]: circles too. Avatars in chat clip with `Outline.setOval` (clipToCircle), status dots
 *   and buttons use oval `GradientDrawable`s or `Canvas.drawCircle`, and react-native-svg masks (the
 *   avatar status cut-out) are `Path.addCircle`. Each is drawn as the square around it instead.
 *
 * Hardware-accelerated drawing goes through `BaseRecordingCanvas`, which overrides Canvas's draw
 * methods, so both classes are hooked.
 */
internal object Corners {
	/**
	 * `setBorderRadius(View, BorderRadiusProp, LengthPercentage)` on R8-minified Discord (352.2+), where
	 * BackgroundStyleApplicator is merged into another class (352.2: `q4.f.Z`). The corner enum is
	 * found by its constant names and LengthPercentage by its toString; the arguments are unchanged.
	 */
	private fun minifiedSetBorderRadius(finder: DexFinder?): Member {
		finder ?: error("Discord is minified and this Valenced can't find its classes")
		val prop = finder.findClass { matcher { usingEqStrings("BORDER_TOP_LEFT_RADIUS", "BORDER_START_START_RADIUS") } }
			?: error("BorderRadiusProp not found")
		val length = finder.findClass { matcher { usingStrings("LengthPercentage(value=") } }
			?: error("LengthPercentage not found")
		return finder.findMethod {
			matcher {
				modifiers(Modifier.STATIC)
				returnType("void")
				paramTypes("android.view.View", prop.name, length.name)
			}
		} ?: error("setBorderRadius not found")
	}

	@Volatile var app = true
	@Volatile var native = true
	@Volatile var ovals = true

	val appCount = AtomicLong()
	val nativeCount = AtomicLong()
	val ovalCount = AtomicLong()

	private val ZERO_RADII = FloatArray(8)
	private val F = Float::class.javaPrimitiveType!!
	private val I = Int::class.javaPrimitiveType!!

	/** Hooks everything it can find; each hook that fails is reported and the rest still go in. */
	fun install(
		classLoader: ClassLoader,
		finder: DexFinder?,
		unhooks: MutableList<XC_MethodHook.Unhook>,
		warn: (String) -> Unit,
	) {
		fun hook(what: String, find: () -> Member, hook: XC_MethodHook) {
			runCatching { unhooks += XposedBridge.hookMethod(find(), hook) }.onFailure { warn("$what: ${it.message}") }
		}

		// --- React Native ---
		hook("BackgroundStyleApplicator.setBorderRadius", {
			runCatching {
				val prop = classLoader.loadClass("com.facebook.react.uimanager.style.BorderRadiusProp")
				val length = classLoader.loadClass("com.facebook.react.uimanager.LengthPercentage")
				classLoader.loadClass("com.facebook.react.uimanager.BackgroundStyleApplicator").getMethod("setBorderRadius", View::class.java, prop, length)
			}.getOrElse { minifiedSetBorderRadius(finder) }
		}, object : XC_MethodHook() {
			override fun beforeHookedMethod(param: MethodHookParam) {
				if (!app) return
				val args = param.args
				if (args[2] != null) {
					args[2] = null
					appCount.incrementAndGet()
				}
			}
		})

		// --- Android shapes: rounded corners -> 0 ---
		val zeroAt = { indices: IntArray ->
			object : XC_MethodHook() {
				override fun beforeHookedMethod(param: MethodHookParam) {
					if (!native) return
					val args = param.args
					for (i in indices) {
						when (val v = args[i]) {
							is Float -> if (v != 0f) args[i] = 0f
							is FloatArray -> args[i] = ZERO_RADII.copyOf()
						}
					}
					nativeCount.incrementAndGet()
				}
			}
		}
		hook("Outline.setRoundRect(ints)", { Outline::class.java.getMethod("setRoundRect", I, I, I, I, F) }, zeroAt(intArrayOf(4)))
		hook("Outline.setRoundRect(Rect)", { Outline::class.java.getMethod("setRoundRect", Rect::class.java, F) }, zeroAt(intArrayOf(1)))
		hook("GradientDrawable.setCornerRadius", { GradientDrawable::class.java.getMethod("setCornerRadius", F) }, zeroAt(intArrayOf(0)))
		hook("GradientDrawable.setCornerRadii", { GradientDrawable::class.java.getMethod("setCornerRadii", FloatArray::class.java) }, zeroAt(intArrayOf(0)))
		for (canvas in canvasClasses()) {
			val name = canvas.simpleName
			hook("$name.drawRoundRect(RectF)", { canvas.getDeclaredMethod("drawRoundRect", RectF::class.java, F, F, Paint::class.java) }, zeroAt(intArrayOf(1, 2)))
			hook("$name.drawRoundRect(floats)", { canvas.getDeclaredMethod("drawRoundRect", F, F, F, F, F, F, Paint::class.java) }, zeroAt(intArrayOf(4, 5)))
		}
		val dir = Path.Direction::class.java
		hook("Path.addRoundRect(RectF, rx, ry)", { Path::class.java.getMethod("addRoundRect", RectF::class.java, F, F, dir) }, zeroAt(intArrayOf(1, 2)))
		hook("Path.addRoundRect(floats, rx, ry)", { Path::class.java.getMethod("addRoundRect", F, F, F, F, F, F, dir) }, zeroAt(intArrayOf(4, 5)))
		hook("Path.addRoundRect(RectF, radii)", { Path::class.java.getMethod("addRoundRect", RectF::class.java, FloatArray::class.java, dir) }, zeroAt(intArrayOf(1)))
		hook("Path.addRoundRect(floats, radii)", { Path::class.java.getMethod("addRoundRect", F, F, F, F, FloatArray::class.java, dir) }, zeroAt(intArrayOf(4)))

		// RN's Pressable ripple (ReactDrawableHelper.getMask, android_ripple.cornerRadius, which Discord's
		// PressableBase fills from the style's borderRadius) and other ShapeDrawables round through
		// RoundRectShape's radii arrays, set once in the constructor.
		hook("RoundRectShape.<init>", {
			RoundRectShape::class.java.getConstructor(FloatArray::class.java, RectF::class.java, FloatArray::class.java)
		}, object : XC_MethodHook() {
			override fun beforeHookedMethod(param: MethodHookParam) {
				if (!app && !native) return
				val args = param.args
				var changed = false
				for (i in intArrayOf(0, 2)) {
					val radii = args[i] as? FloatArray ?: continue
					if (radii.any { it != 0f }) {
						args[i] = FloatArray(radii.size)
						changed = true
					}
				}
				if (changed) nativeCount.incrementAndGet()
			}
		})

		// Drawables from XML set their corners while inflating, not through the setters above.
		hook("GradientDrawable.inflate", {
			GradientDrawable::class.java.methods.first { it.name == "inflate" && it.parameterCount == 4 }
		}, object : XC_MethodHook() {
			override fun afterHookedMethod(param: MethodHookParam) {
				val drawable = param.thisObject as? GradientDrawable ?: return
				if (ovals && drawable.shape == GradientDrawable.OVAL) drawable.shape = GradientDrawable.RECTANGLE
				if (native && drawable.shape == GradientDrawable.RECTANGLE) {
					drawable.cornerRadii = null
					drawable.cornerRadius = 0f
				}
			}
		})

		// --- Circles -> squares ---
		hook("GradientDrawable.setShape", { GradientDrawable::class.java.getMethod("setShape", I) }, object : XC_MethodHook() {
			override fun beforeHookedMethod(param: MethodHookParam) {
				if (ovals && param.args[0] == GradientDrawable.OVAL) {
					param.args[0] = GradientDrawable.RECTANGLE
					ovalCount.incrementAndGet()
				}
			}
		})
		hook("Outline.setOval(ints)", { Outline::class.java.getMethod("setOval", I, I, I, I) }, object : XC_MethodHook() {
			override fun beforeHookedMethod(param: MethodHookParam) {
				if (!ovals) return
				val a = param.args
				(param.thisObject as Outline).setRect(a[0] as Int, a[1] as Int, a[2] as Int, a[3] as Int)
				param.result = null
				ovalCount.incrementAndGet()
			}
		})
		hook("Outline.setOval(Rect)", { Outline::class.java.getMethod("setOval", Rect::class.java) }, object : XC_MethodHook() {
			override fun beforeHookedMethod(param: MethodHookParam) {
				if (!ovals) return
				(param.thisObject as Outline).setRect(param.args[0] as Rect)
				param.result = null
				ovalCount.incrementAndGet()
			}
		})
		for (canvas in canvasClasses()) {
			val name = canvas.simpleName
			hook("$name.drawCircle", { canvas.getDeclaredMethod("drawCircle", F, F, F, Paint::class.java) }, object : XC_MethodHook() {
				override fun beforeHookedMethod(param: MethodHookParam) {
					if (!ovals) return
					val a = param.args
					val x = a[0] as Float
					val y = a[1] as Float
					val r = a[2] as Float
					(param.thisObject as Canvas).drawRect(x - r, y - r, x + r, y + r, a[3] as Paint)
					param.result = null
					ovalCount.incrementAndGet()
				}
			})
			hook("$name.drawOval(RectF)", { canvas.getDeclaredMethod("drawOval", RectF::class.java, Paint::class.java) }, object : XC_MethodHook() {
				override fun beforeHookedMethod(param: MethodHookParam) {
					if (!ovals) return
					(param.thisObject as Canvas).drawRect(param.args[0] as RectF, param.args[1] as Paint)
					param.result = null
					ovalCount.incrementAndGet()
				}
			})
			hook("$name.drawOval(floats)", { canvas.getDeclaredMethod("drawOval", F, F, F, F, Paint::class.java) }, object : XC_MethodHook() {
				override fun beforeHookedMethod(param: MethodHookParam) {
					if (!ovals) return
					val a = param.args
					(param.thisObject as Canvas).drawRect(a[0] as Float, a[1] as Float, a[2] as Float, a[3] as Float, a[4] as Paint)
					param.result = null
					ovalCount.incrementAndGet()
				}
			})
		}
		hook("Path.addCircle", { Path::class.java.getMethod("addCircle", F, F, F, dir) }, object : XC_MethodHook() {
			override fun beforeHookedMethod(param: MethodHookParam) {
				if (!ovals) return
				val a = param.args
				val x = a[0] as Float
				val y = a[1] as Float
				val r = a[2] as Float
				(param.thisObject as Path).addRect(x - r, y - r, x + r, y + r, a[3] as Path.Direction)
				param.result = null
				ovalCount.incrementAndGet()
			}
		})
		hook("Path.addOval(RectF)", { Path::class.java.getMethod("addOval", RectF::class.java, dir) }, object : XC_MethodHook() {
			override fun beforeHookedMethod(param: MethodHookParam) {
				if (!ovals) return
				(param.thisObject as Path).addRect(param.args[0] as RectF, param.args[1] as Path.Direction)
				param.result = null
				ovalCount.incrementAndGet()
			}
		})
		hook("Path.addOval(floats)", { Path::class.java.getMethod("addOval", F, F, F, F, dir) }, object : XC_MethodHook() {
			override fun beforeHookedMethod(param: MethodHookParam) {
				if (!ovals) return
				val a = param.args
				(param.thisObject as Path).addRect(a[0] as Float, a[1] as Float, a[2] as Float, a[3] as Float, a[4] as Path.Direction)
				param.result = null
				ovalCount.incrementAndGet()
			}
		})
	}

	/** Canvas, plus the hidden BaseRecordingCanvas that hardware drawing actually uses (API 29+). */
	private fun canvasClasses(): List<Class<*>> = listOfNotNull(
		Canvas::class.java,
		runCatching { Class.forName("android.graphics.BaseRecordingCanvas") }.getOrNull(),
	)
}
