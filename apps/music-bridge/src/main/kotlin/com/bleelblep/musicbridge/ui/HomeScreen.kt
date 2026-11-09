package com.bleelblep.musicbridge.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.bleelblep.musicbridge.LauncherIcon
import com.bleelblep.musicbridge.Song

/** Everything the screen shows, read by MainActivity. */
data class HomeState(
    val accessOn: Boolean,
    val connected: Boolean,
    /** "Valenced", "Discord", or null when neither is installed. */
    val discord: String?,
    val batteryFree: Boolean,
    val song: Song?,
    /** The Apps row's summary: "All players", "All but 2", "Only 3". */
    val apps: String,
)

@OptIn(ExperimentalMaterial3ExpressiveApi::class)
@Composable
fun HomeScreen(
    state: HomeState,
    onAccess: () -> Unit,
    onDiscord: () -> Unit,
    onBattery: () -> Unit,
    onApps: () -> Unit,
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val cs = MaterialTheme.colorScheme
    val top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val bottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
        Surface(Modifier.fillMaxSize(), color = cs.surface) {}
        ExpressiveBackdrop()
        LazyColumn(
            modifier = Modifier.fillMaxSize().widthIn(max = 840.dp),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = top, bottom = bottom + 32.dp),
        ) {
            item("title") {
                StaggerAppear(0) {
                    ScreenTitle("Music Bridge", "Puts what this phone is playing on your Discord status, through Multi Scrobbler.")
                }
            }

            item("setup") {
                StaggerAppear(1) {
                    Column {
                        SectionHeader("Set up")
                        SettingsGroup(
                            listOf(
                                {
                                    NavRow(
                                        title = "Notification access",
                                        subtitle = if (state.accessOn) {
                                            if (state.connected) "On. Android lets Music Bridge see your music players"
                                            else "On. Waiting for Android to start the listener"
                                        } else "Off. Tap, then turn on Music Bridge",
                                        icon = Icons.Rounded.Notifications,
                                        trailing = if (state.accessOn) "On" else "Off",
                                        done = state.accessOn,
                                        onClick = onAccess,
                                    )
                                },
                                {
                                    NavRow(
                                        title = "Discord",
                                        subtitle = state.discord?.let { "$it found. Pick \"This phone\" in Multi Scrobbler's settings" }
                                            ?: "Valenced isn't installed on this phone",
                                        icon = Icons.AutoMirrored.Rounded.Send,
                                        trailing = if (state.discord != null) "Found" else "Missing",
                                        done = state.discord != null,
                                        onClick = onDiscord,
                                    )
                                },
                                {
                                    NavRow(
                                        title = "Apps",
                                        subtitle = "Choose which apps show on Discord",
                                        icon = Icons.Rounded.PlayArrow,
                                        trailing = state.apps,
                                        onClick = onApps,
                                    )
                                },
                                {
                                    NavRow(
                                        title = "Battery",
                                        subtitle = if (state.batteryFree) "Unrestricted, so it keeps working in the background"
                                        else "Optional. Some phones stop background apps; tap to allow it",
                                        icon = Icons.Rounded.Settings,
                                        trailing = if (state.batteryFree) "Free" else "Limited",
                                        done = state.batteryFree,
                                        onClick = onBattery,
                                    )
                                },
                            ),
                        )
                    }
                }
            }

            item("playing") {
                StaggerAppear(2) {
                    Column {
                        SectionHeader("Now playing")
                        NowPlaying(state)
                    }
                }
            }

            item("look") {
                StaggerAppear(3) {
                    Column {
                        SectionHeader("Look")
                        ChoiceCard(
                            title = "Theme",
                            icon = Icons.Rounded.Star,
                            options = listOf(
                                Look.Night.SYSTEM to "System",
                                Look.Night.LIGHT to "Light",
                                Look.Night.DARK to "Dark",
                            ),
                            selected = Look.night,
                            onSelect = { Look.setNight(context, it) },
                        )
                        VSpace(10.dp)
                        var iconShown by remember { mutableStateOf(LauncherIcon.shown(context)) }
                        SwitchRow(
                            title = "Show in app drawer",
                            subtitle = if (iconShown) "Off hides the icon; open it from Multi Scrobbler's settings"
                            else "Hidden. Your phone may keep a plain icon that opens App info",
                            checked = iconShown,
                            onCheckedChange = {
                                LauncherIcon.setShown(context, it)
                                iconShown = it
                            },
                            icon = Icons.Rounded.Home,
                        )
                        if (isDark()) {
                            VSpace(10.dp)
                            SwitchRow(
                                title = "Pure black",
                                subtitle = "True black background in dark mode",
                                checked = Look.black,
                                onCheckedChange = { Look.setBlack(context, it) },
                                icon = Icons.Rounded.Star,
                            )
                        }
                    }
                }
            }

            item("privacy") {
                StaggerAppear(4) {
                    Column {
                        SectionHeader("Privacy")
                        PopoutCard(shadow = 1.dp) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                RowIconBox(Icons.Rounded.Lock, false)
                                Spacer(Modifier.width(14.dp))
                                Hint(
                                    "Only Discord on this phone hears from Music Bridge, and only the song, artist, album and " +
                                        "which app plays it. It has no internet access and never reads your notifications.",
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun NowPlaying(state: HomeState) {
    val cs = MaterialTheme.colorScheme
    val song = state.song
    PopoutCard(color = if (song?.playing == true) cs.primaryContainer else cs.surfaceContainer) {
        if (song == null) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                RowIconBox(Icons.Rounded.PlayArrow, false)
                Spacer(Modifier.width(14.dp))
                Hint(if (state.accessOn) "Nothing playing. Start a song in any app." else "Turn on notification access first.")
            }
            return@PopoutCard
        }
        val on = if (song.playing) cs.onPrimaryContainer else cs.onSurface
        Row(verticalAlignment = Alignment.CenterVertically) {
            RowIconBox(Icons.Rounded.PlayArrow, song.playing)
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(song.title, style = MaterialTheme.typography.titleLargeEmphasized, color = on, maxLines = 2, overflow = TextOverflow.Ellipsis)
                listOfNotNull(song.artist, song.album).takeIf { it.isNotEmpty() }?.let {
                    Text(it.joinToString(" · "), style = MaterialTheme.typography.bodyMedium, color = on.copy(alpha = 0.8f), maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
        }
        VSpace(14.dp)
        Surface(color = cs.surfaceContainerHighest, shape = CircleShape) {
            Text(
                (if (song.playing) "Playing in " else "Paused in ") + (song.sourceName ?: song.source),
                style = MaterialTheme.typography.labelLarge,
                color = cs.onSurface,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
            )
        }
    }
}
