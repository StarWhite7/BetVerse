package fr.betverse.mobile.data

import java.io.IOException
import java.math.BigDecimal
import java.time.Instant
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject

class ApiFailure(val status: Int, override val message: String) : IOException(message)
class SessionCookieJar(private val origin: HttpUrl, private val vault: SessionVault) : CookieJar {
    private val storageKey = "cookie:" + origin
    private val cookieName = if (origin.isHttps) "__Host-betverse_session" else "betverse_session"
    @Synchronized override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        if (url.scheme != origin.scheme || url.host != origin.host || url.port != origin.port) return
        cookies.lastOrNull { it.name == cookieName && it.hostOnly && it.path == "/" &&
            it.domain == origin.host && (!origin.isHttps || (it.secure && it.httpOnly)) }?.let {
            vault.put(storageKey, if (it.expiresAt <= System.currentTimeMillis()) null else it.toString())
        }
    }
    @Synchronized override fun loadForRequest(url: HttpUrl): List<Cookie> {
        if (url.scheme != origin.scheme || url.host != origin.host || url.port != origin.port) return emptyList()
        val cookie = vault.get(storageKey)?.let { Cookie.parse(origin, it) } ?: return emptyList()
        if (cookie.expiresAt <= System.currentTimeMillis() || !cookie.matches(url)) return emptyList()
        return listOf(cookie)
    }
    fun clear() = vault.put(storageKey, null)
}

/** Every endpoint is on our backend. No provider host, polling, retry, redirect, or logging interceptor. */
class BetVerseApi(
    val origin: String,
    private val vault: SessionVault,
    allowLocalHttpForTests: Boolean = false
) {
    private val base = origin.toHttpUrl()
    private val jar = SessionCookieJar(base, vault)
    @Volatile private var csrf: String? = null
    private val client: OkHttpClient
    init {
        require(base.encodedPath == "/" && base.query == null && base.fragment == null &&
            base.username.isEmpty() && base.password.isEmpty())
        require(base.isHttps || (allowLocalHttpForTests && base.host == "localhost"))
        client = OkHttpClient.Builder().cookieJar(jar).followRedirects(false)
            .followSslRedirects(false).retryOnConnectionFailure(false)
            .callTimeout(20, TimeUnit.SECONDS).build()
    }
    private suspend fun request(path: String, payload: JSONObject? = null, key: String? = null): Pair<String, Response> {
        require(path.startsWith("/api/") && !path.contains("..") && !path.contains("://"))
        val url = base.resolve(path)!!
        require(url.host == base.host && url.scheme == base.scheme && url.port == base.port)
        val builder = Request.Builder().url(url).header("Accept", "application/json")
            .header("Origin", origin).header("X-Requested-With", "BetVerse")
        if (payload != null) {
            csrf?.let { builder.header("X-CSRF-Token", it) }
            key?.let { builder.header("Idempotency-Key", it) }
            builder.post(payload.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
        }
        val response = client.newCall(builder.build()).await()
        response.use {
            // Limit response buffering, including an unexpectedly large upstream error page.
            val source = it.body?.source()
            if (source != null && source.request(4L * 1024 * 1024 + 1)) {
                throw ApiFailure(502, "Réponse serveur trop volumineuse.")
            }
            val text = it.body?.string().orEmpty()
            if (!it.isSuccessful) {
                if (it.code == 401) csrf = null
                val message = runCatching { JSONObject(text).getString("message") }.getOrNull()
                    ?.takeIf { value -> value.length <= 400 }
                    ?: if (it.code in 300..399) "Redirection refusée pour protéger la session."
                    else "Le serveur est indisponible. Réessayez."
                throw ApiFailure(it.code, message)
            }
            return text to it
        }
    }
    suspend fun login(identifier: String, password: String): Player {
        val (body) = request("/api/auth/login", JSONObject().put("identifier", identifier).put("password", password))
        val data = JSONObject(body)
        csrf = data.getString("csrfToken")
        return data.getJSONObject("user").player()
    }
    suspend fun me(): Player {
        val (body, response) = request("/api/auth/me")
        csrf = response.header("X-CSRF-Token")?.takeIf { it.isNotBlank() }
            ?: throw ApiFailure(502, "La session n’a pas pu être vérifiée.")
        return JSONObject(body).player()
    }
    suspend fun logout() { request("/api/auth/logout", JSONObject()); csrf = null; jar.clear() }
    suspend fun register(email: String, username: String, password: String) {
        request("/api/auth/register", JSONObject().put("email", email).put("username", username).put("password", password))
    }
    suspend fun recovery(identifier: String, resend: Boolean) {
        request(if (resend) "/api/auth/resend-verification" else "/api/auth/forgot-password",
            JSONObject().put("identifier", identifier))
    }
    suspend fun wallet(): Wallet = JSONObject(request("/api/wallet").first).wallet()
    suspend fun claim(): Wallet = JSONObject(request("/api/wallet/claim", JSONObject()).first).wallet()
    suspend fun fixtures(): List<Fixture> =
        JSONArray(request("/api/matches?status=UPCOMING").first).objects().map { it.fixture() }
    suspend fun agency(): JSONObject? = request("/api/agence/me").first.let {
        if (it.trim() == "null") null else JSONObject(it)
    }
    suspend fun tickets(status: String? = null, skip: Int = 0): TicketPage {
        require(status == null || status in listOf("PENDING", "WON", "LOST", "VOID"))
        val (body, response) = request("/api/bet/my-bets?limit=25&skip=" + skip + (status?.let { "&status=" + it } ?: ""))
        val entries = JSONArray(body).objects().map { it.ticket() }
        return TicketPage(entries, response.header("X-Total-Count")?.toIntOrNull() ?: entries.size)
    }
    suspend fun history(): List<LedgerEntry> = JSONArray(request("/api/wallet/history?limit=25").first)
        .objects().map {
            LedgerEntry(it.getString("id"), it.getLong("amount"), it.getString("type"),
                it.getString("reason"), Instant.parse(it.getString("createdAt")))
        }
    suspend fun place(draft: DraftBet): Ticket {
        requireNotNull(draft.requestKey)
        if (draft.selections.size > 1) {
            val selections = JSONArray()
            draft.selections.forEach { leg -> selections.put(JSONObject().put("matchId", leg.fixture.id)
                .put("betType", leg.choice.name).put("odds", requireNotNull(leg.fixture.odds(leg.choice)))) }
            return JSONObject(request("/api/bet/combined", JSONObject().put("amount", requireNotNull(draft.stake))
                .put("selections", selections), draft.requestKey).first).ticket()
        }
        val data = JSONObject().put("matchId", draft.fixture.id).put("betType", draft.choice.name)
            .put("amount", requireNotNull(draft.stake)).put("odds", draft.quote)
        return JSONObject(request("/api/bet", data, draft.requestKey).first).ticket()
    }
    fun pending(owner: String): DraftBet? = vault.get("pending:" + base + ":" + owner)?.let { value ->
        val item = JSONObject(value)
        DraftBet(item.getJSONObject("fixture").fixture(), Choice.valueOf(item.getString("choice")),
            item.getString("amount"), item.getString("requestKey"), owner,
            item.optJSONArray("additional")?.objects()?.map { BetSelection(it.getJSONObject("fixture").fixture(), Choice.valueOf(it.getString("choice"))) }.orEmpty())
    }
    fun savePending(draft: DraftBet) {
        val fixture = draft.fixture
        val json = JSONObject().put("fixture", JSONObject()
            .put("id", fixture.id).put("homeTeam", fixture.home).put("awayTeam", fixture.away)
            .put("startDate", fixture.start.toString()).put("status", fixture.status)
            .put("competition", fixture.competition).put("sportKey", fixture.sport)
            .put("oddsHome", fixture.homeOdds).put("oddsDraw", fixture.drawOdds ?: JSONObject.NULL)
            .put("oddsAway", fixture.awayOdds))
            .put("choice", draft.choice.name).put("amount", draft.amount).put("requestKey", draft.requestKey)
        val additional = JSONArray()
        draft.additional.forEach { leg -> additional.put(JSONObject().put("fixture", leg.fixture.json()).put("choice", leg.choice.name)) }
        json.put("additional", additional)
        vault.put("pending:" + base + ":" + requireNotNull(draft.owner), json.toString())
    }
    fun clearPending(owner: String) = vault.put("pending:" + base + ":" + owner, null)
}

private suspend fun Call.await(): Response = suspendCancellableCoroutine { continuation ->
    continuation.invokeOnCancellation { cancel() }
    enqueue(object : Callback {
        override fun onFailure(call: Call, e: IOException) {
            if (continuation.isActive) continuation.resumeWithException(e)
        }
        override fun onResponse(call: Call, response: Response) {
            if (continuation.isActive) continuation.resume(response) else response.close()
        }
    })
}

private fun JSONArray.objects(): List<JSONObject> = (0 until length()).map { getJSONObject(it) }
private fun JSONObject.player() = Player(getString("id"), getString("username"), getString("email"), getInt("level"), getLong("xp"))
private fun JSONObject.decimal(key: String) = BigDecimal(get(key).toString()).setScale(2)
private fun JSONObject.fixture() = Fixture(
    getString("id"), getString("homeTeam"), getString("awayTeam"), Instant.parse(getString("startDate")),
    getString("status"), optString("competition", "Catalogue BetVerse"), optString("sportKey", "football"),
    decimal("oddsHome"), if (isNull("oddsDraw")) null else decimal("oddsDraw"), decimal("oddsAway")
)
private fun JSONObject.wallet() = Wallet(getLong("balance"), getLong("shards"),
    if (isNull("nextClaimAvailableAt")) null else Instant.parse(getString("nextClaimAvailableAt")),
    Instant.parse(getString("serverTime")))
private fun JSONObject.ticket() = Ticket(
    getString("id"), getString("match"), Choice.valueOf(getString("betType")),
    getLong("amount"), decimal("odds"), getString("status"),
    if (isNull("payout")) null else getLong("payout"), Instant.parse(getString("createdAt")),
    optJSONArray("selections")?.objects()?.map { TicketLeg(it.getString("match"), Choice.valueOf(it.getString("betType")), it.decimal("odds"), it.getString("status")) }.orEmpty()
)
private fun Fixture.json() = JSONObject().put("id", id).put("homeTeam", home).put("awayTeam", away)
    .put("startDate", start.toString()).put("status", status).put("competition", competition).put("sportKey", sport)
    .put("oddsHome", homeOdds).put("oddsDraw", drawOdds ?: JSONObject.NULL).put("oddsAway", awayOdds)
