package com.bleelblep.musicbridge.ui

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/** Light, dark or the phone's choice, and pure black for dark. Saved, and read live by [BridgeTheme]. */
object Look {
    enum class Night { SYSTEM, LIGHT, DARK }

    private const val PREFS = "look"

    var night by mutableStateOf(Night.SYSTEM)
        private set
    var black by mutableStateOf(false)
        private set

    fun load(context: Context) {
        val p = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        night = runCatching { Night.valueOf(p.getString("night", null) ?: "") }.getOrDefault(Night.SYSTEM)
        black = p.getBoolean("black", false)
    }

    fun setNight(context: Context, value: Night) {
        night = value
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("night", value.name).apply()
    }

    fun setBlack(context: Context, value: Boolean) {
        black = value
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("black", value).apply()
    }
}
