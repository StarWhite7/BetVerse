package fr.betverse.mobile.data

import java.math.BigDecimal
import java.time.Instant
import java.util.UUID
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.runBlocking
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Cookie
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.Assert.*
import org.junit.Test

private class MemoryVault : SessionVault {
    val values = mutableMapOf<String, String>()
    override fun get(key: String) = values[key]
    override fun put(key: String, value: String?) { if (value == null) values.remove(key) else values[key] = value }
}
class BetVerseApiTest {
    private val player = """{"id":"player-one","username":"alice","email":"alice@example.test","level":1,"xp":10}"""
    private val ticket = """{"id":"ticket-one","match":"Paris vs Arsenal","betType":"HOME","amount":100,"odds":2.10,"status":"PENDING","payout":null,"createdAt":"2026-11-05T12:00:00Z"}"""
    private fun server(): MockWebServer = MockWebServer().apply { start() }
    private fun origin(server: MockWebServer) = server.url("/").newBuilder().host("localhost").build().toString().removeSuffix("/")
    private fun api(server: MockWebServer, vault: SessionVault = MemoryVault()) =
        BetVerseApi(origin(server), vault, true)
    private fun loginResponse() = MockResponse().setBody("""{"user":$player,"csrfToken":"csrf-one"}""")
        .addHeader("Set-Cookie", "betverse_session=" + "a".repeat(64) + "; Path=/; HttpOnly; Max-Age=43200")
    private fun draft() = DraftBet(Fixture(UUID.randomUUID().toString(), "Paris", "Arsenal",
        Instant.parse("2030-01-01T20:00:00Z"), "UPCOMING", "Recette", "football",
        BigDecimal("2.10"), BigDecimal("3.40"), BigDecimal("3.15")), Choice.HOME,
        requestKey = UUID.randomUUID().toString(), owner = "player-one")

    @Test fun loginRestoresCookieAndCsrfWithoutPersistingPassword() = runBlocking {
        val server = server()
        try {
            val vault = MemoryVault()
            server.enqueue(loginResponse())
            val first = api(server, vault)
            assertEquals("alice", first.login("alice", "NotARealPassword123").username)
            val login = server.takeRequest()
            assertEquals("/api/auth/login", login.path)
            assertEquals("BetVerse", login.getHeader("X-Requested-With"))
            assertEquals("application/json; charset=utf-8", login.getHeader("Content-Type"))
            assertEquals(origin(server), login.getHeader("Origin"))
            assertFalse(vault.values.values.any { it.contains("NotARealPassword123") || it.contains("csrf-one") })
            val restarted = api(server, vault)
            server.enqueue(MockResponse().setBody(player).addHeader("X-CSRF-Token", "csrf-two"))
            restarted.me()
            assertTrue(server.takeRequest().getHeader("Cookie")!!.contains("a".repeat(64)))
            server.enqueue(MockResponse().setBody(ticket))
            restarted.place(draft())
            val posted = server.takeRequest()
            assertEquals("/api/bet", posted.path)
            assertEquals("csrf-two", posted.getHeader("X-CSRF-Token"))
            assertNotNull(posted.getHeader("Idempotency-Key"))
        } finally { server.shutdown() }
    }
    @Test fun redirectsNeverForwardCredentials() = runBlocking {
        val source = server()
        val target = server()
        try {
            source.enqueue(MockResponse().setResponseCode(307).addHeader("Location", target.url("/steal")))
            val failure = runCatching { api(source).login("alice", "NotARealPassword123") }.exceptionOrNull()
            assertTrue(failure is ApiFailure && failure.status == 307)
            assertEquals(1, source.requestCount)
            assertNull(target.takeRequest(100, TimeUnit.MILLISECONDS))
        } finally { source.shutdown(); target.shutdown() }
    }
    @Test fun cookieCannotLeaveExactBackendOrigin() {
        val vault = MemoryVault()
        val origin = "https://example.test".toHttpUrl()
        val jar = SessionCookieJar(origin, vault)
        val valid = Cookie.parse(origin, "__Host-betverse_session=" + "b".repeat(64) +
            "; Path=/; HttpOnly; Secure; Max-Age=43200")!!
        jar.saveFromResponse(origin, listOf(valid))
        assertEquals(1, jar.loadForRequest("https://example.test/api/auth/me".toHttpUrl()).size)
        assertTrue(jar.loadForRequest("https://evil.test".toHttpUrl()).isEmpty())
        assertTrue(jar.loadForRequest("http://example.test".toHttpUrl()).isEmpty())
        assertTrue(jar.loadForRequest("https://example.test:8443".toHttpUrl()).isEmpty())
        jar.saveFromResponse("https://evil.test".toHttpUrl(), listOf(valid))
        assertEquals(1, jar.loadForRequest(origin).size)
    }
    @Test fun uncertainBetReusesExactKeyAndPayloadAfterRestart() = runBlocking {
        val server = server()
        try {
            val vault = MemoryVault()
            val first = api(server, vault)
            server.enqueue(loginResponse())
            first.login("alice", "NotARealPassword123")
            server.takeRequest()
            val selected = draft()
            first.savePending(selected)
            server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST))
            assertTrue(runCatching { first.place(selected) }.isFailure)
            val lostResponse = server.takeRequest()
            val restarted = api(server, vault)
            val pending = restarted.pending("player-one")!!
            assertNull(restarted.pending("another-player"))
            assertEquals(selected, pending)
            server.enqueue(MockResponse().setBody(player).addHeader("X-CSRF-Token", "restored"))
            restarted.me()
            server.takeRequest()
            server.enqueue(MockResponse().setBody(ticket))
            restarted.place(pending)
            val retry = server.takeRequest()
            assertEquals(lostResponse.getHeader("Idempotency-Key"), retry.getHeader("Idempotency-Key"))
            assertEquals(lostResponse.body.readUtf8(), retry.body.readUtf8())
            assertEquals(4, server.requestCount)
            restarted.clearPending("player-one")
            assertNull(restarted.pending("player-one"))
        } finally { server.shutdown() }
    }
    @Test fun catalogueUsesOnlyOneFirstPartyRead() = runBlocking {
        val server = server()
        try {
            server.enqueue(MockResponse().setBody("[]"))
            assertTrue(api(server).fixtures().isEmpty())
            val request = server.takeRequest()
            assertEquals("/api/matches?status=UPCOMING", request.path)
            assertEquals("GET", request.method)
            assertNull(request.getHeader("x-apisports-key"))
            assertEquals(1, server.requestCount)
        } finally { server.shutdown() }
    }
    @Test fun failedLogoutKeepsSessionForRetry() = runBlocking {
        val server = server()
        try {
            val client = api(server)
            server.enqueue(loginResponse())
            client.login("alice", "NotARealPassword123")
            server.takeRequest()
            server.enqueue(MockResponse().setResponseCode(503).setBody("""{"message":"Indisponible"}"""))
            assertTrue(runCatching { client.logout() }.isFailure)
            server.takeRequest()
            server.enqueue(MockResponse().setBody(player).addHeader("X-CSRF-Token", "csrf-one"))
            client.me()
            assertNotNull(server.takeRequest().getHeader("Cookie"))
            server.enqueue(MockResponse().setBody("""{"success":true}"""))
            client.logout()
            server.takeRequest()
            server.enqueue(MockResponse().setResponseCode(401).setBody("""{"message":"Connexion requise."}"""))
            runCatching { client.me() }
            assertNull(server.takeRequest().getHeader("Cookie"))
        } finally { server.shutdown() }
    }
    @Test fun productionRejectsCleartextAndPathOrigins() {
        assertTrue(runCatching { BetVerseApi("http://example.test", MemoryVault()) }.isFailure)
        assertTrue(runCatching { BetVerseApi("https://example.test/other", MemoryVault()) }.isFailure)
    }
}
