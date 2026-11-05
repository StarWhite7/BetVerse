package fr.betverse.mobile

import android.app.Application
import android.os.SystemClock
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import fr.betverse.mobile.data.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import org.json.JSONObject
import java.io.IOException
import java.time.Instant
import java.util.UUID

enum class ThemePreference(val label: String) { SYSTEM("Système"), LIGHT("Clair"), DARK("Sombre") }
enum class Destination(val label: String) {
    HOME("Accueil"), MATCHES("Matchs"), BETS("Mes paris"), AGENCY("Agence"), PROFILE("Profil")
}
data class UiState(
    val booting: Boolean = true, val busy: Boolean = false, val player: Player? = null,
    val wallet: Wallet? = null, val fixtures: List<Fixture> = emptyList(),
    val tickets: List<Ticket> = emptyList(), val ticketTotal: Int = 0, val ticketSkip: Int = 0,
    val ticketFilter: String? = null, val history: List<LedgerEntry> = emptyList(),
    val destination: Destination = Destination.MATCHES, val sport: String = "football",
    val day: DayFilter = DayFilter.TODAY, val competition: String? = null, val draft: DraftBet? = null,
    val pending: DraftBet? = null, val showSlip: Boolean = false,
    val message: String? = null, val error: Boolean = false,
    val now: Instant = Instant.now(), val theme: ThemePreference = ThemePreference.SYSTEM,
    val agencyName: String? = null, val agencyMembers: Int = 0, val agencyPoints: Long = 0,
    val agencyLoaded: Boolean = false
)

class AppViewModel(application: Application) : AndroidViewModel(application) {
    private val api = (application as BetVerseApplication).api
    private val preferences = application.getSharedPreferences("betverse_ui", Application.MODE_PRIVATE)
    private val operations = Mutex()
    private var serverAnchor: Instant? = null
    private var monotonicAnchor = 0L
    private val mutable = MutableStateFlow(UiState(theme = runCatching {
        ThemePreference.valueOf(preferences.getString("theme", "SYSTEM")!!)
    }.getOrDefault(ThemePreference.SYSTEM)))
    val state = mutable.asStateFlow()

    init {
        restoreSession()
        viewModelScope.launch {
            while (true) {
                delay(1000)
                mutable.update { it.copy(now = serverNow()) }
            }
        }
    }
    private fun serverNow(): Instant = serverAnchor?.plusMillis(SystemClock.elapsedRealtime() - monotonicAnchor)
        ?: Instant.now()
    private fun acceptWallet(wallet: Wallet) {
        serverAnchor = wallet.serverTime
        monotonicAnchor = SystemClock.elapsedRealtime()
        mutable.update { it.copy(wallet = wallet, now = wallet.serverTime) }
    }
    private fun failure(error: Exception) {
        if (error is CancellationException) throw error
        if (error is ApiFailure && error.status == 401 && mutable.value.player != null) {
            mutable.update { UiState(booting = false, theme = it.theme,
                message = "Votre session a expiré. Reconnectez-vous.", error = true) }
            return
        }
        mutable.update { it.copy(error = true, message = when (error) {
            is ApiFailure -> error.message
            is IOException -> "Connexion interrompue. Vérifiez votre réseau puis réessayez."
            else -> "Cette opération n’a pas pu être terminée. Réessayez."
        }) }
    }
    private fun operation(block: suspend () -> Unit) {
        viewModelScope.launch {
            if (!operations.tryLock()) return@launch
            mutable.update { it.copy(busy = true, message = null, error = false) }
            try { block() } catch (e: Exception) { failure(e) }
            finally {
                mutable.update { it.copy(busy = false, booting = false) }
                operations.unlock()
            }
        }
    }
    fun restoreSession() = operation {
        try {
            val player = api.me()
            mutable.update { it.copy(player = player, pending = api.pending(player.id), booting = false) }
            loadSnapshot()
        } catch (e: ApiFailure) {
            if (e.status != 401) throw e
            mutable.update { it.copy(booting = false) }
        }
    }
    fun login(identifier: String, password: String) = operation {
        val player = api.login(identifier.trim(), password)
        mutable.update { it.copy(player = player, pending = api.pending(player.id), booting = false) }
        loadSnapshot()
    }
    fun register(email: String, username: String, password: String) = operation {
        api.register(email.trim().lowercase(), username.trim().lowercase(), password)
        mutable.update { it.copy(message = "Compte créé. Consultez votre email pour confirmer votre adresse, puis connectez-vous.") }
    }
    fun recover(identifier: String, resend: Boolean) = operation {
        api.recovery(identifier.trim(), resend)
        mutable.update { it.copy(message = if (resend)
            "Si ce compte attend une confirmation, un nouveau lien a été envoyé."
            else "Si ce compte existe, un lien de réinitialisation a été envoyé.") }
    }
    private suspend fun loadSnapshot() {
        acceptWallet(api.wallet())
        val fixtures = api.fixtures()
        mutable.update { it.copy(fixtures = fixtures) }
        loadTickets()
        val history = api.history()
        mutable.update { it.copy(history = history) }
    }
    fun refresh() = operation {
        loadSnapshot()
        if (mutable.value.destination == Destination.AGENCY) loadAgency()
    }
    fun navigate(destination: Destination) {
        if (mutable.value.busy) return
        mutable.update { it.copy(destination = destination, message = null) }
        if (destination == Destination.AGENCY) operation { loadAgency() }
        if (destination == Destination.BETS) operation { loadTickets() }
    }
    private suspend fun loadAgency() {
        val agency = api.agency()
        mutable.update { it.copy(agencyName = agency?.optString("name"),
            agencyMembers = agency?.optJSONObject("_count")?.optInt("members") ?: 0,
            agencyPoints = agency?.optLong("clanScore") ?: 0, agencyLoaded = true) }
    }
    fun setTheme(value: ThemePreference) {
        preferences.edit().putString("theme", value.name).apply()
        mutable.update { it.copy(theme = value) }
    }
    fun sport(value: String) { mutable.update { it.copy(sport = value, competition = null) } }
    fun competition(value: String?) { mutable.update { it.copy(competition = value) } }
    fun day(value: DayFilter) { mutable.update { it.copy(day = value) } }
    fun select(fixture: Fixture, choice: Choice) {
        if (mutable.value.busy) return
        val pending = mutable.value.pending
        if (pending != null) {
            mutable.update { it.copy(draft = pending, showSlip = true,
                error = true, message = "Vérifiez d’abord le pari dont la réponse a été interrompue.") }
            return
        }
        if (!fixture.available(serverNow()) || fixture.odds(choice) == null) {
            mutable.update { it.copy(error = true, message = "Cette sélection n’est plus disponible. Actualisez les matchs.") }
            return
        }
        val draft = mutable.value.draft
        if (draft != null && draft.selections.size >= 10 && draft.selections.none { it.fixture.id == fixture.id }) {
            mutable.update { it.copy(error = true, message = "Un combiné contient 10 rencontres maximum.") }
            return
        }
        mutable.update { it.copy(draft = toggleSelection(it.draft, fixture, choice), showSlip = false, message = null) }
    }
    fun showSlip() {
        mutable.update { it.copy(draft = it.pending ?: it.draft, showSlip = true, message = null) }
    }
    fun closeSlip() { if (!mutable.value.busy) mutable.update { it.copy(showSlip = false) } }
    fun clearDraft() { if (!mutable.value.busy && mutable.value.pending == null) mutable.update { it.copy(draft = null) } }
    fun stake(value: String) {
        if (mutable.value.pending == null && !mutable.value.busy) mutable.update {
            it.copy(draft = it.draft?.copy(amount = value.filter(Char::isDigit).take(7)))
        }
    }
    fun confirmBet() = operation {
        val player = mutable.value.player ?: return@operation
        val previous = mutable.value.pending
        val draft = previous ?: mutable.value.draft ?: return@operation
        if (draft.stake == null || (previous == null && draft.stake!! > (mutable.value.wallet?.balance ?: 0))) {
            mutable.update { it.copy(error = true, message = "Saisissez une mise entière entre 1 et 1 000 000 Verse, dans la limite de votre solde.") }
            return@operation
        }
        if (previous == null && draft.potential == null) {
            mutable.update { it.copy(error = true, message = "La cote totale est trop élevée. Retirez une sélection du combiné.") }
            return@operation
        }
        if (previous == null && draft.selections.any { !it.fixture.available(serverNow()) }) {
            mutable.update { it.copy(error = true, message = "Les paris sont fermés pour cette rencontre.") }
            return@operation
        }
        val submitted = previous ?: draft.copy(requestKey = UUID.randomUUID().toString(), owner = player.id)
        // Persist before the first POST. Any uncertain result keeps this exact payload and key.
        api.savePending(submitted)
        mutable.update { it.copy(pending = submitted, draft = submitted) }
        try {
            api.place(submitted)
        } catch (e: Exception) {
            // A 4xx from this API is a definitive rejection; timeouts, parsing or server errors are uncertain.
            if (e is ApiFailure && e.status in 400..499 && e.status !in listOf(401, 408, 429)) {
                api.clearPending(player.id)
                mutable.update { it.copy(pending = null, draft = null, showSlip = false) }
            } else {
                mutable.update { it.copy(showSlip = true) }
            }
            throw e
        }
        api.clearPending(player.id)
        mutable.update { it.copy(pending = null, draft = null, showSlip = false,
            destination = Destination.BETS, ticketSkip = 0, ticketFilter = null,
            error = false, message = "Pari confirmé. Vous le retrouverez dans Mes paris.") }
        // A failed read here must never turn the successful POST into another submission.
        loadSnapshot()
    }
    fun claim() = operation {
        acceptWallet(api.claim())
        val history = api.history()
        mutable.update { it.copy(history = history, message = "Bonus reçu : +500 Verse.") }
    }
    private suspend fun loadTickets() {
        val current = mutable.value
        val page = api.tickets(current.ticketFilter, current.ticketSkip)
        mutable.update { it.copy(tickets = page.tickets, ticketTotal = page.total) }
    }
    fun ticketFilter(value: String?) {
        if (mutable.value.busy) return
        mutable.update { it.copy(ticketFilter = value, ticketSkip = 0) }
        operation { loadTickets() }
    }
    fun ticketPage(delta: Int) {
        if (mutable.value.busy) return
        mutable.update { it.copy(ticketSkip = (it.ticketSkip + delta * 25).coerceAtLeast(0)) }
        operation { loadTickets() }
    }
    fun logout() = operation {
        api.logout()
        serverAnchor = null
        mutable.update { UiState(booting = false, theme = it.theme) }
    }
    fun dismissMessage() { mutable.update { it.copy(message = null) } }
}
