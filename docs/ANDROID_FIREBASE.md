# Tester BetVerse sur Android sans câble

**Client actuel : Kotlin/Compose dans `mobile/android`.** Le workflow Firebase réutilise l’identifiant, la signature et le groupe privé existants. Voir [ANDROID_NATIVE.md](ANDROID_NATIVE.md) pour le développement et la recette actuels. Les sections Capacitor ci-dessous sont historiques ; ne pas lancer `android:prepare` pour le client Kotlin.

Ce guide prépare une bêta privée, pas une publication sur Google Play. Firebase App Distribution distribue un APK (le fichier d’installation Android) aux comptes invités. Le backend Node.js et sa base restent hébergés séparément.

## État de la préparation

- Projet Capacitor Android créé, identifiant **`fr.betverse.app.beta`**, nom **BetVerse Bêta**. Android 7 minimum.
- Interface Angular embarquée dans l’APK, pas une URL de site chargée à distance.
- API HTTPS via le transport natif Capacitor ; cookies de session gérés par le transport Android, contrôles JSON et CSRF conservés. Aucun jeton ajouté à localStorage. Le backend web ne change pas.
- Workflow `.github/workflows/android-beta.yml` prêt, désactivé tant que `ANDROID_BETA_ENABLED` ne vaut pas `true`.
- Application Firebase enregistrée : projet `betverse-f89bf`, ID `1:472242612609:android:35986b1689d8864d5ba080`. Groupe privé créé avec un testeur d’après la console partagée.
- Java 21 installé et clé de signature créée localement dans `.private/betverse-beta.p12`. Backend déployé sur `https://betverse-beta.onrender.com` ; inscription, email, connexion, bonus et prise de pari vérifiés dans le navigateur. Aucun APK encore compilé/distribué. Les parcours de session doivent encore être vérifiés sur un vrai Android.

## 1. Créer le projet Firebase

1. Ouvrir <https://console.firebase.google.com/> avec votre compte Google.
2. Choisir **Créer un projet**, nommer le projet **BetVerse Beta**.
3. Si Google Analytics est proposé, le désactiver pour cette première étape. Il n’est pas nécessaire pour App Distribution.
4. Garder la formule gratuite **Spark**. App Distribution ne nécessite pas d’abonnement payant. Ne pas activer d’autres services pour ce guide.
5. Dans la vue d’ensemble du projet, cliquer sur **Ajouter une application**, puis sur l’icône **Android**.
6. Renseigner exactement le package **`fr.betverse.app.beta`**, surnom **BetVerse Bêta**. Le package est définitif pour cette application Firebase.
7. Aucun SHA-1 n’est nécessaire pour App Distribution seul. Si le parcours propose `google-services.json` et l’intégration du SDK, terminer/revenir à la console : pour la distribution seule, l’enregistrement de l’application suffit. Aucun SDK Firebase n’a été ajouté à BetVerse.
8. Dans **Paramètres du projet → Général → Vos applications**, relever l’**ID de l’application**, ressemblant à `1:123456789:android:abcdef`. Ce n’est ni le package ni l’ID du projet. Ce champ n’est pas un mot de passe.

## 2. Activer la distribution et créer le groupe privé

1. Ouvrir **App Distribution** dans le menu Firebase (la catégorie du menu peut varier), sélectionner l’application Android et démarrer le service.
2. Dans **Testeurs et groupes**, créer un groupe dont l’alias est **`betverse-private`**.
3. Y ajouter votre adresse Google, celle que vous utiliserez sur le téléphone. Aucun autre testeur n’est ajouté par le code.

Référence : <https://firebase.google.com/docs/app-distribution/android/distribute-console?hl=fr>.

## 3. Héberger le serveur de test

Firebase App Distribution ne lance pas `server/index.mjs`. Choisir un hébergement capable d’exécuter Node.js 24.15+ ou 26, avec disque persistant pour SQLite. Un serveur unique suffit pour cette première bêta, sous réserve des tests de charge. Les étapes de production sont dans le README et `compose.yaml`.

Le parcours retenu pour l’hébergement est décrit dans [RENDER_BETA.md](RENDER_BETA.md). Le domaine reste chez Infomaniak ; un ancien parcours alternatif est conservé dans [INFOMANIAK_BETA.md](INFOMANIAK_BETA.md).

Utiliser de préférence une base de test séparée et une origine comme **`https://beta.betverse.fr`**. L’achat du domaine n’inclut pas nécessairement cet hébergement. Ne pas acheter une offre PHP seule pour notre serveur Node.js.

Configurer le DNS et HTTPS, `NODE_ENV=production`, `APP_ORIGIN=https://beta.betverse.fr`, SMTP et expéditeur, volume persistant, sauvegardes et reverse proxy. Ne définir `TRUST_PROXY=1` que si un proxy de confiance transmet effectivement les requêtes. Les emails de validation doivent fonctionner.

Vérifier depuis le téléphone :

- `https://beta.betverse.fr/api/health` renvoie `{"status":"ok"}`.
- La création de compte, la réception du mail et la connexion fonctionnent dans le navigateur.

L’exemple de domaine n’est pas encore configuré. Ne pas le considérer comme un serveur existant. `localhost` sur Android désigne le téléphone, pas le PC.

## 4. Créer la clé privée de signature, localement, une seule fois

Cette clé sert à autoriser les mises à jour de l’application. La même clé sera réutilisée pour toutes les bêtas. Ne pas la publier dans Git, un artifact GitHub ou le chat. Sauvegarder le fichier et le mot de passe dans un emplacement privé, distinct du dépôt.

Si Java n’est pas installé, installer un JDK 21 depuis <https://adoptium.net/temurin/releases/?version=21>, puis ouvrir un nouveau terminal. Aucun câble ni Android Studio n’est nécessaire pour la compilation GitHub.

Depuis PowerShell, à la racine du dépôt (le dossier contenant `package.json`) :

```powershell
.\scripts\new-beta-signing-key.ps1
```

Si `keytool` n’est pas dans le PATH, passer son chemin avec `-KeytoolPath 'C:\chemin\du\jdk\bin\keytool.exe'`. Le script demande et confirme un mot de passe de 16 caractères minimum, sans l’afficher. Il crée `.private/betverse-beta.p12`, ignoré par Git, et refuse d’écraser une clé existante.

Pour copier le fichier encodé dans le presse-papiers, sans l’afficher dans le terminal :

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path (Get-Location) '.private/betverse-beta.p12'))) | Set-Clipboard
```

Le base64 n’est pas un chiffrement. Le coller uniquement dans le secret GitHub `BETA_KEYSTORE_BASE64`, puis vider le presse-papiers avec `Set-Clipboard -Value ''`.

## 5. Autoriser GitHub à distribuer dans Firebase

Première configuration simple : créer un compte de service dédié dans le projet Google Cloud associé à Firebase, avec uniquement le rôle **Firebase App Distribution Admin** (`roles/firebaseappdistro.admin`), puis créer une clé JSON pour ce compte. Si l’API Firebase App Distribution doit être activée, l’activer dans ce même projet.

Conserver le JSON dans un emplacement privé ; copier son contenu directement dans le secret GitHub `FIREBASE_SERVICE_ACCOUNT_JSON`. Ne pas utiliser le compte de service général Firebase Admin ni le rôle Owner/Editor. Ne pas envoyer la clé dans le chat ou la committer. Une authentification sans clé par fédération d’identité pourra remplacer ce JSON ensuite.

Référence CLI : <https://firebase.google.com/docs/app-distribution/android/distribute-cli?hl=fr>.

## 6. Configurer GitHub

Dans le dépôt GitHub, **Settings → Environments**, créer **`android-beta`**. Limiter les branches de déploiement à `codex/private-beta` et éventuellement `beta` ; garder les modifications de ces branches et des workflows sous contrôle, puisqu’ils utilisent les secrets. L’application restera distribuée aux testeurs invités ; le serveur est protégé par l’authentification BetVerse, pas par Firebase.

Créer ces **Environment secrets** :

| Secret                          | Valeur                                  |
| ------------------------------- | --------------------------------------- |
| `BETA_KEYSTORE_BASE64`          | Fichier de signature encodé à l’étape 4 |
| `BETA_KEYSTORE_PASSWORD`        | Mot de passe choisi à l’étape 4         |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | JSON du compte dédié à la distribution  |

Dans **Settings → Secrets and variables → Actions → Variables**, créer ces **Repository variables** :

| Variable               | Valeur                                                           |
| ---------------------- | ---------------------------------------------------------------- |
| `BETVERSE_BETA_ORIGIN` | `https://betverse-beta.onrender.com`, sans slash final ni `/api` |
| `FIREBASE_APP_ID`      | `1:472242612609:android:35986b1689d8864d5ba080`                  |
| `ANDROID_BETA_ENABLED` | `true`, à mettre seulement lorsque tout est prêt                 |

Le code V1 et Android est publié sur `codex/private-beta`, qui est également utilisée par Render. Aucun changement de branche par défaut ni fusion dans `master` n’est nécessaire pour déclencher le workflow par un push sur cette branche.

## 7. Générer et distribuer

Un push sur `codex/private-beta` ou `beta` lance **Android - private Firebase beta** dans l’onglet **Actions**, uniquement si `ANDROID_BETA_ENABLED=true`. Le bouton **Run workflow** exige aussi que le fichier de workflow existe sur la branche par défaut : ne pas compter dessus tant que `master` contient l’ancien projet. Après configuration, un nouveau push déclenchera la première compilation.

Le workflow vérifie la configuration et le backend, lance les tests, compile Angular, synchronise Capacitor, construit l’APK signé, puis le distribue au groupe `betverse-private`. La première compilation télécharge les outils Android et peut prendre plusieurs minutes. Les minutes GitHub Actions dépendent des quotas de votre compte ; Firebase App Distribution est gratuit.

Sur un dépôt **privé** seulement, l’APK est aussi disponible pendant 7 jours dans les artifacts de l’exécution. Sur notre dépôt public, aucun artifact APK n’est téléversé : la distribution passe uniquement par le groupe privé Firebase. Les clés ne sont jamais conservées comme artifacts. Le numéro de version augmente avec chaque nouvelle exécution ; si une ancienne exécution est relancée après une plus récente, sa version ne permettra pas une mise à jour sur le téléphone.

## 8. Installer sur Android sans câble

1. Ouvrir le mail d’invitation Firebase depuis le téléphone.
2. Accepter avec l’adresse Google invitée, puis ouvrir la version proposée.
3. Télécharger l’APK et autoriser, si Android le demande, l’installation depuis le navigateur ou l’outil Firebase utilisé. Révoquer cette autorisation après installation si souhaité. Ne pas désactiver Play Protect globalement.
4. Installer **BetVerse Bêta**, puis créer un compte de test.
5. Aux prochaines versions, utiliser le lien Firebase et choisir **Mettre à jour**, en conservant l’installation existante.

Si Android affiche un problème de vérification du développeur, noter le message, le pays et la version Android : les règles de distribution hors Play varient selon le déploiement de la vérification Android. Ne pas contourner ce message à l’aveugle.

## 9. Recette avant d’inviter d’autres personnes

Vérifier inscription/email, connexion, fermeture complète puis réouverture, bonus, pari, historique et déconnexion. Tester aussi le mode avion, une session expirée et une mise à jour de l’APK. Une nouvelle version de l’application ne déploie pas automatiquement le backend : celui-ci a son propre déploiement.

Ne pas ouvrir le test à d’autres personnes tant que ces parcours n’ont pas été vérifiés sur Android. La préparation locale ne constitue pas une validation sur téléphone.

## Commande locale facultative

Avec un serveur de test prêt :

```powershell
$env:BETVERSE_BETA_ORIGIN = 'https://beta.betverse.fr'
npm run android:prepare
```

Cette commande génère les fichiers web, ajoute la configuration HTTPS publique dans l’APK et synchronise Android. Elle ne compile pas l’APK et ne l’envoie pas à Firebase. La configuration ne contient aucune clé privée.
