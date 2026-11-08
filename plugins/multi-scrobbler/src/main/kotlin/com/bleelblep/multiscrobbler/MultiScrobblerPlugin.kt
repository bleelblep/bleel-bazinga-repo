@file:JvmName("MultiScrobblerPlugin")

package com.bleelblep.multiscrobbler

import android.content.ActivityNotFoundException
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.SystemClock
import app.valenced.plugins.plugin
import app.valenced.xposed.api.registerNativeMethod

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
 */

private const val BRIDGE = "com.bleelblep.musicbridge"
private const val ACTION_NOW_PLAYING = "$BRIDGE.NOW_PLAYING"
private const val ACTION_REQUEST = "$BRIDGE.REQUEST"
private const val SEND_PERMISSION = "$BRIDGE.permission.SEND_NOW_PLAYING"

/** Longest a text field can be; the bridge already trims, this guards against anything odd. */
private const val MAX_TEXT = 512

private fun Intent.text(key: String) = getStringExtra(key)?.take(MAX_TEXT)?.takeIf { it.isNotBlank() }

/** Shared between start and stop. The bridge methods stay registered, so they read this. */
private object Bridge {
	@Volatile var context: Context? = null
	@Volatile var latest: Map<String, Any?>? = null
	@Volatile var heardAt = 0L
	@Volatile var registered = false

	val receiver = object : BroadcastReceiver() {
		override fun onReceive(ctx: Context?, intent: Intent?) {
			if (intent?.action != ACTION_NOW_PLAYING) return
			val at = SystemClock.elapsedRealtime()
			heardAt = at
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
		latest = null
		heardAt = 0L
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

		// -> { listening, heardAt, now }. heardAt is 0 until the bridge has spoken this session.
		registerNativeMethod("${manifest.id}.bridge.status") { _ ->
			if (enabled) Bridge.register()
			mapOf("listening" to Bridge.registered, "heardAt" to Bridge.heardAt, "now" to SystemClock.elapsedRealtime())
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
