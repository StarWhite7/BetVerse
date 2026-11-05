package fr.betverse.mobile.data

import java.math.BigDecimal
import java.time.Instant
import java.time.ZoneId
import org.junit.Assert.*
import org.junit.Test

class BetRulesTest {
    private fun fixture(start: String, status: String = "UPCOMING", sport: String = "football") =
        Fixture(start, "Paris", "Arsenal", Instant.parse(start), status, "Recette", sport,
            BigDecimal("2.10"), BigDecimal("3.40"), BigDecimal("3.15"))
    @Test fun returnsIncludeStakeAndMatchServerRounding() {
        assertEquals(210L, potentialReturn(100, BigDecimal("2.10")))
        assertEquals(191L, potentialReturn(100, BigDecimal("1.91")))
        assertEquals(2L, potentialReturn(1, BigDecimal("1.50")))
    }
    @Test fun calendarUsesParisMidnight() {
        val now = Instant.parse("2026-11-05T22:00:00Z")
        val matches = listOf(fixture("2026-11-05T23:30:00Z"), fixture("2026-11-05T22:30:00Z"))
        assertEquals(1, filterFixtures(matches, "football", DayFilter.TODAY, now, ZoneId.of("Europe/Paris")).size)
        assertEquals("2026-11-05T23:30:00Z",
            filterFixtures(matches, "football", DayFilter.TOMORROW, now, ZoneId.of("Europe/Paris")).single().id)
    }
    @Test fun onlyUpcomingFixturesOfSelectedSportAreAvailable() {
        val now = Instant.parse("2026-11-05T12:00:00Z")
        val matches = listOf(
            fixture("2026-11-05T11:00:00Z"),
            fixture("2026-11-05T12:00:00Z"),
            fixture("2026-11-05T20:00:00Z", "CANCELLED"),
            fixture("2026-11-05T21:00:00Z", sport = "tennis"),
            fixture("2026-11-05T22:00:00Z")
        )
        assertEquals(1, filterFixtures(matches, "football", DayFilter.ALL, now).size)
        assertFalse(matches[1].available(now))
    }
    @Test fun invalidStakesAreRejected() {
        val selected = DraftBet(fixture("2030-01-01T20:00:00Z"), Choice.HOME)
        listOf("", "0", "1.5", "-2", "1000001", "9999999999999999999999").forEach { assertNull(selected.copy(amount = it).stake) }
        assertEquals(100L, selected.stake)
    }
}
