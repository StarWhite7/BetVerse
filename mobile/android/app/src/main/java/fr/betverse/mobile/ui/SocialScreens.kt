package fr.betverse.mobile.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import fr.betverse.mobile.*
import fr.betverse.mobile.data.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

@Composable fun SocialPanel(state: UiState, model: AppViewModel, onWeb: (String) -> Unit) {
    val context=LocalContext.current
    val scope=rememberCoroutineScope()
    val pushPermission=rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted -> if(granted) model.enablePush() }
    val export=rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        val payload=state.exportPayload
        if(uri!=null && payload!=null) scope.launch(Dispatchers.IO) {
            try {
                val output = context.contentResolver.openOutputStream(uri) ?: error("Fichier indisponible")
                output.bufferedWriter().use { it.write(payload) }
                model.exportSaved()
            } catch (_: Exception) { model.exportFailed() }
        } else model.exportSaved()
    }
    LaunchedEffect(state.exportPayload) { if(state.exportPayload!=null) export.launch("betverse-mes-donnees.json") }
    var pseudo by remember(state.player?.username) { mutableStateOf(state.player?.username.orEmpty()) }
    var password by remember { mutableStateOf("") }
    var replacement by remember { mutableStateOf("") }
    var confirmation by remember { mutableStateOf("") }
    var deletion by remember { mutableStateOf(false) }
    LazyColumn(Modifier.fillMaxSize(),contentPadding=PaddingValues(16.dp),verticalArrangement=Arrangement.spacedBy(14.dp)) {
        item { TextButton(onClick=model::closePanel,enabled=!state.busy) { Icon(Icons.Outlined.ArrowBack,null); Text("Retour") } }
        when(state.panel) {
            "profile" -> {
                item { Text("Mon compte",style=MaterialTheme.typography.headlineLarge) }
                item { ClubCard(Modifier.fillMaxWidth()) {
                    Text(state.player?.email.orEmpty())
                    OutlinedTextField(pseudo,{pseudo=it},label={Text("Pseudo")},singleLine=true,modifier=Modifier.fillMaxWidth())
                    Button(onClick={model.username(pseudo)},enabled=!state.busy && pseudo!=state.player?.username,colors=clubButtonColors()) { Text("Enregistrer le pseudo") }
                } }
                item { ClubCard(Modifier.fillMaxWidth()) {
                    Text("Statistiques",style=MaterialTheme.typography.titleLarge)
                    listOf("betsPlayed" to "Paris joués","betsWon" to "Paris gagnés","winRate" to "Réussite (%)","currentStreak" to "Série gagnante","verseEarned" to "Verse gagnés").forEach { (key,label) -> StatLine(label,state.stats?.opt(key)?.toString() ?: "—") }
                } }
                item { ClubCard(Modifier.fillMaxWidth()) {
                    Text("Mot de passe",style=MaterialTheme.typography.titleLarge)
                    OutlinedTextField(password,{password=it},label={Text("Mot de passe actuel")},visualTransformation=PasswordVisualTransformation(),singleLine=true,modifier=Modifier.fillMaxWidth())
                    OutlinedTextField(replacement,{replacement=it},label={Text("Nouveau mot de passe")},supportingText={Text("10 caractères minimum, majuscule, minuscule et chiffre.")},visualTransformation=PasswordVisualTransformation(),singleLine=true,modifier=Modifier.fillMaxWidth())
                    Button(onClick={model.changePassword(password,replacement);password="";replacement=""},enabled=!state.busy && password.isNotBlank() && replacement.length>=10,colors=clubButtonColors()) { Text("Modifier et me reconnecter") }
                } }
                item { ClubCard(Modifier.fillMaxWidth()) {
                    Text("Notifications",style=MaterialTheme.typography.titleLarge)
                    PreferenceSwitch("Résultats de mes paris",state.noticePreferences.bets,!state.busy) { model.noticePreferences(state.noticePreferences.copy(bets=it)) }
                    PreferenceSwitch("Événements de mon agence",state.noticePreferences.agencies,!state.busy) { model.noticePreferences(state.noticePreferences.copy(agencies=it)) }
                    Text("Le push envoie une alerte générique via Firebase. Vous pouvez le désactiver à tout moment.",style=MaterialTheme.typography.bodySmall)
                    OutlinedButton(onClick={
                        if(android.os.Build.VERSION.SDK_INT>=33 && androidx.core.content.ContextCompat.checkSelfPermission(context,android.Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED) pushPermission.launch(android.Manifest.permission.POST_NOTIFICATIONS)
                        else model.enablePush()
                    },enabled=!state.busy) {Text("Activer sur cet appareil")}
                    TextButton(onClick=model::disablePush,enabled=!state.busy) {Text("Désactiver le push")}
                } }
                item { ClubCard(Modifier.fillMaxWidth()) {
                    Text("Mes données",style=MaterialTheme.typography.titleLarge)
                    OutlinedButton(onClick=model::exportAccount,enabled=!state.busy,modifier=Modifier.fillMaxWidth()) { Text("Exporter mes données") }
                    TextButton(onClick={onWeb("/legal/privacy")}) { Text("Confidentialité") }
                    TextButton(onClick={onWeb("/legal/rules")}) { Text("Règles du jeu") }
                    TextButton(onClick={deletion=true},enabled=!state.busy) { Text("Supprimer mon compte") }
                } }
            }
            "notices" -> {
                item { Text("Notifications",style=MaterialTheme.typography.headlineLarge); TextButton(onClick=model::readNotices,enabled=!state.busy) { Text("Tout marquer comme lu") } }
                if(state.notices.isEmpty()) item { EmptyState("Tout est à jour","Vos résultats et invitations apparaîtront ici.") }
                items(state.notices,key={it.id}) { notice -> ClubCard(Modifier.fillMaxWidth()) {
                    Text((if(notice.read) "" else "• ")+notice.title,style=MaterialTheme.typography.titleMedium)
                    Text(notice.message)
                    if(notice.type.startsWith("AGENCY_INVITE")) TextButton(onClick={model.closePanel();model.navigate(Destination.AGENCY)}) { Text("Voir mon agence et les invitations") }
                } }
            }
            "ranks" -> {
                item { Text("Classements",style=MaterialTheme.typography.headlineLarge) }
                item { LazyRow(horizontalArrangement=Arrangement.spacedBy(8.dp)) { items(listOf("verse" to "Verse","wins" to "Réussite","level" to "Niveau")) { (key,label) -> FilterChip(selected=state.rankMetric==key,onClick={model.rankMetric(key)},label={Text(label)},enabled=!state.busy,colors=clubFilterColors()) } } }
                items(state.ranks,key={it.id}) { player -> ClubCard(Modifier.fillMaxWidth().clickable(enabled=!state.busy) { model.publicProfile(player.id) }) {
                    StatLine("${player.rank}. ${player.username}","Niv. ${player.level}")
                    StatLine(verse(player.verse),"${player.winRate} %")
                } }
                item { Text("Classement des agences",style=MaterialTheme.typography.titleLarge); TextButton(onClick={model.closePanel();model.navigate(Destination.AGENCY)}) { Text("Voir les agences") } }
            }
            "public" -> {
                val profile=state.publicProfile
                item { Text(profile?.optJSONObject("user")?.optString("username") ?: "Joueur",style=MaterialTheme.typography.headlineLarge) }
                item { ClubCard(Modifier.fillMaxWidth()) {
                    val stats=profile?.optJSONObject("stats")
                    StatLine("Paris joués",stats?.optLong("betsPlayed")?.toString() ?: "—")
                    StatLine("Réussite",(stats?.optDouble("winRate") ?: 0.0).toString()+" %")
                    StatLine("Série gagnante",stats?.optLong("currentStreak")?.toString() ?: "—")
                } }
            }
        }
        item { TextButton(onClick={onWeb("/legal/support")}) { Text("Aide et support") } }
    }
    if(deletion) AlertDialog(onDismissRequest={if(!state.busy){deletion=false;password="";confirmation=""}},
        title={Text("Supprimer définitivement mon compte")},text={Column(verticalArrangement=Arrangement.spacedBy(10.dp)) {
            Text("Vos paris, soldes virtuels et données seront effacés. La direction de votre agence sera transmise au membre le plus ancien, ou l’agence supprimée si vous êtes seul.")
            OutlinedTextField(password,{password=it},label={Text("Mot de passe")},visualTransformation=PasswordVisualTransformation(),singleLine=true)
            OutlinedTextField(confirmation,{confirmation=it},label={Text("Saisir SUPPRIMER")},singleLine=true)
        }},confirmButton={TextButton(onClick={model.deleteAccount(password);password="";confirmation="";deletion=false},enabled=!state.busy && confirmation=="SUPPRIMER" && password.isNotBlank()) { Text("Supprimer définitivement") }},
        dismissButton={TextButton(onClick={deletion=false;password="";confirmation=""},enabled=!state.busy) { Text("Annuler") }})
}

@Composable private fun PreferenceSwitch(label: String,value: Boolean,enabled: Boolean,onChange:(Boolean)->Unit) {
    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) { Text(label,Modifier.weight(1f)); Switch(value,onChange,enabled=enabled) }
}

@Composable fun NativeAgencyScreen(state: UiState,model: AppViewModel) {
    var search by remember { mutableStateOf("") }; var name by remember { mutableStateOf("") }; var invite by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf<Pair<String,()->Unit>?>(null) }
    var primary by remember(state.agency?.primary) { mutableStateOf(state.agency?.primary ?: "#2458E8") }
    var secondary by remember(state.agency?.secondary) { mutableStateOf(state.agency?.secondary ?: "#FFFFFF") }
    val agency=state.agency; val role=agency?.members?.find { it.id==state.player?.id }?.role
    LazyColumn(Modifier.fillMaxSize(),contentPadding=PaddingValues(16.dp),verticalArrangement=Arrangement.spacedBy(14.dp)) {
        item { Text("Mon agence",style=MaterialTheme.typography.headlineLarge) }
        items(state.invites,key={it.id}) { invitation -> ClubCard(Modifier.fillMaxWidth()) {
            Text("${invitation.inviter} vous invite à ${invitation.agency}")
            Row { Button(onClick={model.agencyAction("/invitations/${invitation.id}/accept")},enabled=!state.busy,colors=clubButtonColors()) {Text("Accepter")}; TextButton(onClick={model.agencyAction("/invitations/${invitation.id}/decline")},enabled=!state.busy){Text("Refuser")} }
        } }
        if(agency==null) {
            item { ClubCard(Modifier.fillMaxWidth()) {
                Text("Créer mon agence",style=MaterialTheme.typography.titleLarge)
                OutlinedTextField(name,{name=it.take(40)},label={Text("Nom de l’agence")},singleLine=true,modifier=Modifier.fillMaxWidth())
                Text("Création : 100 Shards · Solde : ${state.wallet?.shards ?: 0}")
                Button(onClick={confirm="Créer cette agence pour 100 Shards ?" to {model.agencyAction("",JSONObject().put("name",name))}},enabled=!state.busy && name.trim().length>=3 && (state.wallet?.shards ?: 0)>=100,colors=clubButtonColors()) {Text("Créer l’agence")}
            } }
        } else {
            item { ClubCard(Modifier.fillMaxWidth()) { Text(agency.name,style=MaterialTheme.typography.titleLarge); StatLine("Membres","${agency.count} / 50");StatLine("Points",agency.points.toString());StatLine("Expérience",agency.xp.toString());Text("Votre rôle : $role") } }
            if(role in listOf("DIRECTEUR","ASSOCIE","RESPONSABLE")) item { ClubCard(Modifier.fillMaxWidth()) {
                OutlinedTextField(invite,{invite=it},label={Text("Pseudo du joueur à inviter")},singleLine=true,modifier=Modifier.fillMaxWidth())
                Button(onClick={model.agencyAction("/invitations",JSONObject().put("username",invite.trim().lowercase()));invite=""},enabled=!state.busy && invite.length>=3,colors=clubButtonColors()) {Text("Inviter ce joueur")}
            } }
            item { Text("Membres",style=MaterialTheme.typography.titleLarge) }
            items(agency.members,key={it.id}) { member -> ClubCard(Modifier.fillMaxWidth()) {
                TextButton(onClick={model.publicProfile(member.id)},enabled=!state.busy) {Text(member.username)}
                StatLine(member.role,"${member.points} points")
                if(role=="DIRECTEUR") {
                    var expanded by remember { mutableStateOf(false) }
                    Box { TextButton(onClick={expanded=true},enabled=!state.busy) {Text("Modifier le rôle")}
                        DropdownMenu(expanded,{expanded=false}) { listOf("DIRECTEUR","ASSOCIE","RESPONSABLE","MEMBRE","STAGIAIRE").forEach { newRole ->
                            DropdownMenuItem(text={Text(newRole)},onClick={expanded=false;confirm="Attribuer le rôle $newRole à ${member.username} ?" to {
                                val changes=JSONArray().put(JSONObject().put("id",member.id).put("role",newRole))
                                if(newRole=="DIRECTEUR" && member.id!=state.player?.id) changes.put(JSONObject().put("id",state.player?.id).put("role","MEMBRE"))
                                model.agencyAction("/members/roles",JSONObject().put("changes",changes),"PATCH")
                            } })
                        } }
                    }
                }
            } }
            if(role in listOf("DIRECTEUR","ASSOCIE")) item { ClubCard(Modifier.fillMaxWidth()) {
                Text("Personnalisation",style=MaterialTheme.typography.titleLarge)
                OutlinedTextField(primary,{primary=it.take(7)},label={Text("Couleur principale #RRGGBB")},singleLine=true)
                OutlinedTextField(secondary,{secondary=it.take(7)},label={Text("Couleur secondaire #RRGGBB")},singleLine=true)
                Row { listOf("logo-1","logo-2","logo-3","logo-4").forEachIndexed { index,logo -> TextButton(onClick={model.agencyAction("/me",JSONObject().put("logoId",logo),"PATCH")},enabled=!state.busy){Text("${index+1}")} } }
                Button(onClick={model.agencyAction("/me",JSONObject().put("primaryColor",primary).put("secondaryColor",secondary),"PATCH")},enabled=!state.busy && Regex("#[A-Fa-f0-9]{6}").matches(primary) && Regex("#[A-Fa-f0-9]{6}").matches(secondary),colors=clubButtonColors()) {Text("Enregistrer les couleurs")}
            } }
            item { Text("Missions",style=MaterialTheme.typography.titleLarge); val missions=state.coordination?.optJSONArray("missions"); if(missions!=null) for(index in 0 until missions.length()) {val mission=missions.getJSONObject(index);Text("${mission.optString("title", "Dix premiers points")} : ${mission.optInt("progress")} / ${mission.optInt("target")}")} }
            item { Text("Pronostics collectifs",style=MaterialTheme.typography.titleLarge) }
            items(state.fixtures.filter {it.sport=="football" && it.available(state.now)},key={"vote:"+it.id}) { fixture -> ClubCard(Modifier.fillMaxWidth()) {
                val vote=state.votes.find {it.optString("matchId")==fixture.id}?.optJSONObject("userScore")
                var home by remember(fixture.id,vote?.toString()) { mutableStateOf(vote?.optInt("homeScore")?.toString() ?: "") }
                var away by remember(fixture.id,vote?.toString()) { mutableStateOf(vote?.optInt("awayScore")?.toString() ?: "") }
                Text("${fixture.home} — ${fixture.away}")
                Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {OutlinedTextField(home,{home=it.filter(Char::isDigit).take(3)},label={Text("Domicile")},modifier=Modifier.weight(1f),singleLine=true);OutlinedTextField(away,{away=it.filter(Char::isDigit).take(3)},label={Text("Extérieur")},modifier=Modifier.weight(1f),singleLine=true)}
                Button(onClick={model.agencyAction("/match-votes",JSONObject().put("votes",JSONArray().put(JSONObject().put("matchId",fixture.id).put("homeScore",home.toInt()).put("awayScore",away.toInt()))))},enabled=!state.busy && home.toIntOrNull() in 0..200 && away.toIntOrNull() in 0..200,colors=clubButtonColors()){Text("Valider mon pronostic")}
            } }
            item { TextButton(onClick={confirm=if(role=="DIRECTEUR") "Supprimer définitivement cette agence ?" to {model.agencyAction("",method="DELETE")} else "Quitter cette agence ?" to {model.agencyAction("/leave")}},enabled=!state.busy) { Text(if(role=="DIRECTEUR") "Supprimer l’agence" else "Quitter l’agence") } }
        }
        item { Text("Classement et recherche d’agences",style=MaterialTheme.typography.titleLarge);OutlinedTextField(search,{search=it},label={Text("Rechercher une agence")},modifier=Modifier.fillMaxWidth(),singleLine=true) }
        items(state.agencies.filter {it.name.contains(search,ignoreCase=true)},key={"agency:"+it.id}) { row -> ClubCard(Modifier.fillMaxWidth()) {StatLine(row.name,"${row.points} points");Text("${row.count} membres · ${row.xp} XP")} }
    }
    confirm?.let { (text,action) -> AlertDialog(onDismissRequest={confirm=null},title={Text("Confirmer")},text={Text(text)},confirmButton={TextButton(onClick={confirm=null;action()},enabled=!state.busy){Text("Confirmer")}},dismissButton={TextButton(onClick={confirm=null}){Text("Annuler")}}) }
}
