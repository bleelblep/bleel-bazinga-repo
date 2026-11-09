package com.bleelblep.musicbridge.ui

import android.database.ContentObserver
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.MaterialExpressiveTheme
import androidx.compose.material3.MotionScheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bleelblep.musicbridge.R
import kotlin.math.abs

// The look: Material 3 Expressive with Outfit type,
// big rounded corners, a wallpaper-tinted surface ramp and a soft colour backdrop. Wallpaper colours
// need Android 12; on 10 and 11 the indigo fallback is used.

// ── Fonts ───────────────────────────────────────────────────────────────────

@OptIn(ExperimentalTextApi::class)
private fun variable(res: Int, weight: FontWeight) = Font(
    res,
    weight = weight,
    variationSettings = FontVariation.Settings(FontVariation.weight(weight.weight)),
)

private val weights = listOf(FontWeight.Light, FontWeight.Normal, FontWeight.Medium, FontWeight.SemiBold, FontWeight.Bold, FontWeight.ExtraBold, FontWeight.Black)

val Outfit = FontFamily(weights.map { variable(R.font.outfit, it) })

private val base = Typography()

@OptIn(ExperimentalMaterial3ExpressiveApi::class)
val BridgeTypography = Typography(
    displayLargeEmphasized = base.displayLargeEmphasized.copy(fontFamily = Outfit, fontWeight = FontWeight.Black, letterSpacing = (-2).sp),
    displayMediumEmphasized = base.displayMediumEmphasized.copy(fontFamily = Outfit, fontWeight = FontWeight.Black, letterSpacing = (-1.5).sp),
    displaySmallEmphasized = base.displaySmallEmphasized.copy(fontFamily = Outfit, fontWeight = FontWeight.Black, letterSpacing = (-1).sp),
    headlineLargeEmphasized = base.headlineLargeEmphasized.copy(fontFamily = Outfit, fontWeight = FontWeight.Black),
    headlineMediumEmphasized = base.headlineMediumEmphasized.copy(fontFamily = Outfit, fontWeight = FontWeight.Black),
    headlineSmallEmphasized = base.headlineSmallEmphasized.copy(fontFamily = Outfit, fontWeight = FontWeight.ExtraBold),
    titleLargeEmphasized = base.titleLargeEmphasized.copy(fontFamily = Outfit, fontWeight = FontWeight.ExtraBold),
    titleMediumEmphasized = base.titleMediumEmphasized.copy(fontFamily = Outfit, fontWeight = FontWeight.ExtraBold),
    titleSmallEmphasized = base.titleSmallEmphasized.copy(fontFamily = Outfit, fontWeight = FontWeight.Bold),
    bodyLargeEmphasized = base.bodyLargeEmphasized.copy(fontFamily = Outfit, fontWeight = FontWeight.SemiBold),
    bodyMediumEmphasized = base.bodyMediumEmphasized.copy(fontFamily = Outfit, fontWeight = FontWeight.SemiBold),
    bodySmallEmphasized = base.bodySmallEmphasized.copy(fontFamily = Outfit, fontWeight = FontWeight.SemiBold),
    labelLargeEmphasized = base.labelLargeEmphasized.copy(fontFamily = Outfit, fontWeight = FontWeight.Bold),
    labelMediumEmphasized = base.labelMediumEmphasized.copy(fontFamily = Outfit, fontWeight = FontWeight.Bold),
    labelSmallEmphasized = base.labelSmallEmphasized.copy(fontFamily = Outfit, fontWeight = FontWeight.Bold),
    displayLarge = base.displayLarge.copy(fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, letterSpacing = (-1).sp),
    displayMedium = base.displayMedium.copy(fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.5).sp),
    displaySmall = base.displaySmall.copy(fontFamily = Outfit, fontWeight = FontWeight.Bold),
    headlineLarge = base.headlineLarge.copy(fontFamily = Outfit, fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.5).sp),
    headlineMedium = base.headlineMedium.copy(fontFamily = Outfit, fontWeight = FontWeight.ExtraBold),
    headlineSmall = base.headlineSmall.copy(fontFamily = Outfit, fontWeight = FontWeight.Bold),
    titleLarge = base.titleLarge.copy(fontFamily = Outfit, fontWeight = FontWeight.Bold),
    titleMedium = base.titleMedium.copy(fontFamily = Outfit, fontWeight = FontWeight.SemiBold),
    titleSmall = base.titleSmall.copy(fontFamily = Outfit, fontWeight = FontWeight.SemiBold),
    bodyLarge = base.bodyLarge.copy(fontFamily = Outfit),
    bodyMedium = base.bodyMedium.copy(fontFamily = Outfit),
    bodySmall = base.bodySmall.copy(fontFamily = Outfit),
    labelLarge = base.labelLarge.copy(fontFamily = Outfit, fontWeight = FontWeight.SemiBold),
    labelMedium = base.labelMedium.copy(fontFamily = Outfit, fontWeight = FontWeight.SemiBold, letterSpacing = 0.4.sp),
    labelSmall = base.labelSmall.copy(fontFamily = Outfit, fontWeight = FontWeight.SemiBold, letterSpacing = 0.4.sp),
)

// ── Shapes ──────────────────────────────────────────────────────────────────

val BridgeShapes = Shapes(
    extraSmall = RoundedCornerShape(10.dp),
    small = RoundedCornerShape(14.dp),
    medium = RoundedCornerShape(20.dp),
    large = RoundedCornerShape(28.dp),
    extraLarge = RoundedCornerShape(34.dp),
)

// ── Fallback palette (no wallpaper colours: Android 10 and 11) ──────────────

private val LightFallback = lightColorScheme(
    primary = Color(0xFF3949AB), onPrimary = Color.White,
    primaryContainer = Color(0xFFD5DAFF), onPrimaryContainer = Color(0xFF0B1660),
    secondary = Color(0xFF006B54), onSecondary = Color.White,
    secondaryContainer = Color(0xFFB8F0DA), onSecondaryContainer = Color(0xFF00382A),
    tertiary = Color(0xFFB3245E), onTertiary = Color.White,
    tertiaryContainer = Color(0xFFFFB3CC), onTertiaryContainer = Color(0xFF3E0021),
    background = Color(0xFFF8F8FF), onBackground = Color(0xFF151A30),
    surface = Color(0xFFF8F8FF), onSurface = Color(0xFF151A30),
    surfaceVariant = Color(0xFFDFE1F3), onSurfaceVariant = Color(0xFF4A4F6B),
    surfaceContainerLowest = Color.White, surfaceContainerLow = Color(0xFFF0F1FC),
    surfaceContainer = Color(0xFFE6E8F7), surfaceContainerHigh = Color(0xFFDDE0F3),
    surfaceContainerHighest = Color(0xFFD3D7EE),
    outline = Color(0xFF6E7398), outlineVariant = Color(0xFFC3C7E0),
    inverseSurface = Color(0xFF151A30), inverseOnSurface = Color(0xFFEFF0FF), inversePrimary = Color(0xFFB8C3FF),
)

private val DarkFallback = darkColorScheme(
    primary = Color(0xFFB8C3FF), onPrimary = Color(0xFF13237A),
    primaryContainer = Color(0xFF2C3A99), onPrimaryContainer = Color(0xFFDFE3FF),
    secondary = Color(0xFF9CD5C0), onSecondary = Color(0xFF00382A),
    secondaryContainer = Color(0xFF0E5141), onSecondaryContainer = Color(0xFFB8F0DA),
    tertiary = Color(0xFFFFB0C9), onTertiary = Color(0xFF5E1133),
    tertiaryContainer = Color(0xFF8A1E4B), onTertiaryContainer = Color(0xFFFFD9E3),
    background = Color(0xFF0F121E), onBackground = Color(0xFFE4E6F7),
    surface = Color(0xFF0F121E), onSurface = Color(0xFFE4E6F7),
    surfaceVariant = Color(0xFF3F4460), onSurfaceVariant = Color(0xFFC3C6E2),
    surfaceContainerLowest = Color(0xFF0A0C16), surfaceContainerLow = Color(0xFF171A29),
    surfaceContainer = Color(0xFF1D2133), surfaceContainerHigh = Color(0xFF272B3F),
    surfaceContainerHighest = Color(0xFF31364B),
    outline = Color(0xFF8A8EAE), outlineVariant = Color(0xFF3F4460),
    inverseSurface = Color(0xFFE4E6F7), inverseOnSurface = Color(0xFF22263A), inversePrimary = Color(0xFF3949AB),
)

// ── Backdrop ────────────────────────────────────────────────────────────────

/** The page backdrop: a wash from the top and three edge blobs, alpha already applied. */
data class Backdrop(val wash: Color, val blobA: Color, val blobB: Color, val blobC: Color)

val LocalBackdrop = compositionLocalOf { Backdrop(Color.Transparent, Color.Transparent, Color.Transparent, Color.Transparent) }

/** Push a colour's saturation (and keep it bright enough) so a faint wash still reads as colour, not grey. */
private fun vivid(c: Color, dark: Boolean): Color {
    val hsv = FloatArray(3)
    android.graphics.Color.colorToHSV(c.toArgb(), hsv)
    val s = (hsv[1] * 1.35f).coerceIn(0.55f, 1f)
    val v = hsv[2].coerceAtLeast(if (dark) 0.7f else 0.78f)
    return hsv(hsv[0], s, v)
}

private fun backdropFrom(source: ColorScheme, dark: Boolean) = Backdrop(
    wash = vivid(source.primary, dark).copy(alpha = if (dark) 0.30f else 0.34f),
    blobA = vivid(source.primary, dark).copy(alpha = if (dark) 0.34f else 0.52f),
    blobB = vivid(source.tertiary, dark).copy(alpha = if (dark) 0.26f else 0.44f),
    blobC = vivid(source.secondary, dark).copy(alpha = if (dark) 0.26f else 0.44f),
)

// ── Motion ──────────────────────────────────────────────────────────────────

/** The expressive springs, slowed down: about half the stiffness of MotionScheme.expressive() with the same bounce. */
object BridgeMotionScheme : MotionScheme {
    override fun <T> defaultSpatialSpec(): FiniteAnimationSpec<T> = spring(dampingRatio = 0.8f, stiffness = 200f)
    override fun <T> fastSpatialSpec(): FiniteAnimationSpec<T> = spring(dampingRatio = 0.7f, stiffness = 420f)
    override fun <T> slowSpatialSpec(): FiniteAnimationSpec<T> = spring(dampingRatio = 0.85f, stiffness = 110f)
    override fun <T> defaultEffectsSpec(): FiniteAnimationSpec<T> = spring(dampingRatio = 1f, stiffness = 800f)
    override fun <T> fastEffectsSpec(): FiniteAnimationSpec<T> = spring(dampingRatio = 1f, stiffness = 1800f)
    override fun <T> slowEffectsSpec(): FiniteAnimationSpec<T> = spring(dampingRatio = 1f, stiffness = 400f)
}

/** Used when the system animation scale is 0: movement snaps, fades are short. */
object ReducedMotionScheme : MotionScheme {
    override fun <T> defaultSpatialSpec(): FiniteAnimationSpec<T> = snap()
    override fun <T> fastSpatialSpec(): FiniteAnimationSpec<T> = snap()
    override fun <T> slowSpatialSpec(): FiniteAnimationSpec<T> = snap()
    override fun <T> defaultEffectsSpec(): FiniteAnimationSpec<T> = tween(150)
    override fun <T> fastEffectsSpec(): FiniteAnimationSpec<T> = tween(100)
    override fun <T> slowEffectsSpec(): FiniteAnimationSpec<T> = tween(150)
}

val LocalReduceMotion = compositionLocalOf { false }

/** True while the system animator scale is 0, tracked live. */
@Composable
fun rememberReduceMotion(): Boolean {
    val resolver = LocalContext.current.contentResolver
    fun read() = Settings.Global.getFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    var reduce by remember { mutableStateOf(read()) }
    DisposableEffect(resolver) {
        val observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean) { reduce = read() }
        }
        resolver.registerContentObserver(Settings.Global.getUriFor(Settings.Global.ANIMATOR_DURATION_SCALE), false, observer)
        onDispose { resolver.unregisterContentObserver(observer) }
    }
    return reduce
}

// ── Colour maths ────────────────────────────────────────────────────────────

private fun hsv(h: Float, s: Float, v: Float): Color =
    Color(android.graphics.Color.HSVToColor(floatArrayOf(((h % 360f) + 360f) % 360f, s, v)))

private fun hueOf(color: Color): Float {
    val out = FloatArray(3)
    android.graphics.Color.colorToHSV(color.toArgb(), out)
    return out[0]
}

private fun hsl(h: Float, s: Float, l: Float): Color {
    val hh = ((h % 360f) + 360f) % 360f
    val c = (1f - abs(2f * l - 1f)) * s
    val x = c * (1f - abs((hh / 60f) % 2f - 1f))
    val m = l - c / 2f
    val (r1, g1, b1) = when {
        hh < 60f -> Triple(c, x, 0f)
        hh < 120f -> Triple(x, c, 0f)
        hh < 180f -> Triple(0f, c, x)
        hh < 240f -> Triple(0f, x, c)
        hh < 300f -> Triple(x, 0f, c)
        else -> Triple(c, 0f, x)
    }
    return Color(r1 + m, g1 + m, b1 + m)
}

/** Wallpaper colours come out muted; push the accents up and re-tint the surfaces from the primary hue. */
private fun ColorScheme.withDerivedAccents(dark: Boolean): ColorScheme {
    val baseHue = hueOf(primary)
    fun family(offset: Float): List<Color> {
        val h = baseHue + offset
        return if (dark) listOf(hsv(h, 0.55f, 0.82f), hsv(h, 0.35f, 0.16f), hsv(h, 0.62f, 0.30f), hsv(h, 0.45f, 0.92f))
        else listOf(hsv(h, 0.74f, 0.50f), Color.White, hsv(h, 0.42f, 0.88f), hsv(h, 0.85f, 0.26f))
    }
    val sec = family(45f)
    val ter = family(135f)
    return if (dark) copy(
        secondary = sec[0], onSecondary = sec[1], secondaryContainer = sec[2], onSecondaryContainer = sec[3],
        tertiary = ter[0], onTertiary = ter[1], tertiaryContainer = ter[2], onTertiaryContainer = ter[3],
        surfaceContainerLowest = hsl(baseHue, 0.26f, 0.06f),
        surfaceContainerLow = hsl(baseHue, 0.30f, 0.14f),
        surfaceContainer = hsl(baseHue, 0.36f, 0.19f),
        surfaceContainerHigh = hsl(baseHue, 0.40f, 0.25f),
        surfaceContainerHighest = hsl(baseHue, 0.44f, 0.31f),
    ) else copy(
        secondary = sec[0], onSecondary = sec[1], secondaryContainer = sec[2], onSecondaryContainer = sec[3],
        tertiary = ter[0], onTertiary = ter[1], tertiaryContainer = ter[2], onTertiaryContainer = ter[3],
        surfaceContainerLowest = hsl(baseHue, 0.24f, 0.98f),
        surfaceContainerLow = hsl(baseHue, 0.38f, 0.94f),
        surfaceContainer = hsl(baseHue, 0.48f, 0.90f),
        surfaceContainerHigh = hsl(baseHue, 0.52f, 0.86f),
        surfaceContainerHighest = hsl(baseHue, 0.56f, 0.82f),
    )
}

/** Pure-black night theme: background and surface go to #000, containers stay tinted so cards still read. */
private fun ColorScheme.blackened(): ColorScheme = copy(
    background = Color.Black, surface = Color.Black, surfaceContainerLowest = Color.Black,
)

/** Whether the app is dark right now: the Look setting, or the phone's when it's on System. */
@Composable
fun isDark(): Boolean = when (Look.night) {
    Look.Night.SYSTEM -> isSystemInDarkTheme()
    Look.Night.LIGHT -> false
    Look.Night.DARK -> true
}

@OptIn(ExperimentalMaterial3ExpressiveApi::class)
@Composable
fun BridgeTheme(content: @Composable () -> Unit) {
    val dark = isDark()
    val black = dark && Look.black
    val context = LocalContext.current
    val wallpaper: ColorScheme? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
    } else null
    var scheme = wallpaper?.withDerivedAccents(dark) ?: if (dark) DarkFallback else LightFallback
    if (black) scheme = scheme.blackened()
    // Pure black keeps the glow but quieter, so OLED blacks stay black.
    val backdrop = backdropFrom(wallpaper ?: scheme, dark).let {
        if (!black) it else it.copy(
            wash = it.wash.copy(alpha = it.wash.alpha * 0.55f),
            blobA = it.blobA.copy(alpha = it.blobA.alpha * 0.55f),
            blobB = it.blobB.copy(alpha = it.blobB.alpha * 0.55f),
            blobC = it.blobC.copy(alpha = it.blobC.alpha * 0.55f),
        )
    }
    val reduce = rememberReduceMotion()
    CompositionLocalProvider(LocalReduceMotion provides reduce, LocalBackdrop provides backdrop) {
        MaterialExpressiveTheme(
            colorScheme = scheme,
            motionScheme = if (reduce) ReducedMotionScheme else BridgeMotionScheme,
            typography = BridgeTypography,
            shapes = BridgeShapes,
            content = content,
        )
    }
}
