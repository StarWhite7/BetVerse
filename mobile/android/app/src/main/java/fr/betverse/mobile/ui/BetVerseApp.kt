package fr.betverse.mobile.ui

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import fr.betverse.app.beta.BuildConfig
import fr.betverse.mobile.*

@Composable fun BetVerseApp(state: UiState, model: AppViewModel) {
    val context = LocalContext.current
    val openWeb: (String) -> Unit = { path ->
        // Fixed first-party paths only; never forward session cookies or tokens into a browser URL.
        runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(BuildConfig.API_ORIGIN + path))) }
    }
    ClubTheme(state.theme) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            when {
                state.booting -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(24.dp)) {
                        Brand()
                        CircularProgressIndicator()
                        Text("Vérification de votre session…")
                    }
                }
                state.player == null -> AuthScreen(state, model)
                else -> {
                    BackHandler(enabled = state.destination != Destination.HOME && !state.showSlip && !state.busy) {
                        model.navigate(Destination.HOME)
                    }
                    Scaffold(containerColor = MaterialTheme.colorScheme.background,
                        topBar = {
                            Surface(color = MaterialTheme.colorScheme.surface) {
                                Row(Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 16.dp, vertical = 8.dp),
                                    verticalAlignment = Alignment.CenterVertically) {
                                    Brand(Modifier.weight(1f))
                                    Text(state.wallet?.balance?.let(::verse) ?: "— V", fontWeight = FontWeight.Bold)
                                    IconButton(onClick = model::refresh, enabled = !state.busy) {
                                        Icon(Icons.Outlined.Refresh, "Actualiser les données BetVerse")
                                    }
                                }
                            }
                        },
                        bottomBar = {
                            Column {
                                if (state.draft != null && state.pending == null && state.destination == Destination.MATCHES) {
                                    Surface(color = MaterialTheme.colorScheme.surfaceVariant) {
                                        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
                                            verticalAlignment = Alignment.CenterVertically) {
                                            IconButton(onClick = model::clearDraft, enabled = !state.busy) {
                                                Icon(Icons.Outlined.Close, "Retirer la sélection")
                                            }
                                            Column(Modifier.weight(1f)) {
                                                Text(if (state.draft.selections.size > 1) "Combiné · ${state.draft.selections.size} sélections" else state.draft.fixture.label(state.draft.choice), style = MaterialTheme.typography.labelLarge)
                                                Text("Cote " + quote(state.draft.quote), style = MaterialTheme.typography.bodySmall)
                                            }
                                            Button(onClick = model::showSlip, enabled = !state.busy, colors = clubButtonColors()) { Text("Mon pari") }
                                        }
                                    }
                                }
                                NavigationBar(containerColor = MaterialTheme.colorScheme.surface, tonalElevation = 0.dp) {
                                    Destination.entries.forEach { target ->
                                        NavigationBarItem(selected = target == state.destination,
                                            enabled = !state.busy, onClick = { model.navigate(target) },
                                            icon = { Icon(destinationIcon(target), null) },
                                            label = { Text(target.label, maxLines = 2, style = MaterialTheme.typography.labelSmall,
                                                textAlign = androidx.compose.ui.text.style.TextAlign.Center) },
                                            colors = NavigationBarItemDefaults.colors(indicatorColor = MaterialTheme.colorScheme.primaryContainer))
                                    }
                                }
                            }
                        }) { padding ->
                        Column(Modifier.padding(padding).fillMaxSize()) {
                            if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
                            state.message?.let {
                                Box(Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
                                    Notice(it, state.error, model::dismissMessage)
                                }
                            }
                            if (state.pending != null) {
                                TextButton(onClick = model::showSlip, enabled = !state.busy,
                                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                                    Text("Une confirmation est à vérifier · Ouvrir")
                                }
                            }
                            Box(Modifier.weight(1f)) {
                                when (state.destination) {
                                    Destination.MATCHES -> MatchesScreen(state, model::sport, model::competition, model::select)
                                    Destination.BETS -> TicketsScreen(state, model::ticketFilter, model::ticketPage)
                                    Destination.HOME -> HomeScreen(state, model::claim) { model.navigate(Destination.MATCHES) }
                                    Destination.PROFILE -> ProfileScreen(state, model::setTheme, model::logout) { openWeb("/profile") }
                                    Destination.AGENCY -> AgencyScreen(state) { openWeb("/agence") }
                                }
                            }
                        }
                    }
                    if (state.showSlip && state.draft != null) BetSheet(state, model::closeSlip, model::stake, model::confirmBet)
                }
            }
        }
    }
}
