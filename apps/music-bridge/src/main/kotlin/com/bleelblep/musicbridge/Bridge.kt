package com.bleelblep.musicbridge

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Settings

/**
 * What Music Bridge says to Discord, and to whom. Multi Scrobbler's native half
 * (plugins/multi-scrobbler/src/main) holds the other end; keep the two in step.
 */
object Bridge {
    const val ACTION_NOW_PLAYING = "com.bleelblep.musicbridge.NOW_PLAYING"
    const val ACTION_REQUEST = "com.bleelblep.musicbridge.REQUEST"
    const val SEND_PERMISSION = "com.bleelblep.musicbridge.permission.SEND_NOW_PLAYING"

    /** Valenced first; plain Discord in case a build keeps its package name. */
    val TARGETS = listOf("app.valenced", "com.discord")

    /** Longest text sent; titles longer than this are someone's bug. */
    private const val MAX_TEXT = 256

    fun installedTargets(context: Context): List<String> = TARGETS.filter {
        try {
            context.packageManager.getPackageInfo(it, 0)
            true
        } catch (_: PackageManager.NameNotFoundException) {
            false
        }
    }

    fun listenerEnabled(context: Context): Boolean {
        val enabled = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners") ?: return false
        val mine = ComponentName(context, ListenerService::class.java)
        return enabled.split(':').any { ComponentName.unflattenFromString(it) == mine }
    }

    private var cachedVersion: Pair<Long, String>? = null

    /** This app's versionCode and versionName. */
    private fun version(context: Context): Pair<Long, String>? = cachedVersion ?: try {
        val info = context.packageManager.getPackageInfo(context.packageName, 0)
        (info.longVersionCode to (info.versionName ?: "")).also { cachedVersion = it }
    } catch (_: Exception) {
        null
    }

    /** Sends [song] (null: nothing playing) to each Discord install, and nowhere else. */
    fun send(context: Context, song: Song?) {
        for (target in installedTargets(context)) {
            // Foreground queue: background broadcasts can wait in line for a long time.
            val intent = Intent(ACTION_NOW_PLAYING).setPackage(target).addFlags(Intent.FLAG_RECEIVER_FOREGROUND)
            // Since 0.4.4, so Multi Scrobbler can say when there's a newer Music Bridge.
            // Discord can't look this app up itself (package visibility).
            version(context)?.let { (code, name) ->
                intent.putExtra("bridgeVersion", code)
                intent.putExtra("bridgeVersionName", name)
            }
            if (song != null) {
                intent.putExtra("title", song.title.take(MAX_TEXT))
                intent.putExtra("artist", song.artist?.take(MAX_TEXT))
                intent.putExtra("album", song.album?.take(MAX_TEXT))
                intent.putExtra("durationMs", song.durationMs)
                intent.putExtra("positionMs", song.positionMs())
                intent.putExtra("playing", song.playing)
                intent.putExtra("source", song.source)
                intent.putExtra("sourceName", song.sourceName?.take(MAX_TEXT))
            }
            try {
                context.sendBroadcast(intent)
            } catch (_: Exception) {
                // Discord not running is normal: it hears the next change, or the 30 s repeat.
            }
        }
    }
}

/** One song as a player reports it. */
data class Song(
    val title: String,
    val artist: String?,
    val album: String?,
    val durationMs: Long,
    /** The player's position at [positionAt] (elapsedRealtime). */
    val position: Long,
    val positionAt: Long,
    val speed: Float,
    val playing: Boolean,
    val source: String,
    val sourceName: String?,
) {
    /** Where the song is now, moved on from the player's last report while it plays. */
    fun positionMs(now: Long = android.os.SystemClock.elapsedRealtime()): Long {
        val moved = if (playing && positionAt > 0) ((now - positionAt) * speed).toLong() else 0L
        val at = (position + moved).coerceAtLeast(0L)
        return if (durationMs > 0) at.coerceAtMost(durationMs) else at
    }

    /** The same song in the same state, so there's nothing new to tell Discord. */
    fun sameAs(other: Song?): Boolean =
        other != null && title == other.title && artist == other.artist && album == other.album &&
            playing == other.playing && source == other.source &&
            kotlin.math.abs(positionMs() - other.positionMs()) < 3_000
}
