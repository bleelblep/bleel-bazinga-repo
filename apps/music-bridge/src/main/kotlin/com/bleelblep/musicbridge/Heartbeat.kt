package com.bleelblep.musicbridge

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Music Bridge's safety net while a player has a song loaded.
 *
 * ListenerService arms an alarm for this every time it publishes (about every 30 s while
 * playing), so it only ever fires when publishing stopped: the process was frozen or killed
 * (some phones do that in the background no matter what), or the listener was disconnected.
 * Alarms survive the app's death, so this also runs in a process Android has already reaped,
 * which is what brings the bridge back on such phones. Nothing shows in the shade for it.
 *
 * If it doesn't fire, nothing was wrong: every publish re-arms it further out.
 */
class Heartbeat : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        ListenerService.heartbeat(context)
    }
}
