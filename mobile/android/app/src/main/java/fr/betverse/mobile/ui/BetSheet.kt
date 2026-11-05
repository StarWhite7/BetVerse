package fr.betverse.mobile.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import fr.betverse.mobile.UiState

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun BetSheet(
    state: UiState, onDismiss: () -> Unit, onStake: (String) -> Unit, onConfirm: () -> Unit
) {
    val draft = state.draft ?: return
    val uncertain = state.pending != null
    val valid = draft.stake != null && (uncertain ||
        ((draft.stake ?: Long.MAX_VALUE) <= (state.wallet?.balance ?: 0) && draft.potential != null && draft.selections.all { it.fixture.available(state.now) }))
    ModalBottomSheet(onDismissRequest = { if (!state.busy) onDismiss() },
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MaterialTheme.colorScheme.surface,
        properties = ModalBottomSheetProperties(shouldDismissOnBackPress = !state.busy)) {
        Column(Modifier.fillMaxWidth().imePadding().verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp).padding(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("Mon pari", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.weight(1f))
                IconButton(onClick = onDismiss, enabled = !state.busy) { Icon(Icons.Outlined.Close, "Fermer mon pari") }
            }
            if (uncertain) Notice("Une demande est en attente de vérification. Le même identifiant sera réutilisé pour éviter tout doublon. La mise et la sélection sont verrouillées.", false)
            state.message?.let { Notice(it, state.error) }
            Text(if (draft.selections.size > 1) "Combiné · ${draft.selections.size} rencontres" else "Pari simple", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            draft.selections.forEach { leg ->
                ClubCard(Modifier.fillMaxWidth()) {
                    Text(leg.fixture.home + " — " + leg.fixture.away, style = MaterialTheme.typography.titleMedium)
                    Text(matchDate(leg.fixture.start), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    StatLine(leg.fixture.label(leg.choice), quote(requireNotNull(leg.fixture.odds(leg.choice))))
                }
            }
            if (draft.selections.size > 1) StatLine("Cote totale", quote(draft.quote), true)
            OutlinedTextField(value = draft.amount, onValueChange = onStake,
                label = { Text("Mise en Verse") }, singleLine = true,
                enabled = !state.busy && !uncertain, isError = draft.amount.isNotEmpty() && !valid,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                supportingText = { Text("De 1 à 1 000 000 Verse, dans la limite de votre solde.") },
                modifier = Modifier.fillMaxWidth())
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("50", "100", "250", "500").forEach { amount ->
                    FilterChip(selected = draft.amount == amount, onClick = { onStake(amount) },
                        colors = clubFilterColors(),
                        label = { Text(amount) }, enabled = !state.busy && !uncertain,
                        modifier = Modifier.weight(1f).heightIn(min = 48.dp))
                }
            }
            ClubCard {
                StatLine("Solde disponible", verse(state.wallet?.balance ?: 0))
                StatLine("Gain potentiel", draft.potential?.let(::verse) ?: "—", prominent = true)
                Text("Mise incluse · Montant indicatif jusqu’à la confirmation du serveur.",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Button(onClick = onConfirm, enabled = valid && !state.busy,
                modifier = Modifier.fillMaxWidth().heightIn(min = 54.dp), colors = clubButtonColors()) {
                if (state.busy) CircularProgressIndicator(Modifier.size(20.dp), color = androidx.compose.ui.graphics.Color.White, strokeWidth = 2.dp)
                else Text(if (uncertain) "Vérifier ce pari" else "Confirmer · " + (draft.stake?.let(::verse) ?: "—"))
            }
            Text("Monnaie virtuelle · Aucun gain en argent", style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
