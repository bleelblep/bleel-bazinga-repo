package com.bleelblep.musicbridge

import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.IBinder
import android.os.Looper

/**
 * Keeps Music Bridge out of Android's cached state while a player has a song loaded, so its
 * media-session callbacks keep arriving in the background.
 *
 * Deliberately not a foreground service: a foreground service must post a notification, and that
 * entry in the shade is unwanted. It is an ordinary started service instead, which Android gives
 * the service oom_adj rank for (the app is no longer "cached", so it isn't frozen and pauses,
 * skips and new songs are still seen straight away). No wakelock, no CPU cost of its own.
 *
 * Android can refuse to start any service from the background, and a phone with aggressive
 * power management (Huawei and friends) can still kill the app, so this is only the first line:
 * the heartbeat alarm (Heartbeat) starts it again and republishes what's playing even when this
 * never managed to run.
 */
class KeepAlive : Service() {

    companion object {
        /** How long a start gets to prove there's a song worth staying up for. */
        private const val CHECK_MS = 10_000L

        @Volatile private var running = false

        /** Starts it if it isn't running. Starting from the background can be refused. */
        fun start(context: Context) {
            if (running) return
            try {
                context.startService(Intent(context, KeepAlive::class.java))
                running = true
            } catch (_: Exception) {
                // IllegalStateException: Android won't start a service from the background here.
                // The heartbeat alarm tries again in a moment; nothing is shown either way.
            }
        }

        fun stop(context: Context) {
            if (!running) return
            running = false
            try {
                context.stopService(Intent(context, KeepAlive::class.java))
            } catch (_: Exception) {}
        }
    }

    private val main = Handler(Looper.getMainLooper())

    /** Started with no song in sight (a system restart, or a stale heartbeat): leave again. */
    private val giveUp = Runnable { if (ListenerService.song.value == null) stopSelf() }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        running = true
        main.removeCallbacks(giveUp)
        main.postDelayed(giveUp, CHECK_MS)
        // Sticky: if the system reaps the process while a song is loaded, it starts this again
        // as soon as it can, which puts the app back above the cached state.
        return START_STICKY
    }

    override fun onDestroy() {
        running = false
        main.removeCallbacks(giveUp)
        super.onDestroy()
    }
}
