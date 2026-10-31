
package com.bleelblep.pocketbrowser

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Outline
import android.graphics.PixelFormat
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View
import android.view.ViewOutlineProvider
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Pop Out Player: a floating video window over every app.
 *
 * The window is a WindowManager overlay (`TYPE_APPLICATION_OVERLAY`), not part of Discord's
 * activity, so it stays on screen and keeps playing when Discord goes to the background. Discord
 * declares `SYSTEM_ALERT_WINDOW` (350.4 manifest), so the user can allow "Display over other apps"
 * for it once; a visible overlay also keeps the process at perceptible priority, which is what lets
 * playback outlive the activity -- Discord declares no media-playback foreground service a plugin
 * could use instead.
 *
 * One WebView plays everything:
 * - a Discord attachment or video embed (or a Ghost Log saved copy, `file://`) as a plain HTML
 *   `<video>`;
 * - a YouTube link through YouTube's own iframe API, the way Discord's `MediaModalYoutube` does
 *   (same HTML shape, `playsinline`). Videos whose owner blocks embedding can't play there either.
 *
 * Gestures: drag the bar to move, pinch anywhere to resize (aspect kept), the bar's buttons close,
 * cycle the size, or bring Discord back.
 */
private const val TAG = "PopoutPlayer"
/** Where the YouTube player says it is embedded: Discord, as in Discord's own viewer. */
private const val EMBED_ORIGIN = "https://discord.com"

private fun mainHandler() = Handler(Looper.getMainLooper())

/** Runs [block] on the main thread and returns its result to the calling coroutine. */

object Player {
	var appContext: Context? = null
	private var root: FrameLayout? = null
	private var web: WebView? = null
	private var params: WindowManager.LayoutParams? = null
	/** Height / width of the current video; 16:9 until the page reports the real size. */
	private var aspect = 9f / 16f
	private var widthPx = 0

	private val manager: WindowManager?
		get() = appContext?.getSystemService(Context.WINDOW_SERVICE) as? WindowManager

	fun canOverlay(): Boolean = appContext?.let { Settings.canDrawOverlays(it) } ?: false

	/** Opens Android's "Display over other apps" page for Discord. */
	fun requestOverlay(): Boolean {
		val context = appContext ?: return false
		val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}"))
			.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
		return runCatching { context.startActivity(intent); true }.getOrDefault(false)
	}

	private fun dp(value: Float): Int {
		val context = appContext ?: return value.roundToInt()
		return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, context.resources.displayMetrics).roundToInt()
	}

	private fun screen(): Pair<Int, Int> {
		val metrics = appContext!!.resources.displayMetrics
		return metrics.widthPixels to metrics.heightPixels
	}

	private val sizes = floatArrayOf(0.55f, 0.75f, 0.95f)
	private var sizeIndex = 0

	/** Opens [request] (see `open` in the JS bridge) in the window, replacing what was playing. */
	fun open(request: JSONObject): String? {
		val context = appContext ?: return "not ready"
		if (!canOverlay()) return "overlay permission"
		val html = pageFor(request) ?: return "unsupported"
		if (root == null) create(context)
		aspect = 9f / 16f
		applySize()
		web?.loadDataWithBaseURL(html.second, html.first, "text/html", "utf-8", null)
		return null
	}

	/** The page and its base url for a request, or null when it isn't playable. Shared with [PipPlayer]. */
	internal fun pageFor(request: JSONObject): Pair<String, String>? {
		val kind = request.optString("kind")
		val url = request.optString("url")
		if (url.isEmpty()) return null
		return when (kind) {
			"youtube" -> {
				val id = request.optString("videoId").takeIf { it.matches(Regex("[A-Za-z0-9_-]{6,20}")) } ?: return null
				val start = request.optInt("start", 0)
				lastYoutube = id to start
				// Hosted like Discord's own YouTube embed: YouTube refuses to play (error 153) for a
				// page that doesn't name a real embedding site, and a youtube.com page embedding
				// youtube.com didn't count.
				youtubePage(id, start) to EMBED_ORIGIN
			}
			"video" -> {
				val poster = request.optString("poster").takeIf { it.startsWith("http") || it.startsWith("file:") }
				val base = if (url.startsWith("file:")) "file:///" else "https://discord.com/"
				videoPage(url, poster) to base
			}
			else -> null
		}
	}

	private fun attr(value: String) = value.replace("&", "&amp;").replace("\"", "&quot;").replace("<", "&lt;")

	private fun videoPage(url: String, poster: String?): String = """
		<!doctype html><html><head><meta name="viewport" content="initial-scale=1">
		<style>*{margin:0;padding:0;background:#000}video{width:100vw;height:100vh;object-fit:contain}</style>
		</head><body>
		<video id="v" src="${attr(url)}" ${poster?.let { "poster=\"${attr(it)}\"" } ?: ""} controls autoplay playsinline></video>
		<script>
		const v = document.getElementById('v');
		v.addEventListener('loadedmetadata', () => { if (v.videoWidth && v.videoHeight) Popout.aspect(v.videoWidth, v.videoHeight) });
		v.addEventListener('error', () => Popout.error('video: ' + (v.error && v.error.code)));
		v.addEventListener('play', () => Popout.playing(true));
		v.addEventListener('pause', () => Popout.playing(false));
		window.popoutToggle = () => { if (v.paused) v.play(); else v.pause(); };
		</script></body></html>
	""".trimIndent()

	private fun youtubePage(id: String, start: Int): String = """
		<!doctype html><html><head><meta name="viewport" content="initial-scale=1">
		<style>*{margin:0;padding:0;background:#000}#player{width:100vw;height:100vh}</style>
		<script>
		const tag = document.createElement('script');
		tag.src = "https://www.youtube.com/iframe_api";
		document.head.appendChild(tag);
		function onYouTubeIframeAPIReady() {
		  window.player = new YT.Player('player', {
		    height: '100%', width: '100%', videoId: '$id',
		    playerVars: { playsinline: 1, autoplay: 1, fs: 0, rel: 0, origin: '$EMBED_ORIGIN', widget_referrer: '$EMBED_ORIGIN/'${if (start > 0) ", start: $start" else ""} },
		    events: {
		      onReady: (e) => e.target.playVideo(),
		      onError: (e) => Popout.error('youtube: ' + e.data),
		      onStateChange: (e) => { if (e.data === 1) Popout.playing(true); else if (e.data === 2) Popout.playing(false); },
		    },
		  });
		}
		window.popoutToggle = () => {
		  const p = window.player;
		  if (!p || !p.getPlayerState) return;
		  if (p.getPlayerState() === 1) p.pauseVideo(); else p.playVideo();
		};
		</script></head><body><div id="player"></div></body></html>
	""".trimIndent()

	/** Called from the page. */
	/**
	 * YouTube's own "can't be embedded here" errors: 101/150 (owner disabled embedding),
	 * 152/153 (player configuration / referrer). The mobile watch page plays those anyway.
	 */
	private val BLOCKED = Regex("^youtube: (101|150|152|153)$")

	/** The YouTube video the player was last opened with, for [watchPageFallback]. */
	@Volatile internal var lastYoutube: Pair<String, Int>? = null

	/** When [message] is an embed refusal, loads the video's mobile watch page into [view] instead. */
	internal fun watchPageFallback(view: WebView?, message: String): Boolean {
		if (!BLOCKED.matches(message)) return false
		val (id, start) = lastYoutube ?: return false
		val url = "https://m.youtube.com/watch?v=$id" + if (start > 0) "&t=${start}s" else ""
		mainHandler().post { runCatching { view?.loadUrl(url) } }
		return true
	}

	private class Bridge {
		@JavascriptInterface
		fun aspect(width: Int, height: Int) {
			if (width <= 0 || height <= 0) return
			mainHandler().post {
				aspect = height.toFloat() / width
				applySize()
			}
		}

		@JavascriptInterface
		fun error(message: String) {
			android.util.Log.w(TAG, "playback error: $message")
			lastError = message
			watchPageFallback(web, message)
		}

		@JavascriptInterface
		fun playing(value: Boolean) = Unit
	}

	@Volatile var lastError: String? = null

	@SuppressLint("SetJavaScriptEnabled", "ClickableViewAccessibility")
	private fun create(context: Context) {
		val webView = WebView(context).apply {
			setBackgroundColor(Color.BLACK)
			settings.javaScriptEnabled = true
			settings.domStorageEnabled = true
			settings.mediaPlaybackRequiresUserGesture = false
			settings.allowFileAccess = true
			settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
			settings.loadWithOverviewMode = true
			settings.useWideViewPort = true
			webViewClient = WebViewClient()
			webChromeClient = WebChromeClient()
			addJavascriptInterface(Bridge(), "Popout")
		}

		val bar = LinearLayout(context).apply {
			orientation = LinearLayout.HORIZONTAL
			gravity = Gravity.CENTER_VERTICAL or Gravity.END
			setBackgroundColor(0x99000000.toInt())
			setPadding(dp(6f), 0, dp(6f), 0)
		}
		fun button(label: String, description: String, onClick: () -> Unit) = TextView(context).apply {
			text = label
			contentDescription = description
			setTextColor(Color.WHITE)
			textSize = 16f
			gravity = Gravity.CENTER
			setPadding(dp(10f), 0, dp(10f), 0)
			setOnClickListener { onClick() }
		}
		bar.addView(button("↗", "Open Discord") { openDiscord() }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.MATCH_PARENT))
		bar.addView(button("⤢", "Change size") { cycleSize() }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.MATCH_PARENT))
		bar.addView(button("✕", "Close") { close() }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.MATCH_PARENT))

		val container = object : FrameLayout(context) {
			val scaler = ScaleGestureDetector(context, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
				override fun onScale(detector: ScaleGestureDetector): Boolean {
					resizeBy(detector.scaleFactor)
					return true
				}
			})

			// Two fingers anywhere resize the window instead of reaching the page.
			override fun onInterceptTouchEvent(event: MotionEvent): Boolean = event.pointerCount > 1

			override fun onTouchEvent(event: MotionEvent): Boolean {
				scaler.onTouchEvent(event)
				return true
			}
		}.apply {
			setBackgroundColor(Color.BLACK)
			elevation = dp(8f).toFloat()
			outlineProvider = object : ViewOutlineProvider() {
				override fun getOutline(view: View, outline: Outline) {
					outline.setRoundRect(0, 0, view.width, view.height, dp(12f).toFloat())
				}
			}
			clipToOutline = true
		}
		val barHeight = dp(30f)
		container.addView(webView, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT).apply { topMargin = barHeight })
		container.addView(bar, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, barHeight, Gravity.TOP))

		// Drag the bar to move the window.
		var downX = 0f
		var downY = 0f
		var startX = 0
		var startY = 0
		bar.setOnTouchListener { _, event ->
			val lp = params ?: return@setOnTouchListener false
			when (event.actionMasked) {
				MotionEvent.ACTION_DOWN -> {
					downX = event.rawX; downY = event.rawY; startX = lp.x; startY = lp.y
					// Claimed, or the moves never arrive. The bar's buttons are children and take their own taps.
					true
				}
				MotionEvent.ACTION_MOVE -> {
					lp.x = startX + (event.rawX - downX).roundToInt()
					lp.y = startY + (event.rawY - downY).roundToInt()
					keepOnScreen(lp)
					runCatching { manager?.updateViewLayout(root, lp) }
					true
				}
				else -> false
			}
		}

		val (screenW, screenH) = screen()
		widthPx = (min(screenW, screenH) * sizes[sizeIndex]).roundToInt()
		val lp = WindowManager.LayoutParams(
			widthPx,
			heightFor(widthPx),
			if (Build.VERSION.SDK_INT >= 26) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE,
			WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
			PixelFormat.TRANSLUCENT,
		).apply {
			gravity = Gravity.TOP or Gravity.START
			x = screenW - widthPx - dp(12f)
			y = (screenH * 0.12f).roundToInt()
		}
		manager?.addView(container, lp)
		root = container
		web = webView
		params = lp
	}

	private fun heightFor(width: Int) = (width * aspect).roundToInt() + dp(30f)

	private fun applySize() {
		val lp = params ?: return
		val (screenW, screenH) = screen()
		val maxWidth = (screenW * 0.98f).roundToInt()
		widthPx = widthPx.coerceIn(dp(160f), maxWidth)
		// A tall video is capped by height instead, so it never runs off the screen.
		while (heightFor(widthPx) > screenH * 0.9f && widthPx > dp(160f)) widthPx -= dp(8f)
		lp.width = widthPx
		lp.height = heightFor(widthPx)
		keepOnScreen(lp)
		runCatching { manager?.updateViewLayout(root, lp) }
	}

	private fun resizeBy(factor: Float) {
		widthPx = (widthPx * factor).roundToInt()
		applySize()
	}

	private fun cycleSize() {
		sizeIndex = (sizeIndex + 1) % sizes.size
		val (screenW, screenH) = screen()
		widthPx = (min(screenW, screenH) * sizes[sizeIndex]).roundToInt()
		applySize()
	}

	private fun keepOnScreen(lp: WindowManager.LayoutParams) {
		val (screenW, screenH) = screen()
		lp.x = lp.x.coerceIn(0, max(0, screenW - lp.width))
		lp.y = lp.y.coerceIn(0, max(0, screenH - lp.height))
	}

	private fun openDiscord() {
		val context = appContext ?: return
		val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
		launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
		runCatching { context.startActivity(launch) }
	}

	fun isOpen() = root != null

	fun close() {
		val view = root ?: return
		web?.run {
			loadUrl("about:blank")
			stopLoading()
			destroy()
		}
		runCatching { manager?.removeView(view) }
		root = null
		web = null
		params = null
	}
}

/** Tracks the resumed activity for [PipPlayer], and closes it when its PiP window is dismissed. */
private val lifecycle = object : android.app.Application.ActivityLifecycleCallbacks {
	override fun onActivityResumed(activity: android.app.Activity) = PipPlayer.onActivityResumed(activity)
	override fun onActivityStopped(activity: android.app.Activity) = PipPlayer.onActivityStopped(activity)
	override fun onActivityCreated(activity: android.app.Activity, savedInstanceState: android.os.Bundle?) = Unit
	override fun onActivityStarted(activity: android.app.Activity) = Unit
	override fun onActivityPaused(activity: android.app.Activity) = Unit
	override fun onActivitySaveInstanceState(activity: android.app.Activity, outState: android.os.Bundle) = Unit
	override fun onActivityDestroyed(activity: android.app.Activity) = Unit
}
private var application: android.app.Application? = null

/**
 * Pop-out player, merged in from Pop Out Player: the media-viewer button and the browser's "Pop out
 * video" both end here. Pocket Browser's start/stop call these; methods are `<id>.popout*`.
 */
internal fun startPopout(activity: android.app.Activity) {
	Player.appContext = activity.applicationContext
	PipPlayer.activity = java.lang.ref.WeakReference(activity)
	if (application == null) {
		application = activity.application
		activity.application.registerActivityLifecycleCallbacks(lifecycle)
	}
}

internal fun stopPopout() {
	application?.unregisterActivityLifecycleCallbacks(lifecycle)
	application = null
	mainHandler().post {
		Player.close()
		PipPlayer.close()
	}
}

/** Opens [json]; null when playing, or why not ("overlay permission", "unsupported", "not ready", "pip unsupported"). */
internal fun popoutOpen(json: String): String? = runCatching {
	val request = JSONObject(json)
	if (request.optString("mode", "pip") == "overlay") {
		PipPlayer.close()
		Player.open(request)
	} else {
		Player.close()
		PipPlayer.open(request)
	}
}.getOrElse { it.toString() }

internal fun popoutClose() {
	Player.close()
	PipPlayer.close()
}

internal fun popoutStatus(): String = JSONObject()
	.put("open", Player.isOpen() || PipPlayer.isOpen())
	.put("canOverlay", Player.canOverlay())
	.put("pipSupported", PipPlayer.supported())
	.put("lastError", PipPlayer.lastError ?: Player.lastError ?: JSONObject.NULL)
	.toString()
