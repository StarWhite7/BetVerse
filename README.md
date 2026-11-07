# BetVerse — V1

Application de pronostics **gratuite en monnaie virtuelle**, avec un frontend Angular 22 et un backend Node intégré. Un même serveur sert le site et l'API ; la base SQLite est persistante.

**Android natif** : le nouveau client Kotlin / Jetpack Compose se trouve dans `mobile/android`. Il réutilise cette API et l’identité Club, avec thèmes Système / Clair / Sombre. Voir [la configuration et la recette](docs/ANDROID_NATIVE.md). Le répertoire racine `android/` conserve l’ancienne enveloppe Capacitor ; la distribution Firebase utilise désormais `mobile/android`. Le web Angular reste en place. La future application iPhone sera distincte, en Swift / SwiftUI.

## Démarrer en développement

Prérequis : **Node 24.15+ (branche 24 LTS) ou Node 26**, npm. Depuis ce dossier :

```powershell
npm run setup
npm run seed:demo
npm run dev
```

Ouvrir **http://localhost:4200**. `seed:demo` est facultatif : il crée deux rencontres fictives futures, clairement identifiées comme démonstration. Il n'ajoute aucun utilisateur ni résultat artificiel et est interdit en production.

Créer un compte depuis le site, puis réclamer les **500 Verse** du bonus. Chaque compte reçoit **100 shards** pour sa première agence. En développement, la confirmation du courriel est désactivée ; les demandes de réinitialisation sont déposées dans `server/.data/mail/`, sauf si un SMTP est configuré.

`npm run dev` lance Angular et l'API ensemble. La base est créée et migrée automatiquement dans `server/.data/betverse.sqlite`. Ne pas supprimer ce dossier pour mettre à jour l'application.

## Créer le premier administrateur

Aucun compte ou mot de passe par défaut n'existe. Copier l'exemple, puis renseigner les trois variables temporaires dans **server/.env**, avec un email, un pseudo et un mot de passe choisis :

```powershell
Copy-Item server/.env.example server/.env
npm run admin
```

Avant `npm run admin`, décommenter et renseigner `ADMIN_EMAIL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` dans le fichier. Mot de passe : 10 à 128 caractères avec majuscule, minuscule et chiffre. **Retirer ADMIN_PASSWORD du fichier après création.** Le fichier est ignoré par Git et Docker.

La commande refuse de transformer implicitement un compte existant en administrateur. Choisir une identité administrative distincte si le compte joueur existe déjà.

Se connecter sur le site avec ce compte et ouvrir **Admin → Panel** :

1. Créer une rencontre future avec sport, compétition et cotes.
2. Les joueurs peuvent miser tant que la rencontre n'a pas commencé.
3. Après le début, ouvrir le filtre « En cours » et saisir le score final.
4. Le serveur règle tous les tickets et pronostics, verse les gains et enregistre les opérations atomiquement.
5. En cas de report ou d'annulation, « Annuler et rembourser » restitue chaque mise une seule fois. Recréer ensuite une rencontre avec la bonne date.

Le catalogue sportif s’actualise depuis l’administration avec The Odds API. Aucun push, build ou démarrage ne déclenche d’appel fournisseur. Voir [les garde-fous et la configuration](docs/THE_ODDS_API.md).

## Fonctionnalités livrées

- Inscription, connexion, déconnexion serveur, restauration de session.
- Confirmation d'email obligatoire en production et renvoi du lien.
- Mot de passe oublié, changement et réinitialisation avec révocation des sessions.
- Bonus quotidien, solde, registre des transactions et historique paginé.
- Paris avec cote serveur, contrôle du coup d'envoi, solde non négatif et protection contre les doubles requêtes.
- Clôture collective et annulation/remboursement transactionnels.
- Statistiques sur l'ensemble de l'historique, classement joueurs et profils publics.
- Agences : création, invitations, membres, rôles, transfert de direction, personnalisation, départ et suppression.
- Pronostics de scores, points collectifs, classement par période et mission récompensée une seule fois.
- Notifications et fenêtres de gain accessibles au clavier.
- Administration du catalogue, consultation des tickets et recherche des utilisateurs.

Les achats en euros, les publicités, la présence en ligne et les flux sportifs automatiques ne sont pas activés. Les Verse et les shards n'ont pas de valeur monétaire et ne sont pas retirables en argent.

## Vérifier le projet

```powershell
npm run check
npm audit
npm --prefix server audit
```

`check` exécute les tests HTTP du backend, les tests frontend Vitest, puis le build de production. Il ne requiert ni SMTP réel, ni base de production, ni navigateur installé pour les tests unitaires. Les tests HTTP utilisent des bases et des comptes jetables.

Pour une recette visuelle isolée, après un build :

```powershell
node server/test/browser-fixture.mjs
```

Ouvrir http://localhost:3101. Ce serveur utilise une base temporaire séparée et un administrateur **exclusivement de recette**, `qa-admin` / `BrowserTestOnly123`. Le lanceur de production ne charge jamais ce fichier ; il est exclu de l'image Docker et refuse NODE_ENV=production.

## Production

Pour la bêta Android, les champs exacts du formulaire et les variables à configurer sont dans [docs/RENDER_BETA.md](docs/RENDER_BETA.md). Le lanceur `npm run render:start` utilise l’URL HTTPS attribuée par Render et exige le disque persistant ainsi que le SMTP de production.

La V1 cible **une instance Node avec un disque persistant**, derrière HTTPS. Le backend SQLite ne doit pas être placé sur un disque éphémère de fonction serverless ou partagé entre des réplicas.

Renseigner les variables de `server/.env.example` dans l'environnement du serveur :

| Variable      | Utilisation                                                                    |
| ------------- | ------------------------------------------------------------------------------ |
| NODE_ENV      | `production`                                                                   |
| APP_ORIGIN    | Origine publique exacte, par exemple `https://betverse.fr`, sans slash final   |
| DATABASE_PATH | Chemin absolu sur un volume persistant                                         |
| SMTP_URL      | SMTP réel, par exemple `smtps://utilisateur:mot-de-passe@smtp.example.com:465` |
| MAIL_FROM     | Adresse expéditrice autorisée par le fournisseur                               |
| HOST / PORT   | Interface et port d'écoute, par défaut 127.0.0.1:3001                          |
| TRUST_PROXY   | `1` uniquement derrière un proxy de confiance avec l'accès direct bloqué       |

Le mode production refuse une origine HTTP ou un SMTP manquant. Les courriels utilisent TLS. Configurer l'adresse expéditrice chez le fournisseur avant l'ouverture.

Sans Docker :

```powershell
npm run setup
npm run build
npm start
```

Le build et l'API sont servis sur le même domaine. Pour une prévisualisation locale du build sur le port 3001, utiliser NODE_ENV=development et APP_ORIGIN=http://localhost:3001 dans server/.env.

Avec Docker :

```powershell
docker compose up --build -d
```

Le conteneur sert le port 3001, exposé sur 127.0.0.1 uniquement. Le volume `betverse-data` conserve la base. Placer le reverse proxy HTTPS sur l'hôte devant ce port, et conserver APP_ORIGIN identique au domaine public. Pour créer l'administrateur, fournir temporairement les variables ADMIN_* au processus CLI, puis les retirer.

Le proxy doit transmettre le nom d'hôte et le protocole et limiter la taille des requêtes. TRUST_PROXY doit correspondre au nombre de proxys réellement maîtrisés. Ne pas élargir CORS : le frontend et l'API sont conçus pour la même origine.

## Sauvegardes et exploitation

```powershell
npm run backup
```

La commande crée un instantané SQLite cohérent via l'API de sauvegarde native, y compris lorsque WAL est actif. BACKUP_PATH permet de choisir un autre emplacement. Planifier cette commande sur l'hébergement, conserver les sauvegardes hors de la machine et tester leur restauration.

Pour restaurer : arrêter le serveur, conserver à part la base actuelle et ses fichiers WAL/SHM, puis placer l'instantané au chemin DATABASE_PATH avant le redémarrage. Ne pas copier uniquement le fichier SQLite d'une base active comme méthode de sauvegarde.

`GET /api/health` contrôle la disponibilité du serveur et de la base. Les journaux HTTP incluent un identifiant de requête et ne journalisent ni mots de passe, ni cookies, ni corps de requêtes. Les actions administratives sont enregistrées dans `audit_log`.

Avant l'ouverture publique : configurer domaine/HTTPS, SMTP, stockage persistant, sauvegardes et supervision sur l'hébergement choisi. Aucun déploiement public ni configuration DNS n'a été effectué par cette modification.

## Documents

- [Architecture et règles métier](docs/ARCHITECTURE.md)
- [Résultats de validation et limites](docs/VERIFICATION.md)

## Bêta Android privée

Le parcours sans câble, de la création Firebase à l’installation sur le téléphone, est expliqué dans [docs/ANDROID_FIREBASE.md](docs/ANDROID_FIREBASE.md). Le projet Android utilise le package `fr.betverse.app.beta`. Le workflow de distribution reste désactivé tant que les comptes, le serveur et les secrets ne sont pas configurés.
