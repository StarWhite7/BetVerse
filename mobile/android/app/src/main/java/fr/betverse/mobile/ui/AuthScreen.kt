package fr.betverse.mobile.ui

import android.util.Patterns
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import fr.betverse.mobile.AppViewModel
import fr.betverse.mobile.UiState

private enum class AuthMode { LOGIN, REGISTER, FORGOT, RESEND }
@Composable fun AuthScreen(state: UiState, model: AppViewModel) {
    var mode by rememberSaveable { mutableStateOf(AuthMode.LOGIN) }
    var identifier by rememberSaveable { mutableStateOf("") }
    var username by rememberSaveable { mutableStateOf("") }
    // Password deliberately not saveable (no disk, bundle, or ViewModel persistence).
    var password by remember { mutableStateOf("") }
    var visible by remember { mutableStateOf(false) }
    var validation by remember { mutableStateOf<String?>(null) }
    val needsPassword = mode == AuthMode.LOGIN || mode == AuthMode.REGISTER
    Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding()
        .verticalScroll(rememberScrollState()).padding(horizontal = 24.dp, vertical = 32.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp)) {
        Brand()
        Spacer(Modifier.height(18.dp))
        Text(when (mode) {
            AuthMode.LOGIN -> "Le match commence ici."
            AuthMode.REGISTER -> "Rejoignez BetVerse."
            AuthMode.FORGOT -> "Retrouvez votre compte."
            AuthMode.RESEND -> "Confirmez votre email."
        }, style = MaterialTheme.typography.headlineLarge)
        Text("Le jeu de pronostics entre passionnés.\nEn Verse uniquement, sans argent réel.",
            color = MaterialTheme.colorScheme.onSurfaceVariant)
        state.message?.let { Notice(it, state.error, model::dismissMessage) }
        validation?.let { Notice(it, true) }
        OutlinedTextField(value = identifier, onValueChange = { identifier = it.take(254); validation = null },
            label = { Text(if (mode == AuthMode.REGISTER) "Adresse email" else "Email ou pseudo") },
            singleLine = true, enabled = !state.busy, modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = if (mode == AuthMode.REGISTER) KeyboardType.Email else KeyboardType.Text))
        if (mode == AuthMode.REGISTER) {
            OutlinedTextField(value = username, onValueChange = { username = it.take(24); validation = null },
                label = { Text("Pseudo") }, singleLine = true, enabled = !state.busy,
                supportingText = { Text("3 à 24 caractères : lettres, chiffres, point, tiret ou _.") },
                modifier = Modifier.fillMaxWidth())
        }
        if (needsPassword) {
            OutlinedTextField(value = password, onValueChange = { password = it.take(128); validation = null },
                label = { Text("Mot de passe") }, singleLine = true, enabled = !state.busy,
                modifier = Modifier.fillMaxWidth(),
                visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                trailingIcon = { IconButton(onClick = { visible = !visible }) {
                    Icon(if (visible) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
                        if (visible) "Masquer le mot de passe" else "Afficher le mot de passe")
                } },
                supportingText = if (mode == AuthMode.REGISTER) ({ Text("10 caractères minimum, une majuscule, une minuscule et un chiffre.") }) else null)
        }
        Button(onClick = {
            validation = when {
                identifier.trim().length < 3 -> "Renseignez votre email ou votre pseudo."
                mode == AuthMode.REGISTER && !Patterns.EMAIL_ADDRESS.matcher(identifier.trim()).matches() -> "Vérifiez votre adresse email."
                mode == AuthMode.REGISTER && !username.trim().lowercase().matches(Regex("[a-z0-9_.-]{3,24}")) -> "Vérifiez votre pseudo."
                mode == AuthMode.REGISTER && (password.length < 10 || !password.any { it in 'A'..'Z' } ||
                    !password.any { it in 'a'..'z' } || !password.any { it in '0'..'9' } ||
                    password.contains('\n') || password.contains('\r')) -> "Le mot de passe ne respecte pas les critères indiqués."
                needsPassword && password.isEmpty() -> "Renseignez votre mot de passe."
                else -> null
            }
            if (validation == null) {
                when (mode) {
                    AuthMode.LOGIN -> model.login(identifier, password)
                    AuthMode.REGISTER -> model.register(identifier, username, password)
                    AuthMode.FORGOT -> model.recover(identifier, false)
                    AuthMode.RESEND -> model.recover(identifier, true)
                }
                password = ""
                visible = false
            }
        }, enabled = !state.busy, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp), colors = clubButtonColors()) {
            if (state.busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = androidx.compose.ui.graphics.Color.White)
            else Text(when (mode) {
                AuthMode.LOGIN -> "Se connecter"
                AuthMode.REGISTER -> "Créer mon compte"
                AuthMode.FORGOT -> "Recevoir un lien"
                AuthMode.RESEND -> "Renvoyer la confirmation"
            })
        }
        if (mode == AuthMode.LOGIN) {
            TextButton(onClick = { mode = AuthMode.REGISTER; validation = null; password = "" }, enabled = !state.busy,
                modifier = Modifier.fillMaxWidth()) { Text("Créer un compte") }
            TextButton(onClick = { mode = AuthMode.FORGOT; validation = null; password = "" }, enabled = !state.busy,
                modifier = Modifier.fillMaxWidth()) { Text("Mot de passe oublié ?") }
            TextButton(onClick = { mode = AuthMode.RESEND; validation = null; password = "" }, enabled = !state.busy,
                modifier = Modifier.fillMaxWidth()) { Text("Renvoyer la confirmation d’email") }
            if (state.error) TextButton(onClick = model::restoreSession, enabled = !state.busy,
                modifier = Modifier.fillMaxWidth()) { Text("Réessayer ma session") }
        } else {
            TextButton(onClick = { mode = AuthMode.LOGIN; validation = null; password = ""; model.dismissMessage() },
                enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { Text("Retour à la connexion") }
            Text("Les liens de confirmation et de réinitialisation reçus par email s’ouvrent dans votre navigateur.",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Spacer(Modifier.weight(1f))
        Text("BÊTA PRIVÉE · ANDROID NATIF", style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.align(Alignment.CenterHorizontally))
    }
}
