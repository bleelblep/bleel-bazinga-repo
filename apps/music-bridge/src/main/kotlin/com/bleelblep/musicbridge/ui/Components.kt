package com.bleelblep.musicbridge.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

// The building blocks of the app's look: cards, rows and headers.

// ── Canvas & motion ─────────────────────────────────────────────────────────

/** Soft colour blobs bleeding in from the edges. Gradients, not blur, so it looks the same on Android 10. */
@Composable
fun ExpressiveBackdrop(modifier: Modifier = Modifier) {
    val b = LocalBackdrop.current
    Box(modifier.fillMaxSize()) {
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0f to b.wash, 0.5f to Color.Transparent)))
        Box(
            Modifier.size(400.dp).align(Alignment.TopEnd).offset(x = 130.dp, y = (-160).dp)
                .background(Brush.radialGradient(listOf(b.blobA, Color.Transparent)), CircleShape),
        )
        Box(
            Modifier.size(340.dp).align(Alignment.CenterStart).offset(x = (-140).dp, y = 40.dp)
                .background(Brush.radialGradient(listOf(b.blobB, Color.Transparent)), CircleShape),
        )
        Box(
            Modifier.size(300.dp).align(Alignment.BottomEnd).offset(x = 100.dp, y = 120.dp)
                .background(Brush.radialGradient(listOf(b.blobC, Color.Transparent)), CircleShape),
        )
    }
}

/** Staggered spring entrance: fades and slides content up on first composition, delayed by [index] slots. */
@OptIn(ExperimentalMaterial3ExpressiveApi::class)
@Composable
fun StaggerAppear(index: Int, modifier: Modifier = Modifier, staggerMs: Long = 45L, content: @Composable () -> Unit) {
    if (LocalReduceMotion.current) {
        Box(modifier) { content() }
        return
    }
    var started by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        delay(index * staggerMs)
        started = true
    }
    val alpha by animateFloatAsState(if (started) 1f else 0f, MaterialTheme.motionScheme.defaultEffectsSpec(), label = "staggerAlpha")
    val offsetY by animateFloatAsState(if (started) 0f else 28f, MaterialTheme.motionScheme.defaultSpatialSpec(), label = "staggerOffset")
    Box(modifier.graphicsLayer { this.alpha = alpha; translationY = offsetY.dp.toPx() }) { content() }
}

/** Scale-down-on-press on a fast spatial spring; the release overshoots so a tap ends with a little bounce. */
@OptIn(ExperimentalMaterial3ExpressiveApi::class)
@Composable
fun Modifier.pressBounce(interactionSource: InteractionSource, pressedScale: Float = 0.95f): Modifier {
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) pressedScale else 1f, MaterialTheme.motionScheme.fastSpatialSpec(), label = "pressBounce")
    return graphicsLayer { scaleX = scale; scaleY = scale }
}

// ── Chrome ──────────────────────────────────────────────────────────────────

/** Small uppercase section label. */
@Composable
fun SectionHeader(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text.uppercase(),
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = modifier.padding(start = 6.dp, top = 22.dp, bottom = 10.dp).semantics { heading() },
    )
}

/** The shape a row takes inside a [SettingsGroup]. Null outside a group. */
val LocalRowShape = compositionLocalOf<Shape?> { null }

private val GroupOuter = 28.dp
private val GroupInner = 6.dp

private fun groupShape(index: Int, count: Int): Shape = when {
    count == 1 -> RoundedCornerShape(GroupOuter)
    index == 0 -> RoundedCornerShape(GroupOuter, GroupOuter, GroupInner, GroupInner)
    index == count - 1 -> RoundedCornerShape(GroupInner, GroupInner, GroupOuter, GroupOuter)
    else -> RoundedCornerShape(GroupInner)
}

/** Rounded tonal card with a little lift. */
@Composable
fun PopoutCard(
    modifier: Modifier = Modifier,
    color: Color = MaterialTheme.colorScheme.surfaceContainer,
    shadow: Dp = 2.dp,
    content: @Composable ColumnScope.() -> Unit,
) {
    val grouped = LocalRowShape.current
    val shape = grouped ?: MaterialTheme.shapes.large
    Surface(color = color, shape = shape, shadowElevation = if (grouped != null) 0.dp else shadow, modifier = modifier.fillMaxWidth()) {
        CompositionLocalProvider(LocalRowShape provides null) {
            Column(Modifier.padding(20.dp), content = content)
        }
    }
}

/** Screen title block: a big emphasized title over a one-line intro. */
@OptIn(ExperimentalMaterial3ExpressiveApi::class)
@Composable
fun ScreenTitle(title: String, eyebrow: String, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().padding(start = 4.dp, end = 4.dp, top = 16.dp, bottom = 20.dp)) {
        Text(
            title,
            style = MaterialTheme.typography.displayMediumEmphasized,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.semantics { heading() },
        )
        if (eyebrow.isNotEmpty()) {
            Text(eyebrow, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
        }
    }
}

/** A group of rows: one connected list, rows 2dp apart with big outer and small inner corners. */
@Composable
fun SettingsGroup(items: List<@Composable () -> Unit>) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        items.forEachIndexed { i, item ->
            CompositionLocalProvider(LocalRowShape provides groupShape(i, items.size)) { item() }
        }
    }
}

/** The leading icon box on rows; fills with primary when active. */
@OptIn(ExperimentalMaterial3ExpressiveApi::class)
@Composable
fun RowIconBox(icon: ImageVector, active: Boolean) {
    val cs = MaterialTheme.colorScheme
    val bg by animateColorAsState(if (active) cs.primary else cs.surfaceContainerHighest, MaterialTheme.motionScheme.defaultEffectsSpec(), label = "iconBg")
    val tint by animateColorAsState(if (active) cs.onPrimary else cs.primary, MaterialTheme.motionScheme.defaultEffectsSpec(), label = "iconTint")
    Box(Modifier.size(46.dp).clip(RoundedCornerShape(15.dp)).background(bg), contentAlignment = Alignment.Center) {
        Icon(icon, null, tint = tint)
    }
}

/**
 * Navigation row card: icon box, texts, a value pill and a chevron. [done] fills the icon box and
 * the pill, so a finished setup step reads at a glance.
 */
@Composable
fun NavRow(
    title: String,
    subtitle: String? = null,
    icon: ImageVector? = null,
    trailing: String? = null,
    done: Boolean = false,
    onClick: () -> Unit,
) {
    val cs = MaterialTheme.colorScheme
    val interaction = remember { MutableInteractionSource() }
    val haptic = LocalHapticFeedback.current
    val grouped = LocalRowShape.current
    Surface(
        color = cs.surfaceContainer,
        shape = grouped ?: MaterialTheme.shapes.large,
        onClick = { haptic.performHapticFeedback(HapticFeedbackType.ContextClick); onClick() },
        interactionSource = interaction,
        shadowElevation = if (grouped != null) 0.dp else 1.dp,
        modifier = Modifier.fillMaxWidth().pressBounce(interaction, 0.975f),
    ) {
        Row(Modifier.padding(horizontal = 18.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            if (icon != null) {
                RowIconBox(icon, done)
                Spacer(Modifier.width(14.dp))
            }
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleSmall)
                if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant)
            }
            Spacer(Modifier.width(10.dp))
            if (trailing != null) {
                Surface(color = if (done) cs.primaryContainer else cs.surfaceContainerHighest, shape = CircleShape) {
                    Text(
                        trailing, style = MaterialTheme.typography.labelLarge,
                        color = if (done) cs.onPrimaryContainer else cs.onSurface,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                    )
                }
                Spacer(Modifier.width(6.dp))
            }
            Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = cs.onSurfaceVariant)
        }
    }
}

@Composable
fun Hint(text: String, modifier: Modifier = Modifier) {
    Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = modifier)
}

@Composable
fun VSpace(h: Dp) = Spacer(Modifier.height(h))
