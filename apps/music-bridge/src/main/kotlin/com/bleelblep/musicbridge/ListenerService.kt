package com.bleelblep.musicbridge

import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.service.notification.NotificationListenerService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Holds Android's notification access, which is what lets an app see other apps' media sessions.
 * It never reads notifications themselves.
 *
 * Event-driven, unlike upstream's companion (which re-read every session every 3 s): it listens
 * for sessions coming and going and for each player's own changes, and tells Discord when the
 * song or play state changes. While something plays it repeats itself every 30 s, so a Discord
 * that started later still hears within half a minute. Paused or idle, it's silent.
 */
class ListenerService : NotificationListenerService() {

    companion object {
        private const val SETTLE_MS = 400L
        private const val REPEAT_MS = 30_000L
        private const val MIN_ANSWER_GAP_MS = 2_000L

        private val _song = MutableStateFlow<Song?>(null)
        /** What's playing, for the app's own screen. */
        val song: StateFlow<Song?> = _song

        private val _connected = MutableStateFlow(false)
        val connected: StateFlow<Boolean> = _connected
    }

    private val main = Handler(Looper.getMainLooper())
    private var controllers: List<MediaController> = emptyList()
    private var registered = false
    private var lastSent: Song? = null
    private var sentNothing = true
    private var lastAnswer = 0L

    private val callback = object : MediaController.Callback() {
        override fun onPlaybackStateChanged(state: PlaybackState?) = settle()
        override fun onMetadataChanged(metadata: MediaMetadata?) = settle()
        override fun onSessionDestroyed() = settle()
    }

    private val sessionsChanged = MediaSessionManager.OnActiveSessionsChangedListener { list ->
        watch(list ?: emptyList())
    }

    private val publishNow = Runnable { publish(force = false) }
    private val repeat = Runnable { publish(force = true) }

    /** Multi Scrobbler asks when Discord starts, so it doesn't wait for the next repeat. */
    private val requests = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action != Bridge.ACTION_REQUEST) return
            val now = SystemClock.elapsedRealtime()
            if (now - lastAnswer < MIN_ANSWER_GAP_MS) return
            lastAnswer = now
            main.post { publish(force = true) }
        }
    }

    private fun manager() = getSystemService(MediaSessionManager::class.java)
    private fun me() = ComponentName(this, ListenerService::class.java)

    override fun onListenerConnected() {
        _connected.value = true
        AppFilter.prefs(this).registerOnSharedPreferenceChangeListener(filterChanged)
        try {
            manager()?.addOnActiveSessionsChangedListener(sessionsChanged, me(), main)
            watch(manager()?.getActiveSessions(me()) ?: emptyList())
        } catch (_: SecurityException) {
            // Access was taken away between connecting and asking.
        }
        if (!registered) {
            val filter = IntentFilter(Bridge.ACTION_REQUEST)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(requests, filter, RECEIVER_EXPORTED)
            } else {
                registerReceiver(requests, filter)
            }
            registered = true
        }
    }

    override fun onListenerDisconnected() {
        shutDown()
        // Ask to come back; Android ignores this if access was turned off.
        try {
            requestRebind(me())
        } catch (_: Exception) {}
    }

    override fun onDestroy() {
        shutDown()
        super.onDestroy()
    }

    private fun shutDown() {
        _connected.value = false
        AppFilter.prefs(this).unregisterOnSharedPreferenceChangeListener(filterChanged)
        main.removeCallbacks(publishNow)
        main.removeCallbacks(repeat)
        try {
            manager()?.removeOnActiveSessionsChangedListener(sessionsChanged)
        } catch (_: Exception) {}
        controllers.forEach { it.unregisterCallback(callback) }
        controllers = emptyList()
        if (registered) {
            try {
                unregisterReceiver(requests)
            } catch (_: Exception) {}
            registered = false
        }
        _song.value = null
        KeepAlive.stop(this)
    }

    private fun watch(list: List<MediaController>) {
        controllers.forEach { it.unregisterCallback(callback) }
        controllers = list
        list.forEach { it.registerCallback(callback, main) }
        AppFilter.remember(this, list.map { it.packageName })
        settle()
    }

    /** A change on the Apps screen re-picks the song straight away. */
    private val filterChanged = android.content.SharedPreferences.OnSharedPreferenceChangeListener { _, _ -> settle() }

    /** Players often send several changes at once (new song, then its art, then playing). */
    private fun settle() {
        main.removeCallbacks(publishNow)
        main.postDelayed(publishNow, SETTLE_MS)
    }

    private fun publish(force: Boolean) {
        main.removeCallbacks(repeat)
        val song = current()
        _song.value = song

        // Stay awake while there's a song, even paused, so pressing play is heard straight away.
        if (song != null) KeepAlive.start(this) else KeepAlive.stop(this)

        if (song == null) {
            // Forced means Multi Scrobbler asked: answer even with nothing, so it knows we're here.
            if (force || !sentNothing) {
                Bridge.send(this, null)
                sentNothing = true
                lastSent = null
            }
            return
        }
        if (force || !song.sameAs(lastSent)) {
            Bridge.send(this, song)
            lastSent = song
            sentNothing = false
        }
        if (song.playing) main.postDelayed(repeat, REPEAT_MS)
    }

    /** The playing session, or the first one with a title, among the players the Apps screen lets through. */
    private fun current(): Song? {
        val withTitle = controllers.filter {
            !it.metadata?.getString(MediaMetadata.METADATA_KEY_TITLE).isNullOrBlank() && AppFilter.passes(this, it.packageName)
        }
        val pick = withTitle.firstOrNull { it.playbackState?.state.isPlaying() } ?: withTitle.firstOrNull() ?: return null
        val meta = pick.metadata ?: return null
        val state = pick.playbackState
        return Song(
            title = meta.getString(MediaMetadata.METADATA_KEY_TITLE)?.trim() ?: return null,
            artist = (meta.getString(MediaMetadata.METADATA_KEY_ARTIST)
                ?: meta.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST)
                ?: meta.getString(MediaMetadata.METADATA_KEY_AUTHOR))?.trim()?.takeIf { it.isNotEmpty() },
            album = meta.getString(MediaMetadata.METADATA_KEY_ALBUM)?.trim()?.takeIf { it.isNotEmpty() },
            durationMs = meta.getLong(MediaMetadata.METADATA_KEY_DURATION).coerceAtLeast(0L),
            position = state?.position?.coerceAtLeast(0L) ?: 0L,
            positionAt = state?.lastPositionUpdateTime ?: 0L,
            speed = state?.playbackSpeed?.takeIf { it > 0f } ?: 1f,
            playing = state?.state.isPlaying(),
            source = pick.packageName,
            sourceName = label(pick.packageName),
        )
    }

    private fun Int?.isPlaying() = this == PlaybackState.STATE_PLAYING || this == PlaybackState.STATE_BUFFERING

    private fun label(pkg: String): String? = try {
        packageManager.getApplicationLabel(packageManager.getApplicationInfo(pkg, 0)).toString()
    } catch (_: Exception) {
        null
    }
}
