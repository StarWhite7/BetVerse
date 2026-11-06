# iPhone natif — compilation et limites de validation

Le client iPhone utilise un projet SwiftUI distinct du client Kotlin et le même contrat serveur. Le socle de compilation se trouve dans `mobile/ios/project.yml`. XcodeGen génère `BetVerse.xcodeproj` à partir du dossier `BetVerse` et du package local `Core`, dont le produit attendu est `BetVerseCore`.

## Contrat de construction

- Cible applicative et scheme partagé : `BetVerseNative` ; nom affiché : BetVerse.
- iPhone, iOS 17 minimum, langage Swift 5 pour la compatibilité du compilateur.
- Identifiant proposé : `fr.betverse.app.ios`. Cet identifiant n’est pas une inscription auprès d’Apple et doit être confirmé avant signature publique.
- API HTTPS de bêta : `https://betverse-beta.onrender.com`, clé `BETVERSE_API_ORIGIN` du plist. Ne jamais y placer de token, mot de passe ou clé de fournisseur.
- Aucun relâchement ATS : les chargements HTTP arbitraires sont désactivés. Une éventuelle exception de transport pour les tests doit rester dans le code de test, sans modifier ce plist applicatif.
- Aucune équipe Apple, clé de signature ou autorisation de publication n’est configurée dans le dépôt.

## Depuis un Mac équipé de Xcode

```sh
brew install xcodegen
swift test --package-path mobile/ios/Core
cd mobile/ios
xcodegen generate --spec project.yml
xcodebuild -project BetVerse.xcodeproj -scheme BetVerseNative \
  -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath build CODE_SIGNING_ALLOWED=NO build
```

Le projet généré, `Core/.build`, `.swiftpm`, `build` et les données Xcode propres au poste ne sont pas des sources à distribuer. Le fichier `project.yml` reste la source du projet. Une modification du code Swift ne nécessite pas de recopier le backend ni de changer l’application Android.

## Intégration continue

Le workflow `ios-checks.yml` exécute les tests du package puis compile l’application pour un simulateur générique sur `macos-latest`. Il affiche les versions réellement utilisées de Swift, Xcode et XcodeGen, sans télécharger de runtime de simulateur ni demander de certificat. Il ne contacte pas les fournisseurs sportifs et n’envoie pas d’application à App Store Connect ou TestFlight.

Une source absente ou un package manquant fait échouer les vérifications : aucune étape ne transforme un projet incomplet en résultat vert. Le succès d’un build ne sera revendiqué qu’après le résultat du workflow correspondant au commit livré. Le poste Windows ne permet pas de valider Xcode localement.

## Ce que chaque preuve signifie

| Vérification                    | Ce qu’elle établit                                                       | Ce qu’elle n’établit pas                                                       |
| ------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Tests Swift du package          | Règles et cas de transport réellement couverts par les tests             | Exactitude des écrans, connexion au serveur de production                      |
| Build non signé pour simulateur | Compilation du client et liaison de ses dépendances pour le SDK installé | Installation iPhone, Keychain réel, notifications push, fonctionnement tactile |
| Recette sur simulateur démarré  | Parcours effectivement exécutés dans ce simulateur                       | Comportement d’un appareil physique ou acceptation Apple                       |
| Recette iPhone signée           | Parcours effectivement vérifiés sur l’appareil concerné                  | Distribution publique ou validation de tous les modèles d’iPhone               |
| TestFlight/App Store            | Distribution autorisée après configuration de l’éditeur et soumission    | Aucun de ces états n’est obtenu par ce workflow de compilation                 |

Pour une distribution iPhone, il faudra les accès Apple de l’éditeur, l’identifiant enregistré, la signature, les captures et déclarations de confidentialité, puis une archive pour appareil et une soumission explicite. Les domaines associés et APNs exigent également leur configuration propre ; ils ne sont pas activés par ce socle.

Les cookies, secrets de session et requêtes idempotentes sensibles du client devront être conservés dans le Keychain, et non dans les préférences ordinaires. Le client doit refuser les redirections qui pourraient déplacer une session vers une autre origine et suivre `MOBILE_API_CONTRACT.md` pour les confirmations interrompues. Les manifestes de confidentialité et déclarations de collecte doivent refléter les API effectivement utilisées dans le client final.

## Références primaires

- [Spécification XcodeGen : projets, packages locaux, sources et schemes](https://github.com/yonaskolb/XcodeGen/blob/master/Docs/ProjectSpec.md).
- [Apple : destinations de compilation et simulateur générique](https://developer.apple.com/documentation/xcode/creating-a-multi-platform-binary-framework-bundle).
- [Apple : exécution sur simulateur ou appareil](https://developer.apple.com/documentation/Xcode/running-your-app-on-simulated-or-physical-devices).
- [Apple : App Transport Security](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity).
- [Apple : Keychain Services](https://developer.apple.com/documentation/security/keychain-services).
- [Apple : gestion explicite des redirections URLSession](<https://developer.apple.com/documentation/foundation/urlsessiontaskdelegate/urlsession(_:task:willperformhttpredirection:newrequest:completionhandler:)>).

Références consultées le 6 novembre 2026. Les versions du runner évoluent ; le journal de chaque exécution est la référence de compilation.
