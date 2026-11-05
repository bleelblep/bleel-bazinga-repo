package com.bleelblep.speechbubbles

import android.animation.ValueAnimator
import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.drawable.Drawable
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.View
import android.view.ViewTreeObserver
import android.widget.TextView

/**
 * "Tap: pop-up above the bubble": a small rounded pill with the time, drawn in the window's decor
 * view overlay so nothing clips it, just above the tapped bubble (below it when there's no room).
 * It fades in, fades out after [SHOW_MS] and is removed. Only one at a time (see [TimePopups]).
 * Main thread only.
 */
private class PillDrawable(
	private val text: String,
	bg: Int,
	fg: Int,
	textSize: Float,
	private val padH: Float,
	private val padV: Float,
	private val shadow: Float,
) : Drawable() {
	private val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
		color = bg
		setShadowLayer(shadow, 0f, shadow / 3f, 0x40000000)
	}
	private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
		color = fg
		this.textSize = textSize
	}
	private val rect = RectF()
	private var level = 0

	val pillWidth: Float get() = textPaint.measureText(text) + padH * 2
	val pillHeight: Float get() = textPaint.fontMetrics.let { it.descent - it.ascent } + padV * 2

	/** 0..255, applied to both paints. */
	fun setLevel255(value: Int) {
		level = value
		invalidateSelf()
	}

	override fun draw(canvas: Canvas) {
		val b = bounds
		rect.set(b.left + shadow, b.top + shadow, b.right - shadow, b.bottom - shadow)
		val bgAlpha = bgPaint.color ushr 24
		val fgAlpha = textPaint.color ushr 24
		bgPaint.alpha = bgAlpha * level / 255
		textPaint.alpha = fgAlpha * level / 255
		val r = rect.height() / 2
		canvas.drawRoundRect(rect, r, r, bgPaint)
		val fm = textPaint.fontMetrics
		canvas.drawText(text, rect.left + padH, rect.centerY() - (fm.ascent + fm.descent) / 2, textPaint)
		bgPaint.alpha = bgAlpha
		textPaint.alpha = fgAlpha
	}

	override fun setAlpha(alpha: Int) = setLevel255(alpha)
	override fun setColorFilter(colorFilter: ColorFilter?) {
		bgPaint.colorFilter = colorFilter
		textPaint.colorFilter = colorFilter
	}

	@Deprecated("Deprecated in Java")
	override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
}

internal class TimePopups {
	private val main = Handler(Looper.getMainLooper())
	private var pill: PillDrawable? = null
	private var host: View? = null
	private var anchor: TextView? = null
	private var anchorX = 0
	private var anchorY = 0
	private var animator: ValueAnimator? = null
	private var preDraw: ViewTreeObserver.OnPreDrawListener? = null
	private var detach: View.OnAttachStateChangeListener? = null
	private val hideLater = Runnable { fadeOut() }
	@Volatile var shownCount = 0
		private set

	val isShowing: Boolean get() = pill != null

	/**
	 * Shows [label] above [text]. [tailRight]: own bubble (aligned to its right edge), else theirs
	 * (left edge). [inset] is the room the bubble keeps for its tail on that side. Tapping the bubble
	 * it already shows for hides it instead.
	 */
	fun toggle(text: TextView, label: String, tailRight: Boolean, inset: Float, bg: Int, fg: Int) {
		if (anchor === text && pill != null) {
			dismiss()
			return
		}
		dismiss()
		val root = text.rootView ?: return
		val res = text.resources
		val dm = res.displayMetrics
		fun dp(v: Float) = v * dm.density
		val shadow = dp(3f)
		val p = PillDrawable(
			label, bg, fg,
			TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, 12f, dm),
			dp(8f), dp(4f), shadow,
		)
		val loc = IntArray(2)
		text.getLocationInWindow(loc)
		anchorX = loc[0]
		anchorY = loc[1]
		val w = p.pillWidth
		val h = p.pillHeight
		val gap = dp(4f)
		var x = if (tailRight) loc[0] + text.width - inset - w else loc[0] + inset
		x = x.coerceIn(dp(4f), (root.width - w - dp(4f)).coerceAtLeast(dp(4f)))
		val frame = Rect()
		root.getWindowVisibleDisplayFrame(frame)
		var y = loc[1] - gap - h
		if (y < frame.top) y = loc[1] + text.height + gap
		p.setBounds(
			(x - shadow).toInt(), (y - shadow).toInt(),
			(x + w + shadow).toInt(), (y + h + shadow).toInt(),
		)
		p.setLevel255(0)
		root.overlay.add(p)
		pill = p
		host = root
		anchor = text
		shownCount++

		// Gone when the bubble scrolls (moves in the window) or leaves the screen.
		val pd = ViewTreeObserver.OnPreDrawListener {
			val now = IntArray(2)
			text.getLocationInWindow(now)
			if (now[0] != anchorX || now[1] != anchorY) main.post { if (anchor === text) dismiss() }
			true
		}
		text.viewTreeObserver.addOnPreDrawListener(pd)
		preDraw = pd
		val da = object : View.OnAttachStateChangeListener {
			override fun onViewAttachedToWindow(v: View) = Unit
			override fun onViewDetachedFromWindow(v: View) {
				if (anchor === text) dismiss()
			}
		}
		text.addOnAttachStateChangeListener(da)
		detach = da

		animate(0, 255, 120) { main.postDelayed(hideLater, SHOW_MS) }
	}

	private fun fadeOut() {
		if (pill == null) return
		animate(255, 0, 200) { dismiss() }
	}

	private fun animate(from: Int, to: Int, ms: Long, done: () -> Unit) {
		animator?.cancel()
		val p = pill ?: return
		val a = ValueAnimator.ofInt(from, to).setDuration(ms)
		a.addUpdateListener { p.setLevel255(it.animatedValue as Int) }
		a.addListener(object : android.animation.AnimatorListenerAdapter() {
			private var cancelled = false
			override fun onAnimationCancel(animation: android.animation.Animator) {
				cancelled = true
			}
			override fun onAnimationEnd(animation: android.animation.Animator) {
				if (!cancelled && pill === p) done()
			}
		})
		animator = a
		a.start()
	}

	/** Removes the pop-up at once (also on stop). */
	fun dismiss() {
		main.removeCallbacks(hideLater)
		animator?.cancel()
		animator = null
		pill?.let { host?.overlay?.remove(it) }
		anchor?.let { a ->
			preDraw?.let { runCatching { a.viewTreeObserver.removeOnPreDrawListener(it) } }
			detach?.let { a.removeOnAttachStateChangeListener(it) }
		}
		pill = null
		host = null
		anchor = null
		preDraw = null
		detach = null
	}

	companion object {
		const val SHOW_MS = 3000L
	}
}
