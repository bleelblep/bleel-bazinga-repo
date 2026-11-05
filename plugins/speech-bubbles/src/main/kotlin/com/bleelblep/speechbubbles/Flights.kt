package com.bleelblep.speechbubbles

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.drawable.Drawable
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.HapticFeedbackConstants
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.view.animation.DecelerateInterpolator
import android.view.animation.OvershootInterpolator
import app.valenced.plugins.PluginScope
import java.lang.ref.WeakReference
import java.lang.reflect.Method
import java.util.WeakHashMap
import java.util.concurrent.ConcurrentHashMap

/**
 * The send animation (folded in from the separate Send Animation plugin). JS sees your own message
 * the moment Discord adds it to the chat (the optimistic MESSAGE_CREATE, whose id is the send's
 * nonce) and calls [expect] with that id. Only built while the setting is on (see the plugin's start).
 *
 * A second hook after the main bind of `com.discord.chat.presentation.message.MessageView` (found
 * by the same signature as the bubbles' hook) reads each bound message's id. For an expected id, on the row's
 * first pre-draw a snapshot of the row is drawn into the window's overlay, which is above
 * everything, the message box included. The snapshot starts on the message box and flies to wherever
 * the row is on each frame (Discord scrolls the list while it lands), while the real row is kept
 * transparent. When it lands the snapshot goes and the row shows again.
 *
 * The row itself is never moved: the list clips its rows and the message box sits on top of it.
 * Discord re-binds the row when the server confirms the message, so a row flies at most once per
 * [ROW_COOLDOWN_MS], and JS settles the server's id so it never counts as a new send.
 *
 * Purely local UI: nothing is sent, requested or stored. The trace holds short hashes of ids, never
 * message text.
 */

private const val MESSAGE_VIEW = "com.discord.chat.presentation.message.MessageView"
private const val MESSAGE = "com.discord.chat.bridge.Message"
private const val CHAT_INPUT = "com.discord.chat.input.views.DCDChatInput"
private const val CONTENT_VIEW = "com.discord.chat.presentation.message.view.MessageContentView"

/** An expected id that hasn't been bound by then is forgotten (scrolled up, other channel). */
private const val EXPECT_TTL_MS = 4000L
/** A row bound this recently before its id was expected still flies (the call came late). */
private const val LATE_WINDOW_MS = 600L
/** A row that just flew doesn't fly again (Discord re-binds it when the send is confirmed). */
private const val ROW_COOLDOWN_MS = 2000L
private const val MAX_IDS = 64
/** Telegram iOS's send duration; iMessage's looks about the same. */
private const val IMESSAGE_DURATION_MS = 300L
/** Telegram iOS's send curves (ChatMessageTransitionNode.AnimationParameters.bezier). */
private val HORIZONTAL = android.view.animation.PathInterpolator(0.23f, 1f, 0.32f, 1f)
private val VERTICAL = android.view.animation.PathInterpolator(0.19919473f, 0.010644531f, 0.27920937f, 0.91025390f)
private const val POP_DURATION_MS = 380L
/** Bigger rows (a tall picture) are faded in place instead of snapshotted. */
private const val MAX_SNAPSHOT_BYTES = 24L * 1024 * 1024
private const val TRACE_SIZE = 40
/** A bubble this many times taller than the message box rises instead of morphing out of the box. */
private const val TALL_FACTOR = 2.2f
/** The rise's lift: a soft ease-out, with no sideways move or stretch. */
private val RISE = android.view.animation.PathInterpolator(0.2f, 0.9f, 0.25f, 1f)

internal enum class FlightStyle { IMESSAGE, POP }

/** Runs [inner] between [start] and [end] of the animation: 0 before, 1 after. */
private class Phase(
	private val start: Float,
	private val end: Float,
	private val inner: android.animation.TimeInterpolator,
) : android.animation.TimeInterpolator {
	override fun getInterpolation(input: Float): Float =
		inner.getInterpolation(((input - start) / (end - start)).coerceIn(0f, 1f))
}


internal class FlightConfig(
	val style: FlightStyle = FlightStyle.IMESSAGE,
	val speed: Float = 1f,
	val haptic: Boolean = true,
)

/** The flying snapshot, drawn by the window's overlay at [x], [y] (top left, window coordinates). */
private class Snapshot(val bitmap: Bitmap) : Drawable() {
	private val paint = Paint(Paint.FILTER_BITMAP_FLAG)
	var x = 0f
	var y = 0f
	var scale = 1f
	/** Squash and stretch on top of [scale]: wider and flatter while it slides along the box. */
	var stretchX = 1f
	var stretchY = 1f
	var rotation = 0f
	/** The point scale and rotation turn around, in the snapshot's own pixels. */
	var pivotX = 0f
	var pivotY = 0f
	var opacity = 1f

	override fun draw(canvas: Canvas) {
		if (bitmap.isRecycled) return
		val save = canvas.save()
		canvas.translate(x + pivotX, y + pivotY)
		canvas.rotate(rotation)
		canvas.scale(scale * stretchX, scale * stretchY)
		canvas.translate(-pivotX, -pivotY)
		paint.alpha = (opacity.coerceIn(0f, 1f) * 255).toInt()
		canvas.drawBitmap(bitmap, 0f, 0f, paint)
		canvas.restoreToCount(save)
	}

	override fun setAlpha(alpha: Int) {}
	override fun setColorFilter(colorFilter: ColorFilter?) {}
	@Deprecated("Deprecated in Java")
	override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
}

/**
 * iMessage's send, drawn in the window overlay: a rounded shape that starts as the message box's
 * text area ([from], box colour) and shrinks to the bubble ([to], bubble colour), with the bubble's
 * own picture ([bubble], text at its real size) inside it, clipped to the shape. Window coordinates.
 */
private class Morph(val bubble: Bitmap, private val boxColor: Int, private val bubbleColor: Int) : Drawable() {
	private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
	private val picture = Paint(Paint.FILTER_BITMAP_FLAG)
	private val clip = android.graphics.Path()
	val rect = android.graphics.RectF()
	var radius = 0f
	/** 0: the message box's colour, 1: the bubble's. */
	var tint = 0f
	/** Where the bubble's picture sits (its left edge), so the text starts where you typed it. */
	var pictureX = 0f
	var opacity = 1f

	override fun draw(canvas: Canvas) {
		if (bubble.isRecycled) return
		val a = opacity.coerceIn(0f, 1f)
		val c = android.animation.ArgbEvaluator().evaluate(tint.coerceIn(0f, 1f), boxColor, bubbleColor) as Int
		fill.color = c
		fill.alpha = (Color.alpha(c) * a).toInt()
		canvas.drawRoundRect(rect, radius, radius, fill)
		val save = canvas.save()
		clip.reset()
		clip.addRoundRect(rect, radius, radius, android.graphics.Path.Direction.CW)
		canvas.clipPath(clip)
		// The text keeps its size; the bubble's own background fades in with the colour change.
		picture.alpha = (a * 255 * (0.6f + 0.4f * tint)).toInt()
		canvas.drawBitmap(bubble, pictureX, rect.centerY() - bubble.height / 2f, picture)
		canvas.restoreToCount(save)
	}

	override fun setAlpha(alpha: Int) {}
	override fun setColorFilter(colorFilter: ColorFilter?) {}
	@Deprecated("Deprecated in Java")
	override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
}

private class Flight(
	val row: View,
	val animator: ValueAnimator,
	val snapshot: Drawable?,
	val overlayHost: ViewGroup?,
)

internal class Flights(private val scope: PluginScope) {
	private val main = Handler(Looper.getMainLooper())

	private val messageViewClass: Class<*> = load(MESSAGE_VIEW)
	private val messageClass: Class<*> = load(MESSAGE)
	private val bind: Method = findBind()

	/** `getId-3Eiw7ao` on 352 (value-class mangled). */
	private val messageId: Method = messageClass.methods.firstOrNull {
		it.parameterTypes.isEmpty() && it.returnType == String::class.java && (it.name == "getId" || it.name.startsWith("getId-"))
	} ?: error("Message.getId not found on this Discord version")

	/** Attachments, embeds and stickers (whichever this build has): a message with any rises whole. */
	private val mediaGetters: List<Method> = messageClass.methods.filter { m ->
		m.parameterTypes.isEmpty() && Collection::class.java.isAssignableFrom(m.returnType) &&
			listOf("getAttachments", "getEmbeds", "getStickers", "getStickerItems").any { m.name == it || m.name.startsWith("$it-") }
	}

	private val isOwn: Method? = messageClass.methods.firstOrNull {
		it.parameterTypes.isEmpty() && (it.name == "isCurrentUserMessageAuthor" || it.name == "getIsCurrentUserMessageAuthor")
	}

	/** id -> uptime it was expected. Written from the JS thread, read on main. */
	private val expected = ConcurrentHashMap<String, Long>()
	/** Ids already shown (a send's nonce and the server's id for it): never fly again. */
	private val settled: MutableSet<String> = ConcurrentHashMap.newKeySet()

	// Main thread only.
	private val flights = WeakHashMap<View, Flight>()
	private val lastFlownAt = WeakHashMap<View, Long>()
	/** Own rows by id, bound in the last [LATE_WINDOW_MS], for an expect that came after the bind. */
	private val recentOwn = LinkedHashMap<String, Pair<WeakReference<View>, Long>>()
	private val boundId = WeakHashMap<View, String>()
	private val ownRows = WeakHashMap<View, Boolean>()
	/** Rows whose message has a picture, file, embed or sticker. */
	private val mediaRows = WeakHashMap<View, Boolean>()
	private var lastList: WeakReference<ViewGroup>? = null
	private var chatInput: WeakReference<View>? = null
	/** Debug replays only: multiplies the duration so a recording can see each frame. */
	private var slow = 1f

	@Volatile var config = FlightConfig()

	@Volatile private var expectCount = 0
	@Volatile private var flown = 0
	@Volatile private var late = 0
	@Volatile private var skipped = 0
	@Volatile private var cancelled = 0
	@Volatile private var lastError: String? = null
	@Volatile private var lastFlight: Map<String, Any?>? = null
	private val trace = ArrayDeque<String>()
	private val started = SystemClock.uptimeMillis()

	private val unhook: Unhook = hookMethod(bind, after = ::afterBind)
	val signature: String = bind.toGenericString()

	fun status(): Map<String, Any?> = mapOf(
		"hooked" to true,
		"expected" to expectCount,
		"flown" to flown,
		"late" to late,
		"skipped" to skipped,
		"cancelled" to cancelled,
		"error" to lastError,
		"lastFlight" to lastFlight,
		"trace" to synchronized(trace) { trace.toList() },
	)

	private fun note(event: String) {
		synchronized(trace) {
			trace.addLast("${SystemClock.uptimeMillis() - started} $event")
			while (trace.size > TRACE_SIZE) trace.removeFirst()
		}
	}

	private fun h(id: String) = Integer.toHexString(id.hashCode() and 0xFFFF)

	/** From JS (any thread): a message of yours with this id is about to be drawn. */
	fun expect(id: String) {
		if (id in settled) return
		val now = SystemClock.uptimeMillis()
		if (expected.size >= MAX_IDS) prune(now)
		expected[id] = now
		expectCount++
		note("expect ${h(id)}")
		// Bound already? Then the call came after the bind; fly it if it was only just drawn.
		main.post {
			val (ref, at) = recentOwn[id] ?: return@post
			val row = ref.get() ?: return@post
			if (now - at > LATE_WINDOW_MS || boundId[row] != id || expected.remove(id) == null) return@post
			late++
			note("late ${h(id)}")
			tryLaunch(row, id)
		}
	}

	/** From JS: the server's copy of a send ([id]) replaced the sending one ([nonce]). */
	fun settle(nonce: String, id: String) {
		if (settled.size > MAX_IDS) settled.clear()
		settled.add(nonce)
		settled.add(id)
		expected.remove(id)
		note("settle ${h(nonce)}->${h(id)}")
	}

	/** Debug (devtools): flies your newest message on screen again. Nothing is sent. */
	fun replay(slowBy: Float) {
		main.post {
			val list = lastList?.get() ?: return@post
			var best: View? = null
			for (i in 0 until list.childCount) {
				val child = list.getChildAt(i)
				if (ownRows[child] != true) continue
				if (best == null || child.bottom > best.bottom) best = child
			}
			val row = best ?: return@post
			slow = slowBy.coerceIn(1f, 20f)
			lastFlownAt.remove(row)
			note("replay")
			launch(row)
		}
	}

	fun dispose() {
		unhook.unhook()
		main.post {
			for (flight in flights.values.toList()) flight.animator.cancel()
			flights.clear()
			recentOwn.clear()
			boundId.clear()
		}
		expected.clear()
		settled.clear()
	}

	private fun load(name: String): Class<*> = runCatching { scope.classLoader.loadClass(name) }
		.getOrElse { error("$name not found on this Discord version") }

	/** First parameter Message, more than six parameters, one a Function0 (by name: class loaders differ). */
	private fun findBind(): Method {
		val matches = messageViewClass.declaredMethods.filter { m ->
			val p = m.parameterTypes
			p.size > 6 && p[0].name == messageClass.name && p.any { it.name == "kotlin.jvm.functions.Function0" }
		}
		if (matches.isEmpty()) error("MessageView bind (Message, …, Function0, …) not found on this Discord version")
		if (matches.size > 1) scope.log.w("${matches.size} MessageView bind candidates; using the first")
		return matches.first().apply { isAccessible = true }
	}

	private fun fail(where: String, e: Throwable) {
		val msg = "$where: ${e.javaClass.simpleName}"
		if (lastError != msg) scope.log.w(msg)
		lastError = msg
		note("error $msg")
	}

	private fun prune(now: Long) {
		val it = expected.entries.iterator()
		while (it.hasNext()) if (now - it.next().value > EXPECT_TTL_MS) it.remove()
	}

	private fun afterBind(param: HookParam) {
		val row = param.thisObject as? View ?: return
		try {
			val message = param.args.getOrNull(0) ?: return
			val id = messageId.invoke(message) as? String ?: return
			val own = isOwn?.invoke(message) == true
			val before = boundId[row]
			boundId[row] = id
			ownRows[row] = own
			if (own) mediaRows[row] = mediaGetters.any { g ->
				runCatching { (g.invoke(message) as? Collection<*>)?.isNotEmpty() == true }.getOrDefault(false)
			}
			(row.parent as? ViewGroup)?.let { lastList = WeakReference(it) }
			val now = SystemClock.uptimeMillis()
			if (own) {
				recentOwn[id] = WeakReference(row) to now
				if (recentOwn.size > MAX_IDS) recentOwn.remove(recentOwn.keys.first())
			}
			if (own && id != before) note("bind ${h(id)} row ${Integer.toHexString(System.identityHashCode(row) and 0xFFFF)}")

			// A recycled row mid-flight now shows someone else's message: land it at once. Your own
			// message (the server's copy replacing the sending one) keeps flying.
			flights[row]?.let { flight ->
				if (!own) {
					flight.animator.cancel()
					cancelled++
				}
			}

			val at = expected.remove(id) ?: return
			if (now - at > EXPECT_TTL_MS) return
			tryLaunch(row, id)
		} catch (e: Throwable) {
			fail("bind", e)
		}
	}

	private fun tryLaunch(row: View, id: String) {
		settled.add(id)
		val now = SystemClock.uptimeMillis()
		val last = lastFlownAt[row]
		if (flights[row] != null || (last != null && now - last < ROW_COOLDOWN_MS)) {
			skipped++
			note("skip ${h(id)} (row just flew)")
			return
		}
		lastFlownAt[row] = now
		launch(row)
	}

	/** Waits for the row's first layout, then flies it in. */
	private fun launch(row: View) {
		flights.remove(row)?.animator?.cancel()
		// Hidden from now on, so Discord's first frame of the row never flashes in place.
		row.alpha = 0f
		val observer = row.viewTreeObserver
		observer.addOnPreDrawListener(object : ViewTreeObserver.OnPreDrawListener {
			override fun onPreDraw(): Boolean {
				if (row.viewTreeObserver.isAlive) row.viewTreeObserver.removeOnPreDrawListener(this)
				else if (observer.isAlive) observer.removeOnPreDrawListener(this)
				try {
					fly(row)
				} catch (e: Throwable) {
					row.alpha = 1f
					fail("fly", e)
				}
				return true
			}
		})
	}

	/** Discord's message box, looked up once per window and kept while it's attached. */
	private fun findChatInput(root: View): View? {
		chatInput?.get()?.let { if (it.isAttachedToWindow && it.rootView === root) return it }
		val found = findByClass(root, CHAT_INPUT)
		chatInput = found?.let { WeakReference(it) }
		return found
	}

	private fun findByClass(view: View, name: String): View? {
		if (view.javaClass.name == name) return view
		if (view is ViewGroup) for (i in 0 until view.childCount) findByClass(view.getChildAt(i), name)?.let { return it }
		return null
	}

	/** The row's last message text (the one just sent, for a grouped row), or null. */
	private fun lastContent(row: View): View? {
		var found: View? = null
		fun walk(v: View) {
			if (v.javaClass.name == CONTENT_VIEW && v.width > 0 && v.isShown) {
				if (found == null || windowPos(v)[1] >= windowPos(found!!)[1]) found = v
			}
			if (v is ViewGroup) for (i in 0 until v.childCount) walk(v.getChildAt(i))
		}
		walk(row)
		return found
	}

	private fun windowPos(view: View): IntArray = IntArray(2).also { view.getLocationInWindow(it) }

	/**
	 * The iMessage flight (see [Morph]): phase one shrinks the box's text area towards the send side
	 * into the bubble's size while it turns the bubble colour, phase two lifts it into the bubble's
	 * place. False when the box or the bubble can't be found; the caller falls back to [fly]'s own.
	 */
	private fun flyMorph(row: View): Boolean {
		val root = row.rootView as? ViewGroup ?: return false
		val input = findChatInput(root) ?: return false
		val bubble = lastContent(row) ?: return false
		if (bubble.width == 0 || bubble.height == 0 || bubble.width.toLong() * bubble.height * 4 > MAX_SNAPSHOT_BYTES) return false
		if (isTall(bubble, input)) return false
		val cfg = config

		val bitmap = Bitmap.createBitmap(bubble.width, bubble.height, Bitmap.Config.ARGB_8888)
		bubble.draw(Canvas(bitmap))
		// The bubble's colour, from just inside its left edge halfway down (its background there).
		val color = bitmap.getPixel((bubble.paddingLeft / 3).coerceIn(0, bitmap.width - 1), bitmap.height / 2)
		// The whole message box: the rounded shape Discord draws around the text field.
		val box = messageBox(input)
		val boxColor = box?.let(::backgroundColor) ?: (color and 0x00FFFFFF or 0x40000000)
		val morph = Morph(bitmap, boxColor, color)

		val inPos = windowPos(input)
		val boxView = box ?: input
		val boxPos = windowPos(boxView)
		val from = android.graphics.RectF(
			boxPos[0].toFloat(),
			boxPos[1].toFloat(),
			(boxPos[0] + boxView.width).toFloat(),
			(boxPos[1] + boxView.height).toFloat(),
		)
		// Your text's place in the box, for the bubble's text to start from.
		val typedX = (inPos[0] + input.paddingLeft - bubble.paddingLeft).toFloat()
		val fromRadius = from.height() / 2f
		val bubbleRadius = minOf(bubble.height / 2f, 18f * row.resources.displayMetrics.density)
		// Where phase one ends: bubble-sized, against the box's right edge, on the box's middle line.
		val mid = android.graphics.RectF(from.right - bubble.width, from.centerY() - bubble.height / 2f, from.right, from.centerY() + bubble.height / 2f)

		val bw = bubble.width.toFloat()
		val bh = bubble.height.toFloat()
		fun lerp(a: Float, b: Float, t: Float) = a + (b - a) * t
		fun update(f: Float) {
			// Telegram iOS's send transition (ChatMessageTransitionNode, modelled on iMessage): the
			// box's frame animates to the bubble's frame, with the horizontal edges and the vertical
			// edges on two different curves at once. The horizontal one is a very fast ease-out, so the
			// left side snaps in towards the send button first; the vertical one starts slowly, so the
			// shrunk shape then rises into place.
			val h = HORIZONTAL.getInterpolation(f)
			val v = VERTICAL.getInterpolation(f)
			// Follows the row: Discord scrolls the list while the message lands.
			val b = if (bubble.isAttachedToWindow) windowPos(bubble) else null
			val toL = b?.get(0)?.toFloat() ?: (from.right - bw)
			val toT = b?.get(1)?.toFloat() ?: (from.top - bh)
			morph.rect.set(
				lerp(from.left, toL, h),
				lerp(from.top, toT, v),
				lerp(from.right, toL + bw, h),
				lerp(from.bottom, toT + bh, v),
			)
			morph.pictureX = lerp(typedX, toL, h)
			morph.radius = lerp(fromRadius, bubbleRadius, h)
			morph.tint = h
			morph.opacity = (f / 0.05f).coerceIn(0f, 1f)
			morph.invalidateSelf()
			row.alpha = 0f
		}

		morph.setBounds(0, 0, root.width, root.height)
		update(0f)
		root.overlay.add(morph)
		val animator = ValueAnimator.ofFloat(0f, 1f)
		animator.duration = (IMESSAGE_DURATION_MS * cfg.speed * slow).toLong()
		slow = 1f
		animator.interpolator = null
		animator.addUpdateListener { update(it.animatedFraction) }
		animator.addListener(object : AnimatorListenerAdapter() {
			private var wasCancelled = false
			override fun onAnimationCancel(animation: Animator) { wasCancelled = true }
			override fun onAnimationEnd(animation: Animator) {
				row.alpha = 1f
				runCatching { root.overlay.remove(morph) }
				bitmap.recycle()
				if (flights[row]?.animator === animator) flights.remove(row)
				if (!wasCancelled && cfg.haptic) runCatching { row.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP) }
				note(if (wasCancelled) "cancelled" else "landed")
			}
		})
		flights[row] = Flight(row, animator, morph, root)
		flown++
		lastFlight = mapOf(
			"style" to "IMESSAGE", "ms" to animator.duration, "morph" to true,
			"bubble" to "${bubble.width}x${bubble.height}",
			"box" to (box?.let { "${it.javaClass.name} ${it.width}x${it.height}" } ?: "not found, used the text field"),
			"boxColor" to Integer.toHexString(boxColor), "bubbleColor" to Integer.toHexString(color),
		)
		note("morph ${bubble.width}x${bubble.height} from ${from.width().toInt()}x${from.height().toInt()}")
		animator.start()
		return true
	}

	/**
	 * The message box around the text field: the nearest ancestor (up to six levels) that draws a
	 * background and is wider than the field. Null when there's none.
	 */
	private fun messageBox(input: View): View? {
		var v: View? = input.parent as? View
		var depth = 0
		while (v != null && depth < 6) {
			if (v.background != null && v.width > input.width && v.height < input.height * 3) return v
			v = v.parent as? View
			depth++
		}
		return null
	}

	/**
	 * A long paragraph: much taller than the message box (which is back to one line by the time the
	 * row is drawn). Morphing the box into it showed only its middle lines growing out of a sliver.
	 */
	private fun isTall(bubble: View, input: View): Boolean {
		val box = messageBox(input) ?: input
		return box.height > 0 && bubble.height > box.height * TALL_FACTOR
	}

	/** A view's background colour, read by drawing just the background and sampling its middle. */
	private fun backgroundColor(view: View): Int? = runCatching {
		val bg = view.background ?: return null
		val w = view.width.coerceAtLeast(1)
		val h = view.height.coerceAtLeast(1)
		val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
		bg.draw(Canvas(bmp))
		val c = bmp.getPixel(w / 2, h / 2)
		bmp.recycle()
		c.takeIf { Color.alpha(it) > 0 }
	}.getOrNull()

	/**
	 * A picture, file, embed or sticker. The Message getters miss some (the optimistic copy of an
	 * upload), so a row with no text, or one much taller than its text, counts too.
	 */
	private fun isMedia(row: View): Boolean {
		if (mediaRows[row] == true) return true
		val content = lastContent(row) ?: return true
		return row.height - content.height > 96f * row.resources.displayMetrics.density
	}

	/**
	 * Media moves the real row, not a snapshot: when the row is first drawn the picture is still
	 * uploading or loading, so a snapshot flew a blank placeholder and the picture popped in after
	 * it landed. The row rises a short way from behind the message box (the list clips it there),
	 * growing from its corner and fading in, and the picture can load while it moves.
	 */
	private fun flyLive(row: View) {
		val cfg = config
		val pop = cfg.style == FlightStyle.POP
		val density = row.resources.displayMetrics.density
		val lift = if (pop) 0f else minOf(row.height * 0.3f, 120f * density)
		val fromScale = if (pop) 0.7f else 0.9f
		row.pivotX = if (pop) row.width / 2f else row.width.toFloat()
		row.pivotY = if (pop) row.height / 2f else row.height.toFloat()
		fun apply(f: Float) {
			row.translationY = lift * (1f - f)
			val sc = fromScale + (1f - fromScale) * f
			row.scaleX = sc
			row.scaleY = sc
			row.alpha = (f * 3f).coerceIn(0f, 1f)
		}
		fun reset() {
			row.translationY = 0f
			row.scaleX = 1f
			row.scaleY = 1f
			row.alpha = 1f
			if (android.os.Build.VERSION.SDK_INT >= 28) row.resetPivot()
		}
		val animator = ValueAnimator.ofFloat(0f, 1f)
		val base = if (pop) POP_DURATION_MS.toFloat() else IMESSAGE_DURATION_MS * 1.4f
		animator.duration = (base * cfg.speed * slow).toLong()
		slow = 1f
		animator.interpolator = if (pop) OvershootInterpolator(1.6f) else RISE
		animator.addUpdateListener { apply(it.animatedValue as Float) }
		animator.addListener(object : AnimatorListenerAdapter() {
			private var wasCancelled = false
			override fun onAnimationCancel(animation: Animator) { wasCancelled = true }
			override fun onAnimationEnd(animation: Animator) {
				reset()
				if (flights[row]?.animator === animator) flights.remove(row)
				if (!wasCancelled && cfg.haptic) runCatching { row.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP) }
				note(if (wasCancelled) "cancelled" else "landed")
			}
		})
		apply(0f)
		flights[row] = Flight(row, animator, null, null)
		flown++
		lastFlight = mapOf("style" to "LIVE", "pop" to pop, "ms" to animator.duration, "rowH" to row.height, "lift" to lift)
		note("live ${if (pop) "pop" else "rise"} h=${row.height} lift=${lift.toInt()}")
		animator.start()
	}

	private fun fly(row: View) {
		val media = row.isAttachedToWindow && isMedia(row)
		if (media) {
			flyLive(row)
			return
		}
		if (config.style == FlightStyle.IMESSAGE && row.isAttachedToWindow && flyMorph(row)) return
		if (row.width == 0 || row.height == 0 || !row.isAttachedToWindow) {
			row.alpha = 1f
			return
		}
		val cfg = config
		val root = row.rootView as? ViewGroup
		val bytes = row.width.toLong() * row.height * 4
		val snapshot = if (root != null && bytes <= MAX_SNAPSHOT_BYTES) {
			val bitmap = Bitmap.createBitmap(row.width, row.height, Bitmap.Config.ARGB_8888)
			// draw() ignores the row's own alpha (its parent applies that), so the snapshot is opaque.
			row.draw(Canvas(bitmap))
			Snapshot(bitmap)
		} else null

		val target0 = windowPos(row)
		val input = root?.let(::findChatInput)
		val inputPos = input?.let(::windowPos)
		// The text in the message box: its left edge (after padding) and its middle.
		val boxTextLeft = if (inputPos != null && input != null) (inputPos[0] + input.paddingLeft).toFloat() else target0[0].toFloat()
		val boxCenterY = if (inputPos != null && input != null) inputPos[1] + input.height / 2f
		else ((row.parent as? View)?.let { windowPos(it)[1] + it.height } ?: (target0[1] + row.height)).toFloat()

		// The bubble inside the row (the message text), relative to the row's top left. Without
		// one, the whole row stands in for it.
		// A picture or file sends the whole row (the text alone would leave the picture behind).
		val bubble = if (media) null else lastContent(row)
		// iMessage for a picture, file or long paragraph: the whole thing rises out of the box,
		// with no squash, stretch or sideways slide (those only suit a short line of text).
		val rise = cfg.style == FlightStyle.IMESSAGE && (media || bubble == null || (input != null && isTall(bubble, input)))
		val bubblePos = bubble?.let(::windowPos)
		val bx = if (bubblePos != null) (bubblePos[0] - target0[0]).toFloat() else 0f
		val by = if (bubblePos != null) (bubblePos[1] - target0[1]).toFloat() else 0f
		val bw = (bubble?.width ?: row.width).toFloat()
		val bh = (bubble?.height ?: row.height).toFloat()

		// Start offsets from the row's landing place (top left), per style.
		val fromY: Float
		val fromX: Float
		val fromScale: Float
		val fromRotation = 0f
		val pathY: android.animation.TimeInterpolator
		val pathX: android.animation.TimeInterpolator
		when {
			rise -> {
				// Its bottom starts on the box's middle line and lifts into place, slightly smaller.
				fromX = 0f
				fromY = boxCenterY - (target0[1] + by + bh)
				fromScale = 0.92f
				pathY = RISE
				pathX = RISE
			}
			cfg.style == FlightStyle.IMESSAGE -> {
				// iMessage: your text becomes the bubble where it sits in the box (its left edge on the
				// text's, its middle on the box's middle), slides right along the box, then lifts into place.
				fromX = boxTextLeft - (target0[0] + bx)
				fromY = boxCenterY - (target0[1] + by + bh / 2f)
				fromScale = 0.9f
				pathY = Phase(0.35f, 1f, android.view.animation.PathInterpolator(0.4f, 0f, 0.2f, 1f))
				pathX = Phase(0f, 0.6f, DecelerateInterpolator(1.8f))
			}
			else -> {
				fromY = 0f; fromX = 0f; fromScale = 0.4f
				pathY = OvershootInterpolator(2.0f); pathX = pathY
			}
		}

		snapshot?.apply {
			// iMessage stretches back from the leading (right) edge; Pop grows from the middle.
			pivotX = if (cfg.style == FlightStyle.IMESSAGE) bx + bw else bx + bw / 2f
			pivotY = if (rise) by + bh else by + bh / 2f
			x = target0[0] + fromX
			y = target0[1] + fromY
			scale = fromScale
			rotation = fromRotation
			opacity = 0f
		}
		if (snapshot != null) root!!.overlay.add(snapshot)

		val animator = ValueAnimator.ofFloat(0f, 1f)
		val base = if (cfg.style == FlightStyle.IMESSAGE) IMESSAGE_DURATION_MS else POP_DURATION_MS
		animator.duration = (base * cfg.speed * slow).toLong()
		slow = 1f
		animator.interpolator = null // linear clock; each part eases on its own below
		val fade = DecelerateInterpolator(2f)
		animator.addUpdateListener { a ->
			val f = a.animatedFraction
			if (snapshot == null) {
				row.alpha = fade.getInterpolation(f)
				return@addUpdateListener
			}
			// Discord can scroll the list while the message lands: follow the row.
			val target = if (row.isAttachedToWindow) windowPos(row) else target0
			val ty = 1f - pathY.getInterpolation(f)
			val tx = 1f - pathX.getInterpolation(f)
			snapshot.x = target[0] + fromX * tx
			snapshot.y = target[1] + fromY * ty
			snapshot.scale = 1f + (fromScale - 1f) * ty
			snapshot.rotation = fromRotation * ty
			if (rise) {
				snapshot.opacity = fade.getInterpolation((f * 4f).coerceAtMost(1f))
			} else if (cfg.style == FlightStyle.IMESSAGE) {
				// Stretched while it slides along the box (most at the middle of the slide), back to
				// its own shape as it lifts.
				val slide = Math.sin(Math.PI * (f / 0.6f).coerceIn(0f, 1f)).toFloat()
				snapshot.stretchX = 1f + 0.45f * slide
				snapshot.stretchY = 1f - 0.12f * slide
				snapshot.opacity = fade.getInterpolation((f * 5f).coerceAtMost(1f))
			} else {
				snapshot.opacity = fade.getInterpolation((f * 10f).coerceAtMost(1f))
			}
			snapshot.invalidateSelf()
			row.alpha = 0f
		}
		animator.addListener(object : AnimatorListenerAdapter() {
			private var wasCancelled = false
			override fun onAnimationCancel(animation: Animator) { wasCancelled = true }
			override fun onAnimationEnd(animation: Animator) {
				row.alpha = 1f
				if (snapshot != null) {
					runCatching { root!!.overlay.remove(snapshot) }
					snapshot.bitmap.recycle()
				}
				if (flights[row]?.animator === animator) flights.remove(row)
				if (!wasCancelled && cfg.haptic) runCatching { row.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP) }
				note(if (wasCancelled) "cancelled" else "landed")
			}
		})
		// Bounds cover the window so the overlay redraws wherever the snapshot is.
		snapshot?.setBounds(0, 0, root!!.width, root.height)
		flights[row] = Flight(row, animator, snapshot, root)
		flown++
		lastFlight = mapOf(
			"style" to (if (rise) "RISE" else cfg.style.name), "media" to media, "ms" to animator.duration, "snapshot" to (snapshot != null),
			"input" to (input != null), "rowTop" to target0[1], "rowH" to row.height, "fromY" to fromY,
		)
		note("fly ${if (rise) "RISE" else cfg.style.name} media=$media fromY=${fromY.toInt()} input=${input != null}")
		animator.start()
	}
}
