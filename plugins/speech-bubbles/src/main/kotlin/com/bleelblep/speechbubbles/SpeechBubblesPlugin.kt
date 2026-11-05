@file:JvmName("SpeechBubblesPlugin")

package com.bleelblep.speechbubbles

import android.content.res.ColorStateList
import android.view.MotionEvent
import android.view.ViewConfiguration
import kotlin.math.abs
import android.graphics.Canvas
import android.graphics.Color
import android.text.Spanned
import android.text.TextPaint
import android.text.style.ClickableSpan
import android.graphics.drawable.Drawable
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.widget.TextView
import app.valenced.plugins.PluginScope
import app.valenced.plugins.plugin
import app.valenced.xposed.api.registerNativeMethod
import java.lang.reflect.Method
import java.util.WeakHashMap

/**
 * Messages drawn as bubbles: the current user's own on the right (no name, time or avatar), other
 * people's on the left (header and avatar stock). DMs and group DMs only, unless "Show everywhere"
 * is on. Colours come from JS (the theme's tokens) through `configure`.
 *
 * Hooks the main bind of `com.discord.chat.presentation.message.MessageView` (an R8-renamed method,
 * found by signature) and, after every bind, decides whether that row is a bubble row. The text is a
 * `MessageContentView` that is a direct child of the row's `MessageAccessoriesView`, a RecyclerView
 * whose items are bound during its next layout, not inside the row bind. So the decision is stored
 * per row and applied while each text is measured (a hook on `TextView.onMeasure`, which returns at
 * once for any other view), and an OnLayoutChangeListener on the accessories view places the bubble
 * with `translationX` once its width is known. Discord's constraints are never touched.
 *
 * Groups: the bind's `Function0` says where the row sits in its author's run (ONLY/START/MIDDLE/
 * END). It's kept per row and read again after later binds, because a new message turns the old
 * END into MIDDLE without re-binding it. The bubble's tail and small inner corners follow it;
 * other people's avatar stays where Discord puts it, on a run's first row.
 *
 * Times (tap modes): touches are watched at the row (a before-hook on
 * `ViewGroup.dispatchTouchEvent`, which never changes an event or result). A plain tap on any
 * bubble (yours or theirs) shows its time under the bubble (TimeTag, in room the bubble's bottom
 * padding makes) or in a pop-up above it (TimePopups), depending on the setting.
 *
 * Recycling: rows and text views are reused for other messages (the text views can even move
 * between rows through a shared pool). Every text view's originals are saved before the first
 * change and put back whenever it sits in a row that isn't a bubble row, so other rows look stock.
 *
 * Purely local UI: no network, no dispatch, no store writes. Logs and status never hold message text.
 */

private const val MESSAGE_VIEW = "com.discord.chat.presentation.message.MessageView"
private const val MESSAGE = "com.discord.chat.bridge.Message"
private const val ACCESSORIES_VIEW = "com.discord.chat.presentation.message.MessageAccessoriesView"
private const val CONTENT_VIEW = "com.discord.chat.presentation.message.view.MessageContentView"
/** Discord's reactions row (the chips and its "+" button), a child of the accessories list. */
private const val REACTIONS_VIEW = "com.discord.reactions.ShortcutsFlexbox"
private const val ADD_REACTION_BUTTON = "com.discord.reactions.AddReactionView"
/** Reactions on the bubble's corner: their size there, and how far they reach over the corner. */
private const val TAPBACK_SCALE = 0.85f
private const val TAPBACK_OVERLAP_DP = 14f
/** translationZ (px) for a row with a corner badge, so it draws over the row above. */
private const val TAPBACK_ROW_Z = 1f
/** Two-finger swipe: the most the bubbles slide left (they slide as far as the widest time needs). */
private const val SWIPE_MAX_DP = 160f
private const val SWIPE_BACK_MS = 220L
private const val SWIPE_TIME_PAD_DP = 12f

/** Fallbacks until JS has sent the theme's colours. */
private const val OWN_BG = 0xFF5865F2.toInt()
private const val OWN_TEXT = 0xFFFFFFFF.toInt()
private const val OTHER_BG = 0xFF2B2D31.toInt()
private const val OTHER_TEXT = 0xFFDBDEE1.toInt()
private const val RADIUS_DP = 18f
private const val SMALL_RADIUS_DP = 6f
private const val TAIL_W_DP = 6f
private const val TAIL_H_DP = 14f
private const val PAD_H_DP = 12f
private const val PAD_V_DP = 8f
private const val RIGHT_GAP_DP = 8f
private const val MAX_WIDTH_FRACTION = 0.75f

/** Message types drawn as bubbles. Anything else (system messages, calls, joins) stays stock. */
private val BUBBLE_TYPES = setOf("DEFAULT", "REPLY")
private const val MAX_SEEN_TYPES = 16
private const val TIME_TEXT_SP = 11f
/** Between a bubble and the time under it, and from the bubble's edge to the time's. */
private const val TIME_GAP_DP = 2f
private const val TIME_INSET_DP = 4f
private const val MAX_SHOWN_TIMES = 200
/** Space between their name and their first bubble. */
private const val NAME_GAP_DP = 6f
/** Discord snowflakes count milliseconds from 2015-01-01T00:00:00Z. */
private const val DISCORD_EPOCH = 1420070400000L
/** "Hide avatars": their bubbles and names start this far from the row's left edge. */
private const val AVATAR_MARGIN_DP = 12f
/** "Colour per person": how many hues people are spread over. */
private const val PERSON_HUES = 8
/** Time breaks: the text size, the gap above and below it, and the rules' inset from the row's edges. */
private const val BREAK_TEXT_SP = 12f
private const val BREAK_PAD_DP = 12f
private const val BREAK_RULE_MARGIN_DP = 16f
/** The views that make up their avatar, moved together (alignAvatar). */
private val AVATAR_VIEWS = listOf("author_avatar", "author_avatar_decoration")

/** How a row is drawn. */
private enum class Mode { NONE, OWN, OTHER }

/** What the bubbles look like and where they show. Written from JS, read on the main thread. */
private class Config(
	val everywhere: Boolean = false,
	/** Times setting: true = "Show on tap", false = "Hidden". */
	val tapTimes: Boolean = false,
	/** With [tapTimes]: true = drawn under the bubble (TimeTag), false = a pop-up above it (TimePopups). */
	val timesBelow: Boolean = true,
	/** "Tails" setting: tail on the last bubble of a run, and its room reserved. */
	val tails: Boolean = true,
	/** "Use my own colours" is on (JS has already put them in the colours below). */
	val custom: Boolean = false,
	/** "Hide avatars": other people's avatars hidden, their bubbles and names moved into the column. */
	val hideAvatars: Boolean = false,
	/** "Colour per person": in chats with two or more other people, each gets their own bubble hue. */
	val perPerson: Boolean = false,
	/** "Time breaks": a centred time above the first message after a quiet gap (JS says which). */
	val timeBreaks: Boolean = false,
	/** "Invisible ink": hidden spoilers drawn as moving specks (InvisibleInk.kt). */
	val invisibleInk: Boolean = true,
	/** "iOS-style reactions": Discord's reaction chips, in place, as round pills in the bubble colours. */
	val iosReactions: Boolean = true,
	/** The chat background (for the ring around reaction badges), or null when JS didn't send one. */
	val chatBg: Int? = null,
	/** "On the bubble's corner": reactions moved to the bubble's top corner, like iMessage tapbacks. */
	val tapbackCorner: Boolean = true,
	/** "Swipe for times": two fingers dragging the chat left show every message's time. */
	val swipeTimes: Boolean = true,
	/** Bubbles' "Roundness": the outer corner radius in dp (the joined corners scale with it). */
	val bubbleRadiusDp: Float = RADIUS_DP,
	val ownBg: Int = OWN_BG,
	val ownText: Int = OWN_TEXT,
	val otherBg: Int = OTHER_BG,
	val otherText: Int = OTHER_TEXT,
	val tokens: Map<String, String?> = emptyMap(),
) {
	val ownColors: ColorStateList = ColorStateList.valueOf(ownText)
	val otherColors: ColorStateList = ColorStateList.valueOf(otherText)
	fun bg(mode: Mode) = if (mode == Mode.OWN) ownBg else otherBg
	fun text(mode: Mode) = if (mode == Mode.OWN) ownColors else otherColors
}

/** `#RRGGBBAA` (or `#RRGGBB`) to an Android ARGB int; null when it isn't one. */
internal fun parseColor(value: Any?): Int? {
	val s = (value as? String)?.trim()?.removePrefix("#") ?: return null
	if (s.length != 6 && s.length != 8) return null
	val v = s.toLongOrNull(16) ?: return null
	return if (s.length == 6) (0xFF000000L or v).toInt()
	else (((v and 0xFFL) shl 24) or (v ushr 8)).toInt()
}

private fun hex(color: Int) = "#%06X%02X".format(color and 0xFFFFFF, (color ushr 24) and 0xFF)

/** A text view's look before we touched it. */
private class SavedText(
	val background: Drawable?,
	val padding: IntArray,
	val lpWidth: Int?,
	val maxWidth: Int,
	val translationX: Float,
	val textColors: ColorStateList,
	val bubble: BubbleDrawable,
) {
	/** The colours we last gave the text, so a colour Discord set since is left alone on restore. */
	var ourColors: ColorStateList? = null
}

/** A row we have seen: how it's drawn now, the message facts that decided it, and what we hid. */
private class RowState(val accessories: ViewGroup?, val listener: View.OnLayoutChangeListener?) {
	var mode = Mode.NONE
	/** From the last bind, so a scope change can re-decide without waiting for one. */
	var own = false
	var inGuild = false
	var bubbleType = false
	/** The bind's group-position supplier (a Discord `Function0`), read again for stale tails. */
	var supplier: Any? = null
	var position = GroupPosition.ONLY
	/**
	 * What the rows next to this one say about joining, from the last on-screen pass
	 * ([checkNeighbours]): false when the row above ends (or the row below starts) with something
	 * that isn't a bubble. Null when that row isn't on screen, so the group position decides.
	 */
	var aboveJoins: Boolean? = null
	var belowJoins: Boolean? = null
	/** Author id as text, for the run's time template (TimeTemplates). */
	var authorKey: String? = null
	/** The bound message's id and Discord's own formatted time, for "Show on tap". */
	var messageId: String? = null
	var timestamp: String? = null
	/** The pop-up's text when Discord wrote a short time (with Timezones' part); null on later messages. */
	var popupTime: String? = null
	/** For later messages: channel and send time, to build their time like the run's first message. */
	var channelKey: String? = null
	var sentAt: Long? = null
	/** Discord's time in an other-person row's header, hidden by us under "Show on tap". */
	var otherTimeHidden: View? = null
	/** The long form of the time ("Tuesday, October 27, 2026 11:58 PM") for the pop-up. */
	var fullTime: String? = null
	/** The time shown under this row's bubble ("Tap: under the bubble"), in the row's overlay. */
	var timeTag: TimeTag? = null
	/** Header (R.id.header) visibility before we hid it; Discord never sets it itself. */
	var headerSaved: Int? = null
	/** Views Discord re-sets on every bind (name, time, avatar) -> the visibility we gave them. */
	val hidden = HashMap<View, Int>()
	/** "Hide avatars": views of this row we moved left (accessories, header, reply preview) -> their translationX before. */
	val shifted = HashMap<View, Float>()
	/** Own replies: preview views we moved right or mirrored -> their (translationX, scaleX) before. */
	val replyMoved = HashMap<View, Pair<Float, Float>>()
	/** Their avatar (and decoration) is moved down beside the first bubble (alignAvatar). */
	var avatarMoved = false
	/** This row's avatar views (author_avatar, author_avatar_decoration), found once. */
	var avatarViews: List<View>? = null
	/** A pre-draw alignment of the avatar is waiting on this row (scheduleRowAlign). */
	var avatarAlignPending = false
	/** Time break: the row's topmost part we padded for it, its top padding before, and the label. */
	var breakPadded: View? = null
	var breakPadding = 0
	var breakTag: TimeTag? = null
}

internal class BubbleHooks(private val scope: PluginScope) {
	private val main = Handler(Looper.getMainLooper())

	private val messageViewClass: Class<*> = load(MESSAGE_VIEW)
	private val messageClass: Class<*> = load(MESSAGE)
	private val accessoriesClass: Class<*> = load(ACCESSORIES_VIEW)
	private val contentClass: Class<*> = load(CONTENT_VIEW)

	/** The row bind: first parameter Message, more than six parameters, one of them a Function0. */
	private val bind: Method = findBind()

	private val isOwn: Method = messageClass.methods.firstOrNull {
		it.parameterTypes.isEmpty() && it.name == "isCurrentUserMessageAuthor"
	} ?: messageClass.methods.firstOrNull {
		it.parameterTypes.isEmpty() && it.name == "getIsCurrentUserMessageAuthor"
	} ?: error("Message.isCurrentUserMessageAuthor not found on this Discord version")

	/** Kotlin mangles the value-class getter (`getGuildId-qOKuAAo`), so match the prefix. */
	private val guildId: Method = messageClass.methods.firstOrNull {
		it.parameterTypes.isEmpty() && it.name.startsWith("getGuildId")
	} ?: error("Message.getGuildId not found on this Discord version")

	private val type: Method = messageClass.methods.firstOrNull {
		it.parameterTypes.isEmpty() && it.name == "getType"
	} ?: error("Message.getType not found on this Discord version")

	/** `getAuthorId-…` on 352 (a UserId value class); its toString is the id. Optional. */
	private val authorIdGetter: Method? = messageClass.methods.firstOrNull {
		it.parameterTypes.isEmpty() && it.name.startsWith("getAuthorId")
	}

	/** `getId-3Eiw7ao` on 352 (value-class mangled). Optional: without it times can't be toggled. */
	private val messageIdGetter: Method? = messageClass.methods.firstOrNull {
		it.parameterTypes.isEmpty() && it.returnType == String::class.java && (it.name == "getId" || it.name.startsWith("getId-"))
	}

	/** Discord's formatted time ("Today at 3:04 PM"), the text its own timestamp view shows. */
	private val timestampGetter: Method? = messageClass.methods.firstOrNull {
		it.parameterTypes.isEmpty() && it.returnType == String::class.java && it.name == "getTimestamp"
	}

	/**
	 * The long form Discord shows when its time is tapped ("Tuesday, October 27, 2026 11:58 PM").
	 * Discord leaves `getTimestamp` empty on the later messages of a run, which are most of the
	 * ones tapped, so the time is taken from this instead (0.1.11 drew an empty label).
	 */
	private val tooltipGetter: Method? = messageClass.methods.firstOrNull {
		it.parameterTypes.isEmpty() && it.returnType == String::class.java && it.name == "getTimestampTooltip"
	}

	/** "11:58 PM" or "23:58", as found in the tooltip. */
	private val timeInText = Regex("""\d{1,2}[:.]\d{2}(?:\s?[AaPp]\.?[Mm]\.?)?""")

	/** Index of the group-position `Function0` among the bind's parameters (matched by name). */
	private val supplierIndex: Int = bind.parameterTypes.indexOfFirst { it.name == "kotlin.jvm.functions.Function0" }
	@Volatile private var invokeMethod: Method? = null

	// Main thread only.
	private val rows = WeakHashMap<ViewGroup, RowState>()
	/** Invisible ink on bubble texts (InvisibleInk.kt). Before the hooks below, which use it. */
	private val ink = InvisibleInk()
	private val texts = WeakHashMap<TextView, SavedText>()
	private val seenTypes = LinkedHashSet<String>()

	@Volatile private var styledRows = 0
	@Volatile private var config = Config()
	@Volatile private var lastError: String? = null
	/** The last on-screen pass of [checkNeighbours], top to bottom, for the status report. */
	@Volatile private var joinSnapshot: List<Map<String, Any?>> = emptyList()
	@Volatile private var seenTypesSnapshot: List<String> = emptyList()
	private val positionCounts = java.util.concurrent.ConcurrentHashMap<String, Int>()
	/** Other people's END rows: avatar URL present (network URL) or not. */
	private var stalePending = false
	@Volatile private var tapToggles = 0
	/** Diagnostics for "Tap: under the bubble": measures that made room, times placed, why the last wasn't. */
	@Volatile private var roomsMade = 0
	@Volatile private var timesPlaced = 0
	@Volatile private var lastTimeSkip: String? = null
	/** Layout passes run by hand after a tap (runLayout). */
	@Volatile private var layoutsRun = 0
	/** Their avatar moves (alignAvatar): how many, and the last one's numbers or why it was skipped. */
	@Volatile private var avatarsAligned = 0
	/** Own rows whose avatar Discord showed again after the bind, hidden again (keepOwnAvatarsHidden). */
	@Volatile private var ownAvatarsRehidden = 0
	/** One pre-draw check per window's tree observer (watchOwnAvatars); main thread. */
	private val avatarWatchers = WeakHashMap<ViewTreeObserver, ViewTreeObserver.OnPreDrawListener>()
	@Volatile private var lastAvatarAlign: String? = null
	/** Message ids whose time is showing under the bubble (main thread; oldest dropped past [MAX_SHOWN_TIMES]). */
	private val shownTimes = LinkedHashSet<String>()
	/** For the phone's 12/24-hour setting when a time is worked out from the message id. */
	@Volatile private var appContext: android.content.Context? = null

	@Volatile private var lastTapTimeLength = -1

	private val unhook: Unhook = hookMethod(bind, after = ::afterBind)

	val signature: String = bind.toGenericString()

	fun status(): Map<String, Any?> = mapOf(
		"hooked" to true,
		"method" to signature,
		"styledRows" to styledRows,
		"everywhere" to config.everywhere,
		"times" to if (!config.tapTimes) "hidden" else if (config.timesBelow) "below" else "popup",
		"timesShown" to shownTimes.size,
		"tails" to config.tails,
		"linkSpanClasses" to spanHookCount,
		"linkRecolours" to linkRecolours,
		"custom" to config.custom,
		"hideAvatars" to config.hideAvatars,
		"tapToggles" to tapToggles,
		"roomsMade" to roomsMade,
		"timesPlaced" to timesPlaced,
		"lastTimeSkip" to lastTimeSkip,
		"layoutsRun" to layoutsRun,
		"avatarsAligned" to avatarsAligned,
		"ownAvatarsRehidden" to ownAvatarsRehidden,
		"lastAvatarAlign" to lastAvatarAlign,
		"popupsShown" to popups.shownCount,
		"lastTapTimeLength" to lastTapTimeLength,
		"rowTouchDowns" to rowTouchDowns,
		"rowTapsSeen" to rowTapsSeen,
		"lastTapSkip" to lastTapSkip,
		"messageIdGetter" to messageIdGetter?.name,
		"colors" to mapOf(
			"ownBg" to hex(config.ownBg),
			"ownText" to hex(config.ownText),
			"otherBg" to hex(config.otherBg),
			"otherText" to hex(config.otherText),
		),
		"tokens" to config.tokens,
		"seenTypes" to seenTypesSnapshot,
		"positions" to HashMap(positionCounts),
		"authorGetter" to authorIdGetter?.name,
		"error" to lastError,
		"joins" to joinSnapshot,
	)

	/**
	 * Takes the settings and theme colours from JS (any thread). On the main thread, rows whose mode
	 * changed (scope switch) are re-decided and measured again, and every tracked bubble gets the
	 * new colours. Colours never change a size, so they need no new measure.
	 */
	fun configure(map: Map<*, *>) {
		val old = config
		config = Config(
			everywhere = map["everywhere"] as? Boolean ?: old.everywhere,
			tapTimes = (map["times"] as? String)?.let { it != "hidden" } ?: old.tapTimes,
			// "tap" (before 0.2.4) and "beside" (before 0.2.9) are under the bubble now.
			// "toast" (0.2.4) became "popup".
			timesBelow = (map["times"] as? String)?.let { it != "popup" && it != "toast" } ?: old.timesBelow,
			tails = map["tails"] as? Boolean ?: old.tails,
			custom = map["custom"] as? Boolean ?: old.custom,
			hideAvatars = map["hideAvatars"] as? Boolean ?: old.hideAvatars,
			perPerson = map["perPerson"] as? Boolean ?: old.perPerson,
			timeBreaks = map["timeBreaks"] as? Boolean ?: old.timeBreaks,
			invisibleInk = map["invisibleInk"] as? Boolean ?: old.invisibleInk,
			iosReactions = map["iosReactions"] as? Boolean ?: old.iosReactions,
			chatBg = parseColor(map["chatBg"]) ?: old.chatBg,
			tapbackCorner = map["tapbackCorner"] as? Boolean ?: old.tapbackCorner,
			swipeTimes = map["swipeTimes"] as? Boolean ?: old.swipeTimes,
			bubbleRadiusDp = (map["bubbleRadius"] as? Number)?.toFloat() ?: old.bubbleRadiusDp,
			ownBg = parseColor(map["ownBg"]) ?: old.ownBg,
			ownText = parseColor(map["ownText"]) ?: old.ownText,
			otherBg = parseColor(map["otherBg"]) ?: old.otherBg,
			otherText = parseColor(map["otherText"]) ?: old.otherText,
			tokens = (map["tokens"] as? Map<*, *>)?.entries?.associate { (k, v) -> k.toString() to v?.toString() } ?: old.tokens,
		)
		val timesChanged = old.tapTimes != config.tapTimes || old.timesBelow != config.timesBelow
		val tailsChanged = old.tails != config.tails
		// Measured positions move with these; measured again on the next layout.
		if (old.tails != config.tails || old.hideAvatars != config.hideAvatars) bubbleLeftPx = -1f
		val avatarsChanged = old.hideAvatars != config.hideAvatars
		val inkChanged = old.invisibleInk != config.invisibleInk
		val reactionsChanged = old.iosReactions != config.iosReactions || old.ownBg != config.ownBg ||
			old.otherBg != config.otherBg || old.ownText != config.ownText || old.otherText != config.otherText ||
			old.chatBg != config.chatBg || old.tapbackCorner != config.tapbackCorner
		main.post {
			try {
				if (timesChanged && !(config.tapTimes && config.timesBelow)) shownTimes.clear()
				if (timesChanged) popups.dismiss()
				for ((row, state) in rows.entries.toList()) {
					val mode = decide(state)
					// Times switched: the room kept under a shown time changes, so measure again.
					if (timesChanged && mode != Mode.NONE && mode == state.mode) state.accessories?.let(::remeasureTexts)
					// Tails switched: the tail-side padding changes, so every bubble measures again.
					if (tailsChanged && mode != Mode.NONE && mode == state.mode) state.accessories?.let(::remeasureTexts)
					if (mode != state.mode) {
						setMode(row, state, mode)
						state.accessories?.let(::remeasureTexts)
					}
					// Avatars hidden or back: placed again and the bubbles/name moved, without a rebind.
					// Visibility is INVISIBLE/VISIBLE and the move is translationX, so no resize.
					if (avatarsChanged && row.isAttachedToWindow) {
						if (state.mode == Mode.OTHER) placeAvatar(row, state, binding = false)
						state.accessories?.let { applyTexts(row, it, state) }
					}
					if (inkChanged && row.isAttachedToWindow) state.accessories?.let { applyInk(it, state) }
					if (reactionsChanged && row.isAttachedToWindow) state.accessories?.let { placeAccessories(row, it, state) }
					syncOtherTime(row, state)
					updateTimeTag(row, state)
				}
				if (old.bubbleRadiusDp != config.bubbleRadiusDp) {
					val d = appContext?.resources?.displayMetrics?.density
					if (d != null) for (saved in texts.values) saved.bubble.setRadii(config.bubbleRadiusDp * d, joinedRadiusDp() * d)
					// Embed cards are clipped to the bubble radius: unclip, then clip again at the new one.
					for (v in roundedCards.keys.toList()) restoreCard(v)
					for ((row, state) in rows.entries.toList()) {
						if (row.isAttachedToWindow) state.accessories?.let { placeAccessories(row, it, state) }
					}
				}
				if (old.otherBg != config.otherBg) personColors.clear()
				if (old.timeBreaks != config.timeBreaks) relayoutBreaks { true }
				for ((text, saved) in texts.entries.toList()) {
					val mode = rowOf(text)?.mode ?: continue
					if (mode != Mode.NONE) recolor(text, saved, mode)
				}
			} catch (e: Throwable) {
				fail("configure", e)
			}
		}
	}

	/** Unhooks, then puts every row and text view we touched back the way it was. */
	/**
	 * Diagnostics for building new looks: class names only (never message text). For every bubble
	 * row on screen: the accessories list's children, and the span classes in its texts (with their
	 * superclasses); plus the chat list's parents up to the window. Main thread; waits up to 1 s.
	 */
	private fun probeTree(v: View, depth: Int = 0): Map<String, Any?> {
		val bg = v.background
		val out = linkedMapOf<String, Any?>(
			"class" to v.javaClass.name,
			"size" to "${v.width}x${v.height}",
			"vis" to v.visibility,
			"selected" to v.isSelected,
			"activated" to v.isActivated,
			"clickable" to v.isClickable,
			"longClickable" to v.isLongClickable,
			"bg" to bg?.javaClass?.name,
			"bgTint" to v.backgroundTintList?.defaultColor?.let { Integer.toHexString(it) },
		)
		out["fg"] = v.foreground?.javaClass?.name
		out["elevation"] = v.elevation
		out["z"] = v.translationZ
		out["stateAnim"] = v.stateListAnimator != null
		out["outline"] = v.outlineProvider?.javaClass?.name
		out["clipOutline"] = v.clipToOutline
		if (v is android.widget.ImageView) {
			out["image"] = v.drawable?.javaClass?.name
			out["imageTint"] = v.imageTintList?.defaultColor?.let { Integer.toHexString(it) }
		}
		if (bg is android.graphics.drawable.ColorDrawable) out["bgColor"] = Integer.toHexString(bg.color)
		if (bg is android.graphics.drawable.GradientDrawable) out["bgColor"] = bg.color?.defaultColor?.let { Integer.toHexString(it) }
		if (v is TextView) {
			val t = v.text?.toString().orEmpty()
			out["text"] = if (t.isNotEmpty() && t.all { it.isDigit() || it == 'k' || it == '.' }) t else "len ${t.length}"
			out["textColor"] = Integer.toHexString(v.currentTextColor)
			out["textSize"] = v.textSize
		}
		if (depth <= 2 && !v.javaClass.name.startsWith("android.")) {
			out["fields"] = v.javaClass.declaredFields.filter { !java.lang.reflect.Modifier.isStatic(it.modifiers) }.joinToString(";") { f ->
				runCatching {
					f.isAccessible = true
					val value = f.get(v)
					val shown = when (value) {
						null -> "null"
						is Number, is Boolean -> value.toString()
						is Enum<*> -> "enum ${value.name}"
						is CharSequence -> "text(${value.length})"
						else -> value.javaClass.name
					}
					"${f.name}:${f.type.simpleName}=$shown"
				}.getOrDefault(f.name)
			}
		}
		// Hidden chips are skipped (Discord keeps spares), so the "+" at the end shows up too.
		if (v is ViewGroup && depth < 6) out["children"] = (0 until v.childCount).map(v::getChildAt)
			.filter { it.visibility == View.VISIBLE }.take(12).map { probeTree(it, depth + 1) }
		return out
	}

	fun probe(): Map<String, Any?> {
		val out = java.util.concurrent.atomic.AtomicReference<Map<String, Any?>>(mapOf("error" to "timeout"))
		val latch = java.util.concurrent.CountDownLatch(1)
		main.post {
			try {
				val rowsOut = mutableListOf<Map<String, Any?>>()
				var list: ViewGroup? = null
				for ((row, state) in rows.entries.toList()) {
					if (!row.isAttachedToWindow || !row.isShown) continue
					list = list ?: row.parent as? ViewGroup
					val acc = state.accessories
					val children = acc?.let { a -> (0 until a.childCount).map { i ->
						val c = a.getChildAt(i)
						val sub = (c as? ViewGroup)?.let { g -> (0 until minOf(g.childCount, 6)).map { g.getChildAt(it).javaClass.name } }
						mapOf("class" to c.javaClass.name, "w" to c.width, "h" to c.height, "children" to sub)
					} }
					val spans = mutableSetOf<String>()
					acc?.let { a -> for (i in 0 until a.childCount) {
						val t = a.getChildAt(i) as? TextView ?: continue
						val sp = t.text as? Spanned ?: continue
						for (s in sp.getSpans(0, sp.length, Any::class.java)) {
							var c: Class<*>? = s.javaClass
							val chain = mutableListOf<String>()
							while (c != null && c != Any::class.java && chain.size < 4) { chain += c.name; c = c.superclass }
							// Fields of Discord's own spans: numbers, booleans and enums by value, others by type only.
							val fields = if (s.javaClass.name.startsWith("android.")) "" else s.javaClass.declaredFields.joinToString(";") { f ->
								runCatching {
									f.isAccessible = true
									val v = f.get(s)
									val shown = when (v) {
										null -> "null"
										is Number, is Boolean -> v.toString()
										is Enum<*> -> "enum ${v.name}"
										is CharSequence -> "text(${v.length})"
										else -> v.javaClass.name
									}
									"${f.name}:${f.type.simpleName}=$shown"
								}.getOrDefault(f.name)
							}
							// What the span does to a test paint (the ink's "still hidden?" check), without
							// calling anything else on it.
							val paintTest = if (s is android.text.style.CharacterStyle && s !is android.text.style.ClickableSpan && !s.javaClass.name.startsWith("android.")) runCatching {
								val tp = TextPaint()
								tp.color = 0xFF123456.toInt()
								tp.bgColor = 0
								s.updateDrawState(tp)
								" | paint color=${Integer.toHexString(tp.color)} bg=${Integer.toHexString(tp.bgColor)} alpha=${tp.alpha}"
							}.getOrDefault(" | paint failed") else ""
							val where = sp.getSpanStart(s) to sp.getSpanEnd(s)
							spans += chain.joinToString(" < ") + " | " + s.javaClass.interfaces.joinToString(",") { it.name } +
								" | span ${where.second - where.first} chars | " + fields + paintTest
						}
					} }
					// Reactions rows: the whole view tree, plus each chip's own fields (numbers, booleans and
					// enums by value; a text only when it is all digits, i.e. a count).
					val reactions = acc?.let { a -> (0 until a.childCount).map(a::getChildAt).filter { it.javaClass.name == REACTIONS_VIEW }.map(::probeTree) }
					rowsOut += mapOf("mode" to state.mode.name, "children" to children, "spans" to spans.toList(), "reactions" to reactions)
				}
				val parents = mutableListOf<String>()
				var p: Any? = list
				while (p is View && parents.size < 14) { parents += "${p.javaClass.name} ${p.width}x${p.height}"; p = p.parent }
				out.set(mapOf("rows" to rowsOut, "listParents" to parents))
			} catch (e: Throwable) {
				out.set(mapOf("error" to "${e.javaClass.simpleName}: ${e.message}"))
			} finally {
				latch.countDown()
			}
		}
		latch.await(1, java.util.concurrent.TimeUnit.SECONDS)
		return out.get()
	}

	fun dispose() {
		unhook.unhook()
		unhookMeasure.unhook()
		unhookTouch.unhook()
		unhookListDraw?.unhook()
		unhookListDraw = null
		for (u in unhookChipMe) runCatching { u.unhook() }
		unhookFlexMeasure?.unhook()

		unhookDraw.unhook()
		main.post {
			for (u in spanHooks.values) runCatching { u.unhook() }
			spanHooks.clear()
			drawing = null
			pendingTap?.let(main::removeCallbacks)
			pendingTap = null
			tapText = null
			shownTimes.clear()
			popups.dismiss()
			TimeTemplates.clear()
			for ((observer, listener) in avatarWatchers.entries.toList()) runCatching {
				if (observer.isAlive) observer.removeOnPreDrawListener(listener)
			}
			avatarWatchers.clear()
			for ((row, state) in rows.entries.toList()) runCatching {
				state.mode = Mode.NONE
				syncOtherTime(row, state)
				state.timeTag?.let { row.overlay.remove(it) }
				state.timeTag = null
				unshiftRow(state)
				unalignReply(state)
				unalignAvatar(row, state)
				state.breakPadded?.let { v ->
					if (v.paddingTop == state.breakPadding + breakRoom(row)) v.setPadding(v.paddingLeft, state.breakPadding, v.paddingRight, v.paddingBottom)
					state.breakPadded = null
				}
				state.breakTag?.let { row.overlay.remove(it) }
				state.breakTag = null
				state.accessories?.let { acc ->
					for (i in 0 until acc.childCount) {
						val child = acc.getChildAt(i)
						restoreTapback(child)
						movedAccessories.remove(child)?.let { child.translationX = it }
						restoreReactions(child)
						restoreCard(child)
					}
				}
				restoreRow(row, state, stopping = true)
				state.listener?.let { state.accessories?.removeOnLayoutChangeListener(it) }
			}
			for (text in texts.keys.toList()) runCatching {
				restoreText(text)
				text.requestLayout()
			}
			runCatching { ink.dispose() }
			runCatching {
				swipeBack?.cancel()
				chatList?.get()?.let { list ->
					swiping = false
					setSwipe(list, 0f)
				}
			}
			for (v in tapbacks.keys.toList()) runCatching { restoreTapback(v) }
			for (v in raisedRows.keys.toList()) runCatching { lowerRow(v) }
			for (v in styledChips.keys.toList()) runCatching { restoreChip(v) }
			for ((g, clip) in unclippedForDots.entries.toList()) runCatching { g.clipChildren = clip }
			unclippedForDots.clear()
			for ((v, tx) in movedAccessories.entries.toList()) runCatching { v.translationX = tx }
			movedAccessories.clear()
			for (v in roundedCards.keys.toList()) runCatching { restoreCard(v) }
			rows.clear()
			texts.clear()
			styledRows = 0
		}
	}

	private fun load(name: String): Class<*> = runCatching { scope.classLoader.loadClass(name) }
		.getOrElse { error("$name not found on this Discord version") }

	private fun findBind(): Method {
		// By name: Discord's Function0 and the one this plugin was compiled against can come from
		// different class loaders, so comparing classes never matches.
		val matches = messageViewClass.declaredMethods.filter { m ->
			val p = m.parameterTypes
			p.size > 6 && p[0].name == messageClass.name && p.any { it.name == "kotlin.jvm.functions.Function0" }
		}
		if (matches.isEmpty()) {
			// Lists what is there instead, so a new Discord build can be matched from the status alone.
			val seen = messageViewClass.declaredMethods
				.filter { it.parameterTypes.size >= 4 }
				.take(12)
				.joinToString("; ") { m -> "${m.name}(${m.parameterTypes.joinToString(",") { it.name.substringAfterLast('.') }})" }
			error("MessageView bind (Message, …, Function0, …) not found on this Discord version. Candidates: $seen")
		}
		if (matches.size > 1) scope.log.w("${matches.size} MessageView bind candidates; using the first")
		return matches.first().apply { isAccessible = true }
	}

	private fun fail(where: String, e: Throwable) {
		val msg = "$where: ${e.javaClass.simpleName}"
		if (lastError != msg) scope.log.w(msg)
		lastError = msg
	}

	// ---- Bind ----

	private fun afterBind(param: HookParam) {
		val row = param.thisObject as? ViewGroup ?: return
		try {
			if (appContext == null) appContext = row.context.applicationContext
			val state = rows[row] ?: newRow(row).also { rows[row] = it }
			(row.parent as? ViewGroup)?.let { if (chatList?.get() !== it) chatList = java.lang.ref.WeakReference(it) }
			val message = param.args.getOrNull(0)
			if (message != null) readMessage(message, state) else state.bubbleType = false
			state.supplier = param.args.getOrNull(supplierIndex)
			state.position = readPosition(state.supplier)
			positionCounts.merge(state.position.name, 1, Int::plus)
			val mode = decide(state)
			val changed = state.mode != mode
			setMode(row, state, mode, binding = true)
			// Discord has just set its own time visible for this message, so nothing to put back.
			state.otherTimeHidden = null
			syncOtherTime(row, state)
			updateTimeTag(row, state)
			if (mode == Mode.OTHER) placeAvatar(row, state, binding = true)
			if (mode == Mode.OWN) watchOwnAvatars(row)
			applyBreak(row, state)
			scheduleRowAlign(row, state)
			notePerson(state)
			// Shape for texts already in the row; ones bound later get it as they're measured.
			state.accessories?.let { reshapeTexts(it, state) }
			scheduleStalePass(row)
			// Text views already in the row are measured again with the new choice; ones bound
			// later are styled as they're measured.
			if (changed) state.accessories?.let(::remeasureTexts)
		} catch (e: Throwable) {
			fail("bind", e)
		}
	}

	/** Calls Discord's `Function0` through its own interface (never our copy of the class). */
	private fun readPosition(supplier: Any?): GroupPosition {
		if (supplier == null) return GroupPosition.ONLY
		return try {
			val invoke = invokeMethod ?: findInvoke(supplier.javaClass).also { invokeMethod = it }
			GroupPosition.of((invoke.invoke(supplier) as? Enum<*>)?.name)
		} catch (e: Throwable) {
			fail("position", e)
			GroupPosition.ONLY
		}
	}

	private fun findInvoke(cls: Class<*>): Method {
		var c: Class<*>? = cls
		while (c != null) {
			c.interfaces.firstOrNull { it.name == "kotlin.jvm.functions.Function0" }?.let { return it.getMethod("invoke") }
			c = c.superclass
		}
		error("Function0.invoke not found")
	}

	/**
	 * After a bind, other rows of the same list may have changed position without a bind (the old
	 * END becomes MIDDLE when a message arrives). One pass per frame re-reads their suppliers and
	 * redraws: shape changes only, so no size changes after layout.
	 */
	private fun scheduleStalePass(row: ViewGroup) {
		if (stalePending) return
		stalePending = true
		val list = row.parent
		main.post {
			stalePending = false
			try {
				val reshape = LinkedHashMap<ViewGroup, RowState>()
				for ((other, state) in rows.entries.toList()) {
					if (state.mode == Mode.NONE || other.parent !== list || !other.isAttachedToWindow) continue
					val pos = readPosition(state.supplier)
					if (pos == state.position) continue
					state.position = pos
					reshape[other] = state
				}
				// Who touches whom on screen, after this frame's layout.
				(list as? ViewGroup)?.let { for ((other, state) in checkNeighbours(it)) reshape[other] = state }
				for ((other, state) in reshape) if (state.mode != Mode.NONE) state.accessories?.let { reshapeTexts(it, state) }
			} catch (e: Throwable) {
				fail("stale", e)
			}
		}
	}

	private fun avatarViewsOf(row: ViewGroup, state: RowState): List<View> =
		state.avatarViews ?: AVATAR_VIEWS.mapNotNull { row.findViewById<View>(id(row, it)) }.also { state.avatarViews = it }

	/**
	 * Own rows never show an avatar. styleRow hides it in the bind, but Discord can show it again
	 * later without one (a sent message being confirmed, or its run changing), and an own bubble
	 * then had your picture on the left like someone else's message. So before every frame of a
	 * window with own rows, any own row's avatar that is visible again goes back to INVISIBLE
	 * (recorded in hidden, so stop restores it). INVISIBLE keeps its size: a redraw, no layout.
	 */
	private fun watchOwnAvatars(row: ViewGroup) {
		// A row bound before it's on screen has a stand-in observer that is merged away on attach;
		// a listener keyed to it would be added again and again. View.post waits for the attach.
		if (!row.isAttachedToWindow) {
			row.post { if (row.isAttachedToWindow) watchOwnAvatars(row) }
			return
		}
		val observer = row.viewTreeObserver
		if (!observer.isAlive || avatarWatchers.containsKey(observer)) return
		val listener = ViewTreeObserver.OnPreDrawListener {
			try {
				keepOwnAvatarsHidden()
			} catch (e: Throwable) {
				fail("ownAvatar", e)
			}
			true
		}
		observer.addOnPreDrawListener(listener)
		avatarWatchers[observer] = listener
	}

	private fun keepOwnAvatarsHidden() {
		for ((row, state) in rows.entries.toList()) {
			if (state.mode != Mode.OWN || !row.isAttachedToWindow) continue
			for (v in avatarViewsOf(row, state)) if (v.visibility == View.VISIBLE) {
				state.hidden[v] = View.INVISIBLE
				v.visibility = View.INVISIBLE
				ownAvatarsRehidden++
			}
		}
	}

	/**
	 * Other people's avatars. Discord draws one on the first row of a run and that's where it
	 * stays (0.2.14; before, it moved to the last row). "Hide avatars" makes them INVISIBLE (sizes
	 * kept, so safe outside a bind), recorded in [RowState.hidden] so switching back or stop
	 * restores them. Discord re-sets the avatar on every bind, so recycling restores itself.
	 */
	private fun placeAvatar(row: ViewGroup, state: RowState, binding: Boolean) {
		val avatar = row.findViewById<View>(id(row, "author_avatar")) ?: return
		val decoration = row.findViewById<View>(id(row, "author_avatar_decoration"))
		if (binding) state.hidden.clear()
		if (config.hideAvatars) {
			// "Hide avatars": never one beside their bubbles. INVISIBLE keeps sizes, so this is safe
			// outside a bind; recorded in hidden so switching back or stop restores them.
			for (v in listOfNotNull(avatar, decoration)) if (v.visibility == View.VISIBLE) {
				state.hidden[v] = View.INVISIBLE
				v.visibility = View.INVISIBLE
			}
			return
		}
		// "Hide avatars" switched off: Discord's avatars we hid come back.
		for ((v, ours) in state.hidden) if (v.visibility == ours) v.visibility = View.VISIBLE
		state.hidden.clear()
	}


	private fun readMessage(message: Any, state: RowState) {
		state.messageId = runCatching { messageIdGetter?.invoke(message) as? String }.getOrNull()
		state.timestamp = readTime(message)
		state.fullTime = readFullTime(message)
		state.authorKey = runCatching { authorIdGetter?.invoke(message)?.toString() }.getOrNull()
		readRunTime(message, state)
		state.own = isOwn.invoke(message) == true
		state.inGuild = guildId.invoke(message) != null
		val name = (type.invoke(message) as? Enum<*>)?.name
		if (name != null && seenTypes.size < MAX_SEEN_TYPES && seenTypes.add(name)) seenTypesSnapshot = seenTypes.toList()
		state.bubbleType = name != null && name in BUBBLE_TYPES
	}

	/** Discord's tooltip ("Tuesday, October 27, 2026 11:58 PM"), else date and time from the id. */
	private fun readFullTime(message: Any): String? {
		val tooltip = runCatching { tooltipGetter?.invoke(message) as? String }.getOrNull()
		if (!tooltip.isNullOrBlank()) return tooltip
		val id = runCatching { messageIdGetter?.invoke(message) as? String }.getOrNull()?.toLongOrNull() ?: return null
		val context = appContext ?: return null
		val at = java.util.Date((id ushr 22) + DISCORD_EPOCH)
		return android.text.format.DateFormat.getLongDateFormat(context).format(at) + " " +
			android.text.format.DateFormat.getTimeFormat(context).format(at)
	}

	/** `getChannelId-…` (a value class, its long). Optional: per-channel time templates need it. */
	private val channelIdGetter: Method? = messageClass.methods.firstOrNull {
		it.parameterTypes.isEmpty() && it.name.startsWith("getChannelId")
	}

	/**
	 * The time texts for under the bubble and the pop-up. A first message keeps Discord's short time as
	 * written (Custom Timestamps, Timezones) and teaches [TimeTemplates] how it looks; a later one
	 * gets the same look built from its own send time, when the author's first message in this
	 * channel was bound this session. Both under the bubble and the pop-up show the whole text,
	 * Timezones' part included.
	 */
	private fun readRunTime(message: Any, state: RowState) {
		state.popupTime = null
		val raw = runCatching { timestampGetter?.invoke(message) as? String }.getOrNull()
		val author = state.authorKey
		val channel = runCatching { channelIdGetter?.invoke(message)?.toString() }.getOrNull()
		val sentAt = state.messageId?.toLongOrNull()?.let { (it ushr 22) + DISCORD_EPOCH }
		state.channelKey = channel
		state.sentAt = sentAt
		if (raw.isNullOrBlank()) return
		state.popupTime = raw
		state.timestamp = TimeTemplates.split(raw).first
		if (author != null && channel != null && sentAt != null) {
			runCatching { TimeTemplates.learn(author, channel, raw, sentAt) }
		}
	}

	/**
	 * (under, pop-up) texts for a row. Built when asked, not at bind: the list binds the newest
	 * rows first, so a run's first message is often bound after its later ones.
	 */
	private fun timesFor(state: RowState): Pair<String?, String?> {
		state.popupTime?.let { return state.timestamp to it }
		val author = state.authorKey
		val channel = state.channelKey
		val sentAt = state.sentAt
		if (author != null && channel != null && sentAt != null) {
			runCatching { TimeTemplates.build(author, channel, sentAt) }.getOrNull()?.let { return it }
		}
		return state.timestamp to state.timestamp
	}

	/** A short time for the label: Discord's own when it has one, else the time out of the tooltip. */
	private fun readTime(message: Any): String? {
		val short = runCatching { timestampGetter?.invoke(message) as? String }.getOrNull()
		if (!short.isNullOrBlank()) return short
		val tooltip = runCatching { tooltipGetter?.invoke(message) as? String }.getOrNull()
		if (!tooltip.isNullOrBlank()) return timeInText.findAll(tooltip).lastOrNull()?.value ?: tooltip
		// Both are empty on the later messages of a run. A message id is a snowflake with the send
		// time in it (ms since 2015-01-01 in the top bits), formatted with the phone's 12/24-hour setting.
		val id = runCatching { messageIdGetter?.invoke(message) as? String }.getOrNull()?.toLongOrNull() ?: return null
		val at = (id ushr 22) + DISCORD_EPOCH
		val context = appContext ?: return null
		return android.text.format.DateFormat.getTimeFormat(context).format(java.util.Date(at))
	}

	private fun decide(state: RowState): Mode = when {
		!state.bubbleType -> Mode.NONE
		state.inGuild && !config.everywhere -> Mode.NONE
		state.own -> Mode.OWN
		else -> Mode.OTHER
	}

	/**
	 * Moves a row to [mode]: own rows lose header, name, time and avatar; other rows keep them stock.
	 * In a bind Discord has just set name, time and avatar for the new message itself; outside one
	 * (a scope switch) nobody will, so an own row leaving OWN gets them back from us.
	 */
	private fun setMode(row: ViewGroup, state: RowState, mode: Mode, binding: Boolean = false) {
		if (state.mode != mode) {
			if (state.mode == Mode.NONE) styledRows++
			if (mode == Mode.NONE) styledRows--
		}
		val wasOwn = state.mode == Mode.OWN
		state.mode = mode
		if (mode != Mode.OTHER) unshiftRow(state)
		if (mode != Mode.OWN) unalignReply(state)
		if (mode != Mode.OTHER) unalignAvatar(row, state)
		if (mode == Mode.OWN) styleRow(row, state)
		else restoreRow(row, state, stopping = wasOwn && !binding)
	}

	/**
	 * Under "Show on tap", other people's first message loses Discord's own time too (their name
	 * stays), so every bubble's time is tap-only. Shown again when that's off, the row isn't theirs
	 * any more, or on stop; only while it still has the GONE we gave it.
	 */
	private fun syncOtherTime(row: ViewGroup, state: RowState) {
		// Discord's time beside their name: hidden on their bubbles in every mode, "Hidden" included
		// (before 0.5.15 "Hidden" left it, so a time still showed).
		val hide = state.mode == Mode.OTHER
		val hidden = state.otherTimeHidden
		if (hide) {
			if (hidden != null) return
			val time = row.findViewById<View>(id(row, "timestamp")) ?: return
			if (time.visibility != View.VISIBLE) return
			time.visibility = View.GONE
			state.otherTimeHidden = time
		} else if (hidden != null) {
			if (hidden.visibility == View.GONE) hidden.visibility = View.VISIBLE
			state.otherTimeHidden = null
		}
	}

	private fun newRow(row: ViewGroup): RowState {
		val accessories = (0 until row.childCount).map(row::getChildAt).firstOrNull { accessoriesClass.isInstance(it) } as? ViewGroup
		val listener = accessories?.let {
			View.OnLayoutChangeListener { v, _, _, _, _, _, _, _, _ ->
				try {
					val state = rows[row] ?: return@OnLayoutChangeListener
					applyTexts(row, v as ViewGroup, state)
					updateTimeTag(row, state)
				} catch (e: Throwable) {
					fail("layout", e)
				}
			}.also(it::addOnLayoutChangeListener)
		}
		return RowState(accessories, listener)
	}

	private fun id(row: View, name: String): Int {
		val res = row.resources
		val own = res.getIdentifier(name, "id", row.context.packageName)
		return if (own != 0) own else res.getIdentifier(name, "id", "com.discord")
	}

	private fun styleRow(row: ViewGroup, state: RowState) {
		row.findViewById<View>(id(row, "header"))?.let { header ->
			if (state.headerSaved == null) state.headerSaved = header.visibility
			if (header.visibility != View.GONE) header.visibility = View.GONE
		}
		// Discord sets these on every bind (MessageView.b/c), so this bind's value is the one to keep.
		state.hidden.clear()
		for ((name, hide) in listOf(
			"author_name" to View.GONE,
			"timestamp" to View.GONE,
			"author_avatar" to View.INVISIBLE,
			"author_avatar_decoration" to View.INVISIBLE,
		)) {
			val v = row.findViewById<View>(id(row, name)) ?: continue
			// A grouped row has the avatar GONE already; keep that (the gutter comes from constraints).
			if (v.visibility == View.VISIBLE) {
				state.hidden[v] = hide
				v.visibility = hide
			}
		}
	}

	private fun restoreRow(row: ViewGroup, state: RowState, stopping: Boolean = false) {
		state.headerSaved?.let { saved ->
			row.findViewById<View>(id(row, "header"))?.visibility = saved
		}
		state.headerSaved = null
		// On a re-bind Discord has already set these for the new message, so only stop puts them
		// back (they were all VISIBLE), and only while they still have the value we gave them.
		if (stopping) {
			for ((v, ours) in state.hidden) if (v.visibility == ours) v.visibility = View.VISIBLE
		}
		state.hidden.clear()
	}

	// ---- Text views ----

	/**
	 * Styling happens while Discord measures the text, not after: changing padding or width
	 * after the list has laid out is a resize Android drops (long messages were cut off) or redoes
	 * a frame later (flicker). Before `onMeasure` the bubble padding, background and colours go on;
	 * after it, a bubble is measured once more at most 75% of the row (AT_MOST), so the height the
	 * list uses already fits the wrapped text. The re-measure calls the same hooked method, so a
	 * flag keeps it from styling twice.
	 */
	private val onMeasure: Method = TextView::class.java
		.getDeclaredMethod("onMeasure", Int::class.javaPrimitiveType, Int::class.javaPrimitiveType)
		.apply { isAccessible = true }
	private var remeasuring = false

	private val unhookMeasure: Unhook = hookMethod(onMeasure, before = ::beforeMeasure, after = ::afterMeasure)

	/**
	 * Taps are watched at the row, not on the text: Discord's touch listener on the text answers
	 * false to a plain DOWN and the text isn't clickable, so the rest of the gesture (and the
	 * long-press menu) goes to the row, whose onInterceptTouchEvent takes it. A before-hook on
	 * `ViewGroup.dispatchTouchEvent` sees every event reaching one of our bubble rows; it never
	 * changes an event or a result. See [onRowTouch].
	 */
	private val unhookTouch: Unhook = hookMethod(
		ViewGroup::class.java.getDeclaredMethod("dispatchTouchEvent", MotionEvent::class.java),
		before = ::beforeDispatch,
	)

	@Volatile private var rowTouchDowns = 0
	@Volatile private var rowTapsSeen = 0
	@Volatile private var lastTapSkip: String? = null

	// The one gesture being followed (main thread).
	private var tapText: TextView? = null
	private var tapDownX = 0f
	private var tapDownY = 0f
	private var tapDownTime = 0L
	private var tapPlain = false
	private var pendingTap: Runnable? = null

	private fun beforeDispatch(param: HookParam) {
		val row = param.thisObject as? ViewGroup ?: return
		// The window root (as Quick Toggles and Focus Bubble do): it sees a gesture before any view
		// below can claim it, the member-list swipe and React Native's gesture handler included.
		if (row.parent !is View) {
			val list = chatList?.get()
			if (list != null && list.isAttachedToWindow && list.rootView === row) {
				try {
					onListTouch(row, list, param)
				} catch (e: Throwable) {
					swiping = false
					swipeEnd(list)
					fail("swipe", e)
				}
			}
			return
		}
		if (!messageViewClass.isInstance(row)) return
		val state = rows[row] ?: return
		if (state.mode == Mode.NONE) return
		val event = param.args.getOrNull(0) as? MotionEvent ?: return
		try {
			if (routeTapbackTouch(row, state, event)) {
				param.result = true
				return
			}
		} catch (e: Throwable) {
			tapbackTouch = null
			fail("tapbackTouch", e)
		}
		try {
			onRowTouch(row, state, event)
		} catch (e: Throwable) {
			tapPlain = false
			fail("touch", e)
		}
	}

	private fun skip(reason: String) {
		lastTapSkip = reason
		tapPlain = false
	}

	/**
	 * A plain tap: DOWN on a bubble's text but not on a ClickableSpan (Discord's link, mention,
	 * spoiler and emoji spans are ClickableSpans), no move past touch slop, UP before the long-press
	 * timeout. It's reported after the double-tap timeout and dropped if another DOWN comes first.
	 */
	private fun onRowTouch(row: ViewGroup, state: RowState, event: MotionEvent) {
		when (event.actionMasked) {
			MotionEvent.ACTION_DOWN -> {
				rowTouchDowns++
				tapText = null
				pendingTap?.let {
					main.removeCallbacks(it)
					pendingTap = null
					skip("double")
					return
				}
				tapDownX = event.rawX
				tapDownY = event.rawY
				tapDownTime = event.eventTime
				tapPlain = true
				val text = bubbleTextAt(state, event.rawX, event.rawY) ?: return skip("noBubble")
				if (onClickableSpan(text, event.rawX, event.rawY)) return skip("span")
				tapText = text
			}
			MotionEvent.ACTION_POINTER_DOWN -> skip("multi")
			MotionEvent.ACTION_MOVE -> if (tapPlain) {
				val slop = ViewConfiguration.get(row.context).scaledTouchSlop
				if (abs(event.rawX - tapDownX) > slop || abs(event.rawY - tapDownY) > slop) skip("slop")
			}
			MotionEvent.ACTION_CANCEL -> if (tapPlain) skip("cancel")
			MotionEvent.ACTION_UP -> {
				val text = tapText
				tapText = null
				if (!tapPlain || text == null) return
				tapPlain = false
				if (event.eventTime - tapDownTime >= ViewConfiguration.getLongPressTimeout()) return skip("long")
				rowTapsSeen++
				val r = Runnable {
					pendingTap = null
					if (text.isAttachedToWindow) onPlainTap(text)
				}
				pendingTap = r
				main.postDelayed(r, ViewConfiguration.getDoubleTapTimeout().toLong())
			}
		}
	}

	// ---- Two-finger swipe left: every message's time, like iMessage ----

	/** The chat list (the rows' parent), from the last bind. */
	private var chatList: java.lang.ref.WeakReference<ViewGroup>? = null
	/** A two-finger gesture on the chat list is ours from the second finger until the last one lifts. */
	private var swiping = false
	private var swipeStartX = 0f
	private var swipeOffset = 0f
	/** Set while we hand the list a CANCEL ourselves, so the hook lets it through. */
	private var sendingCancel = false
	private var swipeBack: android.animation.ValueAnimator? = null
	private var swipeTimesTag: SwipeTimes? = null
	@Volatile private var swipesSeen = 0

	private fun avgX(e: MotionEvent): Float {
		var sum = 0f
		var n = 0
		for (i in 0 until e.pointerCount) {
			if (e.actionMasked == MotionEvent.ACTION_POINTER_UP && i == e.actionIndex) continue
			sum += e.getX(i)
			n++
		}
		return if (n == 0) swipeStartX else sum / n
	}

	/**
	 * One finger stays Discord's (a reply swipe on a message, the member list on the chat, Android's
	 * back gesture at the edge). Watched at the window root. When a second finger lands on the chat,
	 * the gesture becomes ours: the window gets a CANCEL (so whatever the first finger started stops)
	 * and every later event of it is consumed at the root until the last finger lifts. Dragging left slides your bubbles aside and shows each message's time; letting go
	 * springs back. Only translationX and a drawing in the list's overlay change.
	 */
	private fun onListTouch(root: ViewGroup, list: ViewGroup, param: HookParam) {
		if (sendingCancel) return
		val event = param.args.getOrNull(0) as? MotionEvent ?: return
		when (event.actionMasked) {
			MotionEvent.ACTION_DOWN -> {
				swipePending = false
				if (swiping) swipeEnd(list)
			}
			MotionEvent.ACTION_POINTER_DOWN -> {
				if (!config.swipeTimes || swiping || event.pointerCount != 2) {
					if (swiping) param.result = true
					return
				}
				// Both fingers on the chat, which is showing bubbles.
				val area = android.graphics.Rect()
				if (!list.getGlobalVisibleRect(area)) return
				val rootLoc = IntArray(2)
				root.getLocationOnScreen(rootLoc)
				for (i in 0 until 2) {
					if (!area.contains((event.getX(i) + rootLoc[0]).toInt(), (event.getY(i) + rootLoc[1]).toInt())) return
				}
				if (rows.entries.none { (r, st) -> r.parent === list && st.mode != Mode.NONE }) return
				// Not ours yet: only once the fingers move mostly left (see ACTION_MOVE). Moving up or down
				// leaves the gesture to everyone else, Quick Toggles' two-finger pull up included.
				swipePending = true
				swipeStartX = avgX(event)
				swipeStartY = avgY(event)
			}
			MotionEvent.ACTION_MOVE -> if (swipePending && !swiping) {
				val dx = avgX(event) - swipeStartX
				val dy = avgY(event) - swipeStartY
				val slop = ViewConfiguration.get(root.context).scaledTouchSlop * 1.5f
				if (abs(dy) > slop && abs(dy) >= abs(dx)) {
					swipePending = false
				} else if (dx < -slop && abs(dx) > abs(dy) * 1.5f) {
					swipePending = false
					claimSwipe(root, event)
					swipeStartX = avgX(event) + swipeOffset
					param.result = true
				}
			} else if (swiping) {
				val max = swipeMax(list)
				setSwipe(list, (swipeStartX - avgX(event)).coerceIn(0f, max))
				param.result = true
			}
			MotionEvent.ACTION_POINTER_UP -> if (swiping) {
				// Still ours: the finger left behind must not start a reply swipe.
				swipeStartX = avgX(event) + swipeOffset
				param.result = true
			}
			MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
				swipePending = false
				if (swiping) {
					param.result = true
					swipeEnd(list)
				}
			}
		}
	}

	/** Two fingers waiting to see which way they go (onListTouch). */
	private var swipePending = false
	private var swipeStartY = 0f

	private fun avgY(e: MotionEvent): Float {
		var sum = 0f
		var n = 0
		for (i in 0 until e.pointerCount) {
			if (e.actionMasked == MotionEvent.ACTION_POINTER_UP && i == e.actionIndex) continue
			sum += e.getY(i)
			n++
		}
		return if (n == 0) swipeStartY else sum / n
	}

	/**
	 * The swipe is ours: everything below the root that started stops (a reply swipe, a long-press,
	 * a scroll, the member list) and the rest of the gesture is consumed.
	 */
	private fun claimSwipe(root: ViewGroup, event: MotionEvent) {
		swiping = true
		swipesSeen++
		if (unhookListDraw == null) unhookListDraw = runCatching {
			hookMethod(ViewGroup::class.java.getDeclaredMethod("dispatchDraw", Canvas::class.java), before = ::beforeListDraw)
		}.onFailure { fail("swipeDrawHook", it) }.getOrNull()
		swipeBack?.cancel()
		val cancel = MotionEvent.obtain(event)
		cancel.action = MotionEvent.ACTION_CANCEL
		sendingCancel = true
		try {
			root.dispatchTouchEvent(cancel)
		} finally {
			sendingCancel = false
			cancel.recycle()
		}
	}

	/** Springs the bubbles back and ends the gesture. */
	private fun swipeEnd(list: ViewGroup) {
		swiping = false
		val from = swipeOffset
		if (from == 0f) return setSwipe(list, 0f)
		swipeBack?.cancel()
		swipeBack = android.animation.ValueAnimator.ofFloat(from, 0f).apply {
			duration = SWIPE_BACK_MS
			interpolator = android.view.animation.DecelerateInterpolator(1.6f)
			addUpdateListener { setSwipe(list, it.animatedValue as Float) }
			start()
		}
	}

	/** How far the bubbles slide: the widest time on screen plus a gap, within limits. */
	private fun swipeMax(list: ViewGroup): Float {
		val paint = TextPaint()
		paint.textSize = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, TIME_TEXT_SP, list.resources.displayMetrics)
		var widest = 0f
		for (i in 0 until list.childCount) {
			val state = rows[list.getChildAt(i) as? ViewGroup ?: continue] ?: continue
			if (state.mode == Mode.NONE) continue
			val label = timesFor(state).second ?: continue
			widest = maxOf(widest, paint.measureText(label))
		}
		val pad = dp(list, SWIPE_TIME_PAD_DP) * 2f
		return (widest + pad).coerceIn(dp(list, 56f).toFloat(), dp(list, SWIPE_MAX_DP).toFloat())
	}

	/**
	 * Every bubble row slides left by [offset] (yours and theirs, as in iMessage, so a long time like
	 * "16 minutes ago" never sits on a bubble); each one's time shows at the right, fading in.
	 */
	private fun setSwipe(list: ViewGroup, offset: Float) {
		swipeOffset = offset
		watchSwipe(list, offset > 0f)
		// Rows the list let go of (recycled or removed) while slid: put them back, or they show up
		// shifted when they're bound again.
		for (row in swipeShifted.keys.toList()) {
			if (row.parent === list) continue
			if (row.translationX == -swipeShiftedBy(row)) row.translationX = 0f
			swipeShifted.remove(row)
		}
		val max = swipeMax(list)
		val labels = ArrayList<Triple<String, Float, Boolean>>()
		for (i in 0 until list.childCount) {
			val row = list.getChildAt(i) as? ViewGroup ?: continue
			val state = rows[row] ?: continue
			val dx = if (state.mode != Mode.NONE && offset > 0f) -offset else 0f
			if (row.translationX != dx) row.translationX = dx
			if (dx != 0f) swipeShifted[row] = -dx else swipeShifted.remove(row)
			if (offset <= 0f || state.mode == Mode.NONE) continue
			val label = timesFor(state).second?.takeIf { it.isNotBlank() } ?: continue
			// Lined up with the row's last bubble, or the row's middle.
			val text = state.accessories?.let { acc -> (0 until acc.childCount).map(acc::getChildAt).lastOrNull { it is TextView && texts[it] != null } }
			val y = if (text != null && text.height > 0) {
				val r = android.graphics.Rect(0, 0, text.width, text.height)
				row.offsetDescendantRectToMyCoords(text, r)
				row.top + r.exactCenterY()
			} else row.top + row.height / 2f
			labels += Triple(label, y, state.mode == Mode.OWN)
		}
		val tag = swipeTimesTag ?: SwipeTimes().also {
			it.setBounds(0, 0, Int.MAX_VALUE / 2, Int.MAX_VALUE / 2)
			list.overlay.add(it)
			swipeTimesTag = it
		}
		val size = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, TIME_TEXT_SP, list.resources.displayMetrics)
		val base = if (config.custom) 0xFFDBDEE1.toInt() else config.text(Mode.OTHER).defaultColor
		tag.set(labels, list.width - dp(list, SWIPE_TIME_PAD_DP).toFloat() - (max - offset), size, base, (offset / max).coerceIn(0f, 1f))
		if (offset <= 0f) {
			runCatching { list.overlay.remove(tag) }
			swipeTimesTag = null
		}
		list.invalidate()
	}

	/** Rows slid by the swipe -> how far, so a recycled one can be put back. Main thread. */
	private val swipeShifted = WeakHashMap<View, Float>()
	private fun swipeShiftedBy(row: View): Float = swipeShifted[row] ?: 0f

	private var swipeWatcher: Pair<ViewTreeObserver, ViewTreeObserver.OnPreDrawListener>? = null
	private var swipeLayoutSig = 0

	/**
	 * While the bubbles are slid, every frame checks them just before drawing. The chat list
	 * animates rows' translationX itself when they move or change (a picture loading, a new
	 * message, a reaction), and rows scroll in unshifted; without this those rows lagged behind
	 * the rest until the fingers moved again.
	 */
	private fun watchSwipe(list: ViewGroup, on: Boolean) {
		val current = swipeWatcher
		if (on) {
			if (current != null && current.first.isAlive && current.first === list.viewTreeObserver) return
			unwatchSwipe()
			val listener = ViewTreeObserver.OnPreDrawListener {
				try {
					if (swipeOffset > 0f && list.isAttachedToWindow && swipeRowsOff(list)) setSwipe(list, swipeOffset)
				} catch (e: Throwable) {
					fail("swipeFrame", e)
				}
				true
			}
			val observer = list.viewTreeObserver
			observer.addOnPreDrawListener(listener)
			swipeWatcher = observer to listener
		} else if (current != null) {
			unwatchSwipe()
		}
	}

	private fun unwatchSwipe() {
		val (observer, listener) = swipeWatcher ?: return
		swipeWatcher = null
		runCatching { if (observer.isAlive) observer.removeOnPreDrawListener(listener) }
	}

	/**
	 * Discord's reply swipe is an ItemTouchHelper. If the first finger moved a little before the
	 * swipe became ours, it has grabbed that row, and after our CANCEL it plays its own slide back,
	 * setting the row's translationX from the list's onDraw on every frame, after the pre-draw
	 * check. So the row under the first finger lagged behind. The list's dispatchDraw runs after
	 * its onDraw and before any row is drawn, so the rows are put where the swipe says there.
	 * Installed on the first swipe; it does nothing but a compare for any other view.
	 */
	private var unhookListDraw: Unhook? = null

	private fun beforeListDraw(param: HookParam) {
		if (swipeOffset <= 0f) return
		val list = param.thisObject
		if (list !== chatList?.get()) return
		try {
			list as ViewGroup
			for (i in 0 until list.childCount) {
				val row = list.getChildAt(i) as? ViewGroup ?: continue
				val state = rows[row] ?: continue
				val dx = if (state.mode != Mode.NONE) -swipeOffset else 0f
				if (row.translationX != dx) row.translationX = dx
			}
		} catch (e: Throwable) {
			fail("swipeDraw", e)
		}
	}

	/** True when a row isn't where the swipe puts it, or rows moved (the times follow them). */
	private fun swipeRowsOff(list: ViewGroup): Boolean {
		var sig = list.childCount
		var off = false
		for (i in 0 until list.childCount) {
			val row = list.getChildAt(i) as? ViewGroup ?: continue
			val state = rows[row] ?: continue
			sig = sig * 31 + row.top
			val dx = if (state.mode != Mode.NONE) -swipeOffset else 0f
			if (row.translationX != dx) off = true
		}
		if (sig != swipeLayoutSig) {
			swipeLayoutSig = sig
			off = true
		}
		return off
	}

	/** The times drawn at the chat's right edge during a two-finger swipe. */
	private class SwipeTimes : Drawable() {
		private val paint = TextPaint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { textAlign = android.graphics.Paint.Align.RIGHT }
		private var labels: List<Triple<String, Float, Boolean>> = emptyList()
		private var right = 0f

		fun set(labels: List<Triple<String, Float, Boolean>>, right: Float, size: Float, color: Int, alpha: Float) {
			this.labels = labels
			this.right = right
			paint.textSize = size
			paint.color = color
			paint.alpha = (android.graphics.Color.alpha(color) * alpha * 0.8f).toInt()
			invalidateSelf()
		}

		override fun draw(canvas: Canvas) {
			val fm = paint.fontMetrics
			val shift = -(fm.ascent + fm.descent) / 2f
			for ((label, y, _) in labels) canvas.drawText(label, right, y + shift, paint)
		}

		override fun setAlpha(alpha: Int) {}
		override fun setColorFilter(colorFilter: android.graphics.ColorFilter?) {}
		@Deprecated("Deprecated in Java")
		override fun getOpacity(): Int = android.graphics.PixelFormat.TRANSLUCENT
	}

	/** The bubble text of this row under a screen point (translationX included), or null. */
	private fun bubbleTextAt(state: RowState, rawX: Float, rawY: Float): TextView? {
		val accessories = state.accessories ?: return null
		val loc = IntArray(2)
		for (i in 0 until accessories.childCount) {
			val child = accessories.getChildAt(i) as? TextView ?: continue
			if (!contentClass.isInstance(child) || texts[child] == null || child.visibility != View.VISIBLE) continue
			child.getLocationOnScreen(loc)
			if (rawX >= loc[0] && rawX < loc[0] + child.width && rawY >= loc[1] && rawY < loc[1] + child.height) return child
		}
		return null
	}

	/** Whether a ClickableSpan is under the point, the way Discord's own handler looks for one. */
	private fun onClickableSpan(text: TextView, rawX: Float, rawY: Float): Boolean {
		val layout = text.layout ?: return true
		val spanned = text.text as? Spanned ?: return false
		val loc = IntArray(2)
		text.getLocationOnScreen(loc)
		val x = text.scrollX + (rawX - loc[0]) - text.totalPaddingLeft
		val y = text.scrollY + (rawY - loc[1]) - text.totalPaddingTop
		val line = layout.getLineForVertical(y.toInt())
		val left = layout.getLineLeft(line)
		val right = layout.getLineRight(line)
		val offset = layout.getOffsetForHorizontal(line, x.coerceIn(left, right))
		if (spanned.getSpans(offset, offset, ClickableSpan::class.java).isNotEmpty()) return true
		// Past the end of a line Discord can still pick a span on that line; stay out of its way.
		if (x > right || x < left) {
			val start = layout.getLineStart(line)
			val end = layout.getLineEnd(line)
			if (spanned.getSpans(start, end, ClickableSpan::class.java).isNotEmpty()) return true
		}
		return false
	}

	/** The one time pop-up ("Tap: pop-up above the bubble"). Main thread. */
	private val popups = TimePopups()

	/**
	 * A plain tap on a bubble with a tap time mode: under the bubble toggles that message's time
	 * (TimeTag); pop-up shows it above the bubble for a few seconds (TimePopups).
	 */
	private fun onPlainTap(text: TextView) {
		try {
			if (!config.tapTimes) return skip("timesOff")
			val state = rowOf(text) ?: return skip("noRow")
			if (state.mode == Mode.NONE) return skip("noBubble")
			lastTapTimeLength = state.timestamp?.length ?: -1
			val full = state.fullTime?.takeIf { it.isNotBlank() } ?: state.timestamp
			if (full.isNullOrBlank()) return skip("noTimestamp")
			lastTapSkip = null
			if (config.timesBelow) {
				// Under the bubble: toggled per message. The text measures again to make (or drop) the
				// room under the bubble, and the row's layout listener places the time in it.
				val id = state.messageId ?: return skip("noId")
				if (state.timestamp.isNullOrBlank()) return skip("noTimestamp")
				if (!shownTimes.remove(id)) {
					shownTimes += id
					if (shownTimes.size > MAX_SHOWN_TIMES) shownTimes.remove(shownTimes.first())
				}
				tapToggles++
				text.requestLayout()
				(text.parent?.parent as? ViewGroup)?.let { row ->
					updateTimeTag(row, state)
					text.post {
						runLayout(text)
						updateTimeTag(row, state)
					}
				}
				return
			}
			// Pop-up: the row's short time as Discord (or Custom Timestamps / Timezones) wrote it,
			// never Discord's long date; on later messages of a run, the time from the message id.
			val label = timesFor(state).second?.takeIf { it.isNotBlank() } ?: return skip("noTimestamp")
			val own = state.mode == Mode.OWN
			val saved = texts[text]
			val inset = if (saved != null && saved.bubble.tails) saved.bubble.tailWidth else 0f
			// The tapped bubble's own colours, so the pill reads as part of it (the shadow sets it apart).
			val bg = bgFor(state, state.mode)
			val fg = config.text(state.mode).defaultColor
			popups.toggle(text, label, own, inset, bg, fg)
			tapToggles++
		} catch (e: Throwable) {
			fail("tap", e)
		}
	}

	/** The time to draw under this row's bubble, or null. */
	private fun timeLabel(state: RowState): String? {
		if (!config.tapTimes || !config.timesBelow || state.mode == Mode.NONE) return null
		val id = state.messageId ?: return null
		// The whole text, Timezones' "· 3:02 AM Tue" included, on later messages of a run too.
		return if (id in shownTimes) timesFor(state).second else null
	}

	private val timePaint = android.graphics.Paint()

	/** Height kept under a bubble for its time: one line of it plus a small gap above. */
	private fun timeRoom(text: View): Int {
		timePaint.textSize = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, TIME_TEXT_SP, text.resources.displayMetrics)
		val fm = timePaint.fontMetrics
		return (fm.descent - fm.ascent).toInt() + dp(text, TIME_GAP_DP)
	}

	/**
	 * Shows, moves or removes the row's time tag (TimeTag): under the bubble, in the row's overlay.
	 * Called after a tap, a bind, a layout of the accessories and a settings change; a redraw only.
	 */
	private fun updateTimeTag(row: ViewGroup, state: RowState) {
		val label = timeLabel(state)
		val text = if (label.isNullOrBlank()) null else state.accessories?.let { acc ->
			(0 until acc.childCount).map(acc::getChildAt).firstOrNull { it is TextView && texts[it] != null } as? TextView
		}
		// Only once the text has measured with the room under it (styleText), or it would overlap.
		val room = text?.let { texts[it] }?.bubble?.bottomGap ?: 0f
		if (label.isNullOrBlank() || text == null || text.width == 0 || room <= 0f) {
			if (!label.isNullOrBlank()) lastTimeSkip = when {
				text == null -> "noText"
				text.width == 0 -> "noWidth"
				else -> "noRoom"
			}
			state.timeTag?.let { row.overlay.remove(it) }
			state.timeTag = null
			return
		}
		val tag = state.timeTag ?: TimeTag().also {
			it.setBounds(0, 0, Int.MAX_VALUE / 2, Int.MAX_VALUE / 2)
			row.overlay.add(it)
			state.timeTag = it
		}
		val rect = android.graphics.Rect(0, 0, text.width, text.height)
		row.offsetDescendantRectToMyCoords(text, rect)
		// Our own translationX and the accessories list's ("Hide avatars" moves the whole list).
		rect.offset((text.translationX + ((text.parent as? View)?.translationX ?: 0f)).toInt(), 0)
		val size = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, TIME_TEXT_SP, text.resources.displayMetrics)
		val own = state.mode == Mode.OWN
		// Lined up with the bubble's body on its own side, inside the tail.
		val inset = (if (config.tails) dp(text, TAIL_W_DP) else 0) + dp(text, TIME_INSET_DP)
		// On the chat background, not a bubble: the theme's normal text colour, a little faded.
		// With custom colours the text colours are picked for the bubbles, so plain light grey then.
		val base = if (config.custom) 0xFFDBDEE1.toInt() else config.text(Mode.OTHER).defaultColor
		val color = (base and 0x00FFFFFF) or (0xB3 shl 24)
		tag.set(label, color, size, (if (own) rect.right - inset else rect.left + inset).toFloat(), rect.bottom - tag.descent(), rightAligned = own)
		timesPlaced++
		lastTimeSkip = if (rect.bottom > row.height) "outsideRow ${rect.bottom}/${row.height}" else null
		row.invalidate()
	}

	/**
	 * The row this content view sits in, if it's one of ours (content -> accessories -> row). Only
	 * the message's own text counts: the reply preview above a reply is a MessageContentView too,
	 * one level down in the same row, and it stays stock (it became a bubble in 0.1.3).
	 */
	private fun rowOf(text: View): RowState? {
		val accessories = text.parent as? ViewGroup ?: return null
		if (!accessoriesClass.isInstance(accessories)) return null
		val row = accessories.parent as? ViewGroup ?: return null
		return rows[row]
	}

	private fun beforeMeasure(param: HookParam) {
		if (remeasuring) return
		val text = param.thisObject as? TextView ?: return
		if (!contentClass.isInstance(text)) return
		try {
			val state = rowOf(text)
			val mode = state?.mode ?: Mode.NONE
			if (state != null && mode != Mode.NONE) styleText(text, mode, state, timeLabel(state) != null) else restoreText(text)
		} catch (e: Throwable) {
			fail("measure", e)
		}
	}

	private fun afterMeasure(param: HookParam) {
		if (remeasuring) return
		val text = param.thisObject as? TextView ?: return
		if (!contentClass.isInstance(text)) return
		try {
			val state = rowOf(text) ?: return
			if (state.mode == Mode.NONE || texts[text] == null) return
			val args = param.args
			val widthSpec = args[0] as Int
			val heightSpec = args[1] as Int
			val available = View.MeasureSpec.getSize(widthSpec)
			val row = text.parent?.parent as? View
			val rowWidth = row?.width?.takeIf { it > 0 } ?: text.resources.displayMetrics.widthPixels
			val max = (rowWidth * MAX_WIDTH_FRACTION).toInt()
			val limit = if (available > 0) minOf(available, max) else max
			remeasuring = true
			try {
				onMeasure.invoke(text, View.MeasureSpec.makeMeasureSpec(limit, View.MeasureSpec.AT_MOST), heightSpec)
			} finally {
				remeasuring = false
			}
		} catch (e: Throwable) {
			remeasuring = false
			fail("remeasure", e)
		}
	}

	/**
	 * Places own bubbles on the right and leaves others' where Discord put the text; runs after
	 * every layout of the accessories list. Only translationX changes here, never a size.
	 */
	private fun applyTexts(row: ViewGroup, accessories: ViewGroup, state: RowState) {
		val mode = state.mode
		val shift = mode == Mode.OTHER && config.hideAvatars
		if (shift) shiftRow(row, accessories, state) else unshiftRow(state)
		if (mode == Mode.OWN) alignReply(row, accessories, state) else unalignReply(state)
		scheduleRowAlign(row, state)
		placeAccessories(row, accessories, state)
		if (mode == Mode.OTHER) noteChatMetrics(row, accessories)
		for (i in 0 until accessories.childCount) {
			val child = accessories.getChildAt(i) as? TextView ?: continue
			if (!contentClass.isInstance(child)) continue
			val saved = texts[child] ?: continue
			if (mode == Mode.OWN) {
				if (child.width > 0 && accessories.width > 0) {
					// The tail's tip is the bubble's right edge.
					val target = accessories.width - accessories.paddingRight - dp(child, RIGHT_GAP_DP)
					val dx = (target - child.right).coerceAtLeast(0).toFloat()
					if (child.translationX != dx) child.translationX = dx
				}
			} else if (mode == Mode.OTHER) {
				// Where Discord put it; "Hide avatars" moves the whole accessories list instead (shiftRow).
				if (child.translationX != saved.translationX) child.translationX = saved.translationX
			} else {
				// Measured as a bubble before the row changed; measure it again as stock.
				child.requestLayout()
			}
		}
		applyInk(accessories, state)
	}

	private fun applyInk(accessories: ViewGroup, state: RowState) {
		val mode = state.mode
		for (i in 0 until accessories.childCount) {
			val child = accessories.getChildAt(i) as? TextView ?: continue
			if (!contentClass.isInstance(child)) continue
			val on = config.invisibleInk && mode != Mode.NONE && texts[child] != null
			try {
				ink.update(child, on, bgFor(state, mode), config.text(mode).defaultColor)
			} catch (e: Throwable) {
				ink.remove(child)
				fail("ink", e)
			}
		}
	}

	// ---- Where the chat's columns are, for the typing bubble (JS) ----

	/** Screen x (px) of the left edge of their bubbles' body, and the avatar column's centre. */
	@Volatile private var bubbleLeftPx = -1f
	@Volatile private var avatarCenterPx = -1f
	@Volatile private var metricsDensity = 0f
	private val loc = IntArray(2)

	/**
	 * Remembers where their bubbles and the avatar column are on screen, from a laid-out row
	 * (translationX included, so "Hide avatars" is followed). Reading positions only.
	 */
	private fun noteChatMetrics(row: ViewGroup, accessories: ViewGroup) {
		metricsDensity = row.resources.displayMetrics.density
		for (i in 0 until accessories.childCount) {
			val child = accessories.getChildAt(i) as? TextView ?: continue
			val saved = texts[child] ?: continue
			if (child.width == 0) continue
			child.getLocationOnScreen(loc)
			// getLocationOnScreen includes translationX; the body starts after the tail's room.
			val reserve = if (saved.bubble.tails) saved.bubble.tailWidth else 0f
			bubbleLeftPx = loc[0] + reserve
			break
		}
		val avatar = row.findViewById<View>(id(row, "author_avatar")) ?: return
		if (avatar.width == 0) return
		avatar.getLocationOnScreen(loc)
		avatarCenterPx = loc[0] + avatar.width / 2f
	}

	/**
	 * For the typing bubble, in dp: their bubbles' left edge and the avatar column's centre, from a
	 * row on screen when there has been one, else from Discord's own dimensions
	 * (`message_start_guideline`, `message_avatar_margin_start`, `message_avatar`).
	 */
	fun chatMetrics(): Map<String, Any?> {
		val res = appContext?.resources
		val density = res?.displayMetrics?.density ?: metricsDensity.takeIf { it > 0 } ?: return emptyMap()
		fun dimen(name: String): Float? {
			val r = res ?: return null
			val pkg = appContext?.packageName ?: "com.discord"
			var id = r.getIdentifier(name, "dimen", pkg)
			if (id == 0) id = r.getIdentifier(name, "dimen", "com.discord")
			return if (id == 0) null else r.getDimension(id) / density
		}
		val guideline = dimen("message_start_guideline")
		val avatarSize = dimen("message_avatar")
		val avatarStart = dimen("message_avatar_margin_start")
		val tail = if (config.tails) TAIL_W_DP else 0f
		return mapOf(
			"bubbleLeft" to (bubbleLeftPx.takeIf { it >= 0 }?.div(density)
				?: if (config.hideAvatars) AVATAR_MARGIN_DP + tail else guideline?.plus(tail)),
			"avatarCenter" to (avatarCenterPx.takeIf { it >= 0 }?.div(density)
				?: if (avatarSize != null && avatarStart != null) avatarStart + avatarSize / 2 else null),
			"measured" to (bubbleLeftPx >= 0),
		)
	}

	/**
	 * "Hide avatars": moves their whole message left into the free avatar column, as one block:
	 * the accessories list (text bubbles, pictures, embeds, reactions), the name header and the
	 * reply preview above a reply. translationX only (no layout or size change); each view's own
	 * translationX is saved and put back by [unshiftRow].
	 */
	private fun shiftRow(row: ViewGroup, accessories: ViewGroup, state: RowState) {
		// Content starts where the first item starts (Discord's start guideline), else at the guideline dimension.
		val first = (0 until accessories.childCount).map(accessories::getChildAt).firstOrNull { it.width > 0 }
		val contentLeft = accessories.left + (first?.left ?: guidelinePx(row))
		val dx = (dp(row, AVATAR_MARGIN_DP) - contentLeft).coerceAtMost(0).toFloat()
		val views = listOfNotNull(
			accessories,
			row.findViewById<View>(id(row, "header")),
			(0 until row.childCount).map(row::getChildAt).firstOrNull { it.javaClass.name.contains("ReplyPreview") },
		)
		// Views that were moved but are no longer part of this row go back.
		for (v in state.shifted.keys.toList()) if (v !in views) {
			v.translationX = state.shifted.remove(v) ?: 0f
		}
		for (v in views) {
			val original = state.shifted.getOrPut(v) { v.translationX }
			val target = original + dx
			if (v.translationX != target) v.translationX = target
		}
	}

	/**
	 * Own replies: Discord lays the reply preview out for the left side (its curved line hooks down
	 * to the avatar column, the quote starts at the left). Ours sit on the right, so the line is
	 * mirrored to hook down onto the bubble's top right, and the quote (name chip and text) is
	 * right-aligned next to it; a long quote may run into the free avatar column. translationX and
	 * scaleX only, saved and put back by [unalignReply].
	 */
	private fun alignReply(row: ViewGroup, accessories: ViewGroup, state: RowState) {
		val preview = row.findViewById<View>(id(row, "reply_preview_view")) as? ViewGroup
		val spline = preview?.findViewById<View>(id(row, "reply_spline"))
		val quote = preview?.findViewById<TextView>(id(row, "reply_text"))
		val leading = preview?.findViewById<View>(id(row, "reply_leading_views"))
		if (preview == null || spline == null || quote == null || preview.width == 0 || spline.width == 0) {
			unalignReply(state)
			return
		}
		// Where own bubbles end (their tail tip): the target applyTexts pushes them to, not the
		// bubble's current edge, which on a freshly recycled row is still its left-side position
		// (0.2.13-0.2.20 put the line and quote 99px short on those rows).
		val bubbleRight = accessories.left + accessories.width - accessories.paddingRight - dp(row, RIGHT_GAP_DP)
		// The line comes down a little inside the bubble's top-right corner, past its tail.
		val inset = (if (config.tails) dp(row, TAIL_W_DP) else 0) + dp(row, minOf(config.bubbleRadiusDp, RADIUS_DP) * 0.75f)
		val lineRight = bubbleRight - inset - preview.left
		val gap = (quote.left - spline.right).coerceAtLeast(0)
		// The quote's drawn right edge: the widest line (getLineRight includes the first line's
		// indent for the name chip) or the chip, whichever reaches further.
		val layout = quote.layout
		val textRight = if (layout == null || layout.lineCount == 0) quote.right
		else quote.left + quote.paddingLeft + (0 until layout.lineCount).maxOf { layout.getLineRight(it) }.toInt()
		val contentRight = maxOf(textRight, leading?.takeIf { it.width > 0 }?.right ?: 0)
		val contentLeft = minOf(quote.left, leading?.left ?: quote.left)
		val dx = ((lineRight - spline.width - gap) - contentRight).coerceAtLeast(dp(row, AVATAR_MARGIN_DP) - contentLeft)
		move(state, spline, (lineRight - spline.width - spline.left).toFloat(), -1f)
		move(state, quote, dx.toFloat(), null)
		leading?.let { move(state, it, dx.toFloat(), null) }
	}

	/**
	 * Their avatar: Discord lines it up with the name above the first message, which leaves it
	 * floating beside the name once the text is a bubble under it. It moves down (translationY,
	 * set outright: Discord never sets it) so its top meets the first item of the message, never
	 * past the row's bottom.
	 *
	 * Measured just before the row draws ([scheduleRowAlign]), after its whole layout pass. The
	 * accessories list's layout listener runs in the middle of that pass, when the avatar's `top`
	 * is still the previous message's (0.2.17-0.2.19 read a reply row's 139px on a plain row and
	 * the other way round, so pictures jumped), and a bind runs before any layout at all.
	 */
	private fun alignAvatar(row: ViewGroup, state: RowState) {
		val accessories = state.accessories ?: return
		val avatar = row.findViewById<View>(id(row, "author_avatar"))
		// The message's first item (a bubble, a picture, an embed): the avatar meets its top.
		val first = (0 until accessories.childCount).map(accessories::getChildAt).firstOrNull { it.height > 0 }
		if (avatar == null || avatar.visibility != View.VISIBLE || avatar.height == 0 || first == null) {
			if (avatar != null && avatar.visibility == View.VISIBLE) lastAvatarAlign = if (first == null) "noContent" else "noHeight"
			unalignAvatar(row, state)
			return
		}
		// A bubble's body starts below the gap kept under their name.
		val isBubble = first is TextView && texts[first] != null
		val gap = if (isBubble && (state.position == GroupPosition.START || state.position == GroupPosition.ONLY)) dp(row, NAME_GAP_DP) else 0
		val firstTop = accessories.top + first.top + gap
		val wanted = (firstTop - avatar.top).coerceAtLeast(0)
		val dy = wanted.coerceAtMost(row.height - avatar.bottom).coerceAtLeast(0).toFloat()
		avatarsAligned++
		lastAvatarAlign = "dy=$dy firstTop=$firstTop bubble=$isBubble avatarTop=${avatar.top} rowH=${row.height} ty=${avatar.translationY}"
		setAvatarY(row, state, dy)
	}

	/**
	 * Aligns the row once its next layout is done and before it draws: a one-shot pre-draw
	 * listener, one per row at a time. Called from the bind and from the accessories list's layout
	 * listener; the frame that is drawn already has everything in place. Their avatar goes beside
	 * the first item ([alignAvatar]); own pictures, cards and reactions go to the right
	 * ([placeAccessories]), which also catches views recycled out of an own row.
	 */
	private fun scheduleRowAlign(row: ViewGroup, state: RowState) {
		if (state.avatarAlignPending) return
		state.avatarAlignPending = true
		val observer = row.viewTreeObserver
		if (!observer.isAlive) {
			state.avatarAlignPending = false
			return
		}
		observer.addOnPreDrawListener(object : android.view.ViewTreeObserver.OnPreDrawListener {
			override fun onPreDraw(): Boolean {
				state.avatarAlignPending = false
				val live = row.viewTreeObserver
				if (live.isAlive) live.removeOnPreDrawListener(this)
				try {
					if (rows[row] === state) alignRow(row, state)
				} catch (e: Throwable) {
					fail("align", e)
				}
				return true
			}
		})
	}

	private fun alignRow(row: ViewGroup, state: RowState) {
		if (state.mode == Mode.OTHER && !config.hideAvatars) alignAvatar(row, state) else unalignAvatar(row, state)
		state.accessories?.let { placeAccessories(row, it, state) }
		placeBreak(row, state)
	}

	// ---- Time breaks ----

	/** Per channel, the ids of messages that start a block (from JS). Main thread, bounded. */
	private val breaks = object : LinkedHashMap<String, Set<String>>(16, 0.75f, true) {
		override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Set<String>>?) = size > 50
	}

	/** JS: the messages of [channel] that come after a quiet gap. Rows on screen update at once. */
	fun setBreaks(channel: String, ids: Collection<String>) = main.post {
		try {
			val new = ids.toHashSet()
			if (breaks.put(channel, new) == new) return@post
			relayoutBreaks { it.channelKey == channel }
		} catch (e: Throwable) {
			fail("breaks", e)
		}
	}

	/** Pads or unpads every row that [matches], and runs the layout that needs (runLayout). */
	private fun relayoutBreaks(matches: (RowState) -> Boolean) {
		for ((row, state) in rows.entries.toList()) {
			if (!matches(state) || !row.isAttachedToWindow) continue
			if (!applyBreak(row, state)) continue
			row.requestLayout()
			runLayout(row)
			scheduleRowAlign(row, state)
		}
	}

	private fun breakWanted(state: RowState): Boolean {
		if (!config.timeBreaks || state.mode == Mode.NONE) return false
		val id = state.messageId ?: return false
		val channel = state.channelKey ?: return false
		return breaks[channel]?.contains(id) == true
	}

	/** The row's topmost part: the reply preview, else their name header, else the message list. */
	private fun topmostOf(row: ViewGroup, state: RowState): View? =
		listOfNotNull(
			row.findViewById<View>(id(row, "reply_preview_view")),
			row.findViewById<View>(id(row, "header")),
			state.accessories,
		).firstOrNull { it.visibility == View.VISIBLE }

	private val breakPaint = android.graphics.Paint()

	/** Height kept above the row's content for the time: one line of it plus a gap each side. */
	private fun breakRoom(row: View): Int {
		breakPaint.textSize = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, BREAK_TEXT_SP, row.resources.displayMetrics)
		val fm = breakPaint.fontMetrics
		return (fm.descent - fm.ascent).toInt() + 2 * dp(row, BREAK_PAD_DP)
	}

	/**
	 * Makes (or drops) the room for a time break above the row: extra top padding on its topmost
	 * part, set before the row measures (a bind, or relayoutBreaks). Padding Discord doesn't touch
	 * between binds, so what we added is taken off first, if it is still ours. Returns whether
	 * anything changed.
	 */
	private fun applyBreak(row: ViewGroup, state: RowState): Boolean {
		var changed = false
		state.breakPadded?.let { v ->
			val ours = state.breakPadding + breakRoom(row)
			if (v.paddingTop == ours) v.setPadding(v.paddingLeft, state.breakPadding, v.paddingRight, v.paddingBottom)
			state.breakPadded = null
			changed = true
		}
		if (!breakWanted(state)) return changed
		val target = topmostOf(row, state) ?: return changed
		state.breakPadding = target.paddingTop
		target.setPadding(target.paddingLeft, target.paddingTop + breakRoom(row), target.paddingRight, target.paddingBottom)
		state.breakPadded = target
		return true
	}

	/** Draws (or removes) the row's time break label, centred in the room applyBreak made. */
	private fun placeBreak(row: ViewGroup, state: RowState) {
		val padded = state.breakPadded
		val label = padded?.let { state.messageId?.toLongOrNull()?.let { id -> breakLabel(row, (id ushr 22) + DISCORD_EPOCH) } }
		if (padded == null || label == null || row.width == 0) {
			state.breakTag?.let { row.overlay.remove(it) }
			state.breakTag = null
			return
		}
		val tag = state.breakTag ?: TimeTag().also {
			it.setBounds(0, 0, Int.MAX_VALUE / 2, Int.MAX_VALUE / 2)
			row.overlay.add(it)
			state.breakTag = it
		}
		val size = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, BREAK_TEXT_SP, row.resources.displayMetrics)
		val base = if (config.custom) 0xFFDBDEE1.toInt() else config.text(Mode.OTHER).defaultColor
		val color = (base and 0x00FFFFFF) or (0xE0 shl 24)
		breakPaint.textSize = size
		val baseline = padded.top + dp(row, BREAK_PAD_DP) - breakPaint.fontMetrics.ascent
		val margin = dp(row, BREAK_RULE_MARGIN_DP).toFloat()
		tag.setCentered(label, color, size, row.width / 2f, baseline, margin, row.width - margin, dp(row, 1f).toFloat())
		row.invalidate()
	}

	/** "Today 3:42 PM", "Yesterday 9:10 AM", "Mon 3:42 PM", "Oct 12 3:42 PM" (with the year when it differs). */
	private fun breakLabel(row: View, at: Long): String? {
		val context = appContext ?: row.context
		val time = android.text.format.DateFormat.getTimeFormat(context).format(java.util.Date(at))
		val now = java.util.Calendar.getInstance()
		val then = java.util.Calendar.getInstance().apply { timeInMillis = at }
		val dayNow = now.get(java.util.Calendar.YEAR) * 400L + now.get(java.util.Calendar.DAY_OF_YEAR)
		val dayThen = then.get(java.util.Calendar.YEAR) * 400L + then.get(java.util.Calendar.DAY_OF_YEAR)
		val day = when {
			dayThen == dayNow -> "Today"
			dayThen == dayNow - 1 -> "Yesterday"
			now.timeInMillis - at < 6L * 86_400_000L -> android.text.format.DateFormat.format("EEE", at).toString()
			then.get(java.util.Calendar.YEAR) == now.get(java.util.Calendar.YEAR) -> android.text.format.DateFormat.format("MMM d", at).toString()
			else -> android.text.format.DateFormat.format("MMM d, yyyy", at).toString()
		}
		return "$day $time"
	}

	// ---- Own pictures, cards and reactions on the right ----

	/** Accessory containers we moved right (own rows) -> their translationX before. Main thread. */
	private val movedAccessories = WeakHashMap<View, Float>()
	/** Embed cards we clipped to the bubble radius -> their (outlineProvider, clipToOutline) before. */
	private val roundedCards = WeakHashMap<View, Pair<android.view.ViewOutlineProvider?, Boolean>>()

	/**
	 * Everything in the accessories list that isn't a text bubble (a picture mosaic, a link card,
	 * the reactions row) is a full-width container with its content at the left. On own rows each
	 * is slid right (translationX only) so its content's right edge meets the bubbles' tail tip,
	 * measured from the container's widest laid-out child (the mosaic, the card, the last chip).
	 * Cards get the bubble's corner radius on every bubble row. Views recycled into any other row
	 * are put back here, since every row gets this pass after its layout.
	 */
	private fun placeAccessories(row: ViewGroup, accessories: ViewGroup, state: RowState) {
		val own = state.mode == Mode.OWN
		val target = accessories.width - accessories.paddingRight - dp(row, RIGHT_GAP_DP)
		for (i in 0 until accessories.childCount) {
			val child = accessories.getChildAt(i)
			if (child is TextView && contentClass.isInstance(child)) continue
			if (child.javaClass.name == REACTIONS_VIEW && child is ViewGroup) {
				if (state.mode != Mode.NONE && config.iosReactions) styleReactions(accessories, child, state.mode == Mode.OWN) else restoreReactions(child)
				if (state.mode != Mode.NONE && config.tapbackCorner && placeTapback(row, accessories, child, i, state)) continue
				restoreTapback(child)
			}
			roundCard(row, child, state.mode != Mode.NONE)
			if (!own || child.width == 0 || child !is ViewGroup) {
				movedAccessories.remove(child)?.let { if (child.translationX != it) child.translationX = it }
				continue
			}
			val contentRight = (0 until child.childCount).map(child::getChildAt)
				.filter { it.width > 0 && it.visibility == View.VISIBLE }
				.maxOfOrNull { it.right } ?: child.width
			val dx = (target - (child.left + contentRight)).coerceAtLeast(0).toFloat()
			val original = movedAccessories.getOrPut(child) { child.translationX }
			if (child.translationX != original + dx) child.translationX = original + dx
		}
	}

	// ---- Reactions on the bubble's top corner (iMessage's place for tapbacks) ----

	private class TapbackSaved(
		val tx: Float, val ty: Float, val sx: Float, val sy: Float, val px: Float, val py: Float,
		val clip: Boolean = true,
		/** "+" buttons we hid -> their visibility before. */
		val hidden: MutableMap<View, Int> = WeakHashMap(),
	)

	/** Reactions rows we moved -> how they were. Main thread. */
	private val tapbacks = WeakHashMap<View, TapbackSaved>()

	/**
	 * The reactions row's own onMeasure (on its class or the nearest superclass that has one). While
	 * a row sits on the corner it measures 1 px tall, so no gap is left under the bubble; it still
	 * draws its chips (clipping is off), and touches on them are handed over by [routeTapbackTouch].
	 */
	private val setMeasured: Method = View::class.java
		.getDeclaredMethod("setMeasuredDimension", Int::class.javaPrimitiveType, Int::class.javaPrimitiveType)
		.apply { isAccessible = true }
	private val unhookFlexMeasure: Unhook? = runCatching {
		var c: Class<*>? = scope.classLoader.loadClass(REACTIONS_VIEW)
		var m: Method? = null
		while (c != null && m == null) {
			m = runCatching { c!!.getDeclaredMethod("onMeasure", Int::class.javaPrimitiveType, Int::class.javaPrimitiveType) }.getOrNull()
			c = c.superclass
		}
		hookMethod(m!!, after = ::afterFlexMeasure)
	}.onFailure { scope.log.w("reactions measure not hooked: ${it.message}") }.getOrNull()

	private fun afterFlexMeasure(param: HookParam) {
		val flex = param.thisObject as? View ?: return
		if (flex.javaClass.name != REACTIONS_VIEW || !tapbacks.containsKey(flex)) return
		runCatching { setMeasured.invoke(flex, flex.measuredWidth, 1) }
	}

	private fun collectAdd(v: View, out: MutableList<View>) {
		if (v.javaClass.name == ADD_REACTION_BUTTON) { out += v; return }
		if (v is ViewGroup) for (i in 0 until v.childCount) collectAdd(v.getChildAt(i), out)
	}

	/**
	 * Discord's own reactions row, moved (translation and scale only) onto the top corner of the
	 * bubble above it: the top left of yours, the top right of theirs, like iMessage. The chips stay
	 * Discord's views, so a tap still does what a tap on a reaction does; nothing new reacts. The "+"
	 * button is hidden (long-press still adds a reaction). The row measures 1 px tall, so no gap is
	 * left under the bubble; touches on its chips are handed to it by [routeTapbackTouch].
	 */
	private fun placeTapback(row: ViewGroup, acc: ViewGroup, flex: ViewGroup, index: Int, state: RowState): Boolean {
		if (flex.width == 0) return false
		var bubble: View? = null
		for (j in index - 1 downTo 0) {
			val v = acc.getChildAt(j)
			if (v.width > 0 && v.height > 0 && v.visibility == View.VISIBLE) { bubble = v; break }
		}
		if (bubble == null) return false
		movedAccessories.remove(flex)?.let { flex.translationX = it }
		val fresh = !tapbacks.containsKey(flex)
		val saved = tapbacks.getOrPut(flex) {
			TapbackSaved(flex.translationX, flex.translationY, flex.scaleX, flex.scaleY, flex.pivotX, flex.pivotY, clip = flex.clipChildren)
		}
		if (flex.clipChildren) flex.clipChildren = false
		if (fresh) flex.post { flex.requestLayout() }
		val adds = mutableListOf<View>()
		for (i in 0 until flex.childCount) collectAdd(flex.getChildAt(i), adds)
		for (a in adds) {
			if (a !in saved.hidden) saved.hidden[a] = a.visibility
			if (a.visibility != View.INVISIBLE) a.visibility = View.INVISIBLE
		}
		// The chips' extent inside the reactions row (the "+" and its wrapper left out).
		var cl = Int.MAX_VALUE
		var cr = Int.MIN_VALUE
		var ct = Int.MAX_VALUE
		var cb = Int.MIN_VALUE
		for (i in 0 until flex.childCount) {
			val c = flex.getChildAt(i)
			if (c.width == 0 || c.visibility != View.VISIBLE || c in adds) continue
			if (c is ViewGroup && c.javaClass.name.startsWith("com.google.android.flexbox")) continue
			cl = minOf(cl, c.left)
			cr = maxOf(cr, c.right)
			ct = minOf(ct, c.top)
			cb = maxOf(cb, c.bottom)
		}
		if (cl == Int.MAX_VALUE) return false
		// The bubble's extent in the accessories list: a text's own box, or a container's content.
		val bl: Float
		val br: Float
		val bt: Float
		if (bubble is TextView) {
			bl = bubble.left + bubble.translationX
			br = bl + bubble.width
			bt = bubble.top + bubble.translationY
		} else {
			val group = bubble as? ViewGroup
			val kids = if (group == null) emptyList() else (0 until group.childCount).map(group::getChildAt)
				.filter { it.width > 0 && it.visibility == View.VISIBLE }
			bl = bubble.left + bubble.translationX + (kids.minOfOrNull { it.left } ?: 0)
			br = bubble.left + bubble.translationX + (kids.maxOfOrNull { it.right } ?: bubble.width)
			bt = bubble.top + bubble.translationY + (kids.minOfOrNull { it.top } ?: 0)
		}
		val own = state.mode == Mode.OWN
		val overlap = dp(row, TAPBACK_OVERLAP_DP)
		val sc = TAPBACK_SCALE
		// Scaled about the corner that meets the bubble, so that corner stays put.
		val px = (if (own) cr else cl).toFloat()
		val py = ct.toFloat()
		val targetX = if (own) bl + overlap else br - overlap
		val chipH = (cb - ct) * sc
		val targetY = bt - chipH * 0.55f
		val tx = saved.tx + targetX - (flex.left + px)
		val ty = saved.ty + targetY - (flex.top + py)
		if (flex.pivotX != px) flex.pivotX = px
		if (flex.pivotY != py) flex.pivotY = py
		if (flex.scaleX != sc) flex.scaleX = sc
		if (flex.scaleY != sc) flex.scaleY = sc
		if (flex.translationX != tx) flex.translationX = tx
		if (flex.translationY != ty) flex.translationY = ty
		for (g in listOf(acc, row)) if (g.clipChildren) {
			unclippedForDots.getOrPut(g) { true }
			g.clipChildren = false
		}
		raiseRow(row)
		return true
	}

	/** Rows lifted above their neighbours for a corner badge -> (translationZ, outlineProvider) before. */
	private val raisedRows = WeakHashMap<View, Pair<Float, android.view.ViewOutlineProvider?>>()

	/**
	 * The badge reaches up into the row above, and the chat list draws its rows bottom-up, so the
	 * row above would paint over it. A little translationZ puts this row on top (ViewGroup draws
	 * children in Z order). No outline while raised, so it casts no shadow.
	 */
	private fun raiseRow(row: View) {
		if (!raisedRows.containsKey(row)) raisedRows[row] = row.translationZ to row.outlineProvider
		if (row.outlineProvider != null) row.outlineProvider = null
		if (row.translationZ != TAPBACK_ROW_Z) row.translationZ = TAPBACK_ROW_Z
	}

	private fun lowerRow(row: View) {
		val (z, outline) = raisedRows.remove(row) ?: return
		row.translationZ = z
		row.outlineProvider = outline
	}

	private fun restoreTapback(flex: View) {
		val saved = tapbacks.remove(flex) ?: return
		flex.translationX = saved.tx
		flex.translationY = saved.ty
		flex.scaleX = saved.sx
		flex.scaleY = saved.sy
		flex.pivotX = saved.px
		flex.pivotY = saved.py
		(flex as? ViewGroup)?.clipChildren = saved.clip
		for ((v, vis) in saved.hidden) v.visibility = vis
		((flex.parent as? View)?.parent as? View)?.let(::lowerRow)
		// Back to its full height.
		flex.requestLayout()
	}

	/** The reactions row taking this row's touches, from a DOWN on a badge to its UP. Main thread. */
	private var tapbackTouch: ViewGroup? = null

	/** [e] (in [parent]'s coordinates) in [child]'s own, translation and scale undone. */
	private fun toChild(parent: View, child: View, e: MotionEvent) {
		e.offsetLocation((parent.scrollX - child.left).toFloat(), (parent.scrollY - child.top).toFloat())
		if (!child.matrix.isIdentity) {
			val inv = android.graphics.Matrix()
			if (child.matrix.invert(inv)) e.transform(inv)
		}
	}

	/**
	 * A touch on a corner badge goes straight to Discord's reactions row, which hands it to the chip
	 * under it as usual, so a tap or long-press does exactly what it does on Discord's chip. Needed
	 * because the row is 1 px tall there: its parent would never send it a touch. True when consumed.
	 */
	private fun routeTapbackTouch(row: ViewGroup, state: RowState, event: MotionEvent): Boolean {
		val acc = state.accessories ?: return false
		val action = event.actionMasked
		if (action == MotionEvent.ACTION_DOWN) {
			tapbackTouch = null
			if (!config.tapbackCorner) return false
			for (i in 0 until acc.childCount) {
				val flex = acc.getChildAt(i) as? ViewGroup ?: continue
				if (!tapbacks.containsKey(flex)) continue
				val e = MotionEvent.obtain(event)
				try {
					toChild(row, acc, e)
					toChild(acc, flex, e)
					if (!chipAt(flex, e.x, e.y)) continue
				} finally {
					e.recycle()
				}
				tapbackTouch = flex
				break
			}
		}
		val flex = tapbackTouch ?: return false
		if (flex.parent !== acc) {
			tapbackTouch = null
			return false
		}
		val e = MotionEvent.obtain(event)
		try {
			toChild(row, acc, e)
			toChild(acc, flex, e)
			flex.dispatchTouchEvent(e)
		} finally {
			e.recycle()
		}
		if (action == MotionEvent.ACTION_DOWN) row.parent?.requestDisallowInterceptTouchEvent(true)
		if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) tapbackTouch = null
		return true
	}

	/** Whether a visible reaction chip (not the hidden "+") is at ([x], [y]) in the reactions row. */
	private fun chipAt(group: ViewGroup, x: Float, y: Float): Boolean {
		for (i in 0 until group.childCount) {
			val c = group.getChildAt(i)
			if (c.visibility != View.VISIBLE || c.width == 0) continue
			if (x < c.left || x >= c.right || y < c.top || y >= c.bottom) continue
			if (c is ViewGroup && c.javaClass.name.startsWith("com.google.android.flexbox")) return false
			return c.javaClass.name != ADD_REACTION_BUTTON
		}
		return false
	}

	// ---- iOS-style reactions: Discord's chips, in place, restyled ----

	/** A chip's background and its texts' colours before we changed them. */
	private class ChipSaved(
		val background: Drawable?,
		val texts: Map<TextView, ColorStateList>,
		val elevation: Float = 0f,
		/** The "+" button's inner views' backgrounds and elevations we cleared. */
		val inner: Map<View, Pair<Drawable?, Float>> = emptyMap(),
	)

	/** Chips we restyled -> how they were. Main thread. */
	private val styledChips = WeakHashMap<View, ChipSaved>()

	/**
	 * Whether you reacted with each chip, as Discord last told it. When Discord binds a chip it calls
	 * two of the chip's own methods with that flag, `(boolean me, colours)`, to pick its background
	 * and text colours (`a` and `b` on 352.2, decompiled `dg/b.java`). Those are watched with an
	 * after-hook that only reads the flag. (0.5.9 to 0.5.16 read a boxed Boolean field instead,
	 * which is the emoji's "animated" flag, so some pills were purple that weren't yours.)
	 */
	private val chipMe = WeakHashMap<View, Boolean>()

	/** The chip class: what the reactions row's `(int) -> chip` factory returns (`v` on 352.2). */
	private val unhookChipMe: List<Unhook> = runCatching {
		val flexClass = scope.classLoader.loadClass(REACTIONS_VIEW)
		val chipClass = flexClass.declaredMethods.firstOrNull { m ->
			m.parameterTypes.size == 1 && m.parameterTypes[0] == Int::class.javaPrimitiveType &&
				View::class.java.isAssignableFrom(m.returnType) && m.returnType != View::class.java
		}?.returnType ?: error("reaction chip factory not found")
		chipClass.declaredMethods.filter { m ->
			m.returnType == Void.TYPE && m.parameterTypes.size == 2 &&
				m.parameterTypes[0] == java.lang.Boolean.TYPE && !m.parameterTypes[1].isPrimitive
		}.map { hookMethod(it, after = ::afterChipColors) }.also {
			if (it.isEmpty()) scope.log.w("reaction chip colour methods not found")
		}
	}.onFailure { scope.log.w("reactions 'me' not hooked: ${it.message}") }.getOrDefault(emptyList())

	private fun afterChipColors(param: HookParam) {
		val chip = param.thisObject as? View ?: return
		val me = param.args.getOrNull(0) as? Boolean ?: return
		if (chipMe[chip] == me) return
		chipMe[chip] = me
		// Discord just recoloured the chip: the next layout pass puts the badge back in the right colour.
		if (config.iosReactions) chip.post { (chip.parent as? View)?.requestLayout() }
	}

	private fun chipIsMine(chip: View): Boolean = chipMe[chip] == true

	private fun collectTexts(v: View, out: MutableList<TextView>) {
		if (v is TextView) out += v
		if (v is ViewGroup) for (i in 0 until v.childCount) collectTexts(v.getChildAt(i), out)
	}

	/**
	 * Each reaction chip (and the "+" button) becomes a round pill like iOS: yours in your bubble's
	 * colour, everyone else's in theirs, with the count in that bubble's text colour. Only the
	 * background and text colours change; the chips stay Discord's views where Discord put them, so
	 * taps and long-presses work as before. Run after every layout, since Discord sets a new
	 * background when a reaction changes.
	 */
	private fun styleReactions(acc: ViewGroup, flex: ViewGroup, own: Boolean) {
		val density = flex.resources.displayMetrics.density
		val visible = (0 until flex.childCount).map(flex::getChildAt).filter { it.visibility == View.VISIBLE && it.width > 0 }
		// The badges' dots reach past the chips: let the reactions row, the list and the row draw there.
		val row = acc.parent as? ViewGroup
		for (g in listOfNotNull(flex, acc, row)) if (g.clipChildren) {
			unclippedForDots.getOrPut(g) { true }
			g.clipChildren = false
		}
		// The "+" sits in a small FlexboxLayout of its own: that wrapper stays as Discord drew it (a
		// badge on it was the box around the button), and the button inside gets the badge instead.
		val targets = ArrayList<View>()
		for (child in visible) {
			if (child is ViewGroup && child.javaClass.name.startsWith("com.google.android.flexbox")) {
				restoreChip(child)
				for (k in 0 until child.childCount) {
					val c = child.getChildAt(k)
					if (c.visibility == View.VISIBLE && c.width > 0 && c.javaClass.name == ADD_REACTION_BUTTON) targets += c
				}
			} else targets += child
		}
		for (chip in targets) {
			// The whole badge in the other bubble colour from the message it's on: theirs on your
			// bubbles, yours on theirs, so it stands out against the bubble.
			val mode = if (own) Mode.OTHER else Mode.OWN
			val texts = mutableListOf<TextView>()
			collectTexts(chip, texts)
			val prior = styledChips[chip]
			// Discord replaced the background since (a reaction changed): save the new one.
			val ours = prior != null && chip.background is PillDrawable
			val add = chip.javaClass.name == ADD_REACTION_BUTTON
			if (!ours) {
				// The "+" button draws its own grey circle and shadow inside: cleared, so it's one flat pill.
				val inner = HashMap<View, Pair<Drawable?, Float>>()
				if (add && chip is ViewGroup) {
					fun walk(v: ViewGroup) {
						for (k in 0 until v.childCount) {
							val c = v.getChildAt(k)
							if (c.background != null || c.elevation != 0f) inner[c] = c.background to c.elevation
							if (c is ViewGroup) walk(c)
						}
					}
					walk(chip)
				}
				styledChips[chip] = ChipSaved(chip.background, texts.associateWith { it.textColors }, chip.elevation, inner)
			}
			if (add) {
				if (chip.elevation != 0f) chip.elevation = 0f
				for (v in styledChips[chip]?.inner?.keys.orEmpty()) {
					if (v.background != null) v.background = null
					if (v.elevation != 0f) v.elevation = 0f
				}
			}
			val bg = config.bg(mode)
			// No dots on the "+": it isn't a reaction. Under the message they trail down towards it; on
			// the bubble's corner they trail up and away from it (left on yours, right on theirs).
			val corner = config.tapbackCorner
			val side = if (add) 0 else if (own != corner) 1 else -1
			// Dots always trail down, in the badge's colour.
			val vert = 1
			val dots = bg
			val ring = config.chatBg
			val badge = (chip.background as? PillDrawable)?.takeIf {
				it.color == bg && it.dotColor == dots && it.side == side && it.vert == vert && it.ring == ring
			}
			if (badge == null) chip.background = PillDrawable(bg, dots, side, vert, ring, density)
			val fg = config.text(mode)
			for (t in texts) if (t.textColors != fg) t.setTextColor(fg)
		}
	}

	private fun restoreReactions(flex: View) {
		if (flex !is ViewGroup) return
		for (i in 0 until flex.childCount) restoreChip(flex.getChildAt(i))
		unclippedForDots.remove(flex)?.let { flex.clipChildren = it }
	}

	/** Containers we let draw past their bounds for the dots -> clipChildren before. */
	private val unclippedForDots = WeakHashMap<ViewGroup, Boolean>()

	private fun restoreChip(chip: View) {
		val saved = styledChips.remove(chip) ?: return
		if (chip.background is PillDrawable) chip.background = saved.background
		for ((t, c) in saved.texts) if (t.textColors != c) t.setTextColor(c)
		if (chip.elevation != saved.elevation) chip.elevation = saved.elevation
		for ((v, pair) in saved.inner) {
			v.background = pair.first
			v.elevation = pair.second
		}
	}

	/**
	 * iMessage's tapback badge: a round badge (a pill when the chip is wider than tall, for a count
	 * or Who Reacted's avatars) with a middle dot and a small dot trailing off its lower corner on
	 * the message's side ([side] 1: right, -1: left), and a thin ring in the chat background colour
	 * around all three so it looks cut out. Dot sizes and places follow BlueBubbles' tapback
	 * (Apache-2.0, reaction_clipper.dart): in a box of side s, the badge is 0.8s, the middle dot
	 * 0.3s at (0.55s, 0.55s) and the small dot 0.175s at (0.825s, 0.825s). Our own drawing, no
	 * Apple artwork.
	 */
	private class PillDrawable(
		val color: Int,
		val dotColor: Int,
		val side: Int,
		val vert: Int,
		val ring: Int?,
		private val density: Float,
	) : Drawable() {
		private val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG)
		private val rect = android.graphics.RectF()

		private fun pill(canvas: Canvas, grow: Float) {
			val r = rect.height() / 2f
			canvas.drawRoundRect(rect.left - grow, rect.top - grow, rect.right + grow, rect.bottom + grow, r + grow, r + grow, paint)
		}

		private fun dots(canvas: Canvas, grow: Float) {
			val r = rect.height() / 2f
			if (side == 0) return
			// The dots hang off the end cap on [side] (1 right, -1 left), down ([vert] 1) or up (-1),
			// measured from its centre.
			val d = rect.height()
			val cx = if (side > 0) rect.right - r else rect.left + r
			val cy = rect.top + r
			canvas.drawCircle(cx + side * 0.375f * d, cy + vert * 0.375f * d, 0.1875f * d + grow, paint)
			canvas.drawCircle(cx + side * 0.64f * d, cy + vert * 0.64f * d, 0.109f * d + grow, paint)
		}

		override fun draw(canvas: Canvas) {
			rect.set(bounds)
			if (rect.height() <= 0f) return
			// Square chips become a circle the chip's height across, centred.
			if (rect.width() < rect.height() * 1.15f) {
				val c = rect.centerX()
				val r = rect.height() / 2f
				rect.left = c - r
				rect.right = c + r
			}
			// Ring round everything, then the dots, then the badge with its own ring over them, so
			// the differently coloured dots sit cut out just under the badge.
			val g = 1.5f * density
			ring?.let {
				paint.color = it
				pill(canvas, g)
				dots(canvas, g)
			}
			paint.color = dotColor
			dots(canvas, 0f)
			ring?.let {
				paint.color = it
				pill(canvas, g)
			}
			paint.color = color
			pill(canvas, 0f)
		}

		override fun setAlpha(alpha: Int) { paint.alpha = alpha }
		override fun setColorFilter(colorFilter: android.graphics.ColorFilter?) { paint.colorFilter = colorFilter }
		@Deprecated("Deprecated in Java")
		override fun getOpacity(): Int = android.graphics.PixelFormat.TRANSLUCENT
	}

	/** A link or embed card (it has Discord's `border` strip): corners clipped to the bubble radius. */
	private fun roundCard(row: ViewGroup, container: View, on: Boolean) {
		if (container.findViewById<View>(id(row, "border")) == null) {
			restoreCard(container)
			return
		}
		if (!on) {
			restoreCard(container)
			return
		}
		if (container.outlineProvider is RoundedOutline) return
		roundedCards[container] = container.outlineProvider to container.clipToOutline
		container.outlineProvider = RoundedOutline(config.bubbleRadiusDp * container.resources.displayMetrics.density)
		container.clipToOutline = true
	}

	private fun restoreCard(container: View) {
		val (provider, clip) = roundedCards.remove(container) ?: return
		container.outlineProvider = provider
		container.clipToOutline = clip
	}

	private class RoundedOutline(private val radius: Float) : android.view.ViewOutlineProvider() {
		override fun getOutline(view: View, outline: android.graphics.Outline) {
			outline.setRoundRect(0, 0, view.width, view.height, radius)
		}
	}

	private fun setAvatarY(row: ViewGroup, state: RowState, dy: Float) {
		state.avatarMoved = dy != 0f
		for (name in AVATAR_VIEWS) {
			val v = row.findViewById<View>(id(row, name)) ?: continue
			if (v.translationY != dy) v.translationY = dy
		}
	}

	private fun unalignAvatar(row: ViewGroup, state: RowState) {
		if (!state.avatarMoved) return
		setAvatarY(row, state, 0f)
	}

	/** Sets [v]'s translationX (and scaleX, when given), first saving what it had. */
	private fun move(state: RowState, v: View, dx: Float, scaleX: Float?) {
		val (tx, sx) = state.replyMoved.getOrPut(v) { v.translationX to v.scaleX }
		if (v.translationX != tx + dx) v.translationX = tx + dx
		val sxTarget = scaleX ?: sx
		if (v.scaleX != sxTarget) v.scaleX = sxTarget
	}

	private fun unalignReply(state: RowState) {
		for ((v, saved) in state.replyMoved) {
			if (v.translationX != saved.first) v.translationX = saved.first
			if (v.scaleX != saved.second) v.scaleX = saved.second
		}
		state.replyMoved.clear()
	}

	private fun unshiftRow(state: RowState) {
		for ((v, original) in state.shifted) if (v.translationX != original) v.translationX = original
		state.shifted.clear()
	}

	private fun guidelinePx(row: View): Int {
		val res = row.resources
		var rid = res.getIdentifier("message_start_guideline", "dimen", row.context.packageName)
		if (rid == 0) rid = res.getIdentifier("message_start_guideline", "dimen", "com.discord")
		return if (rid == 0) 0 else res.getDimensionPixelSize(rid)
	}

	/**
	 * Which ends of this bubble touch another bubble of the same group (small corner there, and no
	 * tail under a joined bottom). Discord's group position only says the next or previous message
	 * is by the same person; it also counts runs with something else in between. So an end joins
	 * only when, besides the position, nothing else of this row sits on that side of the bubble
	 * (a picture, an embed, reactions, the reply quote, a time break, the time under it) and the
	 * neighbouring row, when it's on screen, has a bubble on the facing side.
	 */
	private fun joins(text: TextView, state: RowState, timeShown: Boolean): Pair<Boolean, Boolean> {
		val accessories = text.parent as? ViewGroup ?: return false to false
		val row = accessories.parent as? ViewGroup ?: return false to false
		val items = (0 until accessories.childCount).map(accessories::getChildAt)
			.filter { it.visibility == View.VISIBLE && (it.height > 0 || it === text) }
		val pos = state.position
		val top = (pos == GroupPosition.MIDDLE || pos == GroupPosition.END) &&
			items.firstOrNull() === text && !interruptedAbove(row, state) && state.aboveJoins != false
		val bottom = (pos == GroupPosition.START || pos == GroupPosition.MIDDLE) &&
			items.lastOrNull() === text && !timeShown && state.belowJoins != false
		return top to bottom
	}

	/**
	 * Something of the row's own above its first item: the reply quote, a time break, or the
	 * author's name (Discord shows it again after a pause even when the group position still says
	 * the run goes on). The name counts while we hide it too ([RowState.hidden]).
	 */
	private fun interruptedAbove(row: ViewGroup, state: RowState): Boolean {
		if (state.breakPadded != null) return true
		if (row.findViewById<View>(id(row, "reply_preview_view"))?.visibility == View.VISIBLE) return true
		val name = row.findViewById<View>(id(row, "author_name")) ?: return false
		return name.visibility == View.VISIBLE || state.hidden.containsKey(name)
	}

	/** The row's first or last laid-out item is a bubble (null when nothing is laid out yet). */
	private fun edgeIsBubble(state: RowState, first: Boolean): Boolean? {
		val accessories = state.accessories ?: return null
		val items = (0 until accessories.childCount).map(accessories::getChildAt).filter { it.visibility == View.VISIBLE && it.height > 0 }
		val edge = (if (first) items.firstOrNull() else items.lastOrNull()) ?: return null
		val saved = (edge as? TextView)?.let { texts[it] } ?: return false
		return edge.background === saved.bubble
	}

	/**
	 * Fills [RowState.aboveJoins] / [RowState.belowJoins] from the rows on screen: each pair of
	 * touching rows joins only when the upper one ends with a bubble and the lower one starts
	 * with one, with no quote or time break on top of it. A different view touching the row (a
	 * date divider, a "new messages" line) blocks the join too; at the list's edge nothing is
	 * known and the group position decides. Returns the rows whose verdict changed.
	 */
	private fun checkNeighbours(list: ViewGroup): List<Pair<ViewGroup, RowState>> {
		val slack = dp(list, 2f)
		// Where each row is on screen, not in the list's own coordinates: the chat list can be
		// drawn flipped (newest at the bottom), which turns its tops and bottoms around.
		val boxes = LinkedHashMap<View, android.graphics.Rect>()
		for (i in 0 until list.childCount) {
			val child = list.getChildAt(i)
			if (child.visibility != View.VISIBLE || child.height == 0) continue
			val box = android.graphics.Rect()
			if (child.getGlobalVisibleRect(box)) boxes[child] = box
		}
		val changed = ArrayList<Pair<ViewGroup, RowState>>()
		val snapshot = ArrayList<Map<String, Any?>>()
		for ((child, box) in boxes) {
			val row = child as? ViewGroup ?: continue
			val state = rows[row] ?: continue
			val above = boxes.entries.firstOrNull { it.key !== row && kotlin.math.abs(it.value.bottom - box.top) <= slack }?.key
			val below = boxes.entries.firstOrNull { it.key !== row && kotlin.math.abs(it.value.top - box.bottom) <= slack }?.key
			val aboveJoins = above?.let { v ->
				val other = (v as? ViewGroup)?.let { rows[it] }
				if (other == null || other.mode == Mode.NONE) false else edgeIsBubble(other, first = false)
			}
			val belowJoins = below?.let { v ->
				val other = (v as? ViewGroup)?.let { rows[it] }
				if (other == null || other.mode == Mode.NONE || interruptedAbove(v as ViewGroup, other)) false else edgeIsBubble(other, first = true)
			}
			if (aboveJoins != state.aboveJoins || belowJoins != state.belowJoins) {
				state.aboveJoins = aboveJoins
				state.belowJoins = belowJoins
				changed += row to state
			}
			if (state.mode != Mode.NONE) snapshot += joinFacts(row, state, box)
		}
		joinSnapshot = snapshot.sortedBy { it["y"] as Int }
		return changed
	}

	/** One row of the "joins" diagnostics: where it is, what decides its corners. No message text. */
	private fun joinFacts(row: ViewGroup, state: RowState, box: android.graphics.Rect): Map<String, Any?> {
		val items = state.accessories?.let { acc ->
			(0 until acc.childCount).map(acc::getChildAt).filter { it.visibility == View.VISIBLE }.map { v ->
				val bubble = (v as? TextView)?.let { texts[it] }?.bubble
				val kind = if (bubble != null && v.background === bubble) "bubble" else v.javaClass.simpleName
				val joined = bubble?.let { "${if (it.joinTop) "T" else "-"}${if (it.joinBottom) "B" else "-"}" }
				listOfNotNull(kind, "h=${v.height}", joined).joinToString(" ")
			}
		}
		return mapOf(
			"y" to box.top,
			"h" to box.height(),
			"mode" to state.mode.name,
			"pos" to state.position.name,
			"interrupted" to interruptedAbove(row, state),
			"above" to state.aboveJoins,
			"below" to state.belowJoins,
			"items" to items,
		)
	}

	/** Tail and corners for the row's position on texts already styled; a redraw, never a resize. */
	private fun reshapeTexts(accessories: ViewGroup, state: RowState) {
		if (state.mode == Mode.NONE) return
		for (i in 0 until accessories.childCount) {
			val child = accessories.getChildAt(i) as? TextView ?: continue
			val saved = texts[child] ?: continue
			val tailRight = state.mode == Mode.OWN
			// The tail side's padding is reserved, so only a side switch (own <-> other) or a tails
			// switch re-measures; the new padding goes on in beforeMeasure.
			if (saved.bubble.tailRight != tailRight || saved.bubble.tails != config.tails) child.requestLayout()
			else {
				val (joinTop, joinBottom) = joins(child, state, saved.bubble.bottomGap > 0f)
				saved.bubble.setShape(tailRight, joinTop, joinBottom, config.tails)
			}
		}
	}

	/** After a row bind changed whether it's a bubble row: its texts must be measured again. */
	/**
	 * Runs the layout pass a [View.requestLayout] asked for. React Native's own views drop layout
	 * requests (their layout comes from JS), so one made inside the chat climbs to the first of them
	 * and stops: nothing is measured again (0.2.9's times under the bubble never got their room).
	 * The topmost view still marked is measured and laid out again at the size it already has, the
	 * way React Native's native components do it; the rows inside re-measure as normal.
	 */
	private fun runLayout(view: View) {
		var top = view
		while (true) {
			val parent = top.parent as? View ?: break
			if (!parent.isLayoutRequested) break
			top = parent
		}
		if (!top.isLayoutRequested || top.width == 0) return
		layoutsRun++
		top.measure(
			View.MeasureSpec.makeMeasureSpec(top.width, View.MeasureSpec.EXACTLY),
			View.MeasureSpec.makeMeasureSpec(top.height, View.MeasureSpec.EXACTLY),
		)
		top.layout(top.left, top.top, top.right, top.bottom)
	}

	private fun remeasureTexts(accessories: ViewGroup) {
		for (i in 0 until accessories.childCount) {
			val child = accessories.getChildAt(i)
			if (contentClass.isInstance(child)) child.requestLayout()
		}
	}

	/** Where bubbles of a run touch: a third of the outer corner, as at the default 18 / 6. */
	private fun joinedRadiusDp() = minOf(SMALL_RADIUS_DP, config.bubbleRadiusDp / 3f)

	private fun dp(v: View, value: Float) = (value * v.resources.displayMetrics.density + 0.5f).toInt()

	private fun styleText(text: TextView, mode: Mode, state: RowState, timeShown: Boolean) {
		val position = state.position
		val saved = texts[text] ?: SavedText(
			background = text.background,
			padding = intArrayOf(text.paddingLeft, text.paddingTop, text.paddingRight, text.paddingBottom),
			lpWidth = text.layoutParams?.width,
			maxWidth = text.maxWidth,
			translationX = text.translationX,
			textColors = text.textColors,
			bubble = text.resources.displayMetrics.density.let { d ->
				BubbleDrawable(RADIUS_DP * d, SMALL_RADIUS_DP * d, TAIL_W_DP * d, TAIL_H_DP * d)
			},
		).also { texts[text] = it }

		val tailRight = mode == Mode.OWN
		val tails = config.tails
		val (joinTop, joinBottom) = joins(text, state, timeShown)
		val density = text.resources.displayMetrics.density
		saved.bubble.setRadii(config.bubbleRadiusDp * density, joinedRadiusDp() * density)
		saved.bubble.setShape(tailRight, joinTop, joinBottom, tails)
		if (text.background !== saved.bubble) text.background = saved.bubble
		// Runs before measure only: the tail side keeps room for the tail whatever the position.
		val h = dp(text, PAD_H_DP)
		val t = if (tails) h + dp(text, TAIL_W_DP) else h
		val v = dp(text, PAD_V_DP)
		val left = if (tailRight) h else t
		val right = if (tailRight) t else h
		// A shown time ("Tap: under the bubble") sits in extra bottom padding, under the bubble's body.
		val room = if (timeShown) timeRoom(text) else 0
		if (room > 0) roomsMade++
		saved.bubble.setBottomGap(room.toFloat())
		val bottom = v + room
		// Their first message of a run has their name above it: a little room between the two.
		val gap = if (mode == Mode.OTHER && (position == GroupPosition.START || position == GroupPosition.ONLY)) dp(text, NAME_GAP_DP) else 0
		saved.bubble.setTopGap(gap.toFloat())
		val top = v + gap
		if (text.paddingLeft != left || text.paddingTop != top || text.paddingRight != right || text.paddingBottom != bottom) {
			text.setPadding(left, top, right, bottom)
		}
		recolor(text, saved, mode)
		try {
			hookSpans(text)
		} catch (e: Throwable) {
			fail("spans", e)
		}
	}

	// ---- Link contrast ----

	/**
	 * Discord's link span (a ClickableSpan subclass, `hh.d` on 352.2) sets the theme's link colour
	 * in `updateDrawState`, which can be the same colour as a bubble. While one of our bubbles draws
	 * (TextView.onDraw, before/after), [drawing] holds its colours; every ClickableSpan class seen in
	 * a bubble has its `updateDrawState` hooked once (found from the span object, never by name),
	 * and a colour with WCAG contrast under 3 against the bubble becomes the bubble's text colour,
	 * underlined. Colour and underline only: no metrics change. Outside our draws it does nothing.
	 */
	private class Drawing(val bg: Int, val text: Int)

	private var drawing: Drawing? = null
	/** updateDrawState methods hooked, by declaring method (main thread). */
	private val spanHooks = HashMap<Method, Unhook>()
	@Volatile private var spanHookCount = 0
	@Volatile private var linkRecolours = 0

	private val unhookDraw: Unhook = hookMethod(
		TextView::class.java.getDeclaredMethod("onDraw", Canvas::class.java),
		before = ::beforeDraw,
		after = { drawing = null },
	)

	private fun beforeDraw(param: HookParam) {
		drawing = null
		val text = param.thisObject as? TextView ?: return
		if (!contentClass.isInstance(text) || texts[text] == null) return
		val state = rowOf(text) ?: return
		val mode = state.mode
		if (mode == Mode.NONE) return
		drawing = Drawing(bgFor(state, mode), config.text(mode).defaultColor)
	}

	/** Hooks `updateDrawState` of every ClickableSpan class in [text] not hooked yet. */
	private fun hookSpans(text: TextView) {
		val spanned = text.text as? Spanned ?: return
		for (span in spanned.getSpans(0, spanned.length, ClickableSpan::class.java)) {
			val method = runCatching { span.javaClass.getMethod("updateDrawState", TextPaint::class.java) }.getOrNull() ?: continue
			if (spanHooks.containsKey(method)) continue
			spanHooks[method] = hookMethod(method, after = ::afterUpdateDrawState)
			spanHookCount = spanHooks.size
		}
	}

	private fun afterUpdateDrawState(param: HookParam) {
		val d = drawing ?: return
		val paint = param.args.getOrNull(0) as? TextPaint ?: return
		if (paint.shader != null) return
		if (contrast(paint.color, d.bg) >= 3.0) return
		paint.color = d.text
		paint.isUnderlineText = true
		linkRecolours++
	}

	private fun luminance(c: Int): Double {
		fun ch(v: Int): Double {
			val s = v / 255.0
			return if (s <= 0.03928) s / 12.92 else Math.pow((s + 0.055) / 1.055, 2.4)
		}
		return 0.2126 * ch(Color.red(c)) + 0.7152 * ch(Color.green(c)) + 0.0722 * ch(Color.blue(c))
	}

	private fun contrast(a: Int, b: Int): Double {
		val la = luminance(a)
		val lb = luminance(b)
		return (maxOf(la, lb) + 0.05) / (minOf(la, lb) + 0.05)
	}

	/** Bubble and text colour for [mode] from the current config. Never changes a size. */
	private fun recolor(text: TextView, saved: SavedText, mode: Mode) {
		saved.bubble.setColor(bgFor(rowOf(text), mode))
		val colors = config.text(mode)
		if (text.textColors !== colors) text.setTextColor(colors)
		saved.ourColors = colors
	}

	// ---- Colour per person ----

	/** Other people seen per channel this session (main thread, bounded): a chat with 2+ gets hues. */
	private val channelPeople = object : LinkedHashMap<String, MutableSet<String>>(16, 0.75f, true) {
		override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, MutableSet<String>>?) = size > 100
	}
	private val personColors = HashMap<String, Int>()
	/** Channel id -> group DM or server channel, as JS says when a channel is opened. */
	private val groupChannels = object : LinkedHashMap<String, Boolean>(16, 0.75f, true) {
		override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Boolean>?) = size > 200
	}

	/** JS: [channel] was opened and is (or isn't) a group; its bubbles recolour if that's news. */
	fun setChannel(channel: String, group: Boolean) = main.post {
		try {
			if (groupChannels.put(channel, group) == group) return@post
			for ((text, saved) in texts.entries.toList()) {
				val row = rowOf(text) ?: continue
				if (row.mode == Mode.OTHER && row.channelKey == channel) recolor(text, saved, Mode.OTHER)
			}
		} catch (e: Throwable) {
			fail("channel", e)
		}
	}

	/** Remembers [state]'s author in its channel; when that makes it a group, its bubbles recolour. */
	private fun notePerson(state: RowState) {
		if (state.mode != Mode.OTHER) return
		val channel = state.channelKey ?: return
		val author = state.authorKey ?: return
		val people = channelPeople.getOrPut(channel) { HashSet() }
		if (!people.add(author) || people.size != 2 || !config.perPerson) return
		for ((text, saved) in texts.entries.toList()) {
			val row = rowOf(text) ?: continue
			if (row.mode == Mode.OTHER && row.channelKey == channel) recolor(text, saved, Mode.OTHER)
		}
	}

	/** The bubble colour for this row: their own hue in a group chat with "Colour per person". */
	private fun bgFor(state: RowState?, mode: Mode): Int {
		if (mode != Mode.OTHER || !config.perPerson || state == null) return config.bg(mode)
		val author = state.authorKey ?: return config.bg(mode)
		val channel = state.channelKey ?: return config.bg(mode)
		// A server channel or group DM from the start (JS says which); else once two people showed up.
		val group = state.inGuild || groupChannels[channel] == true || (channelPeople[channel]?.size ?: 0) >= 2
		if (!group) return config.bg(mode)
		return personColors.getOrPut(author) { personColor(config.otherBg, author) }
	}

	/**
	 * Their bubble colour turned to one of eight hues picked by their id. Brightness stays the
	 * theme's, so the text on it reads the same; a grey theme colour gets a little saturation so
	 * the hues show at all.
	 */
	private fun personColor(base: Int, author: String): Int {
		val hsv = FloatArray(3)
		Color.colorToHSV(base, hsv)
		val slot = Math.floorMod(author.hashCode(), PERSON_HUES)
		hsv[0] = (hsv[0] + slot * (360f / PERSON_HUES)) % 360f
		hsv[1] = maxOf(hsv[1], 0.35f)
		return Color.HSVToColor(Color.alpha(base), hsv)
	}

	private fun restoreText(text: TextView) {
		ink.remove(text)
		val saved = texts.remove(text) ?: return
		if (text.background === saved.bubble) text.background = saved.background
		val p = saved.padding
		if (text.paddingLeft != p[0] || text.paddingTop != p[1] || text.paddingRight != p[2] || text.paddingBottom != p[3]) {
			text.setPadding(p[0], p[1], p[2], p[3])
		}
		// Discord's own bind may already have set a new colour for a new message; keep that one.
		val ours = saved.ourColors
		if (ours != null && text.textColors === ours) text.setTextColor(saved.textColors)
		val lp = text.layoutParams
		if (lp != null && saved.lpWidth != null && lp.width != saved.lpWidth) {
			lp.width = saved.lpWidth
			text.layoutParams = lp
		}
		if (text.maxWidth != saved.maxWidth) text.maxWidth = saved.maxWidth
		if (text.translationX != saved.translationX) text.translationX = saved.translationX
	}
}

val speechBubblesPlugin = plugin {
	var hooks: BubbleHooks? = null
	var startError: String? = null
	var flights: Flights? = null
	var flightError: String? = null
	var flightConfig = FlightConfig()

	start {
		registerNativeMethod("${manifest.id}.configure") { args ->
			(args.firstOrNull() as? Map<*, *>)?.let { hooks?.configure(it) }
			null
		}
		registerNativeMethod("${manifest.id}.probe") { _ -> hooks?.probe() ?: emptyMap<String, Any?>() }
		registerNativeMethod("${manifest.id}.metrics") { _ -> hooks?.chatMetrics() ?: emptyMap<String, Any?>() }
		registerNativeMethod("${manifest.id}.breaks") { args ->
			val channel = args.getOrNull(0) as? String
			val ids = (args.getOrNull(1) as? List<*>)?.mapNotNull { it as? String }
			if (channel != null && ids != null) hooks?.setBreaks(channel, ids)
			null
		}
		registerNativeMethod("${manifest.id}.channel") { args ->
			val id = args.getOrNull(0) as? String
			if (id != null) hooks?.setChannel(id, args.getOrNull(1) == true)
			null
		}
		registerNativeMethod("${manifest.id}.status") { _ ->
			hooks?.status() ?: mapOf("hooked" to false, "styledRows" to 0, "error" to startError)
		}

		// The send animation (Flights.kt). Its hook goes in only while the setting is on, and a
		// failure there is kept for its status: the bubbles never depend on it.
		registerNativeMethod("${manifest.id}.flightConfigure") { args ->
			val map = args.firstOrNull() as? Map<*, *>
			if (map != null) {
				flightConfig = FlightConfig(
					style = if (map["style"] == "pop") FlightStyle.POP else FlightStyle.IMESSAGE,
					speed = ((map["speed"] as? Number)?.toFloat() ?: 1f).coerceIn(0.3f, 3f),
					haptic = map["haptic"] != false,
				)
				val on = map["enabled"] == true
				if (on && flights == null && flightError == null) {
					try {
						flights = Flights(this).also { it.config = flightConfig }
						log.i("send animation hooked ${flights?.signature}")
					} catch (e: Throwable) {
						flightError = e.message ?: e.javaClass.simpleName
						log.w("send animation not hooked: $flightError")
					}
				} else if (!on && flights != null) {
					flights?.dispose()
					flights = null
				}
				flights?.config = flightConfig
			}
			null
		}
		registerNativeMethod("${manifest.id}.flightExpect") { args ->
			(args.firstOrNull() as? String)?.let { flights?.expect(it) }
			null
		}
		registerNativeMethod("${manifest.id}.flightSettle") { args ->
			val nonce = args.getOrNull(0) as? String
			val real = args.getOrNull(1) as? String
			if (nonce != null && real != null) flights?.settle(nonce, real)
			null
		}
		registerNativeMethod("${manifest.id}.flightReplay") { args ->
			flights?.replay((args.firstOrNull() as? Number)?.toFloat() ?: 1f)
			null
		}
		registerNativeMethod("${manifest.id}.flightStatus") { _ ->
			flights?.status() ?: mapOf("hooked" to false, "error" to flightError)
		}
		// Throws when the bind or a Message getter is missing, which disables the plugin with the reason.
		try {
			hooks = BubbleHooks(this)
		} catch (e: Throwable) {
			startError = e.message ?: e.javaClass.simpleName
			throw e
		}
		log.i("hooked ${hooks?.signature}")
	}

	stop {
		flights?.dispose()
		flights = null
		flightError = null
		hooks?.dispose()
		hooks = null
	}
}
