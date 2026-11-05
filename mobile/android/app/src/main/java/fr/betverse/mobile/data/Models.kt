package fr.betverse.mobile.data

import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

data class Player(val id: String, val username: String, val email: String, val level: Int, val xp: Long)
data class Wallet(val balance: Long, val shards: Long, val nextClaim: Instant?, val serverTime: Instant)
data class Fixture(
    val id: String, val home: String, val away: String, val start: Instant,
    val status: String, val competition: String, val sport: String,
    val homeOdds: BigDecimal, val drawOdds: BigDecimal?, val awayOdds: BigDecimal
) {
    fun odds(choice: Choice): BigDecimal? = when (choice) {
        Choice.HOME -> homeOdds
        Choice.DRAW -> drawOdds
        Choice.AWAY -> awayOdds
    }
    fun label(choice: Choice): String = when (choice) {
        Choice.HOME -> home
        Choice.DRAW -> "Match nul"
        Choice.AWAY -> away
    }
    fun available(at: Instant) = status == "UPCOMING" && start.isAfter(at)
}
enum class Choice(val short: String) { HOME("1"), DRAW("N"), AWAY("2") }
data class Ticket(
    val id: String, val match: String, val choice: Choice, val amount: Long,
    val odds: BigDecimal, val status: String, val payout: Long?, val created: Instant
)
data class TicketPage(val tickets: List<Ticket>, val total: Int)
data class LedgerEntry(val id: String, val amount: Long, val type: String, val reason: String, val created: Instant)
data class DraftBet(
    val fixture: Fixture, val choice: Choice, val amount: String = "100",
    val requestKey: String? = null, val owner: String? = null
) {
    val quote: BigDecimal get() = requireNotNull(fixture.odds(choice))
    val stake: Long? get() = amount.toLongOrNull()?.takeIf { it in 1..1_000_000 }
    val potential: Long? get() = stake?.let { potentialReturn(it, quote) }
}
fun potentialReturn(stake: Long, odds: BigDecimal): Long =
    odds.multiply(BigDecimal.valueOf(stake)).setScale(0, RoundingMode.HALF_UP).longValueExact()

enum class DayFilter(val label: String) { TODAY("Aujourd’hui"), TOMORROW("Demain"), WEEK("7 jours"), ALL("Tous") }
fun filterFixtures(
    fixtures: List<Fixture>, sport: String, day: DayFilter, now: Instant,
    zone: ZoneId = ZoneId.systemDefault()
): List<Fixture> {
    val today = LocalDate.ofInstant(now, zone)
    return fixtures.filter {
        val date = LocalDate.ofInstant(it.start, zone)
        it.sport == sport && it.available(now) && when (day) {
            DayFilter.TODAY -> date == today
            DayFilter.TOMORROW -> date == today.plusDays(1)
            DayFilter.WEEK -> date >= today && date < today.plusDays(7)
            DayFilter.ALL -> true
        }
    }.sortedBy { it.start }
}
