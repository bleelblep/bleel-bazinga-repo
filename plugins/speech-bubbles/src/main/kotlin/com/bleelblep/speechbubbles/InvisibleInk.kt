package com.bleelblep.speechbubbles

import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.RectF
import android.graphics.drawable.Drawable
import android.os.SystemClock
import android.text.Spanned
import android.text.style.CharacterStyle
import android.text.style.ClickableSpan
import android.text.style.MetricAffectingSpan
import android.text.style.UpdateAppearance
import android.view.View
import android.widget.TextView
import java.lang.reflect.Field
import java.lang.reflect.Modifier
import java.util.WeakHashMap
import kotlin.random.Random

/** Specks per square dp of hidden text, and the most one text view draws. */
private const val SPECKS_PER_DP2 = 1f / 14f
private const val MAX_SPECKS = 700
/** About 30 frames a second: specks drift slowly, so more would only cost battery. */
private const val FRAME_MS = 33L
private const val FADE_MS = 320L
/** How far a finger has to rub over a spoiler, in dp, before it's revealed. */
private const val RUB_DP = 90f
private const val PUSH_RADIUS_DP = 22f

/**
 * Invisible ink: Discord's hidden text spoilers drawn as moving, twinkling specks, like iMessage.
 *
 * A spoiler is found by its span's shape, not its (R8-renamed) class: a CharacterStyle that is an
 * UpdateAppearance and not metric-affecting, with exactly two instance fields, a boolean (revealed)
 * and a Function0. On 352.6 that is `lh.i`. Discord still draws its own block and hides the text;
 * the ink covers the block with the bubble's colour and draws specks in the text colour on top.
 *
 * Revealing stays Discord's: a tap goes to Discord's own spoiler span as before, and the ink fades
 * out once the span draws its text again (see [revealed]).
 *
 * Battery: a text view animates only while it is attached, shown, in a visible window and on
 * screen, and has a hidden spoiler. Otherwise its loop stops; an attach or the next layout pass
 * starts it again. Purely local drawing: nothing is sent, requested or stored.
 */
internal class InvisibleInk {
	private class Shape(val revealed: Field)

	/** Span class -> its spoiler shape, or null when it isn't one. */
	private val shapes = HashMap<Class<*>, Shape?>()
	private val inks = WeakHashMap<TextView, Ink>()

	@Volatile var drawn = 0
		private set

	private fun shape(c: Class<*>): Shape? = shapes.getOrPut(c) {
		if (!CharacterStyle::class.java.isAssignableFrom(c)) return@getOrPut null
		if (MetricAffectingSpan::class.java.isAssignableFrom(c) || ClickableSpan::class.java.isAssignableFrom(c)) return@getOrPut null
		if (!UpdateAppearance::class.java.isAssignableFrom(c)) return@getOrPut null
		val fields = c.declaredFields.filter { !Modifier.isStatic(it.modifiers) }
		if (fields.size != 2) return@getOrPut null
		val flag = fields.firstOrNull { it.type == java.lang.Boolean.TYPE } ?: return@getOrPut null
		if (fields.none { it.type.name == "kotlin.jvm.functions.Function0" }) return@getOrPut null
		runCatching { flag.isAccessible = true }.getOrNull() ?: return@getOrPut null
		Shape(flag)
	}

	private val probePaint = android.text.TextPaint()

	/**
	 * Whether Discord shows the spoiler's text now. Asked the way Discord's own drawing asks: the
	 * span's updateDrawState on a test paint. A hidden spoiler changes the text colour (to the
	 * block's colour or transparent); a revealed one leaves it. 0.5.4 read the span's boolean field
	 * instead, which doesn't change on a tap, so the ink never went away.
	 */
	private fun revealed(span: Any): Boolean {
		if (shape(span.javaClass) == null) return true
		return runCatching {
			val probe = 0xFF123456.toInt()
			probePaint.reset()
			probePaint.color = probe
			probePaint.bgColor = 0
			(span as CharacterStyle).updateDrawState(probePaint)
			probePaint.color == probe
		}.getOrDefault(true)
	}

	/** The hidden spoilers of [text]: span and its range. */
	private fun hiddenSpoilers(text: TextView): List<Triple<Any, Int, Int>> {
		val spanned = text.text as? Spanned ?: return emptyList()
		val out = ArrayList<Triple<Any, Int, Int>>()
		for (span in spanned.getSpans(0, spanned.length, CharacterStyle::class.java)) {
			if (shape(span.javaClass) == null || revealed(span)) continue
			out += Triple(span, spanned.getSpanStart(span), spanned.getSpanEnd(span))
		}
		return out
	}

	/**
	 * Called after every layout of a bubble's text. [on] false (setting off, or not a bubble) takes
	 * the ink away. [cover] is the bubble's colour, [speck] its text colour.
	 */
	fun update(text: TextView, on: Boolean, cover: Int, speck: Int) {
		updatePlain(text, on, cover)
		if (!on) return remove(text)
		val spoilers = hiddenSpoilers(text)
		val ink = inks[text]
		if (spoilers.isEmpty()) {
			// Revealed (Discord rebuilt the text with a revealed span), or a recycled text with none:
			// whatever ink is left fades out now.
			if (ink != null) {
				ink.sync(emptyList())
				ink.start()
			}
			return
		}
		val target = ink ?: Ink(text).also {
			inks[text] = it
			it.setBounds(0, 0, Int.MAX_VALUE / 2, Int.MAX_VALUE / 2)
			text.overlay.add(it)
			text.addOnAttachStateChangeListener(it)
		}
		target.cover = cover
		target.speck = speck
		target.sync(spoilers)
		target.start()
	}

	fun remove(text: TextView) {
		val ink = inks.remove(text) ?: return
		ink.stop()
		text.removeOnAttachStateChangeListener(ink)
		runCatching { text.overlay.remove(ink) }
		text.invalidate()
	}

	fun dispose() {
		for (text in inks.keys.toList()) runCatching { remove(text) }
		inks.clear()
		for (text in plains.keys.toList()) runCatching { removePlain(text) }
		plains.clear()
	}

	// ---- Opened spoilers without Discord's box ----

	private val plains = WeakHashMap<TextView, Plain>()

	/** The opened spoilers of [text]: their ranges. */
	private fun openedSpoilers(text: TextView): List<Pair<Int, Int>> {
		val spanned = text.text as? Spanned ?: return emptyList()
		val out = ArrayList<Pair<Int, Int>>()
		for (span in spanned.getSpans(0, spanned.length, CharacterStyle::class.java)) {
			if (shape(span.javaClass) == null || !revealed(span)) continue
			out += spanned.getSpanStart(span) to spanned.getSpanEnd(span)
		}
		return out
	}

	/**
	 * Discord keeps a dark box behind a spoiler once it's opened. iMessage shows the text plain, so
	 * over each opened spoiler this paints the bubble's colour (hiding the box) and draws those lines'
	 * text again on top, clipped to the spoiler. Drawing only; the text and its spans are untouched.
	 */
	private fun updatePlain(text: TextView, on: Boolean, cover: Int) {
		val ranges = if (on) openedSpoilers(text) else emptyList()
		if (ranges.isEmpty()) return removePlain(text)
		val plain = plains[text] ?: Plain(text).also {
			plains[text] = it
			it.setBounds(0, 0, Int.MAX_VALUE / 2, Int.MAX_VALUE / 2)
			text.overlay.add(it)
		}
		plain.cover = cover
		plain.ranges = ranges
		text.invalidate()
	}

	private fun removePlain(text: TextView) {
		val plain = plains.remove(text) ?: return
		runCatching { text.overlay.remove(plain) }
		text.invalidate()
	}

	private class Plain(val text: TextView) : Drawable() {
		var cover = 0
		var ranges: List<Pair<Int, Int>> = emptyList()
		private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
		private val textPaint = android.text.TextPaint(Paint.ANTI_ALIAS_FLAG)
		private val density = text.resources.displayMetrics.density

		override fun draw(canvas: Canvas) {
			val layout = text.layout ?: return
			val length = text.text.length
			val ox = text.totalPaddingLeft.toFloat() - text.scrollX
			val oy = text.totalPaddingTop.toFloat() - text.scrollY
			paint.color = cover
			// Discord's box reaches a little past the letters.
			val pad = 3f * density
			for ((s0, e0) in ranges) {
				val end = e0.coerceAtMost(length)
				val start = s0.coerceIn(0, end)
				if (start >= end) continue
				for (line in layout.getLineForOffset(start)..layout.getLineForOffset(end)) {
					val ls = maxOf(start, layout.getLineStart(line))
					val le = minOf(end, layout.getLineEnd(line))
					if (ls >= le) continue
					val a = layout.getPrimaryHorizontal(ls)
					val b = if (le >= layout.getLineEnd(line)) layout.getLineRight(line) else layout.getPrimaryHorizontal(le)
					val r = RectF(minOf(a, b) + ox - pad, layout.getLineTop(line) + oy, maxOf(a, b) + ox + pad, layout.getLineBottom(line) + oy)
					val save = canvas.save()
					canvas.clipRect(r)
					canvas.drawRect(r, paint)
					// The spoiler's own letters, in the text's paint and colour, on the line's baseline.
					textPaint.set(text.paint)
					textPaint.color = text.currentTextColor
					canvas.drawText(text.text, ls, le, minOf(a, b) + ox, layout.getLineBaseline(line) + oy, textPaint)
					canvas.restoreToCount(save)
				}
			}
		}

		override fun setAlpha(alpha: Int) {}
		override fun setColorFilter(colorFilter: ColorFilter?) {}
		@Deprecated("Deprecated in Java")
		override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
	}

	/**
	 * A finger moving over [text] (screen coordinates): specks near it scatter, and after enough
	 * rubbing the spoiler under it is revealed through Discord's own span. True when over ink.
	 */
	fun rub(text: TextView, rawX: Float, rawY: Float, down: Boolean): Boolean {
		val ink = inks[text] ?: return false
		val loc = IntArray(2)
		text.getLocationOnScreen(loc)
		return ink.rub(rawX - loc[0], rawY - loc[1], down)
	}

	private class Speck(var x: Float, var y: Float, var vx: Float, var vy: Float, val r: Float, var phase: Float, val rate: Float)

	private class Spoiler(val span: Any, var start: Int, var end: Int) {
		val rects = ArrayList<RectF>()
		val specks = ArrayList<Speck>()
		var fading = false
		var fadeStart = 0L
		var rubbed = 0f
	}

	private inner class Ink(val text: TextView) : Drawable(), View.OnAttachStateChangeListener {
		val spoilers = ArrayList<Spoiler>()
		var cover = 0
		var speck = 0
		private val coverPaint = Paint(Paint.ANTI_ALIAS_FLAG)
		private val speckPaint = Paint(Paint.ANTI_ALIAS_FLAG)
		private val density = text.resources.displayMetrics.density
		private var running = false
		private var last = 0L
		private var layoutSeen: Any? = null
		private var widthSeen = -1
		private var lastRub: Pair<Float, Float>? = null
		private val visible = android.graphics.Rect()

		private val frame = object : Runnable {
			override fun run() {
				if (!running) return
				if (!onScreen()) {
					running = false
					return
				}
				tick()
				invalidateSelf()
				text.postOnAnimationDelayed(this, FRAME_MS)
			}
		}

		fun onScreen(): Boolean =
			text.isAttachedToWindow && text.isShown && text.windowVisibility == View.VISIBLE && text.getGlobalVisibleRect(visible)

		fun start() {
			if (running || !onScreen()) return
			running = true
			last = SystemClock.uptimeMillis()
			text.postOnAnimation(frame)
		}

		fun stop() {
			running = false
			text.removeCallbacks(frame)
		}

		override fun onViewAttachedToWindow(v: View) = start()
		override fun onViewDetachedFromWindow(v: View) = stop()

		/** Keeps the spoilers in step with the text's hidden ones; revealed ones start fading. */
		fun sync(hidden: List<Triple<Any, Int, Int>>) {
			val now = SystemClock.uptimeMillis()
			for (s in spoilers) if (!s.fading && hidden.none { it.first === s.span }) {
				s.fading = true
				s.fadeStart = now
			}
			for ((span, start, end) in hidden) {
				val s = spoilers.firstOrNull { it.span === span }
				if (s == null) spoilers += Spoiler(span, start, end) else { s.start = start; s.end = end }
			}
			measure(force = true)
		}

		/** Each spoiler's line boxes in the text's coordinates, and specks spread over them. */
		private fun measure(force: Boolean) {
			val layout = text.layout ?: return
			if (!force && layout === layoutSeen && text.width == widthSeen) return
			layoutSeen = layout
			widthSeen = text.width
			val ox = text.totalPaddingLeft.toFloat() - text.scrollX
			val oy = text.totalPaddingTop.toFloat() - text.scrollY
			val budget = MAX_SPECKS / spoilers.size.coerceAtLeast(1)
			for (s in spoilers) {
				val end = s.end.coerceAtMost(text.text.length)
				val start = s.start.coerceIn(0, end)
				s.rects.clear()
				if (start >= end) continue
				val first = layout.getLineForOffset(start)
				val lastLine = layout.getLineForOffset(end)
				for (line in first..lastLine) {
					val ls = maxOf(start, layout.getLineStart(line))
					val le = minOf(end, layout.getLineEnd(line))
					if (ls >= le) continue
					val a = layout.getPrimaryHorizontal(ls)
					val b = if (le >= layout.getLineEnd(line)) layout.getLineRight(line) else layout.getPrimaryHorizontal(le)
					val top = layout.getLineTop(line).toFloat()
					val bottom = (layout.getLineBottom(line) - layout.spacingAdd).toFloat()
					s.rects += RectF(minOf(a, b) + ox, top + oy, maxOf(a, b) + ox, bottom + oy)
				}
				val area = s.rects.sumOf { (it.width() * it.height()).toDouble() }.toFloat() / (density * density)
				val want = (area * SPECKS_PER_DP2).toInt().coerceIn(6, budget.coerceAtLeast(6))
				if (s.specks.size != want || force) {
					s.specks.clear()
					repeat(want) { s.specks += newSpeck(s) ?: return@repeat }
				}
			}
		}

		private fun newSpeck(s: Spoiler): Speck? {
			if (s.rects.isEmpty()) return null
			// Lines weighted by width, so a long first line gets more specks than a short last one.
			val total = s.rects.sumOf { it.width().toDouble() }.toFloat()
			var pick = Random.nextFloat() * total
			var rect = s.rects.last()
			for (r in s.rects) {
				if (pick <= r.width()) { rect = r; break }
				pick -= r.width()
			}
			val speed = (4f + Random.nextFloat() * 10f) * density
			val angle = Random.nextFloat() * 6.2832f
			return Speck(
				rect.left + Random.nextFloat() * rect.width(),
				rect.top + Random.nextFloat() * rect.height(),
				kotlin.math.cos(angle) * speed,
				kotlin.math.sin(angle) * speed,
				(0.55f + Random.nextFloat() * 0.6f) * density,
				Random.nextFloat() * 6.2832f,
				1.5f + Random.nextFloat() * 3f,
			)
		}

		private fun tick() {
			val now = SystemClock.uptimeMillis()
			val dt = ((now - last).coerceIn(0, 100)) / 1000f
			last = now
			measure(force = false)
			for (s in spoilers) {
				// Revealed, or no longer part of the text at all: a tap makes Discord rebuild the text
				// with new spans, so the span we cover can be one Discord has already dropped.
				if (!s.fading && (revealed(s.span) || (text.text as? Spanned)?.getSpanStart(s.span)?.let { it < 0 } != false)) {
					s.fading = true
					s.fadeStart = now
				}
				for (p in s.specks) {
					p.x += p.vx * dt
					p.y += p.vy * dt
					p.phase += p.rate * dt
					// A push from a finger dies away to the usual slow drift.
					val v = kotlin.math.hypot(p.vx, p.vy)
					val cap = 14f * density
					if (v > cap) {
						p.vx *= 0.92f
						p.vy *= 0.92f
					}
					// Kept inside its line box: bounce off the edges.
					val r = s.rects.firstOrNull { it.contains(p.x, p.y) }
					if (r == null) {
						val home = s.rects.minByOrNull { kotlin.math.abs(it.centerY() - p.y) } ?: continue
						p.x = p.x.coerceIn(home.left, home.right)
						p.y = p.y.coerceIn(home.top, home.bottom)
						p.vx = -p.vx
						p.vy = -p.vy
					}
				}
			}
			spoilers.removeAll { it.fading && now - it.fadeStart > FADE_MS }
			if (spoilers.isEmpty()) {
				running = false
				text.post { remove(text) }
			}
		}

		fun rub(x: Float, y: Float, down: Boolean): Boolean {
			val s = spoilers.firstOrNull { sp -> !sp.fading && sp.rects.any { it.contains(x, y) } }
			if (s == null) {
				lastRub = null
				return false
			}
			val prev = lastRub
			lastRub = x to y
			if (down || prev == null) return true
			s.rubbed += kotlin.math.hypot(x - prev.first, y - prev.second)
			// Specks near the finger are pushed away from it.
			val radius = PUSH_RADIUS_DP * density
			for (p in s.specks) {
				val dx = p.x - x
				val dy = p.y - y
				val d = kotlin.math.hypot(dx, dy)
				if (d < radius && d > 0.1f) {
					p.vx += dx / d * 60f * density
					p.vy += dy / d * 60f * density
				}
			}
			if (s.rubbed > RUB_DP * density) reveal(s)
			return true
		}

		/** Discord's own reveal: the clickable span on the spoiler's text, as a tap would call it. */
		private fun reveal(s: Spoiler) {
			if (s.fading) return
			val spanned = text.text as? Spanned ?: return
			val click = spanned.getSpans(s.start, s.end, ClickableSpan::class.java)
				.firstOrNull { spanned.getSpanStart(it) <= s.start && spanned.getSpanEnd(it) >= s.end } ?: return
			s.rubbed = 0f
			runCatching { click.onClick(text) }
		}

		override fun draw(canvas: Canvas) {
			val now = SystemClock.uptimeMillis()
			val radius = 4f * density
			for (s in spoilers) {
				val fade = if (s.fading) (1f - (now - s.fadeStart).toFloat() / FADE_MS).coerceIn(0f, 1f) else 1f
				if (fade <= 0f) continue
				coverPaint.color = cover
				coverPaint.alpha = (android.graphics.Color.alpha(cover) * fade).toInt()
				for (r in s.rects) canvas.drawRoundRect(r.left - density, r.top, r.right + density, r.bottom, radius, radius, coverPaint)
				speckPaint.color = speck
				val base = android.graphics.Color.alpha(speck)
				for (p in s.specks) {
					val twinkle = 0.45f + 0.55f * (0.5f + 0.5f * kotlin.math.sin(p.phase))
					speckPaint.alpha = (base * twinkle * fade).toInt()
					canvas.drawCircle(p.x, p.y, p.r, speckPaint)
				}
			}
			drawn++
		}

		override fun setAlpha(alpha: Int) {}
		override fun setColorFilter(colorFilter: ColorFilter?) {}
		@Deprecated("Deprecated in Java")
		override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
	}
}
