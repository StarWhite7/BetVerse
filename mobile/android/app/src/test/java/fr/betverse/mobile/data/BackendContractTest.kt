package fr.betverse.mobile.data

import java.io.File
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

/** Real Node/SQLite backend, in-memory database, no .env or API-Football. */
class BackendContractTest {
    @Test fun completeNativeJourneyAgainstExistingBackend() = runBlocking {
        val repo = generateSequence(File(requireNotNull(System.getProperty("user.dir")))) { it.parentFile }
            .first { File(it, "server/test/native-contract-fixture.mjs").isFile }
        val process = ProcessBuilder("node", File(repo, "server/test/native-contract-fixture.mjs").absolutePath)
            .directory(repo).redirectError(ProcessBuilder.Redirect.INHERIT).start()
        val executor = Executors.newSingleThreadExecutor()
        try {
            val line = executor.submit<String> { process.inputStream.bufferedReader().readLine() }.get(20, TimeUnit.SECONDS)
            val origin = JSONObject(line).getString("origin")
            val values = mutableMapOf<String, String>()
            val vault = object : SessionVault {
                override fun get(key: String) = values[key]
                override fun put(key: String, value: String?) {
                    if (value == null) values.remove(key) else values[key] = value
                }
            }
            val api = BetVerseApi(origin, vault, true)
            val player = api.login("native-test", "NativeTest123456")
            assertEquals("native-test", player.username)
            assertEquals(0L, api.wallet().balance)
            assertEquals(500L, api.claim().balance)
            val fixtures = api.fixtures()
            val fixture = fixtures.first()
            val draft = DraftBet(fixture, Choice.HOME, "100", UUID.randomUUID().toString(), player.id)
            api.savePending(draft)
            val first = api.place(draft)
            assertEquals("PENDING", first.status)
            assertEquals(400L, api.wallet().balance)
            val restarted = BetVerseApi(origin, vault, true)
            assertEquals(player.id, restarted.me().id)
            val replay = restarted.place(restarted.pending(player.id)!!)
            assertEquals(first.id, replay.id)
            assertEquals(400L, restarted.wallet().balance)
            assertEquals(1, restarted.tickets().total)
            assertEquals(2, restarted.history().size)
            restarted.clearPending(player.id)
            val combo = DraftBet(fixtures[0], Choice.HOME, "50", UUID.randomUUID().toString(), player.id,
                listOf(BetSelection(fixtures[1], Choice.HOME)))
            restarted.savePending(combo)
            val recovered = restarted.pending(player.id)!!
            assertEquals(combo, recovered)
            val combinedTicket = restarted.place(recovered)
            assertEquals(2, combinedTicket.selections.size)
            assertEquals(combo.quote, combinedTicket.odds)
            assertEquals(350L, restarted.wallet().balance)
            assertEquals(combinedTicket.id, restarted.place(recovered).id)
            assertEquals(350L, restarted.wallet().balance)
            assertEquals(2, restarted.tickets().total)
            restarted.clearPending(player.id)
            restarted.logout()
            val error = runCatching { restarted.me() }.exceptionOrNull()
            assertTrue(error is ApiFailure && error.status == 401)
        } finally {
            executor.shutdownNow()
            process.destroy()
            if (!process.waitFor(5, TimeUnit.SECONDS)) process.destroyForcibly()
        }
    }
}
