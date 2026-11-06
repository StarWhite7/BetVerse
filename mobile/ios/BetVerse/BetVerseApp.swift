import SwiftUI
import BetVerseCore
import UniformTypeIdentifiers

typealias Object = [String: Any]
func string(_ object: Object, _ key: String) -> String { object[key].map { String(describing: $0) } ?? "" }
func number(_ object: Object, _ key: String) -> Int { (object[key] as? NSNumber)?.intValue ?? 0 }
func objects(_ value: Any?) -> [Object] { value as? [Object] ?? [] }
func decimal(_ object: Object, _ key: String) -> Decimal { Decimal(string: string(object,key), locale: Locale(identifier: "en_US_POSIX")) ?? 0 }
func price(_ value: Decimal) -> String { NSDecimalNumber(decimal: value).stringValue }
struct SavedDraft: Codable { var owner: String; var rows: [Selection]; var stake: String }
struct PendingTicket: Codable { var owner: String; var path: String; var body: Data; var key: String }

@MainActor final class Model: ObservableObject {
    let api: API
    let origin: String
    @Published var user: Object?; @Published var wallet: Object = [:]
    @Published var matches: [Object] = []; @Published var tickets: [Object] = []
    @Published var agency: Object?; @Published var agencies: [Object] = []; @Published var invites: [Object] = []
    @Published var notices: [Object] = []; @Published var ranks: [Object] = []; @Published var stats: Object = [:]
    @Published var preferences: Object = [:]; @Published var coordination: Object = [:]
    @Published var rows: [Selection] = []; @Published var stake = "100"; @Published var pending: PendingTicket?
    @Published var busy = false; @Published var message: String?; @Published var slip = false
    @Published var sport = "football"; @Published var competition = ""; @Published var ticketFilter = ""
    @Published var ticketPage = 0
    init() {
        origin = Bundle.main.object(forInfoDictionaryKey: "BETVERSE_API_ORIGIN") as? String ?? "https://betverse-beta.onrender.com"
        // A malformed release configuration stops before any request can leave the app.
        api = try! API(origin: origin, vault: KeychainVault(service: "fr.betverse.ios." + origin))
    }
    func object(_ path: String, method: String = "GET", body: Object? = nil, key: String? = nil) async throws -> Any {
        let data = try await api.request(path, method: method, body: try body.map { try JSONSerialization.data(withJSONObject: $0) }, idempotency: key)
        return data.isEmpty ? [:] : try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
    }
    func perform(_ action: @escaping () async throws -> Void) {
        guard !busy else { return }; busy = true; message = nil
        Task { defer { busy = false }; do { try await action() } catch { message = error.localizedDescription } }
    }
    func refresh() async throws {
        wallet = try await object("/api/wallet") as? Object ?? [:]
        matches = objects(try await object("/api/matches?status=UPCOMING"))
    }
    func restoreDraft() async {
        guard let user, let owner = user["id"] as? String else { return }
        if let data = await api.privateData("draft:" + owner), let draft = try? JSONDecoder().decode(SavedDraft.self, from: data), draft.owner == owner { rows = draft.rows; stake = draft.stake }
        if let data = await api.privateData("pending:" + owner), let value = try? JSONDecoder().decode(PendingTicket.self, from: data), value.owner == owner { pending = value; slip = true }
    }
    func persistDraft() async throws {
        guard let user else { return }; let owner = string(user,"id")
        try await api.savePrivate("draft:" + owner, data: rows.isEmpty ? nil : JSONEncoder().encode(SavedDraft(owner: owner,rows: rows,stake: stake)))
    }
    func start() async {
        do { user = try await object("/api/auth/me") as? Object; await restoreDraft(); try await refresh() }
        catch APIError.response(401, _) {} catch { message = error.localizedDescription }
    }
    func login(_ identifier: String, _ password: String) { perform {
        let response = try await self.object("/api/auth/login",method:"POST",body:["identifier":identifier,"password":password]) as? Object
        self.user = response?["user"] as? Object; await self.restoreDraft(); try await self.refresh()
    } }
    func logout() { perform {
        _ = try await self.object("/api/auth/logout",method:"POST",body:[:]); self.user = nil; self.rows = []; self.pending = nil; self.wallet = [:]; self.tickets = []; self.agency = nil; self.notices = []
    } }
    func select(_ match: Object, _ type: String, _ quote: Decimal) {
        guard !busy, pending == nil else { slip = pending != nil; return }
        let selection = Selection(matchId:string(match,"id"),match:string(match,"homeTeam") + " — " + string(match,"awayTeam"),betType:type,odds:quote)
        rows = Coupon.toggled(rows,selection)
        Task { do { try await persistDraft() } catch { message = "Brouillon non enregistré sur cet appareil." } }
    }
    func remove(_ row: Selection) { guard pending == nil else { return }; rows.removeAll { $0.id == row.id }; Task { try? await persistDraft() } }
    func confirm() { perform {
        guard let user = self.user else { return }; let owner = string(user,"id")
        let value: PendingTicket
        if let pending = self.pending { guard pending.owner == owner else { return }; value = pending }
        else {
            guard !self.rows.isEmpty, let amount = Int(self.stake), (1...1_000_000).contains(amount), amount <= number(self.wallet,"balance"), Coupon.odds(self.rows) <= 1_000_000 else { self.message = "Vérifiez la mise, les sélections et le solde."; return }
            let path = self.rows.count == 1 ? "/api/bet" : "/api/bet/combined"
            var body: Object = ["amount":amount]
            if self.rows.count == 1 { let row = self.rows[0]; body["matchId"] = row.matchId; body["betType"] = row.betType; body["odds"] = NSDecimalNumber(decimal:row.odds) }
            else { body["selections"] = self.rows.map { ["matchId":$0.matchId,"betType":$0.betType,"odds":NSDecimalNumber(decimal:$0.odds)] as Object } }
            value = PendingTicket(owner:owner,path:path,body:try JSONSerialization.data(withJSONObject:body),key:UUID().uuidString)
            try await self.api.savePrivate("pending:" + owner,data:JSONEncoder().encode(value)); self.pending = value
        }
        do {
            _ = try await self.api.request(value.path,method:"POST",body:value.body,idempotency:value.key)
            try await self.api.savePrivate("pending:" + owner,data:nil); self.pending = nil; self.rows = []; try await self.persistDraft(); self.slip = false
            try await self.refresh(); self.message = "Pari enregistré."
        } catch APIError.response(let status, let text) where (400...499).contains(status) && status != 408 && status != 429 {
            try await self.api.savePrivate("pending:" + owner,data:nil); self.pending = nil; throw APIError.response(status,text)
        }
    } }
    func claim() { perform { _ = try await self.object("/api/wallet/claim",method:"POST",body:[:],key:UUID().uuidString); try await self.refresh() } }
    func loadTickets() { perform { self.tickets = objects(try await self.object("/api/bet/my-bets?limit=25&skip=\(self.ticketPage * 25)" + (self.ticketFilter.isEmpty ? "" : "&status=" + self.ticketFilter))) } }
    func loadAgencyData() async throws {
        agency = try await object("/api/agence/roster") as? Object
        agencies = objects(try await object("/api/agence")); invites = objects(try await object("/api/agence/invitations"))
        if agency != nil { coordination = try await object("/api/agence/coordination") as? Object ?? [:] }
    }
    func loadAgency() { perform { try await self.loadAgencyData() } }
    func agencyAction(_ path: String, _ body: Object = [:], method: String = "POST") { perform {
        _ = try await self.object("/api/agence" + path,method:method,body:body); try await self.loadAgencyData(); try await self.refresh()
    } }
    func loadProfile() { perform {
        self.stats = try await self.object("/api/users/me/stats") as? Object ?? [:]
        self.preferences = try await self.object("/api/notifications/preferences") as? Object ?? [:]
    } }
    func loadNotices() { perform { self.notices = objects(try await self.object("/api/notifications")) } }
    func loadRanks(_ metric: String) { perform { self.ranks = objects(try await self.object("/api/leaderboard?metric=" + metric)) } }
}

@main struct BetVerseApp: App {
    @StateObject private var model = Model()
    @AppStorage("appearance") private var appearance = "system"
    var body: some Scene { WindowGroup {
        Group { if model.user == nil { LoginView() } else { ClubTabs() } }
            .environmentObject(model).tint(Color(red:0.02,green:0.25,blue:0.96))
            .preferredColorScheme(appearance == "dark" ? .dark : appearance == "light" ? .light : nil)
            .task { await model.start() }
            .alert("BetVerse",isPresented:Binding(get:{model.message != nil},set:{if !$0 { model.message = nil }})) { Button("Fermer") { model.message = nil } } message: { Text(model.message ?? "") }
    } }
}
struct LoginView: View {
    @EnvironmentObject var model: Model
    @State private var identifier = "", password = "", email = "", registration = false
    var body: some View { NavigationStack { Form {
        Section { Text("BV BETVERSE").font(.largeTitle.bold()).foregroundStyle(.blue); Text("Votre club de pronostics. Monnaie virtuelle, aucun gain en argent.") }
        Section(registration ? "Créer un compte" : "Connexion") {
            TextField("Pseudo ou email",text:$identifier).textInputAutocapitalization(.never).autocorrectionDisabled()
            if registration { TextField("Email",text:$email).keyboardType(.emailAddress).textInputAutocapitalization(.never) }
            SecureField("Mot de passe",text:$password).textContentType(registration ? .newPassword : .password)
            Button(registration ? "S’inscrire" : "Se connecter") {
                let secret = password; password = ""
                if registration { model.perform { _ = try await model.object("/api/auth/register",method:"POST",body:["email":email,"username":identifier,"password":secret]); model.message = "Compte créé. Confirmez votre email avant de vous connecter."; registration = false } }
                else { model.login(identifier,secret) }
            }.disabled(model.busy)
            Button(registration ? "J’ai déjà un compte" : "Créer un compte") { registration.toggle(); password = "" }
            if !registration {
                Button("Mot de passe oublié") { model.perform { _ = try await model.object("/api/auth/forgot-password",method:"POST",body:["identifier":identifier]); model.message = "Si le compte existe, un email a été envoyé." } }
                Button("Renvoyer la confirmation") { model.perform { _ = try await model.object("/api/auth/resend-verification",method:"POST",body:["identifier":identifier]); model.message = "Vérifiez votre messagerie." } }
            }
        }
        Section { Link("Règles et confidentialité",destination:URL(string:model.origin + "/legal/privacy")!) }
    }.navigationTitle("Bienvenue") } }
}
struct ClubTabs: View {
    @EnvironmentObject var model: Model
    var body: some View { TabView {
        NavigationStack { List {
            Section { Text("BV BETVERSE").font(.title.bold()); Text("Bonjour \(model.user.map { string($0,"username") } ?? "")"); Text("\(number(model.wallet,"balance")) Verse · \(number(model.wallet,"shards")) Shards") }
            Section("Bonus quotidien") { Button("Récupérer 500 Verse",action:model.claim).disabled(model.busy); Text("Une fois toutes les 24 heures. Le serveur vérifie l’éligibilité.").font(.footnote) }
            Section { NavigationLink("Classements") { RanksView() }; Button("Actualiser") { model.perform { try await model.refresh() } } }
        }.navigationTitle("Accueil").toolbar { NavigationLink { NoticesView() } label: { Image(systemName:"bell") } } }.tabItem { Label("Accueil",systemImage:"house") }
        NavigationStack { MatchesView() }.tabItem { Label("Matchs",systemImage:"sportscourt") }
        NavigationStack { TicketsView() }.tabItem { Label("Mes paris",systemImage:"ticket") }
        NavigationStack { AgencyView() }.tabItem { Label("Agence",systemImage:"person.3") }
        NavigationStack { ProfileView() }.tabItem { Label("Profil",systemImage:"person.crop.circle") }
    }.sheet(isPresented:$model.slip) { CouponView().environmentObject(model).presentationDetents([.medium,.large]).interactiveDismissDisabled(model.busy) } }
}
struct MatchesView: View {
    @EnvironmentObject var model: Model
    var competitions: [String] { Array(Set(model.matches.filter { string($0,"sportKey") == model.sport }.map { string($0,"competition") })).sorted() }
    var body: some View { VStack(spacing:0) {
        Picker("Sport",selection:$model.sport) { Label("Football",systemImage:"soccerball").tag("football"); Label("Tennis",systemImage:"tennisball").tag("tennis"); Label("Basket",systemImage:"basketball").tag("basketball") }.pickerStyle(.segmented).padding()
        ScrollView(.horizontal,showsIndicators:false) { HStack { Button("Toutes") { model.competition = "" }; ForEach(competitions,id:\.self) { name in Button(name) { model.competition = name }.buttonStyle(.bordered).tint(model.competition == name ? .blue : .secondary) } }.padding(.horizontal) }
        List {
            ForEach(model.matches.filter { string($0,"sportKey") == model.sport && (model.competition.isEmpty || string($0,"competition") == model.competition) },id:\.selfID) { match in
                VStack(alignment:.leading,spacing:12) {
                    Text(string(match,"competition")).font(.caption).foregroundStyle(.secondary)
                    Text(string(match,"homeTeam") + " — " + string(match,"awayTeam")).font(.headline)
                    Text(string(match,"startDate")).font(.caption)
                    HStack { ForEach([("HOME","1","oddsHome"),("DRAW","N","oddsDraw"),("AWAY","2","oddsAway")],id:\.0) { type,label,key in
                        if decimal(match,key) > 0 {
                            let selected = model.rows.contains { $0.matchId == string(match,"id") && $0.betType == type }
                            Button { model.select(match,type,decimal(match,key)) } label: { Text(label + "  " + price(decimal(match,key))).frame(maxWidth:.infinity).padding(.vertical,8).foregroundStyle(selected ? Color.white : Color.primary).background(selected ? Color.blue : Color.secondary.opacity(0.1),in:RoundedRectangle(cornerRadius:8)) }.buttonStyle(.plain).disabled(model.busy || model.pending != nil)
                        }
                    } }
                }.padding(.vertical,8)
            }
            if model.matches.isEmpty { Text("Aucune rencontre disponible. Actualisez le catalogue.") }
        }
        if !model.rows.isEmpty || model.pending != nil { Button("Voir mon pari · \(model.rows.count) sélection(s)") { model.slip = true }.buttonStyle(.borderedProminent).padding() }
    }.navigationTitle("Matchs").toolbar { Button("Actualiser") { model.perform { try await model.refresh() } }.disabled(model.busy) } }
}
extension Dictionary where Key == String, Value == Any { var selfID: String { string(self,"id") } }
struct CouponView: View {
    @EnvironmentObject var model: Model
    var body: some View { NavigationStack { Form {
        if model.pending != nil { Text("Réponse interrompue : la reprise conserve exactement la même mise, les mêmes cotes et la même clé. Ne créez pas un second ticket.").foregroundStyle(.orange) }
        ForEach(model.rows) { row in HStack { VStack(alignment:.leading) { Text(row.match); Text(row.betType + " · " + price(row.odds)).font(.caption) }; Spacer(); Button("Retirer") { model.remove(row) }.disabled(model.pending != nil || model.busy) } }
        Section("Mise en Verse") { TextField("100",text:$model.stake).keyboardType(.numberPad).disabled(model.pending != nil || model.busy).onChange(of:model.stake) { _,_ in Task { try? await model.persistDraft() } }; Text("Cote totale : " + price(Coupon.odds(model.rows))); Text("Gain potentiel, mise incluse : " + price(Coupon.payout(stake:Int(model.stake) ?? 0,rows:model.rows)) + " V") }
        Button(model.pending == nil ? "Confirmer le pari" : "Vérifier/reprendre le ticket",action:model.confirm).disabled(model.busy || (model.rows.isEmpty && model.pending == nil))
        Text("Monnaie virtuelle. Aucun gain en argent.").font(.footnote)
    }.navigationTitle("Mon pari").toolbar { Button("Fermer") { model.slip = false }.disabled(model.busy) } } }
}
struct TicketsView: View {
    @EnvironmentObject var model: Model
    var body: some View { List {
        Picker("Statut",selection:$model.ticketFilter) { Text("Tous").tag(""); Text("En attente").tag("PENDING"); Text("Gagnés").tag("WON"); Text("Perdus").tag("LOST"); Text("Remboursés").tag("VOID") }.onChange(of:model.ticketFilter) { _,_ in model.ticketPage = 0; model.loadTickets() }
        ForEach(model.tickets,id:\.selfID) { ticket in NavigationLink { List {
            Text(string(ticket,"match")).font(.headline); Text("Statut : " + string(ticket,"status")); Text("Mise : \(number(ticket,"amount")) V · Cote : " + string(ticket,"odds")); Text("Verse reçus : \(number(ticket,"payout"))")
            ForEach(Array(objects(ticket["selections"]).enumerated()),id:\.offset) { _,leg in VStack(alignment:.leading) { Text(string(leg,"match")); Text(string(leg,"betType") + " · " + string(leg,"odds") + " · " + string(leg,"status")).font(.caption) } }
            Text(string(ticket,"id")).font(.caption).textSelection(.enabled)
        }.navigationTitle("Détail du ticket") } label: { VStack(alignment:.leading) { Text(string(ticket,"match")); Text("\(number(ticket,"amount")) V · " + string(ticket,"status")).font(.caption) } } }
        if model.tickets.isEmpty { Text("Aucun ticket dans cette page.") }
        HStack { Button("Précédent") { model.ticketPage -= 1; model.loadTickets() }.disabled(model.ticketPage == 0 || model.busy); Spacer(); Text("\(model.ticketPage + 1)"); Button("Suivant") { model.ticketPage += 1; model.loadTickets() }.disabled(model.tickets.count < 25 || model.busy) }
    }.navigationTitle("Mes paris").toolbar { Button("Actualiser",action:model.loadTickets).disabled(model.busy) }.onAppear { model.loadTickets() } }
}
struct JSONFile: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    var data: Data
    init(data: Data) { self.data = data }
    init(configuration: ReadConfiguration) throws { data = configuration.file.regularFileContents ?? Data() }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents:data) }
}
struct ProfileView: View {
    @EnvironmentObject var model: Model
    @AppStorage("appearance") private var appearance = "system"
    @State private var username = "", password = "", newPassword = "", confirmation = "", deletion = false
    @State private var file = JSONFile(data:Data()), export = false
    var body: some View { Form {
        Section("Mon compte") {
            Text(model.user.map { string($0,"email") } ?? "")
            TextField("Pseudo",text:$username)
            Button("Enregistrer mon pseudo") { model.perform { model.user = try await model.object("/api/users/me",method:"PATCH",body:["username":username]) as? Object } }.disabled(model.busy)
            Picker("Apparence",selection:$appearance) { Text("Système").tag("system"); Text("Clair").tag("light"); Text("Sombre").tag("dark") }
        }
        Section("Statistiques") { ForEach(model.stats.keys.sorted(),id:\.self) { key in if model.stats[key] is NSNumber { LabeledContent(key,value:string(model.stats,key)) } }; NavigationLink("Classements") { RanksView() } }
        Section("Mot de passe") {
            SecureField("Mot de passe actuel",text:$password); SecureField("Nouveau mot de passe",text:$newPassword)
            Button("Changer le mot de passe") { let old = password, replacement = newPassword; password = ""; newPassword = ""; model.perform { _ = try await model.object("/api/users/me/password",method:"PATCH",body:["currentPassword":old,"newPassword":replacement]); try await model.api.clearSession(); model.user = nil; model.message = "Mot de passe modifié. Reconnectez-vous." } }.disabled(model.busy)
        }
        Section("Notifications") { NavigationLink("Centre de notifications") { NoticesView() }; Toggle("Résultats des paris",isOn:preference("bets")); Toggle("Activité de l’agence",isOn:preference("agencies")); Text("Push système non activé sur cette version iOS.").font(.caption) }
        Section("Données et assistance") {
            Button("Exporter mes données") { model.perform { let data = try await model.api.request("/api/users/me/export"); file = JSONFile(data:data); export = true } }
            Link("Support",destination:URL(string:model.origin + "/legal/support")!)
            Link("Confidentialité et suppression",destination:URL(string:model.origin + "/legal/privacy")!)
            Link("Règles du jeu",destination:URL(string:model.origin + "/legal/rules")!)
            Button("Supprimer mon compte",role:.destructive) { deletion = true }
            Button("Se déconnecter",action:model.logout).disabled(model.busy)
        }
        if deletion { Section("Suppression définitive") { Text("Les paris, le portefeuille et les données du compte seront supprimés. Cette action est irréversible."); SecureField("Mot de passe actuel",text:$password); TextField("Écrivez SUPPRIMER",text:$confirmation); Button("Confirmer la suppression",role:.destructive) { let secret = password; password = ""; model.perform { let owner = model.user.map { string($0,"id") } ?? ""; _ = try await model.object("/api/users/me",method:"DELETE",body:["password":secret,"confirmation":"SUPPRIMER"]); try await model.api.clearSession(); try await model.api.savePrivate("draft:" + owner,data:nil); try await model.api.savePrivate("pending:" + owner,data:nil); model.user = nil; model.rows = []; model.pending = nil } }.disabled(confirmation != "SUPPRIMER" || model.busy); Button("Annuler") { deletion = false; password = ""; confirmation = "" } } }
    }.navigationTitle("Profil").onAppear { username = model.user.map { string($0,"username") } ?? ""; model.loadProfile() }
    .fileExporter(isPresented:$export,document:file,contentType:.json,defaultFilename:"betverse-mes-donnees") { result in if case .failure = result { model.message = "Le fichier n’a pas été enregistré." } }
    }
    func preference(_ key: String) -> Binding<Bool> { Binding(get:{model.preferences[key] as? Bool ?? true},set:{ value in model.perform { var preferences = model.preferences; preferences[key] = value; preferences["push"] = false; model.preferences = try await model.object("/api/notifications/preferences",method:"PATCH",body:preferences) as? Object ?? [:] } }) }
}
struct NoticesView: View {
    @EnvironmentObject var model: Model
    var body: some View { List {
        Button("Tout marquer comme lu") { model.perform { _ = try await model.object("/api/notifications/read-all",method:"POST",body:[:]); model.notices = objects(try await model.object("/api/notifications")) } }.disabled(model.busy)
        ForEach(model.notices,id:\.selfID) { notice in VStack(alignment:.leading) { Text(string(notice,"title")).font(.headline); Text(string(notice,"message")); Text(string(notice,"createdAt")).font(.caption).foregroundStyle(.secondary) } }
        if model.notices.isEmpty { Text("Aucune notification.") }
    }.navigationTitle("Notifications").onAppear { model.loadNotices() } }
}
struct RanksView: View {
    @EnvironmentObject var model: Model
    @State private var metric = "verse"
    var body: some View { List {
        Picker("Classement",selection:$metric) { Text("Verse").tag("verse"); Text("Victoires").tag("wins"); Text("Niveau").tag("level") }.onChange(of:metric) { _,value in model.loadRanks(value) }
        ForEach(model.ranks,id:\.selfID) { row in NavigationLink { PublicProfileView(id:string(row,"id")) } label: { HStack { Text("\(number(row,"rank"))"); Text(string(row,"username")); Spacer(); Text(metric == "level" ? "Niv. \(number(row,"level"))" : metric == "wins" ? "\(number(row,"betsWon")) victoires" : "\(number(row,"versePossessedTotal")) V") } } }
    }.navigationTitle("Classements").onAppear { model.loadRanks(metric) } }
}
struct PublicProfileView: View {
    @EnvironmentObject var model: Model
    let id: String
    @State private var profile: Object = [:]
    var body: some View { List { Text(string(profile["user"] as? Object ?? [:],"username")).font(.title); ForEach((profile["stats"] as? Object ?? [:]).keys.sorted(),id:\.self) { key in Text(key + " : " + string(profile["stats"] as? Object ?? [:],key)) } }.navigationTitle("Profil public").task { do { profile = try await model.object("/api/users/" + id + "/public") as? Object ?? [:] } catch { model.message = error.localizedDescription } } }
}

