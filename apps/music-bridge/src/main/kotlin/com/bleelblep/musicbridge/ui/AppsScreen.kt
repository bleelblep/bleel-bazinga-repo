package com.bleelblep.musicbridge.ui

import android.content.Context
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.graphics.drawable.toBitmap
import com.bleelblep.musicbridge.AppFilter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** The Apps screen: which players reach Discord. */
@Composable
fun AppsScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    // Bumped on every change, so the rows re-read the saved choice.
    var revision by remember { mutableIntStateOf(0) }
    val mode = remember(revision) { AppFilter.mode(context) }
    val players by produceState<List<AppFilter.Player>?>(null) {
        value = withContext(Dispatchers.IO) { AppFilter.players(context) }
    }

    DetailScaffold(
        title = "Apps",
        subtitle = "Choose which apps on this phone Music Bridge reads songs from. Music apps are listed first.",
        onBack = onBack,
    ) {
        item("mode") {
            Column {
                SectionHeader("Show")
                ChoiceCard(
                    title = "Which players",
                    icon = Icons.Rounded.PlayArrow,
                    options = listOf(
                        AppFilter.Mode.ALL_EXCEPT to "All except…",
                        AppFilter.Mode.ONLY to "Only these",
                    ),
                    selected = mode,
                    onSelect = {
                        AppFilter.setMode(context, it)
                        revision++
                    },
                )
                VSpace(10.dp)
                Hint(
                    if (mode == AppFilter.Mode.ALL_EXCEPT) "Songs from every player show, except the ones you switch off below. While a switched-off app plays, Discord shows another app's song, or nothing."
                    else "Only songs from the players you switch on below show. New players stay hidden until you add them.",
                    Modifier.padding(horizontal = 6.dp),
                )
            }
        }

        val list = players
        when {
            list == null -> item("loading") {
                Hint("Finding your apps…", Modifier.padding(horizontal = 6.dp))
            }
            list.isEmpty() -> item("empty") {
                PopoutCard(shadow = 1.dp) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        RowIconBox(Icons.Rounded.Info, false)
                        Spacer(Modifier.width(14.dp))
                        Hint("No apps found yet. Play something in any app and it appears here.")
                    }
                }
            }
            else -> {
                val (media, other) = list.partition { it.media }
                // Music apps first; everything else below, in case a player isn't recognised.
                listOf("media" to media, "other" to other).forEach { (key, apps) ->
                    if (apps.isEmpty()) return@forEach
                    item(key) {
                        Column {
                            SectionHeader(if (key == "media") "Music apps" else "Other apps")
                            SettingsGroup(apps.map { player -> { PlayerRow(context, player, revision) { revision++ } } })
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PlayerRow(context: Context, player: AppFilter.Player, revision: Int, onChange: () -> Unit) {
    val shown = remember(revision, player.pkg) { AppFilter.passes(context, player.pkg) }
    SwitchRow(
        title = player.label,
        subtitle = if (shown) "Shows on Discord" else "Hidden",
        checked = shown,
        onCheckedChange = {
            AppFilter.setShown(context, player.pkg, it)
            onChange()
        },
        leading = { AppIcon(context, player.pkg) },
    )
}

@Composable
private fun AppIcon(context: Context, pkg: String) {
    val icon by produceState<ImageBitmap?>(null, pkg) {
        value = withContext(Dispatchers.IO) {
            runCatching { context.packageManager.getApplicationIcon(pkg).toBitmap(96, 96).asImageBitmap() }.getOrNull()
        }
    }
    val bitmap = icon
    if (bitmap != null) {
        Image(bitmap, contentDescription = null, modifier = Modifier.size(46.dp).clip(RoundedCornerShape(15.dp)))
    } else {
        RowIconBox(Icons.Rounded.PlayArrow, false)
    }
}
