package com.bleelblep.livemarkdown

import android.graphics.Typeface
import android.text.TextPaint
import android.text.style.CharacterStyle
import android.text.style.MetricAffectingSpan

/**
 * Home-made spans instead of StyleSpan / UnderlineSpan / …: the framework ones are
 * `ParcelableSpan`s, so copying from the box and pasting would carry the styling into the text as
 * real formatting. These are dropped on copy. [key] identifies a span by look, so a restyle only
 * touches spans that actually changed.
 */
internal interface MdSpan {
	val key: String
}

internal class StyleMd(private val style: Int) : MetricAffectingSpan(), MdSpan {
	override val key = "style$style"
	override fun updateDrawState(tp: TextPaint) = apply(tp)
	override fun updateMeasureState(tp: TextPaint) = apply(tp)

	private fun apply(tp: TextPaint) {
		val old = tp.typeface
		val wanted = (old?.style ?: Typeface.NORMAL) or style
		val tf = if (old == null) Typeface.defaultFromStyle(wanted) else Typeface.create(old, wanted)
		val missing = wanted and tf.style.inv()
		if (missing and Typeface.BOLD != 0) tp.isFakeBoldText = true
		if (missing and Typeface.ITALIC != 0) tp.textSkewX = -0.25f
		tp.typeface = tf
	}
}

internal class MonoMd : MetricAffectingSpan(), MdSpan {
	override val key = "mono"
	override fun updateDrawState(tp: TextPaint) = apply(tp)
	override fun updateMeasureState(tp: TextPaint) = apply(tp)

	private fun apply(tp: TextPaint) {
		tp.typeface = Typeface.create(Typeface.MONOSPACE, tp.typeface?.style ?: Typeface.NORMAL)
	}
}

internal class SizeMd(private val factor: Float) : MetricAffectingSpan(), MdSpan {
	override val key = "size$factor"
	override fun updateDrawState(tp: TextPaint) { tp.textSize *= factor }
	override fun updateMeasureState(tp: TextPaint) { tp.textSize *= factor }
}

internal class ColorMd(private val color: Int) : CharacterStyle(), MdSpan {
	override val key = "color$color"
	override fun updateDrawState(tp: TextPaint) { tp.color = color }
}

internal class BackgroundMd(private val color: Int) : CharacterStyle(), MdSpan {
	override val key = "bg$color"
	override fun updateDrawState(tp: TextPaint) { tp.bgColor = color }
}

internal class UnderlineMd : CharacterStyle(), MdSpan {
	override val key = "underline"
	override fun updateDrawState(tp: TextPaint) { tp.isUnderlineText = true }
}

internal class StrikeMd : CharacterStyle(), MdSpan {
	override val key = "strike"
	override fun updateDrawState(tp: TextPaint) { tp.isStrikeThruText = true }
}
