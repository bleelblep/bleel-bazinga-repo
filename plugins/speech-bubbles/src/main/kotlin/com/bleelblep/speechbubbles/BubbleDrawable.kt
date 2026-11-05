package com.bleelblep.speechbubbles

import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.drawable.Drawable

/** Where a message sits in its author's run of messages (Discord's ONLY/START/MIDDLE/END). */
internal enum class GroupPosition { ONLY, START, MIDDLE, END;
	companion object {
		fun of(name: String?): GroupPosition = entries.firstOrNull { it.name == name } ?: ONLY
	}
}

/**
 * The bubble: a rounded rectangle with, on the last bubble of a group, a small curved tail at the
 * bottom corner of the tail side (right for own messages, left for others). Corners that touch a
 * neighbouring bubble of the same group are smaller, as in iMessage. Which ends touch one is the
 * caller's call ([setShape]): Discord's group position alone also counts a picture, reactions or
 * a reply quote in between.
 *
 * With tails on, the body is always inset by [tailWidth] on the tail side, whether or not the tail
 * is drawn, and the text's padding reserves that width. With tails off ("Tails" setting) there is
 * no inset and no tail; switching it is a size change, so the text is measured again. So a join
 * change (a new message turning the last bubble into a middle one) only changes what is drawn,
 * never the view's size: an invalidate is enough.
 *
 * Drawn for the right side; the left side is the same picture mirrored.
 *
 * It can also leave a strip empty under the body ([setBottomGap]) for the message's time ("Tap:
 * under the bubble"), drawn by the row's TimeTag; the text view's bottom padding reserves it.
 */
internal class BubbleDrawable(
	private var radius: Float,
	private var smallRadius: Float,
	val tailWidth: Float,
	private val tailHeight: Float,
) : Drawable() {
	private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
	private val body = Path()
	private val tail = Path()
	private val rect = RectF()
	private val radii = FloatArray(8)

	var tailRight = true
		private set
	/** This bubble's top / bottom touches another bubble of the same group: small corner there. */
	var joinTop = false
		private set
	var joinBottom = false
		private set
	var tails = true
		private set

	private val inset get() = if (tails) tailWidth else 0f

	/** The "Roundness" setting: the outer corners, and the smaller ones where bubbles join. */
	fun setRadii(outer: Float, joined: Float) {
		if (outer == radius && joined == smallRadius) return
		radius = outer
		smallRadius = joined
		rebuild(bounds)
		invalidateSelf()
	}

	fun setColor(color: Int) {
		if (paint.color == color) return
		paint.color = color
		invalidateSelf()
	}

	/** Side, joins and tails; only redraws (the caller re-measures when tails change). */
	fun setShape(tailRight: Boolean, joinTop: Boolean, joinBottom: Boolean, tails: Boolean) {
		if (this.tailRight == tailRight && this.joinTop == joinTop && this.joinBottom == joinBottom && this.tails == tails) return
		this.tailRight = tailRight
		this.joinTop = joinTop
		this.joinBottom = joinBottom
		this.tails = tails
		rebuild(bounds)
		invalidateSelf()
	}

	/** Space left empty above the bubble (under their name); the text's top padding includes it. */
	private var topGap = 0f

	fun setTopGap(px: Float) {
		if (topGap == px) return
		topGap = px
		rebuild(bounds)
		invalidateSelf()
	}

	/** Space left empty below the bubble (for its time); the text's bottom padding includes it. */
	var bottomGap = 0f
		private set

	fun setBottomGap(px: Float) {
		if (bottomGap == px) return
		bottomGap = px
		rebuild(bounds)
		invalidateSelf()
	}

	override fun onBoundsChange(bounds: Rect) {
		super.onBoundsChange(bounds)
		rebuild(bounds)
	}

	private fun rebuild(b: Rect) {
		body.reset()
		tail.reset()
		if (b.isEmpty) return
		// Drawn as if the tail were on the right; draw() mirrors for the left.
		rect.set(b.left.toFloat(), b.top + topGap, b.right - inset, b.bottom - bottomGap)
		// A pill at most: corners past half the height would overlap.
		val max = minOf(rect.height(), rect.width()) / 2f
		val outer = minOf(radius, max)
		val top = minOf(if (joinTop) smallRadius else radius, max)
		val bottom = minOf(if (joinBottom) smallRadius else radius, max)
		// Order: top-left, top-right, bottom-right, bottom-left (x, y each).
		radii[0] = outer; radii[1] = outer
		radii[2] = top; radii[3] = top
		radii[4] = bottom; radii[5] = bottom
		radii[6] = outer; radii[7] = outer
		body.addRoundRect(rect, radii, Path.Direction.CW)

		if (tails && !joinBottom) {
			val r = rect.right
			val bt = rect.bottom
			val h = minOf(tailHeight, rect.height() / 2f)
			val w = tailWidth
			tail.moveTo(r, bt - h)
			// Outer edge: down the side and out to the tip at the bottom corner of the bounds.
			tail.cubicTo(r, bt - h * 0.35f, r + w * 0.45f, bt, r + w, bt)
			// Inner edge: back from the tip into the body (whatever lands inside the body is hidden).
			tail.quadTo(r - w * 0.5f, bt, r - w * 2f, bt - w * 0.8f)
			tail.lineTo(r - w * 2f, bt - h)
			tail.close()
		}
	}

	override fun draw(canvas: Canvas) {
		if (body.isEmpty) return
		val save = canvas.save()
		if (!tailRight) canvas.scale(-1f, 1f, bounds.exactCenterX(), bounds.exactCenterY())
		canvas.drawPath(body, paint)
		if (!tail.isEmpty) canvas.drawPath(tail, paint)
		canvas.restoreToCount(save)
	}

	override fun setAlpha(alpha: Int) {
		paint.alpha = alpha
		invalidateSelf()
	}

	override fun setColorFilter(colorFilter: ColorFilter?) {
		paint.colorFilter = colorFilter
		invalidateSelf()
	}

	@Deprecated("Deprecated in Java")
	override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
}
