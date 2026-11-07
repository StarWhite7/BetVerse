package fr.betverse.mobile.ui

import android.app.Application
import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.Density
import androidx.compose.ui.platform.LocalDensity
import fr.betverse.mobile.*
import fr.betverse.mobile.data.*
import java.io.File
import java.math.BigDecimal
import java.time.Instant
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class, qualifiers = "w411dp-h891dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ClubUiTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private val fixture = Fixture("demo", "Paris SG", "Arsenal", Instant.parse("2030-01-01T20:00:00Z"),
        "UPCOMING", "Données de démonstration", "football", BigDecimal("2.10"), BigDecimal("3.40"), BigDecimal("3.15"))
    private fun state() = UiState(booting = false,
        player = Player("demo", "alice", "alice@example.test", 1, 0),
        wallet = Wallet(1250, 100, null, Instant.parse("2030-01-01T10:00:00Z")),
        fixtures = listOf(fixture, fixture.copy(id = "inter", home = "Inter", away = "Dortmund"),
            fixture.copy(id = "lyon", home = "Lyon", away = "Porto")),
        now = Instant.parse("2030-01-01T10:00:00Z"), day = DayFilter.ALL)
    @Test fun fixtureHasAccessibleNativeSelection() {
        var choice: Choice? = null
        compose.setContent { ClubTheme(ThemePreference.LIGHT) {
            MatchesScreen(state(), {}, {}, { _, selected -> choice = selected })
        } }
        compose.onNodeWithContentDescription("Paris SG, cote 2,10").performClick()
        assertEquals(Choice.HOME, choice)
    }
    @Test @Config(qualifiers = "w320dp-h700dp-xxhdpi") fun enlargedTextKeepsOddsSelectable() {
        var selected: Choice? = null
        compose.setContent {
            CompositionLocalProvider(LocalDensity provides Density(LocalDensity.current.density, 1.5f)) {
                ClubTheme(ThemePreference.DARK) {
                    MatchesScreen(state().copy(fixtures = listOf(fixture.copy(homeOdds = BigDecimal("1000.00")))),
                        {}, {}, { _, choice -> selected = choice })
                }
            }
        }
        compose.onNodeWithContentDescription("Paris SG, cote 1000,00").performScrollTo().performClick()
        assertEquals(Choice.HOME, selected)
    }
    @Test fun confirmationShowsStakeAndPotentialReturn() {
        var confirmed = false
        compose.setContent { ClubTheme(ThemePreference.DARK) {
            BetSheet(state().copy(draft = DraftBet(fixture, Choice.HOME), showSlip = true), {}, {}, { confirmed = true })
        } }
        compose.onNodeWithText("210 V", substring = true).assertExists()
        compose.onNodeWithText("Monnaie virtuelle · Aucun gain en argent").assertExists()
        compose.onNodeWithText("Confirmer · 100 V").performClick()
        assertTrue(confirmed)
    }
    @Test fun profileEmitsThemePreference() {
        var theme: ThemePreference? = null
        compose.setContent { ClubTheme(ThemePreference.LIGHT) { ProfileScreen(state(), { theme = it }, {}, {}) } }
        compose.onNodeWithText("Sombre").performScrollTo().performClick()
        assertEquals(ThemePreference.DARK, theme)
    }
    @Test fun competitionFiltersReplaceDatesAndSelectionsCanBeToggled() {
        var current by mutableStateOf(state())
        compose.setContent { ClubTheme(ThemePreference.LIGHT) {
            MatchesScreen(current, { sport -> current=current.copy(sport=sport, competition=null) },
                { competition -> current=current.copy(competition=competition) },
                { fixture, choice -> current=current.copy(draft=toggleSelection(current.draft, fixture, choice)) })
        } }
        compose.onNodeWithText("Demain").assertDoesNotExist()
        compose.onNodeWithContentDescription("Football").assertExists()
        compose.onNodeWithContentDescription("Tennis").assertExists()
        compose.onNodeWithContentDescription("Basket").assertExists()
        compose.onNodeWithContentDescription("Paris SG, cote 2,10").performClick().assertIsSelected()
        compose.onNodeWithContentDescription("Paris SG, cote 2,10").performClick().assertIsNotSelected()
        assertNull(current.draft)
        assertEquals("PSG", clubIdentity("Paris Saint-Germain")?.initials)
        assertEquals("RCS", clubIdentity("RC Strasbourg Alsace")?.initials)
    }
    @Test fun renderLightForVisualReview() = renderForVisualReview(ThemePreference.LIGHT, "club-light")

    @Test fun renderDarkForVisualReview() = renderForVisualReview(ThemePreference.DARK, "club-dark")

    private fun renderForVisualReview(theme: ThemePreference, name: String) {
        val preview = state().copy(fixtures = listOf(
            fixture.copy(away = "Marseille", competition = "Ligue 1"),
            fixture.copy(id = "arsenal", home = "Arsenal", away = "Liverpool", competition = "Premier League")
        ))
        compose.setContent {
            ClubTheme(theme) {
                Surface(color = MaterialTheme.colorScheme.background) {
                    Column(Modifier.fillMaxSize()) {
                        Row(Modifier.fillMaxWidth().padding(16.dp)) { Brand(); Spacer(Modifier.weight(1f)); Text("1 250 V") }
                        Box(Modifier.weight(1f)) { MatchesScreen(preview, {}, {}, { _, _ -> }) }
                        NavigationBar {
                            Destination.entries.forEach { destination ->
                                NavigationBarItem(selected = destination == Destination.MATCHES, onClick = {},
                                    icon = { Icon(destinationIcon(destination), null) }, label = { Text(destination.label) })
                            }
                        }
                    }
                }
            }
        }
        compose.onNodeWithText("Paris SG").assertIsDisplayed()
        compose.onNodeWithText("Liverpool").assertIsDisplayed()
        capture(name)
    }
    private fun capture(name: String) {
        val output = File("build/reports/native-previews").apply { mkdirs() }
        compose.runOnIdle {
            val view = compose.activity.window.decorView
            val bitmap = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
            view.draw(Canvas(bitmap))
            File(output, name + ".png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
            bitmap.recycle()
        }
    }
}
