package com.bleelblep.pocketbrowser

import android.app.Activity
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.webkit.WebView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import kotlinx.coroutines.suspendCancellableCoroutine
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import java.io.File
import kotlin.coroutines.resume

/**
 * Background play. While the browser is in sight this does nothing at all: 0.3.0's version spoofed
 * visibility and replaced HTMLMediaElement.pause permanently, and YouTube paused itself almost
 * instantly under it (checked on device 2026-10-13: a tab without the script played normally).
 *
 * Only while the browser is out of sight (`__pocketBg`, set by native when it parks the page or
 * Discord leaves) does the page read as visible and stop hearing visibility/blur/pagehide; and
 * instead of blocking pause(), the media that was playing is started again if the page pauses it
 * (`pause` right after leaving counts too, since the flag can land a moment late). Nothing on any
 * built-in prototype is touched. Added at document start where the WebView supports it, so the
 * page's own listeners register after ours; otherwise on page start/finish.
 */
internal val STAY_VISIBLE_JS = """(function(){if(window.__pocketVisible)return;window.__pocketVisible=1;
var d=document,D=Document.prototype,bg=function(){return window.__pocketBg===true};
var wrap=function(k,v){var g=Object.getOwnPropertyDescriptor(D,k);if(!g||!g.get)return;try{Object.defineProperty(d,k,{get:function(){return bg()?v:g.get.call(d)},configurable:true})}catch(e){}};
wrap('hidden',false);wrap('visibilityState','visible');wrap('webkitHidden',false);wrap('webkitVisibilityState','visible');
var stop=function(e){if(bg())e.stopImmediatePropagation()};
['visibilitychange','webkitvisibilitychange'].forEach(function(t){d.addEventListener(t,stop,true);window.addEventListener(t,stop,true)});
['pagehide','blur','freeze'].forEach(function(t){window.addEventListener(t,stop,true)});
var again=function(){var m=window.__pocketLast;if(bg()&&m&&m.paused&&m.isConnected)m.play().catch(function(){})};
var tell=function(v){try{window.PocketMedia&&window.PocketMedia.playing(v)}catch(e){}};
d.addEventListener('play',function(e){window.__pocketLast=e.target;window.__pocketPausedAt=0;tell(true)},true);
d.addEventListener('playing',function(){tell(true)},true);
d.addEventListener('ended',function(){tell(false)},true);
d.addEventListener('pause',function(e){if(e.target!==window.__pocketLast)return;window.__pocketPausedAt=Date.now();if(bg())setTimeout(again,60);else tell(false)},true);
window.__pocketResume=function(){if(Date.now()-(window.__pocketPausedAt||0)<2000)again()};
""" + (if (DEBUG) MEDIA_LOG_JS else "") + "})();"

/** The page's media log (play/pause/stall with sizes), read back by mediaInfo. Only with [DEBUG]. */
private const val MEDIA_LOG_JS = """var hid=Object.getOwnPropertyDescriptor(D,'hidden'),L=window.__pocketLog=[],t0=Date.now();
['play','pause','waiting','stalled','playing','seeking','ended'].forEach(function(t){d.addEventListener(t,function(e){var m=e.target;if(!m||!m.tagName)return;L.push(((Date.now()-t0)/1000).toFixed(1)+' '+t+' at '+(m.currentTime||0).toFixed(1)+' realHidden='+(hid&&hid.get?hid.get.call(d):'?')+' bg='+bg()+' '+innerWidth+'x'+innerHeight);if(L.length>60)L.shift()},true)});"""

internal object Extras {
	// ---- Dark pages --------------------------------------------------------------------------

	/**
	 * Draws a light page dark: the whole page inverted (hue turned back, so colours stay roughly
	 * themselves) and pictures, video and canvases inverted again so they look normal. Pages that
	 * are already dark -- including every site that follows the system's dark mode -- are left
	 * alone: the check reads the page's real background, so it runs on every page finish.
	 *
	 * Not WebView's algorithmic darkening: that only works while the app's own theme reads as dark,
	 * and it darkens behind the page's back, so this check would then see a light page and undo it.
	 */
	const val DARK_JS = """(function(){var id='__pocketDark';var run=function(){var de=document.documentElement;if(!de||document.getElementById(id))return;
var lum=function(el){if(!el)return null;var m=getComputedStyle(el).backgroundColor.match(/rgba?\(([^)]+)\)/);if(!m)return null;var p=m[1].split(',').map(parseFloat);if(p.length>3&&p[3]<0.1)return null;return(0.299*p[0]+0.587*p[1]+0.114*p[2])/255};
var l=lum(document.body);if(l===null)l=lum(de);if(l===null)l=1;if(l<0.5)return;
var s=document.createElement('style');s.id=id;s.textContent='html{filter:invert(1) hue-rotate(180deg)!important;background:#fff!important}img,video,picture,canvas,iframe,embed,object,[style*="background-image"]{filter:invert(1) hue-rotate(180deg)!important}';
(document.head||de).appendChild(s)};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run()})();"""

	const val UNDARK_JS = """(function(){var s=document.getElementById('__pocketDark');if(s)s.remove()})();"""

	// ---- Site icons --------------------------------------------------------------------------

	fun iconDir(): File = File(Browser.dir, "icons")

	/** "example.com" from a URL, as the JS side's shortHost writes it: the icon file's name. */
	private fun iconHost(url: String): String? =
		runCatching { android.net.Uri.parse(url).host?.lowercase()?.removePrefix("www.") }.getOrNull()?.takeIf { it.isNotEmpty() }

	/** Keeps a site's icon as icons/<host>.png. */
	fun saveIcon(url: String, icon: Bitmap) {
		val host = iconHost(url) ?: return
		runCatching {
			val dir = iconDir().apply { mkdirs() }
			File(dir, "$host.png").outputStream().use { icon.compress(Bitmap.CompressFormat.PNG, 100, it) }
		}
	}

	// ---- Background play ---------------------------------------------------------------------

	private var documentStartSupported: Boolean? = null

	/**
	 * Runs [STAY_VISIBLE_JS] at document start on [web], through the plugin's own androidx.webkit
	 * (libs/). Not Discord's copy: from 352.2 R8 renames it and narrows it to RNCWebView, so reaching
	 * it by name failed quietly and the script never ran.
	 */
	fun addStartScript(web: WebView): Boolean {
		if (documentStartSupported == false) return false
		return runCatching {
			val supported = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)
			documentStartSupported = supported
			if (!supported) return false
			WebViewCompat.addDocumentStartJavaScript(web, STAY_VISIBLE_JS, setOf("*"))
			true
		}.getOrElse {
			documentStartSupported = false
			false
		}
	}

	/**
	 * Tells the page whether it's out of sight. Going out also restarts media the page paused in the
	 * moment before the flag arrived.
	 */
	fun setBackground(web: WebView?, background: Boolean) {
		val js = if (background) "window.__pocketBg=true;window.__pocketResume&&window.__pocketResume()" else "window.__pocketBg=false"
		runCatching { web?.evaluateJavascript(js, null) }
	}

	// ---- Find in page ------------------------------------------------------------------------

	var emitFound: (String) -> Unit = {}

	fun watchFind(web: WebView) {
		web.setFindListener { ordinal, count, done ->
			if (done) emitFound(JSONObject().put("current", if (count == 0) 0 else ordinal + 1).put("count", count).toString())
		}
	}

	fun find(web: WebView?, query: String) {
		if (web == null) return
		if (query.isEmpty()) web.clearMatches() else web.findAllAsync(query)
	}

	fun findNext(web: WebView?, forward: Boolean) {
		web?.findNext(forward)
	}

	// ---- Downloads ---------------------------------------------------------------------------

	private const val DOWNLOADS_FILE = "downloads.json"
	private const val MAX_DOWNLOADS = 100

	private fun downloadsFile() = File(Browser.dir, DOWNLOADS_FILE)

	private fun readDownloads(): JSONArray = runCatching { JSONArray(downloadsFile().readText()) }.getOrElse { JSONArray() }

	fun recordDownload(id: Long, name: String, url: String) {
		val list = readDownloads()
		val next = JSONArray().put(JSONObject().put("id", id).put("name", name).put("url", url).put("at", System.currentTimeMillis()))
		for (i in 0 until minOf(list.length(), MAX_DOWNLOADS - 1)) next.put(list.get(i))
		runCatching { downloadsFile().writeText(next.toString()) }
	}

	/** Every download started here, newest first, with what the download manager says about it now. */
	fun downloads(context: Context): String {
		val list = readDownloads()
		val manager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
		val out = JSONArray()
		for (i in 0 until list.length()) {
			val item = list.optJSONObject(i) ?: continue
			val id = item.optLong("id")
			var status = "gone"
			var progress = 0
			runCatching {
				manager.query(DownloadManager.Query().setFilterById(id)).use { c ->
					if (c.moveToFirst()) {
						status = when (c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))) {
							DownloadManager.STATUS_SUCCESSFUL -> "done"
							DownloadManager.STATUS_FAILED -> "failed"
							DownloadManager.STATUS_PAUSED -> "paused"
							else -> "running"
						}
						val total = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
						val so = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
						progress = if (total > 0) ((so * 100) / total).toInt() else 0
					}
				}
			}
			out.put(JSONObject(item.toString()).put("status", status).put("progress", progress))
		}
		return out.toString()
	}

	/** Opens a finished download in whatever app handles it. */
	fun openDownload(activity: Activity?, id: Long): String? {
		activity ?: return "not ready"
		val manager = activity.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
		val uri = manager.getUriForDownloadedFile(id) ?: return "That file is gone."
		return runCatching {
			val type = manager.getMimeTypeForDownloadedFile(id) ?: "*/*"
			activity.startActivity(
				Intent(Intent.ACTION_VIEW).setDataAndType(uri, type).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION),
			)
			null
		}.getOrElse { "No app here can open that file." }
	}

	/** Takes it off the list; [deleteFile] also removes the file. */
	fun removeDownload(context: Context, id: Long, deleteFile: Boolean) {
		if (deleteFile) runCatching { (context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).remove(id) }
		val list = readDownloads()
		val next = JSONArray()
		for (i in 0 until list.length()) list.optJSONObject(i)?.let { if (it.optLong("id") != id) next.put(it) }
		runCatching { downloadsFile().writeText(next.toString()) }
	}

	// ---- Share to chat -----------------------------------------------------------------------

	private const val SHOTS_DIR = "pocket-browser-shots"
	/** Older screenshots are deleted when a new one is taken: by then they've been sent or dropped. */
	private const val SHOT_TTL_MS = 10 * 60 * 1000L

	/**
	 * Screenshots the visible page into Discord's own cache (never the gallery) and returns
	 * `{ path, width, height }` as JSON for JS to attach to the message, or `{ error }`. Discord
	 * reads the file when the message is sent, so it stays a while; screenshots older than
	 * [SHOT_TTL_MS] are deleted each time, and the whole folder on every start.
	 */
	fun screenshot(activity: Activity?, web: WebView?): String {
		fun error(text: String) = JSONObject().put("error", text).toString()
		activity ?: return error("not ready")
		if (web == null || web.width <= 1 || web.height <= 1) return error("Open the page first.")
		val dir = File(activity.cacheDir, SHOTS_DIR).apply { mkdirs() }
		val now = System.currentTimeMillis()
		dir.listFiles()?.forEach { if (now - it.lastModified() > SHOT_TTL_MS) it.delete() }
		val bitmap = runCatching {
			Bitmap.createBitmap(web.width, web.height, Bitmap.Config.ARGB_8888).also { web.draw(Canvas(it)) }
		}.getOrElse { return error("Couldn't take the screenshot.") }
		val file = File(dir, "screenshot-$now.png")
		return runCatching {
			file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
			JSONObject().put("path", file.absolutePath).put("width", bitmap.width).put("height", bitmap.height).toString()
		}.getOrElse {
			file.delete()
			error("Couldn't save the screenshot.")
		}.also { bitmap.recycle() }
	}

	/** Deletes every screenshot left from earlier. */
	fun clearScreenshots(context: Context) {
		runCatching { File(context.cacheDir, SHOTS_DIR).deleteRecursively() }
	}

	// ---- The page's video, for popping out ---------------------------------------------------

	private const val MEDIA_JS = """(function(){var v=document.querySelector('video');
return JSON.stringify({href:location.href,src:v?(v.currentSrc||v.src||''):'',time:v?Math.floor(v.currentTime||0):0,poster:v&&v.poster||'',paused:v?v.paused:null,bg:window.__pocketBg===true,log:window.__pocketLog||null})})()"""

	/** The page address and its first video's source, time and poster, as JSON. */
	suspend fun mediaInfo(web: WebView?): String = suspendCancellableCoroutine { cont ->
		if (web == null) {
			cont.resume("{}")
			return@suspendCancellableCoroutine
		}
		// WebViews only take calls on the main thread; the bridge calls in from elsewhere.
		web.post {
			web.evaluateJavascript(MEDIA_JS) { raw ->
				val value = runCatching { JSONTokener(raw).nextValue() as? String }.getOrNull() ?: "{}"
				if (cont.isActive) cont.resume(value)
			}
		}
	}

	fun pauseMedia(web: WebView?) {
		runCatching { web?.evaluateJavascript("document.querySelectorAll('video,audio').forEach(function(m){try{m.pause()}catch(e){}})", null) }
	}
}
