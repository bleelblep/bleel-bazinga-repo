package com.bleelblep.musicbridge

import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.service.notification.NotificationListenerService
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.unit.IntOffset
import androidx.compose.animation.togetherWith
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import com.bleelblep.musicbridge.ui.AppsScreen
import com.bleelblep.musicbridge.ui.Look
import com.bleelblep.musicbridge.ui.isDark
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import com.bleelblep.musicbridge.ui.BridgeTheme
import com.bleelblep.musicbridge.ui.HomeScreen
import com.bleelblep.musicbridge.ui.HomeState

class MainActivity : ComponentActivity() {

    /** Bumped on resume, so settings changed elsewhere (access, battery) show on return. */
    private val resumed = mutableIntStateOf(0)

    @OptIn(ExperimentalMaterial3ExpressiveApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Look.load(this)
        enableEdgeToEdge()
        setContent {
            var showApps by rememberSaveable { mutableStateOf(false) }
            val tick = resumed.intValue
            val song by ListenerService.song.collectAsState()
            val connected by ListenerService.connected.collectAsState()
            val state = remember(tick, song, connected) {
                val targets = Bridge.installedTargets(this)
                HomeState(
                    accessOn = Bridge.listenerEnabled(this),
                    connected = connected,
                    discord = when {
                        "app.valenced" in targets -> "Valenced"
                        "com.discord" in targets -> "Discord"
                        else -> null
                    },
                    batteryFree = getSystemService(PowerManager::class.java)?.isIgnoringBatteryOptimizations(packageName) == true,
                    song = song,
                    apps = appsSummary(),
                )
            }
            BridgeTheme {
                // Status and navigation bar icons follow the app's own light or dark, not the phone's.
                val dark = isDark()
                LaunchedEffect(dark) {
                    val clear = android.graphics.Color.TRANSPARENT
                    val style = if (dark) SystemBarStyle.dark(clear) else SystemBarStyle.light(clear, clear)
                    enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
                }
                BackHandler(enabled = showApps) { showApps = false }
                // Resolved here because transitionSpec is not a composable lambda.
                val spatial = MaterialTheme.motionScheme.defaultSpatialSpec<IntOffset>()
                val effects = MaterialTheme.motionScheme.defaultEffectsSpec<Float>()
                AnimatedContent(
                    targetState = showApps,
                    // A sub-screen slide on the app's springs: Apps
                    // comes in from the right over Home, which drifts a little left and fades;
                    // back reverses it, with Apps kept on top as it slides away.
                    transitionSpec = {
                        if (targetState) {
                            (slideInHorizontally(spatial) { it } + fadeIn(effects)) togetherWith
                                (slideOutHorizontally(spatial) { -it / 4 } + fadeOut(effects))
                        } else {
                            ((slideInHorizontally(spatial) { -it / 4 } + fadeIn(effects)) togetherWith
                                (slideOutHorizontally(spatial) { it } + fadeOut(effects)))
                                .apply { targetContentZIndex = -1f }
                        }
                    },
                    label = "screen",
                ) { apps ->
                    if (apps) {
                        AppsScreen(onBack = {
                            showApps = false
                            resumed.intValue++
                        })
                    } else {
                        HomeScreen(
                            state = state,
                            onAccess = ::openAccess,
                            onDiscord = ::openDiscord,
                            onBattery = ::openBattery,
                            onApps = { showApps = true },
                        )
                    }
                }
            }
        }
    }

    private fun appsSummary(): String = when (AppFilter.mode(this)) {
        AppFilter.Mode.ALL_EXCEPT -> AppFilter.blocked(this).size.let { if (it == 0) "All" else "All but $it" }
        AppFilter.Mode.ONLY -> "Only ${AppFilter.allowed(this).size}"
    }

    override fun onResume() {
        super.onResume()
        resumed.intValue++
        // Access may have just been turned on; ask Android to connect the listener now.
        if (Bridge.listenerEnabled(this)) {
            try {
                NotificationListenerService.requestRebind(ComponentName(this, ListenerService::class.java))
            } catch (_: Exception) {}
        }
    }

    private fun open(intent: Intent, fallback: Intent? = null) {
        try {
            startActivity(intent)
        } catch (_: Exception) {
            if (fallback != null) try {
                startActivity(fallback)
            } catch (_: Exception) {}
        }
    }

    private fun openAccess() {
        val list = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // Android 11+: straight to this app's switch.
            val detail = Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS)
                .putExtra(
                    Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME,
                    ComponentName(this, ListenerService::class.java).flattenToString(),
                )
            open(detail, list)
        } else {
            open(list)
        }
    }

    private fun openDiscord() {
        val target = Bridge.installedTargets(this).firstOrNull() ?: return
        packageManager.getLaunchIntentForPackage(target)?.let { open(it) }
    }

    private fun openBattery() {
        val pkg = Uri.fromParts("package", packageName, null)
        // Android 12+: the app's own battery page ("Allow background usage" / Unrestricted).
        // The action is a hidden Settings constant, so it's spelled out; Android 10 and 11 don't
        // have the page and get the battery optimisation list, then the app info page.
        val usage = Intent("android.settings.VIEW_ADVANCED_POWER_USAGE_DETAIL", pkg)
        val list = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
        val info = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) open(usage, info) else open(list, info)
    }
}
