# Android natif — Kotlin et Club

## Architecture

- Projet autonome : mobile/android ; Kotlin 2.2.21, Compose BOM 2025.10.01, Material 3, Activity 1.11.0, Lifecycle 2.9.4.
- Gradle 8.14.3 / AGP 8.13.0 ; JDK 21 ; compilation et cible Android 36 ; minimum Android 7 / API 24.
- API commune : https://betverse-beta.onrender.com. Les valeurs peuvent être remplacées à la compilation par BETVERSE_BETA_ORIGIN (origine HTTPS exacte). Aucun choix de serveur arbitraire dans l'interface.
- Même applicationId fr.betverse.app.beta et alias betverse-beta que la bêta Capacitor. Il faut la même clé PKCS12 et un versionCode croissant pour mettre à jour l'installation existante.
- Aucun WebView ou SDK Capacitor dans ce projet. L'ancien dossier android/ et le web Angular sont conservés séparément.
- Pas de projet iOS factice : l'application Swift sera créée lors du portage, à partir du contrat API commun et des décisions de design.

Organisation :

- data/ : DTO, client HTTP, cookies et demandes idempotentes chiffrées.
- AppViewModel : état et opérations utilisateur sérialisées.
- ui/ : thème Club et composants Compose, écrans, confirmation de pari.
- Les règles d'acceptation, cotes définitives, débits et règlements restent sur le serveur.

## Premier lot fonctionnel

Connexion, inscription, renvoi de confirmation, demande de réinitialisation ; reprise de session ; calendrier avec ballons de sport et compétitions défilantes horizontalement, sans filtre de date ; paris simples et combinés de 2 à 10 rencontres avec mise unique, cote totale et retour potentiel ; historique paginé et filtrable ; portefeuille, 25 derniers mouvements, bonus quotidien ; profil et thème Système / Clair / Sombre persisté.

Les cotes sélectionnées sont bleues sans coche. Un deuxième appui retire la sélection ; choisir une autre issue de la même rencontre la remplace. Les choix de plusieurs rencontres forment un combiné dans le même coupon. Initiales et palettes de clubs sont issues du catalogue local `ClubIdentity.kt` (normalisation des accents et alias, fallback neutre pour un club inconnu), sans téléchargement de logo ni appel au fournisseur. Les matchs à venir de toutes les dates restent visibles, filtrés localement par compétition.

Le combiné utilise `POST /api/bet/combined` : cotes de chaque rencontre vérifiées côté serveur, débit unique et idempotence. Les sélections sont chiffrées ensemble pour reprendre une demande interrompue avec exactement la même clé. Le produit des cotes est arrondi à deux décimales une seule fois, puis le retour est arrondi à l’entier (HALF_UP). Cote totale maximale : 1 000 000. Une rencontre perdante perd le ticket ; toutes les autres doivent être gagnantes ou annulées avant paiement. Une annulation neutralise la cote de la rencontre à 1 ; toutes annulées remboursent la mise. Les identités/dates de toutes les rencontres du ticket sont verrouillées après prise de pari.

Agence : consultation du nom, des membres et des points. Gestion complète, invitations et pronostics collectifs restent dans le web, ouvert explicitement dans le navigateur ; session web distincte possible. Les notifications, classements avancés, modifications de compte et tous les parcours d'agence ne sont pas encore portés en Kotlin. Les emails de validation et de reset continuent à ouvrir les routes web existantes.

Le web ne reçoit pas encore le nouveau thème Club. Voir docs/design/CLUB_DECISION.md pour l'identité retenue.

## Réseau et sécurité

- HTTPS uniquement, confiance dans les certificats système, redirections et retries de transport désactivés.
- Origin exact et X-Requested-With: BetVerse ; CSRF fourni par login ou GET /auth/me.
- Cookie serveur opaque chiffré avec AES-GCM et une clé Android Keystore non exportable. Le mot de passe et le CSRF ne sont pas persistés.
- Les cookies ne sont chargés que pour le schéma, hôte et port exacts du backend ; aucun cookie exporté vers le navigateur.
- Les sauvegardes Android sont désactivées. Aucun secret serveur/API-Football/Firebase de service dans le code ou les ressources.
- Une mise est persistée localement avec son identifiant d'idempotence avant le POST. Sur timeout, résultat indéterminé ou redémarrage, la vérification conserve le même propriétaire, la même sélection, la même cote, la même mise et la même clé. Les nouvelles mises sont bloquées jusqu'à résolution de cette demande.
- La déconnexion serveur doit réussir avant d'effacer la session locale.
- Minuteur du bonus basé sur l'heure serveur et une horloge monotone locale.
- Aucun appel direct fournisseur. Aucun minuteur réseau, worker, synchronisation périodique ou appel d'import administratif. Relecture au démarrage, aux actions explicites et après une mutation. Les filtres de calendrier sont locaux.
- L'exception HTTP localhost est réservée au constructeur utilisé par les tests, jamais à la configuration APK.

## Compiler et vérifier

Depuis mobile/android, avec JAVA_HOME pointant vers un JDK 21 et ANDROID_HOME vers le SDK :

    .\gradlew.bat testDebugUnitTest lintDebug assembleDebug --no-daemon --console=plain

Sur Linux/macOS : ./gradlew avec les mêmes tâches. Node 24 et les dépendances server/node_modules sont nécessaires au test de contrat réel. Le test lance un backend éphémère en mémoire ; il ne charge pas server/.env ni les données de production. Les autres tests réseau utilisent MockWebServer.

APK de développement : mobile/android/app/build/outputs/apk/debug/app-debug.apk. Il n'a pas la signature bêta : ne pas le substituer à la version distribuée.

Compilation release via le workflow .github/workflows/android-beta.yml, avec les secrets existants BETA_KEYSTORE_BASE64, BETA_KEYSTORE_PASSWORD et FIREBASE_SERVICE_ACCOUNT_JSON dans android-beta. Variables existantes : ANDROID_BETA_ENABLED, BETVERSE_BETA_ORIGIN et FIREBASE_APP_ID. Le groupe reste betverse-private. Aucun besoin de google-services.json pour distribuer.

Le workflow teste Angular, le backend et Kotlin, puis compile et distribue uniquement l'APK natif signé au groupe privé. Il ne publie pas d'APK comme artifact d'un dépôt public et ne déploie pas Render. La session Capacitor n'est pas migrée : une première reconnexion dans le nouveau client est attendue.

## Recette sur téléphone

1. Mettre à jour depuis Firebase sans désinstaller. Vérifier la nouvelle identité et la connexion au compte existant.
2. Profil : tester Système, Clair et Sombre ; fermer et rouvrir l'application et vérifier la préférence.
3. Accueil : vérifier le solde et les mouvements ; réclamer le bonus uniquement s'il est disponible.
4. Matchs : vérifier l'absence de matchs artificiels. Les rencontres passées ne sont pas proposées à la mise. Faire créer un match futur de recette par un administrateur si le calendrier est vide ; ne pas déclencher API-Football pour cette recette.
5. Sélectionner une cote ; vérifier la mise, le retour potentiel mise incluse et le débit ; retrouver un seul ticket dans Mes paris.
6. Couper le réseau pendant une confirmation, puis le rétablir et utiliser Vérifier ce pari ; vérifier un ticket et un débit uniques.
7. Tester fermeture/réouverture, expiration et déconnexion ; l'ancien compte ne doit pas rester affiché après connexion à un autre.
8. Vérifier clavier, bouton retour, petits écrans, taille de police agrandie, TalkBack et zones tactiles.
9. Pour les agences, vérifier les informations lues et le passage explicite au navigateur.

La compilation et les tests ne remplacent pas cette recette sur l'appareil du testeur, notamment Android Keystore et les comportements OEM.
