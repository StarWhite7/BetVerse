package fr.betverse.mobile.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import fr.betverse.mobile.UiState
import fr.betverse.mobile.data.*

@Composable fun MatchesScreen(
    state: UiState, onSport: (String) -> Unit, onDay: (DayFilter) -> Unit,
    onSelect: (Fixture, Choice) -> Unit
) {
    val fixtures = filterFixtures(state.fixtures, state.sport, state.day, state.now)
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Text("Matchs", style = MaterialTheme.typography.headlineLarge) }
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(listOf("football" to "Football", "tennis" to "Tennis", "basketball" to "Basket")) { (key, label) ->
                    FilterChip(selected = state.sport == key, onClick = { onSport(key) }, label = { Text(label) },
                        colors = clubFilterColors(),
                        modifier = Modifier.heightIn(min = 48.dp))
                }
            }
        }
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(DayFilter.entries) { day ->
                    FilterChip(selected = state.day == day, onClick = { onDay(day) }, label = { Text(day.label) },
                        colors = clubFilterColors(),
                        modifier = Modifier.heightIn(min = 48.dp))
                }
            }
        }
        item {
            Text("Calendrier enregistré sur BetVerse · heures locales",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (fixtures.isEmpty()) item {
            EmptyState("Aucun match sur cette période",
                "Essayez une autre date ou un autre sport. Seules les rencontres à venir enregistrées par l’administration sont proposées.")
        }
        fixtures.groupBy { it.competition }.forEach { (competition, matches) ->
            item(key = "competition:" + competition) {
                Text(competition, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp))
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
      Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                TeamName(fixture.home)
                TeamName(fixture.away)
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.systemDefault()).format(fixture.start),
                    style = MaterialTheme.typography.labelLarge)
                Text(DateTimeFormatter.ofPattern("d MMM", Locale.FRANCE).withZone(ZoneId.systemDefault()).format(fixture.start),
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Choice.entries.forEach { choice ->
                val odds = fixture.odds(choice)
                val selected = draft?.fixture?.id == fixture.id && draft.choice == choice
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
                                if (selected) Icon(Icons.Outlined.Check, null, Modifier.size(14.dp))
                            }
                            Text(odds?.let(::quote) ?: "—", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyMedium)
                        }
                    } else {
                        Row(Modifier.padding(horizontal = 8.dp, vertical = 12.dp), horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically) {
                            Text(choice.short, style = MaterialTheme.typography.labelLarge)
                            Text(odds?.let(::quote) ?: "—", fontWeight = FontWeight.Bold)
                            if (selected) Icon(Icons.Outlined.Check, null, Modifier.size(14.dp))
                        }
                    }
                }
            }
        }
      }
    }
}
@Composable private fun TeamName(name: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Surface(color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(4.dp)) {
            Text(name.filter { it.isLetterOrDigit() }.take(3).uppercase(),
                Modifier.padding(horizontal = 5.dp, vertical = 4.dp), style = MaterialTheme.typography.labelSmall)
        }
        Text(name, style = MaterialTheme.typography.titleMedium)
    }
}
