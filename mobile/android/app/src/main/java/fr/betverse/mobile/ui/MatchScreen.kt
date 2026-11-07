package fr.betverse.mobile.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import fr.betverse.mobile.UiState
import fr.betverse.app.beta.R
import fr.betverse.mobile.data.*

@Composable fun MatchesScreen(
    state: UiState, onSport: (String) -> Unit, onCompetition: (String?) -> Unit,
    onSelect: (Fixture, Choice) -> Unit
) {
    val available = state.fixtures.filter { it.sport == state.sport && it.available(state.now) }.sortedBy { it.start }
    val competitions = available.map { it.competition }.distinct()
    val selectedCompetition = state.competition?.takeIf { it in competitions }
    val fixtures = available.filter { selectedCompetition == null || it.competition == selectedCompetition }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Text("Matchs", style = MaterialTheme.typography.headlineLarge) }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                for ((key, label, icon) in sportFilters) {
                    FilterChip(
                        selected = state.sport == key,
                        onClick = { onSport(key) },
                        label = {
                            Image(painterResource(icon), contentDescription = null, modifier = Modifier.size(28.dp))
                        },
                        colors = clubFilterColors(),
                        modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = label },
                    )
                }
            }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Choisir une compétition", style = MaterialTheme.typography.labelLarge)
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    item { FilterChip(selected = selectedCompetition == null, onClick = { onCompetition(null) }, label = { Text("Toutes") }, colors = clubFilterColors(), modifier = Modifier.heightIn(min = 48.dp)) }
                    items(competitions) { competition ->
                        FilterChip(selected = selectedCompetition == competition, onClick = { onCompetition(competition) }, label = { Text(competition) },
                            colors = clubFilterColors(),
                            modifier = Modifier.heightIn(min = 48.dp))
                    }
                }
            }
        }
        item {
            Text("Calendrier enregistré sur BetVerse · heures locales",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (fixtures.isEmpty()) item {
            EmptyState("Aucun match disponible",
                "Essayez un autre sport ou une autre compétition. Seules les rencontres à venir enregistrées par l’administration sont proposées.")
        }
        fixtures.groupBy { it.competition }.forEach { (competition, matches) ->
            if (competitionArtwork(matches.first()) == null) {
                item(key = "competition:" + competition) {
                    Text(competition, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp))
                }
            }
            items(matches, key = { it.id }) { fixture ->
                FixtureCard(fixture, state.draft, !state.busy && fixture.available(state.now), onSelect)
            }
        }
        item { Text("Pronostics en monnaie virtuelle · Aucun gain en argent",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}
@Composable fun FixtureCard(fixture: Fixture, draft: DraftBet?, enabled: Boolean, onSelect: (Fixture, Choice) -> Unit) {
    Surface(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
      Column {
        CompetitionBanner(fixture)
        Row(
            Modifier.fillMaxWidth().padding(start = 12.dp, top = 12.dp, end = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                TeamName(fixture.home, showBadge = fixture.sport == "football")
                TeamName(fixture.away, showBadge = fixture.sport == "football")
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.systemDefault()).format(fixture.start),
                    style = MaterialTheme.typography.labelLarge)
                Text(DateTimeFormatter.ofPattern("d MMM", Locale.FRANCE).withZone(ZoneId.systemDefault()).format(fixture.start),
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Row(
            Modifier.padding(start = 12.dp, top = 10.dp, end = 12.dp, bottom = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Choice.entries.forEach { choice ->
                val odds = fixture.odds(choice)
                val selected = draft?.selections?.any { it.fixture.id == fixture.id && it.choice == choice } == true
                Surface(Modifier.weight(1f).heightIn(min = 54.dp)
                    .selectable(selected = selected, enabled = enabled && odds != null, role = Role.Button,
                        onClick = { onSelect(fixture, choice) })
                    .semantics { contentDescription = fixture.label(choice) + ", cote " + (odds?.let(::quote) ?: "indisponible") },
                    shape = RoundedCornerShape(8.dp),
                    color = if (selected) ClubCobalt else MaterialTheme.colorScheme.surfaceVariant,
                    contentColor = if (selected) Color.White else MaterialTheme.colorScheme.onSurface,
                    border = if (selected) null else BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                    if (LocalDensity.current.fontScale > 1.2f || (odds?.let(::quote)?.length ?: 0) > 5) {
                        Column(Modifier.padding(8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text(choice.short, style = MaterialTheme.typography.labelSmall)
                            }
                            Text(odds?.let(::quote) ?: "—", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyMedium)
                        }
                    } else {
                        Row(Modifier.padding(horizontal = 8.dp, vertical = 12.dp), horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically) {
                            Text(choice.short, style = MaterialTheme.typography.labelLarge)
                            Text(odds?.let(::quote) ?: "—", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
      }
    }
}

private data class Banner(
    val artwork: Int,
    val background: Color,
    val foreground: Color = Color(0xFFF3F6FC)
)

private fun competitionArtwork(fixture: Fixture): Banner? {
    if (fixture.sport != "football") return null
    return when (fixture.competition.trim().lowercase()) {
        "ligue 1", "france" -> Banner(R.drawable.ligue_1, Color(0xFF12327E))
        "premier league", "epl" -> Banner(R.drawable.premier_league, Color(0xFF3C164B))
        "la liga", "laliga", "spain" -> Banner(R.drawable.la_liga, Color(0xFF792919))
        "serie a", "italy" -> Banner(R.drawable.serie_a, Color(0xFFF4E5C4), Color(0xFF142137))
        "bundesliga", "germany" -> Banner(R.drawable.bundesliga, Color(0xFF591719))
        else -> null
    }
}

@Composable private fun CompetitionBanner(fixture: Fixture) {
    val banner = competitionArtwork(fixture) ?: return
    Box(
        Modifier.fillMaxWidth().heightIn(min = 40.dp).background(banner.background),
        contentAlignment = Alignment.CenterStart
    ) {
        Box(Modifier.matchParentSize().clipToBounds()) {
            Image(
                painter = painterResource(banner.artwork),
                contentDescription = null,
                modifier = Modifier.align(Alignment.CenterEnd).fillMaxWidth(.65f).fillMaxHeight(),
                contentScale = ContentScale.Crop,
                alignment = Alignment.CenterEnd
            )
            Box(Modifier.matchParentSize().background(Brush.horizontalGradient(
                .45f to banner.background, .70f to banner.background.copy(alpha = 0f)
            )))
        }
        Text(
            fixture.competition.trim(),
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold,
            color = banner.foreground
        )
    }
}

@Composable private fun TeamName(name: String, showBadge: Boolean) {
    val assets = LocalContext.current.assets
    val badge = remember(assets, name, showBadge) {
        if (showBadge) ClubBadgeArtwork.image(assets, name) else null
    }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        if (badge != null) {
            Image(badge, contentDescription = null, modifier = Modifier.size(width = 44.dp, height = 29.dp))
        } else {
            Box(Modifier.width(44.dp), contentAlignment = Alignment.CenterStart) {
                ClubInitials(name)
            }
        }
        Text(name, style = MaterialTheme.typography.titleMedium)
    }
}

@Composable private fun ClubInitials(name: String) {
    val club = clubIdentity(name)
    Surface(color = club?.secondary ?: MaterialTheme.colorScheme.surfaceVariant,
        contentColor = club?.primary ?: MaterialTheme.colorScheme.onSurfaceVariant, shape = RoundedCornerShape(4.dp)) {
        val text = club?.initials ?: name.filter { it.isLetterOrDigit() }.take(3).uppercase()
        val primary = club?.primary ?: MaterialTheme.colorScheme.onSurfaceVariant
        val secondary = club?.secondary ?: MaterialTheme.colorScheme.surfaceVariant
        val contrast = (maxOf(primary.luminance(), secondary.luminance()) + .05f) / (minOf(primary.luminance(), secondary.luminance()) + .05f)
        Box(Modifier.padding(horizontal=5.dp, vertical=4.dp)) {
            if (contrast < 4.5f) Text(text, color=if (primary.luminance() < .4f) Color.White else Color.Black,
                style=MaterialTheme.typography.labelSmall.copy(drawStyle=Stroke(width=2f)), fontWeight=FontWeight.Bold)
            Text(text, color=primary, style=MaterialTheme.typography.labelSmall, fontWeight=FontWeight.Bold)
        }
    }
}

private val sportFilters = listOf(
    Triple("football", "Football", R.drawable.sport_football),
    Triple("tennis", "Tennis", R.drawable.sport_tennis),
    Triple("basketball", "Basket", R.drawable.sport_basketball),
)
