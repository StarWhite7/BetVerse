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
    @Test fun selectionsToggleReplaceAndBuildOneCombinedStake() {
        val first = fixture("2030-01-01T20:00:00Z")
        val second = fixture("2030-01-02T20:00:00Z")
        val single = toggleSelection(null, first, Choice.HOME)!!
        assertNull(toggleSelection(single, first, Choice.HOME))
        val replacement = toggleSelection(single, first, Choice.AWAY)!!
        assertEquals(1, replacement.selections.size)
        assertEquals(Choice.AWAY, replacement.choice)
        val combined = toggleSelection(single.copy(amount = "250"), second, Choice.HOME)!!
        assertEquals(2, combined.selections.size)
        assertEquals(BigDecimal("4.41"), combined.quote)
        assertEquals(1103L, combined.potential)
        val remaining = toggleSelection(combined, first, Choice.HOME)!!
        assertEquals(second.id, remaining.fixture.id)
        assertEquals("250", remaining.amount)
    }
    @Test fun combinationRoundsOnlyTheFinalProductAndBoundsPayout() {
        val first = fixture("2030-01-01T20:00:00Z").copy(homeOdds = BigDecimal("1.91"))
        val draft = DraftBet(first, Choice.HOME, additional = listOf(BetSelection(first.copy(id="second"), Choice.HOME)))
        assertEquals(BigDecimal("3.65"), draft.quote)
        assertEquals(365L, draft.potential)
        val large = first.copy(homeOdds=BigDecimal("1000"))
        assertNull(DraftBet(large, Choice.HOME, additional=listOf(BetSelection(large.copy(id="2"), Choice.HOME), BetSelection(large.copy(id="3"), Choice.HOME))).potential)
    }
}
