@file:JvmName("MultiScrobblerPlugin")

package com.bleelblep.multiscrobbler

import android.content.ActivityNotFoundException
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import app.valenced.plugins.PluginScope
import app.valenced.plugins.plugin
import app.valenced.xposed.api.callJSMethod
import app.valenced.xposed.api.registerNativeMethod
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Multi Scrobbler's native half: hears the Music Bridge app.
 *
 * Android only lets an app with notification access read other apps' music players, and Discord
 * can't have that. So the Music Bridge app (apps/music-bridge) holds the access and pushes each
 * change here as a broadcast. Push, not pull: Discord can't see the app's package on Android 11+
 * (its manifest only queries a fixed list), but the app can see Discord.
 *
 * Only apps holding [SEND_PERMISSION] can reach the receiver. It's a signature permission the
 * bridge declares, so nothing else installed can feed a fake song in.
 *
 * - `bridge.current()` answers the last song heard, or null. Local only: no network, no account.
 * - `bridge.status()` answers whether the receiver is up and when the bridge last spoke.
 * - `bridge.request()` asks a running bridge to send what's playing now (best effort).
 * - `bridge.open()` opens the Music Bridge app; false if it isn't installed.
 *
 * Each song change also wakes the JS side (`bridge.changed`, registered by MusicBridgeService).
 * React Native stops JS timers while Discord is in the background, so without this a pause, seek
 * or new song only reached the status once Discord was opened again (1.3.12).
 */

private const val BRIDGE = "com.bleelblep.musicbridge"
private const val ACTION_NOW_PLAYING = "$BRIDGE.NOW_PLAYING"
private const val ACTION_REQUEST = "$BRIDGE.REQUEST"
private const val SEND_PERMISSION = "$BRIDGE.permission.SEND_NOW_PLAYING"

/** Longest a text field can be; the bridge already trims, this guards against anything odd. */
private const val MAX_TEXT = 512

private fun Intent.text(key: String) = getStringExtra(key)?.take(MAX_TEXT)?.takeIf { it.isNotBlank() }

/** Wait after a broadcast before waking JS, so a burst of changes wakes it once. */
private const val WAKE_SETTLE_MS = 300L

/**
 * A second wake this long after the last change. The status changes at most once per 15 s
 * (lib/activity.ts MIN_GAP_MS) and holds back newer changes on a JS timer, which doesn't run in
 * the background; this wake sends the held-back one.
 */
private const val WAKE_AGAIN_MS = 16_000L

/** Shared between start and stop. The bridge methods stay registered, so they read this. */
private object Bridge {
	@Volatile var context: Context? = null
	@Volatile var scope: PluginScope? = null

	private val main = Handler(Looper.getMainLooper())
	private val jobs = CoroutineScope(SupervisorJob() + Dispatchers.Default)
	private val wakeNow = Runnable { wake() }
	private val wakeAgain = Runnable { wake() }

	/** Tells JS to check the song now. Best effort: if JS isn't up, its own timer catches up. */
	private fun wake() {
		val s = scope ?: return
		if (!s.enabled || !registered || !s.bridge.isReady) return
		jobs.launch {
			withTimeoutOrNull(5_000) {
				runCatching { s.callJSMethod("${s.manifest.id}.bridge.changed") }
			}
		}
	}

	private fun scheduleWake() {
		main.removeCallbacks(wakeNow)
		main.removeCallbacks(wakeAgain)
		main.postDelayed(wakeNow, WAKE_SETTLE_MS)
		main.postDelayed(wakeAgain, WAKE_AGAIN_MS)
	}

	fun cancelWakes() {
		main.removeCallbacks(wakeNow)
		main.removeCallbacks(wakeAgain)
	}
	@Volatile var latest: Map<String, Any?>? = null
	@Volatile var heardAt = 0L
	@Volatile var registered = false
	/** Music Bridge's versionCode and name, from its last message. 0: older than 0.4.4, or not heard. */
	@Volatile var bridgeVersion = 0L
	@Volatile var bridgeVersionName: String? = null

	val receiver = object : BroadcastReceiver() {
		override fun onReceive(ctx: Context?, intent: Intent?) {
			if (intent?.action != ACTION_NOW_PLAYING) return
			val at = SystemClock.elapsedRealtime()
			heardAt = at
			bridgeVersion = intent.getLongExtra("bridgeVersion", 0L).coerceAtLeast(0L)
			bridgeVersionName = intent.text("bridgeVersionName")
			val title = intent.text("title")
			latest = if (title == null) null else mapOf(
				"title" to title,
				"artist" to intent.text("artist"),
				"album" to intent.text("album"),
				"durationMs" to intent.getLongExtra("durationMs", 0L).coerceAtLeast(0L),
				"positionMs" to intent.getLongExtra("positionMs", 0L).coerceAtLeast(0L),
				"playing" to intent.getBooleanExtra("playing", false),
				"source" to intent.text("source"),
				"sourceName" to intent.text("sourceName"),
				// elapsedRealtime, so JS can tell how stale it is and move the position on.
				"heardAt" to at,
			)
			scheduleWake()
		}
	}

	@Synchronized
	fun register() {
		val ctx = context ?: return
		if (registered) return
		val filter = IntentFilter(ACTION_NOW_PLAYING)
		try {
			if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
				ctx.registerReceiver(receiver, filter, SEND_PERMISSION, null, Context.RECEIVER_EXPORTED)
			} else {
				ctx.registerReceiver(receiver, filter, SEND_PERMISSION, null)
			}
			registered = true
		} catch (_: Throwable) {
			// Native start must not throw: without the receiver the source just reports nothing.
		}
	}

	@Synchronized
	fun unregister() {
		if (registered) {
			try {
				context?.unregisterReceiver(receiver)
			} catch (_: Throwable) {}
			registered = false
		}
		cancelWakes()
		latest = null
		heardAt = 0L
		bridgeVersion = 0L
		bridgeVersionName = null
	}

	/**
	 * Opens the bridge's main screen. An explicit component, since Discord can't look the
	 * package up on Android 11+; starting an activity doesn't need package visibility.
	 */
	fun open(): Boolean {
		val ctx = context ?: return false
		return try {
			ctx.startActivity(
				Intent(Intent.ACTION_MAIN)
					.setComponent(ComponentName(BRIDGE, "$BRIDGE.MainActivity"))
					.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
			)
			true
		} catch (_: ActivityNotFoundException) {
			false
		} catch (_: Throwable) {
			false
		}
	}

	fun request(): Boolean {
		val ctx = context ?: return false
		return try {
			// Implicit, because Discord can't address the bridge's package directly.
			ctx.sendBroadcast(Intent(ACTION_REQUEST))
			true
		} catch (_: Throwable) {
			false
		}
	}
}

val multiScrobblerPlugin = plugin {
	start {
		Bridge.scope = this
		withAppContext {
			Bridge.context = it.applicationContext ?: it
			Bridge.register()
		}

		// -> { title, artist, album, durationMs, positionMs, playing, source, sourceName, heardAt, now } or null.
		registerNativeMethod("${manifest.id}.bridge.current") { _ ->
			if (!enabled) return@registerNativeMethod null
			Bridge.register()
			val song = Bridge.latest ?: return@registerNativeMethod null
			song + ("now" to SystemClock.elapsedRealtime())
		}

		// -> { listening, heardAt, now, bridgeVersion, bridgeVersionName }. heardAt is 0 until the
		// bridge has spoken this session; bridgeVersion is 0 for a bridge older than 0.4.4.
		registerNativeMethod("${manifest.id}.bridge.status") { _ ->
			if (enabled) Bridge.register()
			mapOf(
				"listening" to Bridge.registered,
				"heardAt" to Bridge.heardAt,
				"now" to SystemClock.elapsedRealtime(),
				"bridgeVersion" to Bridge.bridgeVersion,
				"bridgeVersionName" to Bridge.bridgeVersionName,
			)
		}

		registerNativeMethod("${manifest.id}.bridge.request") { _ ->
			if (enabled) Bridge.request() else false
		}

		// -> true once the app is opening, false if it isn't installed.
		registerNativeMethod("${manifest.id}.bridge.open") { _ ->
			Bridge.open()
		}
	}

	stop {
		Bridge.unregister()
	}
}
