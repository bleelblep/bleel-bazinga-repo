package com.bleelblep.musicbridge

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * Keeps Music Bridge running while a player has a song loaded (0.4.4).
 *
 * A notification listener alone isn't enough: in the background Android freezes or kills the app,
 * so a pause, skip or new song (and the 30 s repeat) only went out once the app woke again. A
 * foreground service with a quiet notification stops that. It runs only while there's a song
 * (playing or paused) and stops as soon as the players have none, so idle it costs nothing.
 */
class KeepAlive : Service() {

    companion object {
        private const val CHANNEL = "keep_alive"
        private const val ID = 1

        @Volatile private var running = false

        /** Starts it if it isn't running. Android 12+ can refuse a start from the background. */
        fun start(context: Context) {
            if (running) return
            try {
                context.startForegroundService(Intent(context, KeepAlive::class.java))
                running = true
            } catch (_: Exception) {
                // ForegroundServiceStartNotAllowedException: the battery setting is restricted.
                // The listener still works; it just pauses with the app, as before 0.4.4.
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

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val manager = getSystemService(NotificationManager::class.java)
        manager?.createNotificationChannel(
            NotificationChannel(CHANNEL, "Keeps up with your music", NotificationManager.IMPORTANCE_MIN).apply {
                description = "Shown while a player has a song, so Discord hears every change."
                setShowBadge(false)
            },
        )
        val open = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = Notification.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("Sharing your music with Discord")
            .setContentIntent(open)
            .setOngoing(true)
            .setShowWhen(false)
            .build()
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
            } else {
                startForeground(ID, notification)
            }
        } catch (_: Exception) {
            running = false
            stopSelf()
            return START_NOT_STICKY
        }
        running = true
        // Not sticky: the listener restarts it when there's a song again.
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        running = false
        super.onDestroy()
    }
}
