@file:JvmName("PocketBrowserPlugin")

package com.bleelblep.pocketbrowser

import android.annotation.SuppressLint
import android.app.Activity
import android.app.Application
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.MutableContextWrapper
import android.graphics.Bitmap
import android.graphics.Outline
import android.graphics.Rect
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.Message
import android.os.Parcel
import android.util.Base64
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.view.ViewTreeObserver
import android.view.WindowInsets
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebStorage
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.JavascriptInterface
import android.widget.FrameLayout
import app.valenced.plugins.plugin
import app.valenced.xposed.api.callJSMethod
import app.valenced.xposed.api.registerNativeAsyncMethod
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.lang.ref.WeakReference
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Pocket Browser's native half: real Android WebViews that outlive the picker.
 *
 * ## Why native
 *
 * Discord ships react-native-webview, but a JS WebView is destroyed whenever the expression picker
 * closes, and the page with it. Here the WebViews belong to [Browser], not to React: the picker tab
 * draws an empty `View` with a `nativeID`, and [Browser.attach] finds that view in the window and
 * puts the browser inside it. Closing the picker only removes the browser from that view; the pages
 * keep running and are put straight back next time.
 *
 * The placeholder must stay childless on the React side. React Native (Fabric) adds and removes
 * children by index, so a view that React also gives children would get them mixed up with ours.
 * RN never lays out children it doesn't know about, so ours are measured and laid out by hand
 * whenever the placeholder changes size.
 *
 * ## Across restarts
 *
 * Each tab's address, title and back/forward list (`WebView.saveState`) is written to
 * `tabs.json` in the plugin's storage, and restored lazily: a tab gets its WebView the first time
 * it is shown.
 *
 * ## Touches
 *
 * The picker sits in a bottom sheet driven by react-native-gesture-handler, which would take a
 * vertical drag over the page as "drag the sheet". On touch down the page asks its parents not to
 * intercept, which gesture-handler answers by cancelling its own gestures, so the page scrolls.
 */

private const val PAGE_TAG = "[PocketBrowser]"
private const val MAX_LIVE = 4
/** Sites whose cookies and storage "Clear cookies and site data" leaves alone (Vencord Tab, activities). */
private val KEEP_HOSTS = listOf("discord.com", "discordapp.com")
/** Lifecycle tracing ([Trace]) and the page's media log: for diagnosing only, off in releases. */
internal const val DEBUG = false

/**
 * An open tab. An empty [url] is the start page, which JS draws instead of the WebView.
 *
 * A [private] tab is kept out of History, never written to tabs.json, and has its cache and
 * back/forward list wiped when it closes. Android WebViews share one cookie jar per app, so a
 * private tab still shares sign-ins with the others; the UI says so.
 */
internal class Tab(val id: String, var url: String, var title: String, val private: Boolean = false) {
	var web: WebView? = null
	/** A saved back/forward list waiting for this tab's WebView to be made. */
	var saved: Bundle? = null
	var loading = false
	var progress = 100
	var lastShown = 0L
	/** A video or audio element on the page is playing (reported by the page script). */
	@Volatile var playing = false
	/** Why the page didn't load; JS draws an error page instead of the WebView. Cleared on the next load. */
	var error: String? = null
	/** Set once a loading page fails, so the page WebView draws for the failure doesn't clear [error]. */
	var failedUrl: String? = null
}

internal data class Settings(
	val javascript: Boolean = true,
	val desktop: Boolean = false,
	val restore: Boolean = true,
	val home: String = "https://duckduckgo.com",
	val thirdPartyCookies: Boolean = true,
	/** Leave audio and video playing when the picker closes. */
	val keepPlaying: Boolean = false,
	/** target=_blank links and window.open get their own tab; off loads them in the current one. */
	val pageNewTabs: Boolean = true,
	/** Light pages drawn dark (see [Extras.DARK_JS]). */
	val darkPages: Boolean = false,
	/** Page text size, in percent. */
	val textZoom: Int = 100,
) {
	fun toJson(): JSONObject = JSONObject()
		.put("javascript", javascript).put("desktop", desktop).put("restore", restore)
		.put("home", home).put("thirdPartyCookies", thirdPartyCookies).put("keepPlaying", keepPlaying).put("pageNewTabs", pageNewTabs)
		.put("darkPages", darkPages).put("textZoom", textZoom)

	fun merge(patch: JSONObject) = Settings(
		javascript = patch.optBoolean("javascript", javascript),
		desktop = patch.optBoolean("desktop", desktop),
		restore = patch.optBoolean("restore", restore),
		home = patch.optString("home", home).ifBlank { home },
		thirdPartyCookies = patch.optBoolean("thirdPartyCookies", thirdPartyCookies),
		keepPlaying = patch.optBoolean("keepPlaying", keepPlaying),
		pageNewTabs = patch.optBoolean("pageNewTabs", pageNewTabs),
		darkPages = patch.optBoolean("darkPages", darkPages),
		textZoom = patch.optInt("textZoom", textZoom).coerceIn(50, 300),
	)
}

/**
 * Android's default WebView user agent marks the page as embedded ("; wv" and a "Version/4.0"
 * token). Google sign-in and some other sites refuse embedded browsers on sight, so both go: the
 * rest is the same Chrome string Chrome itself sends.
 */
private fun browserUserAgent(context: Context): String =
	WebSettings.getDefaultUserAgent(context)
		.replace("; wv)", ")")
		.replace(Regex(" Version/\\d+(\\.\\d+)*"), "")

/** Desktop Chrome's user agent, with this phone's real WebView version so it never goes stale. */
private fun desktopUserAgent(context: Context): String {
	val major = Regex("Chrome/(\\d+)").find(WebSettings.getDefaultUserAgent(context))?.groupValues?.get(1) ?: "129"
	// Chrome itself only reports the major version now.
	return "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/$major.0.0.0 Safari/537.36"
}

@SuppressLint("SetJavaScriptEnabled", "StaticFieldLeak")
internal object Browser {
	private val main = Handler(Looper.getMainLooper())
	lateinit var dir: File
	var log: (String) -> Unit = {}
	/** Sends the tab list to JS (a JSON string). */
	var emitState: (String) -> Unit = {}
	/** Tells JS a page finished loading, for History (a JSON string). */
	var emitVisit: (String) -> Unit = {}
	/** Tells JS the system keyboard (IME) appeared or hid, for the picker auto-expand. */
	var emitKeyboard: (Boolean) -> Unit = {}
	/** Asks JS to pick files for a page's file input (a JSON string: accept, multiple). */
	var emitChooseFiles: (String) -> Unit = {}
	/** Asks JS whether a site may use the camera or microphone (a JSON string). */
	var emitPermission: (String) -> Unit = {}
	/** A short message for the user, shown as a Discord toast. */
	var emitNotice: (String) -> Unit = {}

	var activity = WeakReference<Activity>(null)
	var settings = Settings()
		private set

	val tabs = mutableListOf<Tab>()
	var activeId: String? = null
		private set

	/** One context for every WebView, re-pointed at the current activity on attach. */
	private var context: MutableContextWrapper? = null
	private var frame: FrameLayout? = null
	/** How much of the frame shows (the sheet's height); the rounded top clip follows it. */
	private var visibleHeight = 0
	private var host: ViewGroup? = null
	private var hostId: String? = null
	private var lastState = ""
	private var emitQueued = false
	private var saveQueued = false

	private val layoutListener = View.OnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> layoutFrame() }
	private var detachGrace: Runnable? = null
	/** The frame's own layout params while it's parked out of sight (keepPlaying). */
	private var parkedParams: ViewGroup.LayoutParams? = null

	// ---- IME watching ----------------------------------------------------------------------

	private var imeWatch: ViewTreeObserver.OnGlobalLayoutListener? = null
	private var imeDecor: View? = null
	private var imeVisible = false

	/**
	 * Reports the system keyboard to JS. Discord's own keyboard events only fire for the chat
	 * input's IME, so a page summoning the keyboard while the picker is open is invisible to the
	 * JS side; the picker then stays at its partial height with the page hidden behind the IME.
	 * The window insets tell the truth for any IME, and the picker auto-expands on them.
	 */
	fun watchIme(activity: Activity) {
		val decor = activity.window?.decorView ?: return
		// Already watching this window. A recreated activity (theme change, rotation, coming back
		// after Android freed it) has a new decor view: move to it, or the old one is watched forever.
		if (imeWatch != null && imeDecor === decor) return
		unwatchIme()
		val watch = ViewTreeObserver.OnGlobalLayoutListener {
			val insets = decor.rootWindowInsets ?: return@OnGlobalLayoutListener
			val visible = if (Build.VERSION.SDK_INT >= 30) {
				insets.isVisible(WindowInsets.Type.ime())
			} else {
				// Before Android 11 there's no IME inset of its own; the bottom inset also counts the
				// navigation bar. A keyboard is far taller than any navigation bar.
				@Suppress("DEPRECATION")
				insets.systemWindowInsetBottom > decor.height * 0.15
			}
			if (visible != imeVisible) {
				imeVisible = visible
				emitKeyboard(visible)
			}
		}
		imeWatch = watch
		imeDecor = decor
		decor.viewTreeObserver.addOnGlobalLayoutListener(watch)
	}

	private fun unwatchIme() {
		val watch = imeWatch ?: return
		imeWatch = null
		imeDecor?.viewTreeObserver?.removeOnGlobalLayoutListener(watch)
		imeDecor = null
	}
	private val detachListener = object : View.OnAttachStateChangeListener {
		override fun onViewAttachedToWindow(v: View) {
			Trace.add("host attached (ours=${v === host})")
			if (v !== host) return
			// The subtree came back (keyboard closed, the sheet re-expanded). React may have
			// dropped the frame while moving the subtree; put it back and cancel the give-up.
			detachGrace?.let { main.removeCallbacks(it) }
			detachGrace = null
			val f = frame
			if (f != null && f.parent !== v) {
				hold()
				(f.parent as? ViewGroup)?.removeView(f)
				v.addView(f)
			}
			layoutFrame()
			unholdSoon()
		}

		// The placeholder leaves the window when the picker closes -- and, briefly, whenever the
		// keyboard resizes the screen and React moves the sheet subtree. Letting go at once made
		// the page vanish on every keyboard open in the half-open picker: React doesn't know the
		// frame exists, so nothing ever re-attaches it. Give it a beat and release only if the
		// view really stayed away; the JS side's detach on unmount releases immediately anyway.
		override fun onViewDetachedFromWindow(v: View) {
			Trace.add("host detached (ours=${v === host})")
			if (v !== host) return
			hold()
			detachGrace?.let { main.removeCallbacks(it) }
			val grace = Runnable {
				detachGrace = null
				if (v === host && !v.isAttachedToWindow) release()
			}
			detachGrace = grace
			main.postDelayed(grace, 400)
		}
	}

	val active: Tab? get() = tabs.firstOrNull { it.id == activeId }

	// ---- Storage -------------------------------------------------------------------------

	fun load() {
		runCatching {
			val file = File(dir, "settings.json")
			if (file.isFile) settings = Settings().merge(JSONObject(file.readText()))
		}.onFailure { log("could not read settings: ${it.message}") }
		if (!settings.restore) return
		runCatching {
			val file = File(dir, "tabs.json")
			if (!file.isFile) return
			val json = JSONObject(file.readText())
			val list = json.optJSONArray("tabs") ?: JSONArray()
			for (i in 0 until list.length()) {
				val item = list.getJSONObject(i)
				val tab = Tab(item.getString("id"), item.optString("url"), item.optString("title"))
				item.optString("state").takeIf { it.isNotEmpty() }?.let { tab.saved = decodeBundle(it) }
				tabs += tab
			}
			activeId = json.optString("active").takeIf { id -> tabs.any { it.id == id } } ?: tabs.firstOrNull()?.id
		}.onFailure { log("could not restore tabs: ${it.message}") }
	}

	fun saveSettings(patch: JSONObject) {
		settings = settings.merge(patch)
		runCatching { File(dir, "settings.json").writeText(settings.toJson().toString()) }
			.onFailure { log("could not save settings: ${it.message}") }
		for (tab in tabs) tab.web?.let { apply(it, tab.private) }
		if (!settings.restore) File(dir, "tabs.json").delete() else queueSave()
	}

	private fun encodeBundle(bundle: Bundle): String {
		val parcel = Parcel.obtain()
		return try {
			bundle.writeToParcel(parcel, 0)
			Base64.encodeToString(parcel.marshall(), Base64.NO_WRAP)
		} finally {
			parcel.recycle()
		}
	}

	private fun decodeBundle(text: String): Bundle? {
		val parcel = Parcel.obtain()
		return try {
			val bytes = Base64.decode(text, Base64.NO_WRAP)
			parcel.unmarshall(bytes, 0, bytes.size)
			parcel.setDataPosition(0)
			parcel.readBundle(Browser::class.java.classLoader)
		} catch (error: Throwable) {
			log("a saved tab could not be read: ${error.message}")
			null
		} finally {
			parcel.recycle()
		}
	}

	fun queueSave() {
		if (saveQueued) return
		saveQueued = true
		main.postDelayed({ saveQueued = false; saveNow() }, 1500)
	}

	/** Writes tabs.json off the main thread, one write at a time and in order. */
	private val writer = java.util.concurrent.Executors.newSingleThreadExecutor()

	/** [saveState] needs the main thread; encoding and writing every tab there stuttered on pause. */
	fun saveNow(sync: Boolean = false) {
		if (!settings.restore) return
		val snapshot = runCatching {
			tabs.filter { !it.private }.map { tab ->
				Triple(tab, tab.web?.let { web -> Bundle().also { web.saveState(it) } } ?: tab.saved, tab.url)
			}
		}.getOrElse {
			log("could not save tabs: ${it.message}")
			return
		}
		val active = activeId?.takeIf { id -> tabs.any { it.id == id && !it.private } } ?: ""
		val file = File(dir, "tabs.json")
		val write = Runnable {
			runCatching {
				val list = JSONArray()
				for ((tab, state, url) in snapshot) {
					val item = JSONObject().put("id", tab.id).put("url", url).put("title", tab.title)
					if (state != null && !state.isEmpty) item.put("state", encodeBundle(state))
					list.put(item)
				}
				val temp = File(dir, "tabs.json.tmp")
				temp.writeText(JSONObject().put("active", active).put("tabs", list).toString())
				if (!temp.renameTo(file)) {
					file.delete()
					temp.renameTo(file)
				}
			}.onFailure { log("could not save tabs: ${it.message}") }
		}
		if (sync) write.run() else writer.execute(write)
	}

	// ---- State for JS --------------------------------------------------------------------

	fun stateJson(): String {
		val list = JSONArray()
		for (tab in tabs) {
			list.put(
				JSONObject()
					.put("id", tab.id)
					.put("url", tab.url)
					.put("title", tab.title)
					.put("loading", tab.loading)
					.put("progress", tab.progress)
					.put("private", tab.private)
					.put("error", tab.error ?: JSONObject.NULL)
					// A tab not shown yet has no page to go back in; Back lights up once it has.
					.put("canBack", tab.web?.canGoBack() ?: false)
					.put("canForward", tab.web?.canGoForward() ?: false),
			)
		}
		return JSONObject()
			.put("active", activeId ?: JSONObject.NULL)
			.put("tabs", list)
			// Site icons are saved there as <host>.png (onReceivedIcon), for the tab row and speed dial.
			.put("iconDir", Extras.iconDir().absolutePath)
			.toString()
	}

	/** Coalesced: a page load reports progress many times a second. */
	fun changed() {
		if (emitQueued) return
		emitQueued = true
		main.postDelayed({
			emitQueued = false
			val state = stateJson()
			if (state != lastState) {
				lastState = state
				emitState(state)
			}
		}, 60)
	}

	// ---- Placement -----------------------------------------------------------------------

	private fun contextFor(activity: Activity): MutableContextWrapper =
		(context ?: MutableContextWrapper(activity).also { context = it }).also {
			if (it.baseContext !== activity) it.setBaseContext(activity)
		}

	private fun findView(view: View, tagId: Int, nativeId: String): View? {
		if (view.getTag(tagId) == nativeId) return view
		if (view is ViewGroup) {
			for (i in 0 until view.childCount) findView(view.getChildAt(i), tagId, nativeId)?.let { return it }
		}
		return null
	}

	/** Puts the browser inside the React view whose nativeID is [nativeId]. False if it isn't on screen yet. */
	fun attach(nativeId: String): Boolean {
		Trace.add("attach $nativeId (current $hostId)")
		val activity = activity.get() ?: return false
		val root = activity.window?.decorView ?: return false
		// The resources keep Discord's package name when the app is installed under another one (app.valenced)
		val tagId = activity.resources.getIdentifier("view_tag_native_id", "id", activity.packageName)
			.takeIf { it != 0 } ?: activity.resources.getIdentifier("view_tag_native_id", "id", "com.discord")
		if (tagId == 0) {
			log("this Discord build has no nativeID tag; the browser can't be placed")
			return false
		}
		val target = findView(root, tagId, nativeId) as? ViewGroup ?: return false
		val ctx = contextFor(activity)
		val f = frame ?: FrameLayout(ctx).also {
			frame = it
			roundTop(it)
		}
		if (f.parent !== target) {
			hold()
			unhost()
			(f.parent as? ViewGroup)?.removeView(f)
			parkedParams?.let { f.layoutParams = it }
			parkedParams = null
			target.addView(f)
			target.addOnLayoutChangeListener(layoutListener)
			target.addOnAttachStateChangeListener(detachListener)
			host = target
		}
		hostId = nativeId
		if (tabs.isEmpty()) newTab(null, select = true)
		show()
		layoutFrame()
		changed()
		unholdSoon()
		return true
	}

	/** Lets go of the current placeholder without pausing or parking: another one is taking over. */
	private fun unhost() {
		detachGrace?.let { main.removeCallbacks(it) }
		detachGrace = null
		val h = host ?: return
		h.removeOnLayoutChangeListener(layoutListener)
		h.removeOnAttachStateChangeListener(detachListener)
		host = null
		hostId = null
	}

	/** Takes the browser out of the picker; pages keep running. Only for the placeholder that asked. */
	fun detach(nativeId: String?) {
		Trace.add("detach $nativeId (current $hostId)")
		if (nativeId != null && nativeId != hostId) return
		// React unmounts and remounts the placeholder when the sheet re-renders; a new one usually
		// attaches within a moment. Wait before letting go, held, so the page never notices.
		hold()
		detachGrace?.let { main.removeCallbacks(it) }
		val grace = Runnable {
			detachGrace = null
			if (hostId == nativeId || hostId == null) release()
		}
		detachGrace = grace
		main.postDelayed(grace, 400)
	}

	private fun release() {
		Trace.add("release (keepPlaying=${settings.keepPlaying})")
		detachGrace?.let { main.removeCallbacks(it) }
		detachGrace = null
		val h = host ?: return
		if (settings.keepPlaying) hold()
		h.removeOnLayoutChangeListener(layoutListener)
		h.removeOnAttachStateChangeListener(detachListener)
		frame?.let { if (it.parent === h) h.removeView(it) }
		host = null
		hostId = null
		// Pausing stops audio and video. With keepPlaying the page keeps running out of sight:
		// parked in the window (a view with no window counts as hidden, and players pause).
		if (settings.keepPlaying) park() else active?.web?.onPause()
		saveNow()
	}

	/** The tallest the page has been while a video plays; see layoutFrame. */
	private var tallHeight = 0

	/** The page's size in the picker, kept for parking at the same size. */
	private var lastWidth = 0
	private var lastHeight = 0

	/**
	 * Keeps the frame attached to the window, at the size it had in the picker but behind
	 * everything Discord draws, so its page keeps playing. 1 px was too small: YouTube read a 0x0
	 * page and paused every ~0.3 s, and the resume fix restarted it each time (the stutter; seen in
	 * the page's media log on device 2026-10-13).
	 */
	private fun park() {
		Trace.add("park")
		val f = frame ?: return
		val decor = activity.get()?.window?.decorView as? ViewGroup ?: return
		runCatching {
			(f.parent as? ViewGroup)?.removeView(f)
			parkedParams = parkedParams ?: f.layoutParams
			f.alpha = 0f
			val metrics = decor.resources.displayMetrics
			val w = if (lastWidth > 1) lastWidth else metrics.widthPixels
			val h = if (lastHeight > 1) lastHeight else metrics.heightPixels / 2
			// Index 0: under Discord's own content, which is opaque and covers it.
			decor.addView(f, 0, FrameLayout.LayoutParams(w, h))
			active?.web?.evaluateJavascript(STAY_VISIBLE_JS, null)
			Extras.setBackground(active?.web, true)
		}.onFailure { log("could not keep the page playing: ${it.message}") }
	}

	/** Discord left or came back: with keepPlaying the page's own pause() is ignored while it's away. */
	fun appVisible(visible: Boolean) {
		Trace.add("app visible=$visible")
		foreground = visible
		if (!visible) {
			if (settings.keepPlaying) hold()
		} else if (host != null) {
			unholdSoon()
		}
	}

	// ---- Holding the page through moves ------------------------------------------------------
	//
	// Every time the WebView leaves the window -- the picker remounting its content (it does in the
	// half-open sheet), a tab switch, parking -- the page briefly reads as hidden, and YouTube
	// pauses on that (traced on device 2026-10-13: "web window visibility=8, web detached" right
	// before each pause). Holding marks the page out of sight *before* the move, so its visibility
	// never changes and a pause in that moment is undone; it lets go a little after it's back.

	private var foreground = true
	private var unhold: Runnable? = null

	private fun hold() {
		active?.web?.let(::holdFor)
	}

	private fun holdFor(web: WebView) {
		unhold?.let { main.removeCallbacks(it) }
		unhold = null
		Extras.setBackground(web, true)
		Trace.add("hold")
	}

	private fun unholdSoon() {
		unhold?.let { main.removeCallbacks(it) }
		val r = Runnable {
			unhold = null
			val web = active?.web
			// Only once it's really back: in a placeholder, on screen, Discord in front.
			if (host != null && foreground && web != null && web.isAttachedToWindow && web.windowVisibility == View.VISIBLE) {
				Extras.setBackground(web, false)
				Trace.add("unhold")
			}
		}
		unhold = r
		main.postDelayed(r, 800)
	}

	private fun layoutFrame() {
		val h = host ?: return
		val f = frame ?: return
		val w = h.width
		val ht = h.height
		// While something plays, the page keeps its tallest size when the sheet drops to half
		// height and is cut off at the sheet's edge instead: YouTube pauses when its page turns
		// short and wide (404x269 at half height; media log on device 2026-10-13). Otherwise the
		// page follows the sheet.
		if (ht >= tallHeight || active?.playing != true) tallHeight = ht
		val pageH = maxOf(ht, tallHeight)
		if (w > 1 && pageH > 1) {
			lastWidth = w
			lastHeight = pageH
		}
		f.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(pageH, View.MeasureSpec.EXACTLY))
		f.layout(0, 0, w, pageH)
		f.clipBounds = if (pageH > ht) Rect(0, 0, w, ht) else null
		visibleHeight = ht
		f.invalidateOutline()
	}

	/**
	 * Rounds the page's top corners like the address bar (17dp). The outline runs a radius past the visible bottom, so only
	 * the top two corners show rounded.
	 */
	private fun roundTop(f: FrameLayout) {
		val radius = 17f * f.resources.displayMetrics.density
		f.outlineProvider = object : ViewOutlineProvider() {
			override fun getOutline(view: View, outline: Outline) {
				val h = if (visibleHeight in 1..view.height) visibleHeight else view.height
				outline.setRoundRect(0, 0, view.width, h + radius.toInt(), radius)
			}
		}
		f.clipToOutline = true
	}

	/** The active tab's WebView in the frame, made or restored if needed. */
	private fun show() {
		Trace.add("show")
		val f = frame ?: return
		f.alpha = 1f
		val tab = active ?: return
		val web = tab.web ?: create(tab)
		tab.lastShown = System.currentTimeMillis()
		if (web.parent !== f) {
			if (web.parent != null) hold()
			(web.parent as? ViewGroup)?.removeView(web)
			f.removeAllViews()
			f.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
		}
		for (other in tabs) if (other !== tab) other.web?.onPause()
		web.onResume()
		if (host != null) unholdSoon()
		trim()
		layoutFrame()
	}

	/** Keeps at most [MAX_LIVE] WebViews; older ones are saved and freed until shown again. */
	private fun trim() {
		val live = tabs.filter { it.web != null && it.id != activeId }.sortedByDescending { it.lastShown }
		for (tab in live.drop(MAX_LIVE - 1)) {
			val web = tab.web ?: continue
			tab.saved = Bundle().also { web.saveState(it) }
			(web.parent as? ViewGroup)?.removeView(web)
			web.destroy()
			tab.web = null
		}
	}

	// ---- WebViews ------------------------------------------------------------------------

	/**
	 * A new-window request loaded in [view] instead. The address isn't known until a WebView starts
	 * loading it, so a throwaway one takes the request, hands its first address over, and goes.
	 */
	private fun openHere(view: WebView, resultMsg: Message): Boolean {
		val transport = resultMsg.obj as? WebView.WebViewTransport ?: return false
		val temp = WebView(view.context)
		var done = false
		fun take(url: String?, from: WebView) {
			if (done || url.isNullOrEmpty() || url == "about:blank") return
			done = true
			view.loadUrl(url)
			main.post { runCatching { from.stopLoading(); from.destroy() } }
		}
		temp.webViewClient = object : WebViewClient() {
			override fun shouldOverrideUrlLoading(v: WebView, request: WebResourceRequest): Boolean {
				take(request.url.toString(), v)
				return true
			}
			override fun onPageStarted(v: WebView, url: String?, favicon: Bitmap?) = take(url, v)
		}
		transport.webView = temp
		resultMsg.sendToTarget()
		// Nothing arrived (a script-only popup): don't leak the throwaway view.
		main.postDelayed({ if (!done) { done = true; runCatching { temp.destroy() } } }, 10_000)
		return true
	}

	private fun apply(web: WebView, private: Boolean) {
		web.settings.apply {
			javaScriptEnabled = settings.javascript
			domStorageEnabled = true
			databaseEnabled = true
			loadWithOverviewMode = true
			useWideViewPort = true
			builtInZoomControls = true
			displayZoomControls = false
			setSupportMultipleWindows(true)
			javaScriptCanOpenWindowsAutomatically = false
			mediaPlaybackRequiresUserGesture = true
			userAgentString = if (settings.desktop) desktopUserAgent(web.context) else browserUserAgent(web.context)
			textZoom = settings.textZoom
		}
		CookieManager.getInstance().setAcceptThirdPartyCookies(web, settings.thirdPartyCookies && !private)
		// A settings change reaches open pages at once; new pages get it when they finish loading.
		web.evaluateJavascript(if (settings.darkPages) Extras.DARK_JS else Extras.UNDARK_JS, null)
	}

	private fun create(tab: Tab): WebView {
		val ctx = context ?: activity.get()?.let { contextFor(it) } ?: error("no activity yet")
		val web = object : WebView(ctx) {
			override fun onWindowVisibilityChanged(visibility: Int) {
				Trace.add("web window visibility=$visibility (0 shown, 4 invisible, 8 gone)")
				// Held before the page hears it, whoever moved the view (React reshuffles the
				// picker's views on its own): the script queues ahead of the visibility change.
				if (visibility != View.VISIBLE && this === active?.web) holdFor(this)
				super.onWindowVisibilityChanged(visibility)
				if (visibility == View.VISIBLE && this === active?.web) unholdSoon()
			}
			override fun onAttachedToWindow() {
				Trace.add("web attached")
				super.onAttachedToWindow()
			}
			override fun onDetachedFromWindow() {
				Trace.add("web detached")
				if (this === active?.web) holdFor(this)
				super.onDetachedFromWindow()
			}
			override fun onSizeChanged(w: Int, h: Int, ow: Int, oh: Int) {
				Trace.add("web size ${w}x$h")
				super.onSizeChanged(w, h, ow, oh)
			}
		}
		apply(web, tab.private)
		web.setOnTouchListener { view, event ->
			if (event.actionMasked == MotionEvent.ACTION_DOWN) view.parent?.requestDisallowInterceptTouchEvent(true)
			false
		}
		web.setOnLongClickListener { holdMenu(tab, web) }
		web.webViewClient = object : WebViewClient() {
			override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
				!loadsHere(request.url) && openElsewhere(request.url, view)

			override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
				view.evaluateJavascript(STAY_VISIBLE_JS, null)
				tab.loading = true
				if (!url.isNullOrEmpty()) tab.url = url
				// A new load clears the error page; WebView's own page for the failure doesn't count.
				if (url != tab.failedUrl) {
					tab.error = null
					tab.failedUrl = null
				}
				popupNoticed = false
				changed()
			}

			override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
				if (!request.isForMainFrame) return
				// A load cut short on purpose (a redirect, a new address typed mid-load) isn't a failure.
				if (error.errorCode == ERROR_UNKNOWN && error.description?.contains("ABORTED", true) == true) return
				tab.error = when (error.errorCode) {
					ERROR_HOST_LOOKUP -> "Couldn't find that site. Check the address, or your connection."
					ERROR_CONNECT, ERROR_TIMEOUT -> "The site didn't answer. It may be down, or you're offline."
					ERROR_FAILED_SSL_HANDSHAKE -> "Couldn't make a secure connection to this site."
					ERROR_TOO_MANY_REQUESTS -> "The site is getting too many requests. Try again in a bit."
					ERROR_UNSUPPORTED_SCHEME -> "This kind of link can't open here."
					else -> error.description?.toString()?.takeIf { it.isNotBlank() } ?: "The page couldn't load."
				}
				tab.failedUrl = request.url.toString()
				tab.loading = false
				changed()
			}

			override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
				// Unhandled, Android kills the whole app along with the page. Lose the page, keep the tab.
				crashed(tab, view)
				return true
			}

			override fun onPageFinished(view: WebView, url: String?) {
				view.evaluateJavascript(STAY_VISIBLE_JS, null)
				if (settings.darkPages) view.evaluateJavascript(Extras.DARK_JS, null)
				tab.loading = false
				tab.progress = 100
				if (!url.isNullOrEmpty()) tab.url = url
				view.title?.takeIf { it.isNotBlank() }?.let { tab.title = it }
				changed()
				queueSave()
				if (!tab.private && !url.isNullOrEmpty() && url.startsWith("http")) {
					emitVisit(JSONObject().put("url", url).put("title", tab.title).toString())
				}
			}

			override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
				if (!url.isNullOrEmpty()) tab.url = url
				changed()
			}
		}
		web.webChromeClient = object : WebChromeClient() {
			override fun onProgressChanged(view: WebView, newProgress: Int) {
				tab.progress = newProgress
				changed()
			}

			override fun onReceivedTitle(view: WebView, title: String?) {
				if (!title.isNullOrBlank()) tab.title = title
				changed()
			}

			// Kept on the phone for the tab row and speed dial, so no icon service hears which sites you use.
			override fun onReceivedIcon(view: WebView, icon: Bitmap?) {
				if (icon != null && !tab.private) Extras.saveIcon(view.url ?: tab.url, icon)
				changed()
			}

			// A video's fullscreen button.
			override fun onShowCustomView(view: View, callback: CustomViewCallback) {
				enterFullscreen(view, callback)
			}

			override fun onHideCustomView() {
				exitFullscreen()
			}

			// target=_blank and window.open after a tap: a new tab, as a desktop browser would.
			override fun onCreateWindow(view: WebView, isDialog: Boolean, isUserGesture: Boolean, resultMsg: Message): Boolean {
				if (!isUserGesture) {
					// Once per page, or a pop-up-happy site toasts on every tap.
					if (!popupNoticed) {
						popupNoticed = true
						emitNotice("Pocket Browser blocked a pop-up.")
					}
					return false
				}
				if (!settings.pageNewTabs) return openHere(view, resultMsg)
				// about:blank, not the start page: the opener's page is about to load into it.
				// A popup from a private tab is private too.
				val opened = newTab("about:blank", select = true, private = tab.private)
				val transport = resultMsg.obj as? WebView.WebViewTransport ?: return false
				transport.webView = opened.web ?: create(opened)
				resultMsg.sendToTarget()
				show()
				return true
			}

			override fun onCloseWindow(window: WebView) {
				tabs.firstOrNull { it.web === window }?.let { closeTab(it.id) }
			}

			// <input type="file">: Discord's own document picker (JS side) chooses, `filesChosen` answers.
			override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
				fileCallback?.onReceiveValue(null)
				fileCallback = callback
				val accept = JSONArray()
				for (type in params.acceptTypes ?: emptyArray()) for (part in type.split(',')) part.trim().takeIf { it.isNotEmpty() }?.let { accept.put(it) }
				emitChooseFiles(
					JSONObject()
						.put("accept", accept)
						.put("multiple", params.mode == FileChooserParams.MODE_OPEN_MULTIPLE)
						.toString(),
				)
				return true
			}

			// Camera and microphone: the user is asked (JS), then Android's own permission if needed.
			override fun onPermissionRequest(request: PermissionRequest) {
				val wanted = request.resources.filter {
					it == PermissionRequest.RESOURCE_VIDEO_CAPTURE || it == PermissionRequest.RESOURCE_AUDIO_CAPTURE
				}
				if (wanted.isEmpty()) {
					request.deny()
					return
				}
				val origin = request.origin?.toString().orEmpty()
				// Already allowed for this site this session: no second question.
				if (wanted.all { "$origin|$it" in allowed }) {
					request.grant(wanted.toTypedArray())
					return
				}
				val id = (++permissionSeq).toString()
				permissions[id] = request to wanted
				emitPermission(
					JSONObject()
						.put("id", id)
						.put("origin", origin)
						.put("camera", PermissionRequest.RESOURCE_VIDEO_CAPTURE in wanted)
						.put("microphone", PermissionRequest.RESOURCE_AUDIO_CAPTURE in wanted)
						.toString(),
				)
			}

			override fun onPermissionRequestCanceled(request: PermissionRequest) {
				permissions.entries.removeAll { it.value.first === request }
			}

			// Discord doesn't hold a location permission, so a site can't have one either.
			override fun onGeolocationPermissionsShowPrompt(origin: String?, callback: GeolocationPermissions.Callback?) {
				callback?.invoke(origin, false, false)
				// Once per site per session: some sites ask again on every move.
				if (locationNoticed.add(origin.orEmpty())) emitNotice("Pocket Browser can't share your location.")
			}
		}
		// Always: it does nothing until the page is held (see hold()), and holding is what keeps
		// moves inside the picker from pausing players.
		Extras.addStartScript(web)
		Extras.watchFind(web)
		// The page script reports play/pause, so the half-height sheet can keep a playing page tall.
		web.addJavascriptInterface(object {
			@JavascriptInterface
			fun playing(value: Boolean) {
				main.post {
					tab.playing = value
					if (tab === active && !value) layoutFrame()
				}
			}
		}, "PocketMedia")
		web.setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
			download(url, userAgent, contentDisposition, mimeType, web)
		}
		tab.web = web
		val saved = tab.saved
		tab.saved = null
		val restored = saved != null && web.restoreState(saved) != null
		if (!restored && tab.url.isNotEmpty()) web.loadUrl(tab.url)
		return web
	}

	private fun loadsHere(uri: Uri): Boolean = when (uri.scheme?.lowercase()) {
		"http", "https", "about", "data", "blob", "javascript" -> true
		else -> false
	}

	/** mailto:, tel:, market:, app links and downloads go to the system; intent: may fall back to a web page. */
	private fun openElsewhere(uri: Uri, view: WebView): Boolean {
		val activity = activity.get() ?: return true
		try {
			if (uri.scheme.equals("intent", true)) {
				val intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME)
				intent.addCategory(Intent.CATEGORY_BROWSABLE)
				intent.component = null
				intent.selector = null
				try {
					activity.startActivity(intent)
				} catch (_: ActivityNotFoundException) {
					intent.getStringExtra("browser_fallback_url")?.let { view.loadUrl(it) }
				}
			} else {
				activity.startActivity(Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE))
			}
		} catch (error: Throwable) {
			log("could not open $uri elsewhere: ${error.message}")
		}
		return true
	}

	// ---- Crashes, pop-ups, location ------------------------------------------------------------

	/** The page blocked a pop-up since it last started loading (one toast per page). */
	private var popupNoticed = false
	/** Origins already told this session that location isn't available. */
	private val locationNoticed = mutableSetOf<String>()

	/**
	 * The page's renderer died (out of memory, a renderer bug). The WebView is unusable after that,
	 * so it goes; the tab stays with an error page, and Reload makes a fresh WebView for it.
	 */
	private fun crashed(tab: Tab, view: WebView) {
		log("a page crashed: ${tab.url}")
		if (fullscreenOwner === view) exitFullscreen()
		(view.parent as? ViewGroup)?.removeView(view)
		runCatching { view.destroy() }
		if (tab.web === view) tab.web = null
		tab.loading = false
		tab.playing = false
		tab.error = "This page crashed. Reload to try again."
		tab.failedUrl = tab.url
		changed()
	}

	// ---- Fullscreen video --------------------------------------------------------------------

	private var fullscreen: FrameLayout? = null
	private var fullscreenCallback: WebChromeClient.CustomViewCallback? = null
	private var fullscreenOwner: WebView? = null

	/** A page's fullscreen video, over all of Discord with the system bars hidden. Back leaves it. */
	private fun enterFullscreen(view: View, callback: WebChromeClient.CustomViewCallback) {
		val activity = activity.get()
		val decor = activity?.window?.decorView as? ViewGroup
		if (decor == null) {
			callback.onCustomViewHidden()
			return
		}
		exitFullscreen()
		val layer = FrameLayout(activity).apply {
			setBackgroundColor(android.graphics.Color.BLACK)
			isFocusable = true
			isFocusableInTouchMode = true
			setOnKeyListener { _, keyCode, event ->
				if (keyCode == android.view.KeyEvent.KEYCODE_BACK && event.action == android.view.KeyEvent.ACTION_UP) exitFullscreen()
				keyCode == android.view.KeyEvent.KEYCODE_BACK
			}
		}
		(view.parent as? ViewGroup)?.removeView(view)
		layer.addView(view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
		decor.addView(layer, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
		layer.requestFocus()
		fullscreen = layer
		fullscreenCallback = callback
		fullscreenOwner = active?.web
		systemBars(activity, show = false)
	}

	fun exitFullscreen() {
		val layer = fullscreen ?: return
		val callback = fullscreenCallback
		fullscreen = null
		fullscreenCallback = null
		fullscreenOwner = null
		(layer.parent as? ViewGroup)?.removeView(layer)
		layer.removeAllViews()
		activity.get()?.let { systemBars(it, show = true) }
		// Tells the page it left fullscreen; it may call onHideCustomView back, which is a no-op now.
		runCatching { callback?.onCustomViewHidden() }
	}

	@Suppress("DEPRECATION")
	private fun systemBars(activity: Activity, show: Boolean) {
		val window = activity.window ?: return
		runCatching {
			if (Build.VERSION.SDK_INT >= 30) {
				val controller = window.insetsController ?: return
				if (show) {
					controller.show(WindowInsets.Type.systemBars())
				} else {
					controller.systemBarsBehavior = android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
					controller.hide(WindowInsets.Type.systemBars())
				}
			} else {
				window.decorView.systemUiVisibility = if (show) 0 else
					View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
			}
		}
	}

	// ---- Holding a link or image -------------------------------------------------------------

	/** Asks JS to show the hold menu for a link or image (a JSON string: link, image, text). */
	var emitHold: (String) -> Unit = {}

	/**
	 * A long press on a link or an image opens Pocket Browser's own menu (JS). Anywhere else the press
	 * goes to the page as usual, so text can still be selected.
	 */
	private fun holdMenu(tab: Tab, web: WebView): Boolean {
		val hit = web.hitTestResult
		val extra = hit.extra
		val image = when (hit.type) {
			WebView.HitTestResult.IMAGE_TYPE, WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE -> extra
			else -> null
		}
		val isLink = hit.type == WebView.HitTestResult.SRC_ANCHOR_TYPE || hit.type == WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE
		if (image == null && !isLink) return false
		val send = { link: String?, text: String? ->
			emitHold(
				JSONObject()
					.put("link", link?.takeIf { it.isNotEmpty() } ?: (if (hit.type == WebView.HitTestResult.SRC_ANCHOR_TYPE) extra else null) ?: JSONObject.NULL)
					.put("image", image ?: JSONObject.NULL)
					.put("text", text?.takeIf { it.isNotBlank() } ?: JSONObject.NULL)
					.put("private", tab.private)
					.toString(),
			)
		}
		if (!isLink) {
			send(null, null)
			return true
		}
		// The link's address and text for an image link (the hit only has the image) and a link's text.
		val reply = Handler(Looper.getMainLooper()) { message ->
			send(message.data?.getString("url"), message.data?.getString("title"))
			true
		}.obtainMessage()
		runCatching { web.requestFocusNodeHref(reply) }.onFailure { send(null, null) }
		return true
	}

	/** Saves [url] (an image, from the hold menu) to Downloads like any download. */
	fun saveUrl(url: String) {
		val web = active?.web ?: return emitNotice("Open the page first.")
		download(url, null, null, null, web)
	}

	/**
	 * Fetches the image at [url] into Discord's cache for "Share image to chat": `{ path, width,
	 * height }` as JSON, or `{ error }`. With the page's cookies, like a download. Off the main thread.
	 */
	fun fetchImage(context: Context, url: String, userAgent: String?, referer: String?): String {
		fun error(text: String) = JSONObject().put("error", text).toString()
		val dir = File(context.cacheDir, "pocket-browser-shots").apply { mkdirs() }
		val file = File(dir, "image-${System.currentTimeMillis()}")
		return runCatching {
			if (url.startsWith("data:", true)) {
				val comma = url.indexOf(',')
				if (comma < 0 || !url.substring(0, comma).contains(";base64", true)) return error("That image can't be shared.")
				file.writeBytes(Base64.decode(url.substring(comma + 1), Base64.DEFAULT))
			} else {
				val scheme = Uri.parse(url).scheme?.lowercase()
				if (scheme != "http" && scheme != "https") return error("That image only exists inside the page.")
				val conn = java.net.URL(url).openConnection() as java.net.HttpURLConnection
				conn.connectTimeout = 15_000
				conn.readTimeout = 30_000
				CookieManager.getInstance().getCookie(url)?.let { conn.setRequestProperty("Cookie", it) }
				userAgent?.let { conn.setRequestProperty("User-Agent", it) }
				referer?.let { conn.setRequestProperty("Referer", it) }
				try {
					if (conn.responseCode !in 200..299) return error("The site refused the image (${conn.responseCode}).")
					conn.inputStream.use { input -> file.outputStream().use { input.copyTo(it) } }
				} finally {
					conn.disconnect()
				}
			}
			val bounds = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
			android.graphics.BitmapFactory.decodeFile(file.absolutePath, bounds)
			if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
				file.delete()
				return error("That isn't an image Discord can send.")
			}
			// Discord reads the type from the name.
			val ext = when (bounds.outMimeType) {
				"image/png" -> "png"
				"image/gif" -> "gif"
				"image/webp" -> "webp"
				else -> "jpg"
			}
			val named = File(dir, "${file.name}.$ext")
			file.renameTo(named)
			JSONObject().put("path", named.absolutePath).put("width", bounds.outWidth).put("height", bounds.outHeight).put("mime", bounds.outMimeType ?: "image/jpeg").toString()
		}.getOrElse {
			file.delete()
			log("fetching an image failed: ${it.message}")
			error("Couldn't get the image.")
		}
	}

	// ---- Files, permissions, downloads -------------------------------------------------------

	/** The page's file input waiting for an answer; only one at a time, like Chrome. */
	private var fileCallback: ValueCallback<Array<Uri>>? = null
	private val permissions = mutableMapOf<String, Pair<PermissionRequest, List<String>>>()
	private var permissionSeq = 0
	/** "origin|resource" the user allowed this session. */
	private val allowed = mutableSetOf<String>()

	/** JS's answer to [emitChooseFiles]: content:// URIs from Discord's document picker, or none. */
	fun filesChosen(uris: List<String>) {
		val callback = fileCallback ?: return
		fileCallback = null
		callback.onReceiveValue(uris.map(Uri::parse).toTypedArray().takeIf { it.isNotEmpty() })
	}

	/** JS's answer to [emitPermission]. */
	fun permissionResult(id: String, allow: Boolean) {
		val (request, wanted) = permissions.remove(id) ?: return
		try {
			if (allow) {
				val origin = request.origin?.toString().orEmpty()
				for (resource in wanted) allowed += "$origin|$resource"
				request.grant(wanted.toTypedArray())
			} else {
				request.deny()
			}
		} catch (error: Throwable) {
			log("answering a permission request failed: ${error.message}")
		}
	}

	/**
	 * Saves a download to Downloads with Android's download manager: with the page's cookies and
	 * user agent, so files behind a sign-in work, and a notification to open it from. Data and
	 * blob URLs only exist inside the page, so they can't be handed over.
	 */
	private fun download(url: String, userAgent: String?, contentDisposition: String?, mimeType: String?, web: WebView) {
		val uri = Uri.parse(url)
		val scheme = uri.scheme?.lowercase()
		if (scheme != "http" && scheme != "https") {
			emitNotice("This download only exists inside the page, so it can't be saved.")
			return
		}
		try {
			val name = URLUtil.guessFileName(url, contentDisposition, mimeType)
			val request = DownloadManager.Request(uri)
				.setTitle(name)
				.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
				.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
			if (!mimeType.isNullOrBlank()) request.setMimeType(mimeType)
			CookieManager.getInstance().getCookie(url)?.let { request.addRequestHeader("Cookie", it) }
			request.addRequestHeader("User-Agent", userAgent ?: web.settings.userAgentString)
			web.url?.let { request.addRequestHeader("Referer", it) }
			val manager = web.context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
			val downloadId = manager.enqueue(request)
			Extras.recordDownload(downloadId, name, url)
			emitNotice("Downloading $name")
		} catch (error: Throwable) {
			log("download failed: ${error.message}")
			emitNotice("Couldn't start the download.")
		}
	}

	// ---- Tab actions -------------------------------------------------------------------------

	private fun newId() = System.currentTimeMillis().toString(36) + (0..999).random().toString(36)

	/** A null [url] is the start page. */
	fun newTab(url: String?, select: Boolean, private: Boolean = false): Tab {
		val tab = Tab(newId(), url.orEmpty(), url.orEmpty(), private)
		val at = tabs.indexOfFirst { it.id == activeId }
		if (at >= 0) tabs.add(at + 1, tab) else tabs += tab
		if (select) activeId = tab.id
		if (frame?.parent != null && select) show()
		changed()
		queueSave()
		return tab
	}

	fun selectTab(id: String) {
		if (tabs.none { it.id == id }) return
		activeId = id
		if (frame?.parent != null) show()
		changed()
		queueSave()
	}

	fun closeTab(id: String) {
		val at = tabs.indexOfFirst { it.id == id }
		if (at < 0) return
		val tab = tabs.removeAt(at)
		tab.web?.let {
			(it.parent as? ViewGroup)?.removeView(it)
			// A private tab leaves no history or form data behind. Not clearCache: the cache is shared
			// by every WebView in Discord (other tabs, Vencord Tab, activities), and it would empty theirs.
			if (tab.private) {
				it.clearHistory()
				it.clearFormData()
			}
			it.destroy()
		}
		tab.web = null
		if (activeId == id) activeId = tabs.getOrNull(at)?.id ?: tabs.getOrNull(at - 1)?.id
		if (tabs.isEmpty()) newTab(null, select = true)
		else if (frame?.parent != null) show()
		changed()
		queueSave()
	}

	fun closeOthers() {
		val keep = activeId ?: return
		for (tab in tabs.toList()) if (tab.id != keep) closeTab(tab.id)
	}

	/** Loads [url] in the active tab, or a new one when asked or when there is none. */
	fun load(url: String, inNewTab: Boolean) {
		// A new tab loads its address itself when its WebView is made; loading again here made
		// every link opened in a new tab request the page twice.
		if (inNewTab || active == null) {
			newTab(url, select = true)
			return
		}
		val tab = active!!
		tab.url = url
		val web = tab.web
		if (web != null) web.loadUrl(url)
		else if (frame?.parent != null) show()
		changed()
		queueSave()
	}

	fun act(action: String) {
		val web = active?.web
		// Whatever happens next, the error page goes: JS puts the WebView back when it does.
		active?.let {
			if (action != "stop") {
				it.error = null
				it.failedUrl = null
			}
		}
		when (action) {
			"back" -> if (web?.canGoBack() == true) web.goBack()
			"forward" -> if (web?.canGoForward() == true) web.goForward()
			// No WebView: the page crashed. A fresh one loads the tab's address when it's shown.
			"reload" -> if (web != null) web.reload() else if (frame?.parent != null) show()
			"stop" -> web?.stopLoading()
			"home" -> load(settings.home, inNewTab = false)
		}
		changed()
	}

	/**
	 * Cookies and storage are shared by every WebView in Discord's process, Vencord Tab's web app
	 * and Discord activities included. Wiping all of it signed Vencord Tab out and deleted its mod
	 * settings, so Discord's own sites are kept: their cookies are put back after the wipe, and their
	 * origins skipped. (Restored cookies lose HttpOnly and their expiry, and last a year.)
	 */
	fun clearData(done: () -> Unit = {}) {
		val cookies = CookieManager.getInstance()
		val keep = KEEP_HOSTS.associateWith { host -> cookies.getCookie("https://$host").orEmpty() }
		cookies.removeAllCookies {
			for ((host, header) in keep) {
				for (pair in header.split(';').map(String::trim).filter { '=' in it }) {
					cookies.setCookie("https://$host", "$pair; Path=/; Secure; Max-Age=31536000")
				}
			}
			cookies.flush()
			val storage = WebStorage.getInstance()
			storage.getOrigins { origins ->
				for (origin in (origins ?: emptyMap<Any, Any>()).keys) {
					val host = runCatching { Uri.parse(origin.toString()).host.orEmpty() }.getOrDefault("")
					if (KEEP_HOSTS.none { host == it || host.endsWith(".$it") }) storage.deleteOrigin(origin.toString())
				}
				done()
			}
		}
		// The HTTP cache is app-wide too, but holds no sign-ins: clearing it only costs other web views
		// a re-download.
		tabs.firstNotNullOfOrNull { it.web }?.clearCache(true)
		allowed.clear()
	}

	fun destroy() {
		saveNow(sync = true)
		exitFullscreen()
		release()
		unwatchIme()
		// Nothing will answer these any more; leaving them open would hang the pages that asked.
		filesChosen(emptyList())
		for (id in permissions.keys.toList()) permissionResult(id, false)
		// Private tabs never outlive the session.
		for (tab in tabs.filter { it.private }) closeTab(tab.id)
		for (tab in tabs) tab.web?.destroy()
		tabs.clear()
		frame = null
		context = null
	}
}

/** Runs [block] on the main thread and returns its result to the calling coroutine. */
private suspend fun <T> onMain(block: () -> T): T = suspendCancellableCoroutine { cont ->
	Handler(Looper.getMainLooper()).post {
		try {
			cont.resume(block())
		} catch (error: Throwable) {
			cont.resumeWithException(error)
		}
	}
}

private val activityCallbacks = object : Application.ActivityLifecycleCallbacks {
	override fun onActivityResumed(activity: Activity) {
		Browser.activity = WeakReference(activity)
		Browser.watchIme(activity)
		Browser.appVisible(true)
	}
	override fun onActivityPaused(activity: Activity) {
		Browser.saveNow()
	}
	override fun onActivityStopped(activity: Activity) = Browser.appVisible(false)
	override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = Unit
	override fun onActivityStarted(activity: Activity) = Unit
	override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit
	override fun onActivityDestroyed(activity: Activity) = Unit
}

private var jsScope: CoroutineScope? = null
private var application: Application? = null

val pocketBrowserPlugin = plugin {
	start {
		val id = manifest.id
		val host = this
		val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default).also { jsScope = it }
		Browser.dir = storageDir.apply { mkdirs() }
		Browser.log = { log.w("$PAGE_TAG $it") }
		Browser.emitState = { state -> scope.launch { runCatching { host.callJSMethod("$id.changed", listOf(state)) } } }
		Browser.emitVisit = { visit -> scope.launch { runCatching { host.callJSMethod("$id.visited", listOf(visit)) } } }
		Browser.emitKeyboard = { visible -> scope.launch { runCatching { host.callJSMethod("$id.keyboardChanged", listOf(visible)) } } }
		Browser.emitChooseFiles = { json -> scope.launch { runCatching { host.callJSMethod("$id.chooseFiles", listOf(json)) } } }
		Browser.emitPermission = { json -> scope.launch { runCatching { host.callJSMethod("$id.permission", listOf(json)) } } }
		Browser.emitNotice = { text -> scope.launch { runCatching { host.callJSMethod("$id.notice", listOf(text)) } } }
		Browser.emitHold = { json -> scope.launch { runCatching { host.callJSMethod("$id.hold", listOf(json)) } } }
		Browser.load()

		Extras.emitFound = { json -> scope.launch { runCatching { host.callJSMethod("$id.found", listOf(json)) } } }
		withAppActivity { activity ->
			startPopout(activity)
			Extras.clearScreenshots(activity)
			Browser.activity = WeakReference(activity)
			Browser.watchIme(activity)
			if (application == null) {
				application = activity.application
				activity.application.registerActivityLifecycleCallbacks(activityCallbacks)
			}
		}

		fun text(args: List<Any?>, at: Int) = args.getOrNull(at) as? String
		registerNativeAsyncMethod("$id.attach") { args -> onMain { Browser.attach(text(args, 0) ?: return@onMain false) } }
		registerNativeAsyncMethod("$id.detach") { args -> onMain { Browser.detach(text(args, 0)) } }
		registerNativeAsyncMethod("$id.state") { _ -> onMain { Browser.stateJson() } }
		registerNativeAsyncMethod("$id.load") { args ->
			onMain {
				Browser.load(text(args, 0) ?: return@onMain false, args.getOrNull(1) == true)
				true
			}
		}
		registerNativeAsyncMethod("$id.act") { args -> onMain { Browser.act(text(args, 0).orEmpty()) } }
		// newTab(url?, private?): no url is the start page.
		registerNativeAsyncMethod("$id.newTab") { args ->
			onMain { Browser.newTab(text(args, 0)?.takeIf { it.isNotEmpty() }, select = true, private = args.getOrNull(1) == true).id }
		}
		registerNativeAsyncMethod("$id.filesChosen") { args ->
			onMain {
				val list = runCatching { JSONArray(text(args, 0) ?: "[]") }.getOrDefault(JSONArray())
				Browser.filesChosen((0 until list.length()).mapNotNull { list.optString(it).takeIf(String::isNotEmpty) })
			}
		}
		registerNativeAsyncMethod("$id.permissionResult") { args ->
			onMain { text(args, 0)?.let { Browser.permissionResult(it, args.getOrNull(1) == true) } }
		}
		registerNativeAsyncMethod("$id.selectTab") { args -> onMain { text(args, 0)?.let(Browser::selectTab) } }
		registerNativeAsyncMethod("$id.closeTab") { args -> onMain { text(args, 0)?.let(Browser::closeTab) } }
		registerNativeAsyncMethod("$id.closeOthers") { _ -> onMain { Browser.closeOthers() } }
		registerNativeAsyncMethod("$id.settings") { args ->
			onMain {
				text(args, 0)?.let { Browser.saveSettings(JSONObject(it)) }
				Browser.settings.toJson().toString()
			}
		}
		registerNativeAsyncMethod("$id.clearData") { _ ->
			suspendCancellableCoroutine { cont -> Handler(Looper.getMainLooper()).post { Browser.clearData { if (cont.isActive) cont.resume(true) } } }
		}
		// Holding a link or image: the menu is JS's; these are its Save image and Share image.
		registerNativeAsyncMethod("$id.saveUrl") { args -> onMain { text(args, 0)?.let(Browser::saveUrl) } }
		registerNativeAsyncMethod("$id.fetchImage") { args ->
			val url = text(args, 0) ?: return@registerNativeAsyncMethod """{"error":"No image."}"""
			val (context, agent, referer) = onMain { Triple(Browser.activity.get(), Browser.active?.web?.settings?.userAgentString, Browser.active?.web?.url) }
			context ?: return@registerNativeAsyncMethod """{"error":"not ready"}"""
			withContext(Dispatchers.IO) { Browser.fetchImage(context, url, agent, referer) }
		}

		// Find in page; results arrive through `<id>.found`.
		// The last lifecycle events, for diagnosing playback that stops (read over devtools).
		registerNativeAsyncMethod("$id.trace") { _ -> Trace.dump() }
		registerNativeAsyncMethod("$id.find") { args -> onMain { Extras.find(Browser.active?.web, text(args, 0).orEmpty()) } }
		registerNativeAsyncMethod("$id.findNext") { args -> onMain { Extras.findNext(Browser.active?.web, args.getOrNull(0) != false) } }
		// Downloads started here.
		registerNativeAsyncMethod("$id.downloads") { _ -> onMain { Browser.activity.get()?.let { Extras.downloads(it) } ?: "[]" } }
		registerNativeAsyncMethod("$id.openDownload") { args ->
			onMain { Extras.openDownload(Browser.activity.get(), (args.getOrNull(0) as? Number)?.toLong() ?: text(args, 0)?.toLongOrNull() ?: -1) }
		}
		registerNativeAsyncMethod("$id.removeDownload") { args ->
			onMain {
				val downloadId = (args.getOrNull(0) as? Number)?.toLong() ?: text(args, 0)?.toLongOrNull() ?: return@onMain
				Browser.activity.get()?.let { Extras.removeDownload(it, downloadId, args.getOrNull(1) == true) }
			}
		}
		// Share to chat: the screenshot file; JS attaches it to the message (lib/upload.ts).
		registerNativeAsyncMethod("$id.screenshot") { _ -> onMain { Extras.screenshot(Browser.activity.get(), Browser.active?.web) } }
		// Pop out: the page's video, then the player (merged in from Pop Out Player).
		registerNativeAsyncMethod("$id.mediaInfo") { _ -> onMain { Browser.active?.web }.let { Extras.mediaInfo(it) } }
		registerNativeAsyncMethod("$id.pauseMedia") { _ -> onMain { Extras.pauseMedia(Browser.active?.web) } }
		registerNativeAsyncMethod("$id.popoutOpen") { args ->
			val json = text(args, 0) ?: return@registerNativeAsyncMethod "unsupported"
			onMain { popoutOpen(json) }
		}
		registerNativeAsyncMethod("$id.popoutClose") { _ -> onMain { popoutClose() } }
		registerNativeAsyncMethod("$id.popoutStatus") { _ -> onMain { popoutStatus() } }
		registerNativeAsyncMethod("$id.popoutCanOverlay") { _ -> onMain { Player.canOverlay() } }
		registerNativeAsyncMethod("$id.popoutRequestOverlay") { _ -> onMain { Player.requestOverlay() } }
	}

	stop {
		jsScope?.cancel()
		jsScope = null
		application?.unregisterActivityLifecycleCallbacks(activityCallbacks)
		application = null
		stopPopout()
		Handler(Looper.getMainLooper()).post { Browser.destroy() }
	}
}

/** A small ring buffer of browser lifecycle events, read with `<id>.trace`. */
internal object Trace {
	private const val MAX = 120
	private val events = ArrayDeque<String>()
	private val start = System.currentTimeMillis()

	@Synchronized fun add(event: String) {
		if (!DEBUG) return
		events.addLast("${System.currentTimeMillis() - start} $event")
		while (events.size > MAX) events.removeFirst()
	}

	@Synchronized fun dump(): String = events.joinToString(" | ")
}
