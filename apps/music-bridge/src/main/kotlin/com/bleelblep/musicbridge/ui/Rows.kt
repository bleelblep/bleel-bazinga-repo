package com.bleelblep.musicbridge.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material3.ButtonGroupDefaults
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.ToggleButton
import androidx.compose.material3.ToggleButtonDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

// More building blocks: the detail screen, switch rows and the
// connected choice.

/** A container colour and the text/icon colour that sits on it. */
data class Tone(val container: Color, val content: Color)

/** Switch row card: fills with primaryContainer and lifts when on. Haptic on toggle. */
@OptIn(ExperimentalMaterial3ExpressiveApi::class)
@Composable
fun SwitchRow(
    title: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    subtitle: String? = null,
    icon: ImageVector? = null,
    leading: (@Composable () -> Unit)? = null,
    enabled: Boolean = true,
) {
    val cs = MaterialTheme.colorScheme
    val container by animateColorAsState(if (checked) cs.primaryContainer else cs.surfaceContainer, MaterialTheme.motionScheme.defaultEffectsSpec(), label = "rowBg")
    val onContainer = if (checked) cs.onPrimaryContainer else cs.onSurface
    val lift by animateDpAsState(if (checked) 3.dp else 1.dp, MaterialTheme.motionScheme.defaultSpatialSpec(), label = "rowLift")
    val haptic = LocalHapticFeedback.current
    val interaction = remember { MutableInteractionSource() }
    val grouped = LocalRowShape.current
    val toggle: (Boolean) -> Unit = { next ->
        haptic.performHapticFeedback(if (next) HapticFeedbackType.ToggleOn else HapticFeedbackType.ToggleOff)
        onCheckedChange(next)
    }
    Surface(
        color = container, shape = grouped ?: MaterialTheme.shapes.large,
        onClick = { toggle(!checked) }, enabled = enabled, interactionSource = interaction,
        shadowElevation = if (grouped != null) 0.dp else lift,
        modifier = Modifier.fillMaxWidth().pressBounce(interaction, 0.975f).semantics { role = Role.Switch },
    ) {
        Row(Modifier.padding(horizontal = 18.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            if (leading != null) {
                leading()
                Spacer(Modifier.width(14.dp))
            } else if (icon != null) {
                RowIconBox(icon, checked)
                Spacer(Modifier.width(14.dp))
            }
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleSmall, color = onContainer, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = onContainer.copy(alpha = 0.72f))
            }
            Spacer(Modifier.width(14.dp))
            Switch(
                checked = checked,
                onCheckedChange = toggle,
                enabled = enabled,
                colors = SwitchDefaults.colors(checkedTrackColor = cs.primary),
                thumbContent = if (checked) {
                    { Icon(Icons.Rounded.Check, null, Modifier.size(SwitchDefaults.IconSize)) }
                } else null,
            )
        }
    }
}

/** Connected single-select group of toggle buttons; the selected one fills with primary. */
@OptIn(ExperimentalMaterial3ExpressiveApi::class)
@Composable
fun <T> ConnectedChoice(
    options: List<Pair<T, String>>,
    selected: T,
    onSelect: (T) -> Unit,
    modifier: Modifier = Modifier,
) {
    val cs = MaterialTheme.colorScheme
    val haptic = LocalHapticFeedback.current
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(ButtonGroupDefaults.ConnectedSpaceBetween)) {
        options.forEachIndexed { i, (value, label) ->
            ToggleButton(
                checked = value == selected,
                onCheckedChange = { haptic.performHapticFeedback(HapticFeedbackType.SegmentTick); onSelect(value) },
                modifier = Modifier.weight(1f).heightIn(min = 48.dp).semantics { role = Role.RadioButton },
                shapes = when (i) {
                    0 -> ButtonGroupDefaults.connectedLeadingButtonShapes()
                    options.lastIndex -> ButtonGroupDefaults.connectedTrailingButtonShapes()
                    else -> ButtonGroupDefaults.connectedMiddleButtonShapes()
                },
                colors = ToggleButtonDefaults.toggleButtonColors(
                    containerColor = cs.surfaceContainerHighest,
                    contentColor = cs.onSurfaceVariant,
                    checkedContainerColor = cs.primary,
                    checkedContentColor = cs.onPrimary,
                ),
            ) {
                Text(label, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

/** A titled card holding a [ConnectedChoice], used for small enum settings. */
@Composable
fun <T> ChoiceCard(title: String, icon: ImageVector, options: List<Pair<T, String>>, selected: T, onSelect: (T) -> Unit) {
    PopoutCard(shadow = 1.dp) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            RowIconBox(icon, false)
            Spacer(Modifier.width(14.dp))
            Text(title, style = MaterialTheme.typography.titleSmall)
        }
        Spacer(Modifier.height(14.dp))
        ConnectedChoice(options, selected, onSelect)
    }
}

/** Lets a lazy item ignore the list's horizontal content padding, for full-bleed blocks. */
fun Modifier.bleed(horizontal: Dp): Modifier = layout { measurable, constraints ->
    val extra = horizontal.roundToPx() * 2
    val width = constraints.maxWidth + extra
    val placeable = measurable.measure(constraints.copy(minWidth = width, maxWidth = width))
    layout(constraints.maxWidth, placeable.height) { placeable.place(-extra / 2, 0) }
}

/**
 * Every detail screen: a full-bleed tonal header with round bottom corners, a back button, a big
 * title and a one-line intro, then the screen's rows.
 */
@OptIn(ExperimentalMaterial3ExpressiveApi::class)
@Composable
fun DetailScaffold(
    title: String,
    subtitle: String?,
    onBack: () -> Unit,
    tone: Tone? = null,
    content: LazyListScope.() -> Unit,
) {
    val cs = MaterialTheme.colorScheme
    val t = tone ?: Tone(cs.primaryContainer, cs.onPrimaryContainer)
    val statusTop = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    Box(Modifier.fillMaxSize().background(cs.surface), contentAlignment = Alignment.TopCenter) {
        ExpressiveBackdrop()
        LazyColumn(
            modifier = Modifier.fillMaxSize().widthIn(max = 840.dp),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = navBottom + 32.dp),
        ) {
            item("detail_header") {
                Column(
                    Modifier
                        .bleed(16.dp)
                        .clip(RoundedCornerShape(bottomStart = 40.dp, bottomEnd = 40.dp))
                        .background(t.container)
                        .padding(start = 20.dp, end = 20.dp, top = statusTop + 12.dp, bottom = 28.dp),
                ) {
                    FilledTonalIconButton(
                        onClick = onBack,
                        shapes = IconButtonDefaults.shapes(),
                        colors = IconButtonDefaults.filledTonalIconButtonColors(containerColor = Color.White.copy(alpha = 0.55f), contentColor = t.content),
                    ) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back") }
                    Spacer(Modifier.height(36.dp))
                    Text(title, style = MaterialTheme.typography.displaySmallEmphasized, color = t.content, modifier = Modifier.semantics { heading() })
                    if (subtitle != null) {
                        Text(subtitle, style = MaterialTheme.typography.bodyLarge, color = t.content, modifier = Modifier.padding(top = 6.dp))
                    }
                }
                Spacer(Modifier.height(8.dp))
            }
            content()
        }
    }
}
