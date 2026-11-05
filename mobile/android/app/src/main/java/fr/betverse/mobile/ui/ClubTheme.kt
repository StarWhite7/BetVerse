package fr.betverse.mobile.ui

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import fr.betverse.mobile.ThemePreference

private val Light = lightColorScheme(
    primary = Color(0xFF2458E8), onPrimary = Color.White,
    primaryContainer = Color(0xFFE5ECFF), onPrimaryContainer = Color(0xFF142234),
    secondary = Color(0xFF2458E8), onSecondary = Color.White,
    secondaryContainer = Color(0xFFE5ECFF), onSecondaryContainer = Color(0xFF142234),
    background = Color(0xFFF5F3ED), onBackground = Color(0xFF142234),
    surface = Color.White, onSurface = Color(0xFF142234),
    surfaceVariant = Color(0xFFEBEFF7), onSurfaceVariant = Color(0xFF4E5D70),
    outline = Color(0xFF7A8594), outlineVariant = Color(0xFFCDD2DA),
    surfaceContainer = Color.White,
    error = Color(0xFFAD2424), onError = Color.White,
    errorContainer = Color(0xFFFFE9E7), onErrorContainer = Color(0xFF781E1E)
)
private val Dark = darkColorScheme(
    primary = Color(0xFF86AAFF), onPrimary = Color(0xFF101722),
    primaryContainer = Color(0xFF263E67), onPrimaryContainer = Color(0xFFF3F6FC),
    secondary = Color(0xFF86AAFF), onSecondary = Color(0xFF101722),
    secondaryContainer = Color(0xFF263E67), onSecondaryContainer = Color(0xFFF3F6FC),
    background = Color(0xFF101722), onBackground = Color(0xFFF3F6FC),
    surface = Color(0xFF192331), onSurface = Color(0xFFF3F6FC),
    surfaceVariant = Color(0xFF222F41), onSurfaceVariant = Color(0xFFB4C0D0),
    outline = Color(0xFF8291A6), outlineVariant = Color(0xFF35445A),
    surfaceContainer = Color(0xFF192331),
    error = Color(0xFFFFB4AB), onError = Color(0xFF680F12),
    errorContainer = Color(0xFF541C20), onErrorContainer = Color(0xFFFFDAD6)
)
val ClubCobalt = Color(0xFF2458E8)
val ClubTypography = Typography(
    headlineLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 30.sp, lineHeight = 36.sp),
    headlineMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 25.sp, lineHeight = 32.sp),
    titleLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 21.sp, lineHeight = 28.sp),
    titleMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, lineHeight = 22.sp),
    bodyLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 14.sp, lineHeight = 20.sp),
    labelLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 20.sp)
)
@Composable fun ClubTheme(preference: ThemePreference, content: @Composable () -> Unit) {
    val dark = when (preference) {
        ThemePreference.SYSTEM -> isSystemInDarkTheme()
        ThemePreference.DARK -> true
        ThemePreference.LIGHT -> false
    }
    val view = LocalView.current
    if (!view.isInEditMode) SideEffect {
        (view.context as? Activity)?.window?.let { window ->
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = !dark
                isAppearanceLightNavigationBars = !dark
            }
        }
    }
    MaterialTheme(colorScheme = if (dark) Dark else Light, typography = ClubTypography,
        shapes = Shapes(small = RoundedCornerShape(8.dp), medium = RoundedCornerShape(12.dp), large = RoundedCornerShape(16.dp)),
        content = content)
}
@Composable fun clubButtonColors() = ButtonDefaults.buttonColors(containerColor = ClubCobalt, contentColor = Color.White)
@Composable fun clubFilterColors() = FilterChipDefaults.filterChipColors(
    selectedContainerColor = ClubCobalt, selectedLabelColor = Color.White,
    selectedLeadingIconColor = Color.White)
