# Préparation Android — 3 novembre 2026

## Contrôles effectués

- 26 tests backend réussis ; les connexions HTTP locales nécessitent une exécution hors du bac à sable Windows.
- 17 tests frontend réussis, dont 6 nouveaux tests du transport natif : maintien du transport web, en-têtes JSON/CSRF et origine exacte, refus des redirections, conservation des erreurs HTTP, isolation des autres hôtes et erreurs réseau ; validation des origines HTTPS incluse.
- Compilation Angular réussie : environ 369 ko initiaux avant compression. Deux avertissements de budget CSS subsistent dans les écrans d’agence ; ils n’empêchent pas la compilation.
- `npm run android:prepare` réussi avec l’origine **d’exemple** `https://beta.betverse.fr` : génération des fichiers Angular et synchronisation Android. Aucun serveur à cette adresse n’a été configuré ou validé.
- Contrôle du package généré `fr.betverse.app.beta` et de la configuration embarquée ; absence de `server.url` distant.
- Syntaxe du script PowerShell de création de clé analysée sans erreur. Aucune clé privée créée.
- Workflow YAML analysé par Prettier ; contrôles d’espacement Git réussis avec prise en compte des fins de ligne Windows.

## Limites de cette validation

Aucun JDK/SDK Android disponible localement : **APK non compilé**, Gradle et signature non exécutés. Aucune connexion à Firebase, aucune invitation ni distribution envoyée. Aucun push Git effectué. Le workflow reste désactivé par défaut.

Le transport HTTP et le cycle de cookies natifs doivent encore être testés sur appareil : inscription, connexion, réouverture, expiration, déconnexion et mise à jour. Les tests frontend simulent la frontière Capacitor et ne remplacent pas cette recette.

Il reste à créer le projet Firebase, le groupe de testeurs, un hébergement HTTPS avec emails, la clé locale de signature et les secrets GitHub avant la première compilation distante.
