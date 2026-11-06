package fr.betverse.mobile.data

import org.json.JSONObject

data class AgencyMember(val id: String, val username: String, val role: String, val points: Long)
data class Agency(val id: String, val name: String, val members: List<AgencyMember>, val count: Int,
    val points: Long, val xp: Long, val primary: String, val secondary: String, val logo: String, val banner: String) {
    companion object {
        fun from(json: JSONObject): Agency = Agency(json.getString("id"), json.getString("name"),
            json.optJSONArray("members")?.let { list -> (0 until list.length()).map { list.getJSONObject(it).let { row ->
                AgencyMember(row.getString("id"),row.getString("username"),row.getString("agencyRole"),row.optLong("predictionScore")) } } }.orEmpty(),
            json.optJSONObject("_count")?.optInt("members") ?: 0, json.optLong("clanScore"),json.optLong("xp"),
            json.optString("primaryColor", "#2458E8"),json.optString("secondaryColor", "#FFFFFF"),json.optString("logoId","logo-1"),json.optString("bannerStyle","grid"))
    }
}
data class AgencyInvite(val id: String, val agency: String, val inviter: String)
data class PlayerRank(val id: String, val username: String, val rank: Int, val level: Int, val verse: Long, val winRate: Double)
data class GameNotice(val id: String, val title: String, val message: String, val read: Boolean, val type: String)
data class NoticePreferences(val bets: Boolean=true, val agencies: Boolean=true, val push: Boolean=false)
