package com.bleelblep.speechbubbles

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.drawable.Drawable

/**
 * A message's time drawn under its bubble ("Tap: under the bubble"), in the row's `overlay`, in
 * room the bubble's bottom padding keeps. Its bounds cover the row; [set] says what and where.
 */
internal class TimeTag : Drawable() {
	private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
	private var text = ""
	private var x = 0f
	private var y = 0f

	/** [x] is the right edge when [rightAligned] (left of own bubbles), else the left edge; [y] is the baseline. */
	fun set(text: String, color: Int, size: Float, x: Float, y: Float, rightAligned: Boolean) {
		this.text = text
		paint.color = color
		paint.textSize = size
		paint.textAlign = if (rightAligned) Paint.Align.RIGHT else Paint.Align.LEFT
		this.x = x
		this.y = y
		invalidateSelf()
	}

	private val rule = Paint(Paint.ANTI_ALIAS_FLAG)
	private var ruleLeft = 0f
	private var ruleRight = 0f

	/**
	 * Centred on [x] (a time break above a row); [y] is the baseline. A thin rule runs from
	 * [left] and to [right] on either side of the text, [stroke] thick, when left < right.
	 */
	fun setCentered(text: String, color: Int, size: Float, x: Float, y: Float, left: Float, right: Float, stroke: Float) {
		this.text = text
		paint.color = color
		paint.textSize = size
		paint.textAlign = Paint.Align.CENTER
		this.x = x
		this.y = y
		rule.color = (color and 0x00FFFFFF) or ((Color.alpha(color) * 0.4f).toInt() shl 24)
		rule.strokeWidth = stroke
		ruleLeft = left
		ruleRight = right
		invalidateSelf()
	}

	/** Descent at the current size, to sit the baseline above the bubble's bottom padding. */
	fun descent(): Float = paint.fontMetrics.descent

	override fun draw(canvas: Canvas) {
		if (text.isEmpty()) return
		canvas.drawText(text, x, y, paint)
		if (paint.textAlign != Paint.Align.CENTER || ruleLeft >= ruleRight) return
		// Rules at the text's middle height, a text-height's gap away on each side.
		val half = paint.measureText(text) / 2f
		val gap = paint.textSize * 0.8f
		val ry = y + (paint.fontMetrics.ascent + paint.fontMetrics.descent) / 2f
		if (x - half - gap > ruleLeft) canvas.drawLine(ruleLeft, ry, x - half - gap, ry, rule)
		if (x + half + gap < ruleRight) canvas.drawLine(x + half + gap, ry, ruleRight, ry, rule)
	}

	override fun setAlpha(alpha: Int) {
		paint.alpha = alpha
		rule.alpha = (alpha * 0.4f).toInt()
		invalidateSelf()
	}

	override fun setColorFilter(colorFilter: ColorFilter?) {
		paint.colorFilter = colorFilter
		invalidateSelf()
	}

	@Deprecated("Deprecated in Java")
	override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
}
