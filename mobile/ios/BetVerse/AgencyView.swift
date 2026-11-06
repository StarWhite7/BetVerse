import SwiftUI

struct AgencyView: View {
    @EnvironmentObject var model: Model
    @State private var search = "", name = "", invite = "", primary = "#0641F5", secondary = "#FFFFFF", logo = "logo-1", banner = "grid"
    @State private var confirmation = "", action = "", transfer: Object?
    var members: [Object] { objects(model.agency?["members"]) }
    var role: String { members.first { string($0,"id") == model.user.map { string($0,"id") } }.map { string($0,"agencyRole") } ?? "" }
    var body: some View { List {
        if let agency = model.agency {
            Section(string(agency,"name")) { Text("\(number(agency,"clanScore")) points · Niveau \(number(agency,"level")) · \(members.count)/50 membres"); Text("Mon rôle : " + role) }
            Section("Membres") { ForEach(members,id:\.selfID) { member in
                VStack(alignment:.leading) {
                    NavigationLink(string(member,"username")) { PublicProfileView(id:string(member,"id")) }
                    Text(string(member,"agencyRole") + " · \(number(member,"predictionScore")) points").font(.caption)
                    if role == "DIRECTEUR", string(member,"agencyRole") != "DIRECTEUR" {
                        Menu("Modifier le rôle") {
                            ForEach(["STAGIAIRE","MEMBRE","RESPONSABLE","ASSOCIE"],id:\.self) { value in Button(value) { model.agencyAction("/members/roles",["changes":[["id":string(member,"id"),"role":value]]],method:"PATCH") } }
                            Button("Transférer la direction",role:.destructive) { transfer = member; action = "transfer"; confirmation = "Transférer la direction à " + string(member,"username") + " ? Vous deviendrez membre." }
                        }
                    }
                }
            } }
            if ["DIRECTEUR","ASSOCIE","RESPONSABLE"].contains(role) {
                Section("Inviter un joueur") { TextField("Pseudo exact",text:$invite).textInputAutocapitalization(.never); Button("Envoyer l’invitation") { model.agencyAction("/invitations",["username":invite]); invite = "" }.disabled(model.busy || invite.isEmpty) }
            }
            if ["DIRECTEUR","ASSOCIE"].contains(role) {
                Section("Identité de l’agence") {
                    TextField("Couleur principale #RRGGBB",text:$primary).autocorrectionDisabled()
                    TextField("Couleur secondaire #RRGGBB",text:$secondary).autocorrectionDisabled()
                    Picker("Écusson",selection:$logo) { ForEach(1...4,id:\.self) { Text("Écusson \($0)").tag("logo-\($0)") } }
                    Picker("Bannière",selection:$banner) { ForEach(["grid","waves","rain","circuit"],id:\.self) { Text($0).tag($0) } }
                    Button("Enregistrer l’identité") { model.agencyAction("/me",["primaryColor":primary,"secondaryColor":secondary,"logoId":logo,"bannerStyle":banner],method:"PATCH") }.disabled(model.busy)
                }
            }
            Section("Missions") { ForEach(Array(objects(model.coordination["missions"]).enumerated()),id:\.offset) { _,row in
                let mission = row["mission"] as? Object ?? [:]
                VStack(alignment:.leading) { Text(string(mission,"title")).font(.headline); Text(string(mission,"description")); Text("\(number(row,"progress"))/\(number(row,"target")) · " + string(row,"status")) }
            } }
            Section("Pronostics collectifs") {
                ForEach(model.matches.filter { string($0,"sportKey") == "football" },id:\.selfID) { match in NavigationLink(string(match,"homeTeam") + " — " + string(match,"awayTeam")) { PredictionView(match:match) } }
            }
            Section { Button(role == "DIRECTEUR" ? "Supprimer l’agence" : "Quitter l’agence",role:.destructive) { action = role == "DIRECTEUR" ? "delete" : "leave"; confirmation = role == "DIRECTEUR" ? "Supprimer définitivement cette agence et ses invitations ?" : "Quitter cette agence ?" }.disabled(model.busy) }
        } else {
            Section("Créer mon agence") {
                Text("Création : 100 Shards. Capacité : 50 membres.")
                TextField("Nom de l’agence",text:$name)
                Button("Créer pour 100 Shards") { action = "create"; confirmation = "Créer \(name) et dépenser 100 Shards ?" }.disabled(model.busy || name.trimmingCharacters(in:.whitespaces).count < 3)
            }
            Section("Invitations reçues") { ForEach(model.invites,id:\.selfID) { invite in
                VStack(alignment:.leading) { Text(string(invite["agency"] as? Object ?? [:],"name")); HStack { Button("Accepter") { model.agencyAction("/invitations/" + string(invite,"id") + "/accept") }; Button("Refuser") { model.agencyAction("/invitations/" + string(invite,"id") + "/decline") } }
            } } }
        }
        Section("Classement des agences") {
            TextField("Rechercher une agence",text:$search)
            ForEach(model.agencies.filter { search.isEmpty || string($0,"name").localizedCaseInsensitiveContains(search) },id:\.selfID) { agency in
                HStack { Text(string(agency,"name")); Spacer(); Text("\(number(agency,"clanScore")) pts · Niv. \(number(agency,"level"))") }
            }
        }
    }.navigationTitle("Mon agence").toolbar { Button("Actualiser",action:model.loadAgency).disabled(model.busy) }
    .onAppear { model.loadAgency() }
    .onChange(of:model.agency.map { string($0,"id") }) { _,_ in if let agency = model.agency { primary = string(agency,"primaryColor"); secondary = string(agency,"secondaryColor"); logo = string(agency,"logoId"); banner = string(agency,"bannerStyle") } }
    .confirmationDialog(confirmation,isPresented:Binding(get:{!confirmation.isEmpty},set:{if !$0 { confirmation = "" }}),titleVisibility:.visible) {
        Button("Confirmer",role:action == "create" ? nil : .destructive) {
            switch action {
            case "create": model.agencyAction("",["name":name])
            case "delete": model.agencyAction("",method:"DELETE")
            case "leave": model.agencyAction("/leave")
            case "transfer": if let transfer, let user = model.user { model.agencyAction("/members/roles",["changes":[["id":string(user,"id"),"role":"MEMBRE"],["id":string(transfer,"id"),"role":"DIRECTEUR"]]],method:"PATCH") }
            default: break
            }
            confirmation = ""
        }
        Button("Annuler",role:.cancel) { confirmation = "" }
    }
    }
}
struct PredictionView: View {
    @EnvironmentObject var model: Model
    let match: Object
    @State private var home = "0", away = "0"
    var body: some View { Form {
        Text(string(match,"homeTeam") + " — " + string(match,"awayTeam")).font(.headline)
        Text("Pronostic personnel contribuant au score collectif. Verrouillé au début du match.")
        TextField("Score domicile",text:$home).keyboardType(.numberPad)
        TextField("Score extérieur",text:$away).keyboardType(.numberPad)
        Button("Enregistrer mon pronostic") { guard let h = Int(home), let a = Int(away), (0...200).contains(h), (0...200).contains(a) else { model.message = "Score invalide."; return }; model.agencyAction("/match-votes",["votes":[["matchId":string(match,"id"),"homeScore":h,"awayScore":a]]]) }.disabled(model.busy)
    }.navigationTitle("Pronostic") }
}
