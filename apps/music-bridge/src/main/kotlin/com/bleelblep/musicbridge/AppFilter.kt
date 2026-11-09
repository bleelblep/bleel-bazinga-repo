package com.bleelblep.musicbridge

import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager

/**
 * Which players Music Bridge tells Discord about.
 *
 * Two modes, each with its own list, so switching between them never loses a choice:
 * - [Mode.ALL_EXCEPT]: every player except the ones in [blocked] (the default; nothing blocked).
 * - [Mode.ONLY]: only the players in [allowed].
 */
object AppFilter {
    enum class Mode { ALL_EXCEPT, ONLY }

    private const val PREFS = "app_filter"
    private const val MODE = "mode"
    private const val BLOCKED = "blocked"
    private const val ALLOWED = "allowed"
    private const val SEEN = "seen"
    /** Bounds the remembered players, in case something registers a session per launch. */
    private const val MAX_SEEN = 100

    fun prefs(context: Context): SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun mode(context: Context): Mode =
        if (prefs(context).getString(MODE, null) == Mode.ONLY.name) Mode.ONLY else Mode.ALL_EXCEPT

    fun setMode(context: Context, mode: Mode) = prefs(context).edit().putString(MODE, mode.name).apply()

    fun blocked(context: Context): Set<String> = prefs(context).getStringSet(BLOCKED, emptySet())!!.toSet()
    fun allowed(context: Context): Set<String> = prefs(context).getStringSet(ALLOWED, emptySet())!!.toSet()

    /** Whether [pkg] is let through in the current mode. */
    fun passes(context: Context, pkg: String): Boolean = when (mode(context)) {
        Mode.ALL_EXCEPT -> pkg !in blocked(context)
        Mode.ONLY -> pkg in allowed(context)
    }

    /** Switches [pkg] on (shown on Discord) or off, in the current mode's list. */
    fun setShown(context: Context, pkg: String, shown: Boolean) {
        val (key, set) = when (mode(context)) {
            Mode.ALL_EXCEPT -> BLOCKED to blocked(context).toMutableSet().apply { if (shown) remove(pkg) else add(pkg) }
            Mode.ONLY -> ALLOWED to allowed(context).toMutableSet().apply { if (shown) add(pkg) else remove(pkg) }
        }
        prefs(context).edit().putStringSet(key, set).apply()
    }

    /** Remembers players that had a media session, so they stay listed after they close. */
    fun remember(context: Context, packages: Collection<String>) {
        val seen = prefs(context).getStringSet(SEEN, emptySet())!!
        val fresh = packages.filter { it !in seen && it != context.packageName }
        if (fresh.isEmpty()) return
        val next = (seen + fresh).toList().takeLast(MAX_SEEN).toSet()
        prefs(context).edit().putStringSet(SEEN, next).apply()
    }

    /** An app to list: its package, label, and whether it looks like a music player. */
    data class Player(val pkg: String, val label: String, val media: Boolean)

    /**
     * Every app on the launcher, plus anything seen with a media session, minus this app and
     * Discord. Music apps (anything offering a media browser, like Spotify, YouTube Music or
     * Symfonium, or anything that has played before) come first, then the rest, each A to Z.
     * Uninstalled ones drop out.
     */
    fun players(context: Context): List<Player> {
        val pm = context.packageManager
        val browsers = pm.queryIntentServices(Intent("android.media.browse.MediaBrowserService"), 0)
            .map { it.serviceInfo.packageName }
        val seen = prefs(context).getStringSet(SEEN, emptySet())!!
        val media = (browsers + seen).toSet()
        val launcher = pm.queryIntentActivities(
            Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0,
        ).map { it.activityInfo.packageName }
        val skip = Bridge.TARGETS + context.packageName
        return (media + launcher).filter { it !in skip }.mapNotNull { pkg ->
            try {
                Player(pkg, pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString(), pkg in media)
            } catch (_: PackageManager.NameNotFoundException) {
                null
            }
        }.sortedWith(compareBy({ !it.media }, { it.label.lowercase() }))
    }
}
