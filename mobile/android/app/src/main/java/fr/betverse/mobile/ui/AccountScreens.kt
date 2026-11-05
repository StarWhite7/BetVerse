package fr.betverse.mobile.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import fr.betverse.app.beta.BuildConfig
import fr.betverse.mobile.*
import fr.betverse.mobile.data.*
import java.time.Duration

fun bonusCountdown(state: UiState): String? {
    val next = state.wallet?.nextClaim ?: return null
    val seconds = Duration.between(state.now, next).seconds.coerceIn(0, 86400)
    if (seconds == 0L) return null
    return "%02d:%02d:%02d".format(seconds / 3600, (seconds % 3600) / 60, seconds % 60)
}
@Composable fun HomeScreen(state: UiState, onClaim: () -> Unit, onMatches: () -> Unit) {
    val player = state.player ?: return
    val countdown = bonusCountdown(state)
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item {
            Text("Bonjour " + player.username, style = MaterialTheme.typography.headlineMedium)
            Text("Prêt pour le prochain match ?", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        item {
            ClubCard(Modifier.fillMaxWidth()) {
                Text("Votre portefeuille", style = MaterialTheme.typography.titleMedium)
                Text(state.wallet?.balance?.let(::verse) ?: "— V", style = MaterialTheme.typography.headlineLarge)
                StatLine("Shards", state.wallet?.shards?.toString() ?: "—")
                Text("Verse et Shards sont des monnaies de jeu sans valeur monétaire.",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        item {
            ClubCard(Modifier.fillMaxWidth()) {
                Text("Votre bonus quotidien", style = MaterialTheme.typography.titleMedium)
                Text(if (countdown == null) "+500 Verse disponibles" else "Prochain bonus dans " + countdown)
                Button(onClick = onClaim, enabled = !state.busy && state.wallet != null && countdown == null,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 50.dp), colors = clubButtonColors()) { Text("Récupérer mon bonus") }
            }
        }
        item {
            ClubCard(Modifier.fillMaxWidth()) {
                StatLine("Niveau " + player.level, player.xp.toString() + " XP")
                Text("Votre progression est calculée par BetVerse.", style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedButton(onClick = onMatches, enabled = !state.busy, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Voir les matchs") }
            }
        }
        item { Text("Derniers mouvements", style = MaterialTheme.typography.titleLarge) }
        if (state.history.isEmpty()) item { EmptyState("Votre historique commence ici", "Vos mises, bonus et retours apparaîtront dans cette liste.") }
        items(state.history, key = { it.id }) { entry ->
            ClubCard(Modifier.fillMaxWidth()) {
                StatLine(when (entry.reason) {
                    "BET_STAKE" -> "Mise sur un pari"
                    "BET_PAYOUT" -> "Pari gagnant"
                    "DAILY_REWARD" -> "Bonus quotidien"
                    "BET_REFUND" -> "Pari remboursé"
                    "TRANSFER" -> "Transfert"
                    "ADMIN_ADJUSTMENT" -> "Ajustement administrateur"
                    else -> "Mouvement du portefeuille"
                }, (if (entry.type == "CREDIT") "+" else "−") + verse(entry.amount))
                Text(matchDate(entry.created), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        item { Text("Les 25 derniers mouvements sont affichés.", style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}
@Composable fun TicketsScreen(state: UiState, onFilter: (String?) -> Unit, onPage: (Int) -> Unit) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Text("Mes paris", style = MaterialTheme.typography.headlineLarge) }
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(listOf(null to "Tous", "PENDING" to "En attente", "WON" to "Gagnés", "LOST" to "Perdus", "VOID" to "Remboursés")) { (status, label) ->
                    FilterChip(selected = state.ticketFilter == status, enabled = !state.busy,
                        colors = clubFilterColors(),
                        onClick = { onFilter(status) }, label = { Text(label) }, modifier = Modifier.heightIn(min = 48.dp))
                }
            }
        }
        item { Text(state.ticketTotal.toString() + " pari(s) · Page " + (state.ticketSkip / 25 + 1),
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        if (state.tickets.isEmpty()) item {
            EmptyState("Aucun pari à afficher", "Vos paris confirmés apparaîtront ici. Changez de filtre ou découvrez les matchs à venir.")
        }
        items(state.tickets, key = { it.id }) { ticket ->
            ClubCard(Modifier.fillMaxWidth()) {
                Text(when (ticket.status) {
                    "WON" -> "Gagné"
                    "LOST" -> "Perdu"
                    "VOID" -> "Remboursé"
                    else -> "En attente"
                }, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                Text(ticket.match, style = MaterialTheme.typography.titleMedium)
                if (ticket.selections.isNotEmpty()) ticket.selections.forEach { leg ->
                    Text(leg.match, style = MaterialTheme.typography.bodyMedium)
                    Text("${leg.choice.short} · ${quote(leg.odds)} · " + when (leg.status) { "WON" -> "Gagné"; "LOST" -> "Perdu"; "VOID" -> "Annulé (cote 1)"; else -> "En attente" }, style = MaterialTheme.typography.bodySmall)
                } else Text("Choix : " + when (ticket.choice) {
                    Choice.HOME -> ticket.match.substringBefore(" vs ")
                    Choice.DRAW -> "Match nul"
                    Choice.AWAY -> ticket.match.substringAfter(" vs ")
                })
                StatLine("Mise", verse(ticket.amount))
                StatLine("Cote confirmée", quote(ticket.odds))
                if (ticket.selections.any { it.status == "VOID" }) StatLine("Cote après annulation", quote(ticket.activeOdds))
                StatLine(if (ticket.status == "PENDING") "Gain potentiel, mise incluse" else "Retour crédité",
                    verse(if (ticket.status == "PENDING") potentialReturn(ticket.amount, ticket.activeOdds) else ticket.payout ?: 0), true)
                Text(matchDate(ticket.created), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("Ticket " + ticket.id.take(8), style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                OutlinedButton(onClick = { onPage(-1) }, enabled = !state.busy && state.ticketSkip > 0) { Text("Précédent") }
                OutlinedButton(onClick = { onPage(1) }, enabled = !state.busy && state.ticketSkip + 25 < state.ticketTotal) { Text("Suivant") }
            }
        }
    }
}
@Composable fun ProfileScreen(state: UiState, onTheme: (ThemePreference) -> Unit, onLogout: () -> Unit, onWeb: () -> Unit) {
    val player = state.player ?: return
    var confirmLogout by remember { mutableStateOf(false) }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { Text("Mon profil", style = MaterialTheme.typography.headlineLarge) }
        item {
            ClubCard(Modifier.fillMaxWidth()) {
                Text(player.username, style = MaterialTheme.typography.titleLarge)
                Text(player.email)
                StatLine("Niveau", player.level.toString())
                StatLine("Expérience", player.xp.toString() + " XP")
            }
        }
        item {
            ClubCard(Modifier.fillMaxWidth()) {
                Text("Apparence", style = MaterialTheme.typography.titleLarge)
                Text("Choisissez votre thème. « Système » suit les réglages du téléphone.",
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                ThemePreference.entries.forEach { preference ->
                    Row(Modifier.fillMaxWidth()) {
                        FilterChip(selected = state.theme == preference, onClick = { onTheme(preference) },
                            colors = clubFilterColors(),
                            label = { Text(preference.label) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp))
                    }
                }
            }
        }
        item {
            ClubCard(Modifier.fillMaxWidth()) {
                Text("Votre compte", style = MaterialTheme.typography.titleMedium)
                Text("La gestion complète reste disponible sur le web pendant cette première bêta native. Une connexion web distincte peut être nécessaire.",
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedButton(onClick = onWeb, modifier = Modifier.fillMaxWidth()) { Text("Ouvrir mon profil web") }
                Button(onClick = { confirmLogout = true }, enabled = !state.busy, modifier = Modifier.fillMaxWidth(),
                    colors = clubButtonColors()) { Text("Se déconnecter") }
            }
        }
        item { Text("BetVerse " + BuildConfig.VERSION_NAME + "\nAndroid natif · Kotlin et Jetpack Compose\nMonnaie virtuelle · Aucun gain en argent",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
    if (confirmLogout) AlertDialog(onDismissRequest = { if (!state.busy) confirmLogout = false },
        title = { Text("Se déconnecter ?") },
        text = { Text("Vous devrez vous reconnecter pour retrouver vos paris. Une demande de pari en attente restera vérifiable avec ce compte.") },
        confirmButton = { TextButton(onClick = { confirmLogout = false; onLogout() }, enabled = !state.busy) { Text("Se déconnecter") } },
        dismissButton = { TextButton(onClick = { confirmLogout = false }) { Text("Annuler") } })
}
@Composable fun AgencyScreen(state: UiState, onWeb: () -> Unit) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { Text("Mon agence", style = MaterialTheme.typography.headlineLarge) }
        item {
            when {
                !state.agencyLoaded -> EmptyState("Chargement de votre agence", "Actualisez si votre connexion a été interrompue.")
                state.agencyName == null -> EmptyState("Jouez aussi en équipe", "Vous ne faites pas encore partie d’une agence.")
                else -> ClubCard(Modifier.fillMaxWidth()) {
                    Text(state.agencyName, style = MaterialTheme.typography.titleLarge)
                    StatLine("Membres", state.agencyMembers.toString())
                    StatLine("Points", state.agencyPoints.toString())
                }
            }
        }
        item {
            ClubCard(Modifier.fillMaxWidth()) {
                Text("Gestion de l’agence", style = MaterialTheme.typography.titleMedium)
                Text("Création, invitations et pronostics collectifs restent accessibles dans la version web. Ces parcours seront portés ensuite en natif.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedButton(onClick = onWeb, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Ouvrir les agences sur le web") }
                Text("Une connexion web distincte peut être nécessaire.", style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
