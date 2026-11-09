package com.bleelblep.musicbridge

import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.service.notification.NotificationListenerService

/** After a restart or an update, asks Android to reconnect the listener if access is on. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action
        if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        if (!Bridge.listenerEnabled(context)) return
        try {
            NotificationListenerService.requestRebind(ComponentName(context, ListenerService::class.java))
        } catch (_: Exception) {}
    }
}
