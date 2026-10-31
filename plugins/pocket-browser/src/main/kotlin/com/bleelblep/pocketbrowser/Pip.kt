package com.bleelblep.pocketbrowser

import android.annotation.SuppressLint
import android.app.Activity
import android.app.PendingIntent
import android.app.PictureInPictureParams
import android.app.RemoteAction
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.graphics.drawable.Icon
import android.os.Build
import android.util.Rational
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject
import java.lang.ref.WeakReference
import kotlin.math.roundToInt

/**
 * Real Android picture-in-picture, the way YouTube does it.
 *
 * Discord's `com.discord.main.MainActivity` declares `supportsPictureInPicture` (350.4 manifest; it
 * uses it for calls), so the activity itself can go into PiP. The video is put on a full-screen
 * layer over Discord's own views (added to the activity's decor view), then the activity enters
 * PiP: Android shrinks the whole window, and what shows is the video. Needs no permission.
 *
 * - PiP buttons are `RemoteAction`s: play/pause (runs the page's `popoutToggle`) and close.
 * - Auto-enter (Android 12+): while a video is up, going home drops it into PiP like YouTube.
 * - Expanding the PiP window brings Discord back with the player still on top and a bar to close it
 *   or go back to PiP. Dismissing the PiP window stops the activity, which closes the player.
 *
 * PiP state is read from the framework's `Activity.isInPictureInPictureMode` on layout changes and
 * lifecycle callbacks, not from androidx listeners, whose names R8 may have renamed in Discord.
 */
object PipPlayer {
	private const val ACTION = "com.bleelblep.pocketbrowser.PIP_ACTION"
	private const val TOGGLE = 1
	private const val CLOSE = 2

	var activity: WeakReference<Activity>? = null
	private var layer: FrameLayout? = null
	private var web: WebView? = null
	private var bar: View? = null
	private var aspect = Rational(16, 9)
	private var playing = true
	private var wasInPip = false
	private var receiver: BroadcastReceiver? = null
	private var layoutListener: View.OnLayoutChangeListener? = null
	@Volatile var lastError: String? = null

	fun supported(): Boolean {
		val current = activity?.get() ?: return false
		return Build.VERSION.SDK_INT >= 26 &&
			current.packageManager.hasSystemFeature("android.software.picture_in_picture")
	}

	fun isOpen() = layer != null

	private fun dp(context: Context, value: Float) =
		TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, context.resources.displayMetrics).roundToInt()

	/** Plays [request] full-screen over Discord and enters PiP. Null on success, or why not. */
	fun open(request: JSONObject): String? {
		val current = activity?.get() ?: return "not ready"
		if (Build.VERSION.SDK_INT < 26) return "pip unsupported"
		if (!current.packageManager.hasSystemFeature("android.software.picture_in_picture")) return "pip unsupported"
		val page = Player.pageFor(request) ?: return "unsupported"
		if (layer == null) create(current)
		aspect = Rational(16, 9)
		playing = true
		web?.loadDataWithBaseURL(page.second, page.first, "text/html", "utf-8", null)
		bar?.visibility = View.GONE
		return runCatching {
			current.enterPictureInPictureMode(params(current))
			null
		}.getOrElse { "pip: ${it.message}" }
	}

	private class PageBridge {
		@JavascriptInterface
		fun aspect(width: Int, height: Int) {
			if (width <= 0 || height <= 0) return
			layer?.post {
				aspect = clamp(Rational(width, height))
				activity?.get()?.let { runCatching { it.setPictureInPictureParams(params(it)) } }
			}
		}

		@JavascriptInterface
		fun error(message: String) {
			lastError = message
			Player.watchPageFallback(web, message)
		}

		@JavascriptInterface
		fun playing(value: Boolean) {
			layer?.post {
				playing = value
				activity?.get()?.let { runCatching { it.setPictureInPictureParams(params(it)) } }
			}
		}
	}

	/** Android rejects PiP ratios outside 1:2.39 .. 2.39:1. */
	private fun clamp(ratio: Rational): Rational {
		val value = ratio.toFloat()
		return when {
			value > 2.39f -> Rational(239, 100)
			value < 1f / 2.39f -> Rational(100, 239)
			else -> ratio
		}
	}

	private fun params(context: Context): PictureInPictureParams {
		val builder = PictureInPictureParams.Builder().setAspectRatio(aspect)
		val toggleIcon = if (playing) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play
		builder.setActions(
			listOf(
				RemoteAction(Icon.createWithResource(context, toggleIcon), if (playing) "Pause" else "Play", if (playing) "Pause" else "Play", pending(context, TOGGLE)),
				RemoteAction(Icon.createWithResource(context, android.R.drawable.ic_menu_close_clear_cancel), "Close", "Close", pending(context, CLOSE)),
			),
		)
		if (Build.VERSION.SDK_INT >= 31) {
			builder.setAutoEnterEnabled(layer != null)
			builder.setSeamlessResizeEnabled(true)
		}
		return builder.build()
	}

	private fun pending(context: Context, what: Int): PendingIntent =
		PendingIntent.getBroadcast(
			context,
			what,
			Intent(ACTION).setPackage(context.packageName).putExtra("what", what),
			PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
		)

	@SuppressLint("SetJavaScriptEnabled", "UnspecifiedRegisterReceiverFlag")
	private fun create(current: Activity) {
		val context = current
		val webView = WebView(context).apply {
			setBackgroundColor(Color.BLACK)
			settings.javaScriptEnabled = true
			settings.domStorageEnabled = true
			settings.mediaPlaybackRequiresUserGesture = false
			settings.allowFileAccess = true
			settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
			webViewClient = WebViewClient()
			webChromeClient = WebChromeClient()
			addJavascriptInterface(PageBridge(), "Popout")
		}
		val controls = LinearLayout(context).apply {
			orientation = LinearLayout.HORIZONTAL
			gravity = Gravity.CENTER_VERTICAL or Gravity.END
			setBackgroundColor(0x99000000.toInt())
			visibility = View.GONE
		}
		fun button(label: String, description: String, onClick: () -> Unit) = TextView(context).apply {
			text = label
			contentDescription = description
			setTextColor(Color.WHITE)
			textSize = 15f
			gravity = Gravity.CENTER
			setPadding(dp(context, 14f), 0, dp(context, 14f), 0)
			setOnClickListener { onClick() }
		}
		controls.addView(button("Picture-in-picture", "Back to picture-in-picture") {
			activity?.get()?.let { runCatching { it.enterPictureInPictureMode(params(it)) } }
		}, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.MATCH_PARENT))
		controls.addView(button("Close", "Close the player") { close() }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.MATCH_PARENT))

		val container = FrameLayout(context).apply {
			setBackgroundColor(Color.BLACK)
			elevation = dp(context, 24f).toFloat()
			isClickable = true // Discord's views underneath never get touches while it's up.
		}
		val barHeight = dp(context, 48f)
		container.addView(webView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
		container.addView(controls, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, barHeight, Gravity.TOP).apply {
			// Clear of the status bar when expanded.
			topMargin = current.window.decorView.rootWindowInsets?.systemWindowInsetTop ?: dp(context, 24f)
		})

		val decor = current.window.decorView as ViewGroup
		decor.addView(container, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

		// PiP in and out: hide the bar inside PiP, show it when the user expands back to Discord.
		val listener = View.OnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> syncPipState() }
		container.addOnLayoutChangeListener(listener)
		layoutListener = listener

		val actions = object : BroadcastReceiver() {
			override fun onReceive(ctx: Context, intent: Intent) {
				when (intent.getIntExtra("what", 0)) {
					TOGGLE -> web?.evaluateJavascript("window.popoutToggle && window.popoutToggle()", null)
					CLOSE -> close()
				}
			}
		}
		val app = current.applicationContext
		if (Build.VERSION.SDK_INT >= 33) app.registerReceiver(actions, IntentFilter(ACTION), Context.RECEIVER_NOT_EXPORTED)
		else app.registerReceiver(actions, IntentFilter(ACTION))
		receiver = actions

		layer = container
		web = webView
		bar = controls
		wasInPip = false
	}

	private fun syncPipState() {
		val current = activity?.get() ?: return
		val inPip = Build.VERSION.SDK_INT >= 24 && current.isInPictureInPictureMode
		if (inPip == wasInPip) return
		wasInPip = inPip
		bar?.visibility = if (inPip) View.GONE else View.VISIBLE
	}

	/** Lifecycle: the PiP window was swiped away (the activity stops while in PiP). */
	fun onActivityStopped(stopped: Activity) {
		if (layer == null || activity?.get() !== stopped) return
		if (wasInPip || (Build.VERSION.SDK_INT >= 24 && stopped.isInPictureInPictureMode)) close()
	}

	fun onActivityResumed(resumed: Activity) {
		activity = WeakReference(resumed)
		syncPipState()
	}

	fun close() {
		val view = layer ?: return
		layer = null
		web?.run {
			loadUrl("about:blank")
			stopLoading()
			destroy()
		}
		web = null
		bar = null
		layoutListener?.let { view.removeOnLayoutChangeListener(it) }
		layoutListener = null
		(view.parent as? ViewGroup)?.removeView(view)
		receiver?.let { r -> activity?.get()?.applicationContext?.let { runCatching { it.unregisterReceiver(r) } } }
		receiver = null
		// Stop auto-entering PiP on home once nothing is playing.
		activity?.get()?.let { current ->
			if (Build.VERSION.SDK_INT >= 31) {
				runCatching { current.setPictureInPictureParams(PictureInPictureParams.Builder().setAutoEnterEnabled(false).build()) }
			}
		}
		wasInPip = false
	}
}
