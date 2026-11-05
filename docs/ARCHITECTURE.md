# Architecture V1

## Périmètre

Jeu gratuit de pronostics, sans argent réel, retraits, achats ou publicités. Les rencontres et leurs scores sont gérés dans le panneau administrateur. Aucune donnée sportive en direct n'est inventée.

## Organisation

```text
src/app/
  core/                  configuration, session, interceptors, guards, layouts
  data-access/           contrats HTTP et état partagé par domaine
  features/              pages et composants métier
    wallet/components/   solde et bonus dans l'en-tête
    notifications/components/ centre de notifications et résultats
  shared/                modèles transversaux, validation, présentation et dialogues
server/
  app.mjs                assemblage HTTP et protections communes
  index.mjs              démarrage et arrêt propre
  cli.mjs                création admin, données démo, sauvegarde
  db/migrations/         schéma versionné, appliqué au démarrage
  domain/                transactions de jeu et calculs métier
  routes/                endpoints regroupés par domaine
  lib/                   configuration, sécurité, validation, courriels
  test/                  intégration HTTP avec bases et comptes jetables
```

Le layout principal assemble les composants et la navigation. Le portefeuille est partagé par son service ; les données sont effacées lors d'un changement de session. L'historique des paris annule les anciennes requêtes lors d'un changement de filtre ou de compte. Les anciens composants, sockets et stores générés inutilisés ont été retirés.

## Déploiement

Un processus Node sert `/api` et le build Angular sur la même origine. En développement, Angular relaie `/api` vers le port 3001. Il n'existe aucun repli silencieux vers une autre API distante. SQLite utilise WAL, clés étrangères et transactions `BEGIN IMMEDIATE`.

Cette architecture vise une V1 avec **une instance et un disque persistant local**. Ne pas déployer la base sur le système éphémère d'une fonction serverless ou multiplier les réplicas. Pour plusieurs instances ou une charge importante, migrer le stockage vers PostgreSQL et les limites de requêtes vers un stockage partagé. Aucun test de charge à grande échelle n'est revendiqué.

## Session et identités

- Mots de passe de 10 à 128 caractères, majuscule, minuscule et chiffre. Hash scrypt avec sel aléatoire ; paramètres enregistrés avec le hash pour les migrations futures.
- Session opaque de 12 heures ; seul son hash est stocké dans la base. Cookie HttpOnly, SameSite=Lax, Secure et préfixe `__Host-` en production.
- Chaque écriture authentifiée exige le secret CSRF de la session. Toutes les écritures exigent aussi une origine exacte autorisée et une requête JSON avec en-tête propre à l'application.
- Droits contrôlés par le serveur sur chaque endpoint protégé. Le rôle envoyé par le navigateur ne fait jamais autorité.
- Confirmation de l'adresse par un lien de 24 heures en production. Réinitialisation de mot de passe de 30 minutes. Les jetons sont hachés, à usage unique ; changement et réinitialisation révoquent les sessions.
- Limites de requêtes globales et spécifiques à l'authentification, CSP et en-têtes Helmet. Les recherches publiques ne renvoient pas les emails.

## Économie et résultats

- Un nouveau compte reçoit 100 shards, sans Verse. Le bonus crédite 500 Verse une fois toutes les 24 heures. Une création d'agence coûte 100 shards pour tous les rôles.
- Mises entières de 1 à 1 000 000 Verse. Le solde ne peut pas devenir négatif. Les cotes sont des entiers en centièmes dans la base ; elles sont relues côté serveur et figées sur le ticket.
- Un pari exige une clé d'idempotence. Répéter la même requête ne débite qu'une fois ; réutiliser sa clé pour un autre contenu échoue. Les ajustements et transferts admin ont la même protection.
- Aucun pari ou pronostic après le coup d'envoi. Les rencontres commencées apparaissent « LIVE » ; cela indique le verrouillage à l'heure prévue, pas un flux de score en direct.
- Un administrateur saisit le score final. La clôture détermine le résultat de tous les tickets, crédite les gagnants, écrit le registre, ajoute XP et notifications, règle les pronostics d'agence et attribue les récompenses de mission dans la même transaction.
- Gain : `arrondi(mise × cote)` au Verse le plus proche, demi vers le haut. Les cotes acceptées restent inchangées même si le catalogue est modifié ensuite.
- Répéter une clôture identique est sans effet ; un résultat contradictoire est refusé. Il n'existe aucune résolution individuelle permettant de contredire le score du match.
- Les ajustements administrateur sont réservés aux administrateurs et journalisés. La remise à zéro globale et les boutons de test ont été retirés.
- Les équipes et l'heure d'une rencontre ayant déjà des mises sont verrouillées. L'administrateur peut annuler une rencontre non réglée avec un motif : tous les tickets en attente passent à `VOID`, leurs mises sont remboursées une seule fois, et les joueurs sont notifiés. Un match déjà réglé ne peut plus être annulé. Pour un report, annuler puis recréer une rencontre avec la nouvelle date.

## Agences

Un joueur appartient à une seule agence de 50 membres maximum. Les invitations ne peuvent être acceptées que par leur destinataire. La création, l'adhésion et les changements de rôles sont transactionnels. Il existe exactement un directeur ; le transfert des rôles se fait en une seule requête. Le directeur doit transmettre sa fonction ou supprimer l'agence avant de partir.

Les pronostics collectifs retiennent le score le plus fréquent ; une égalité est départagée par score domicile puis extérieur croissant. Score exact : 3 points, bon résultat : 1 point. Chaque point collectif donne 100 XP à l'agence ; un score exact donne un trophée. La mission des dix premiers points donne une seule fois 500 XP et un trophée. Les périodes des classements d'agences sont délimitées en UTC. Les dates sont stockées en UTC et affichées dans le fuseau du navigateur.

## Contrats et limites V1

Les contrats du frontend sont dans `data-access/*/*.api.ts`. Les endpoints suivent les mêmes noms sous `/api` : `auth`, `users`, `wallet`, `matches`, `bet`, `leaderboard`, `notifications`, `agence`. Les entrées sont validées par Zod ; les erreurs sont `{message, requestId}`. L'historique personnel expose `X-Total-Count` et accepte `limit`, `skip`, `status`, `order`.

Le catalogue et la liste d'agences sont bornés à 500 résultats, le classement joueurs à 100, les notifications récentes à 100. Les recherches admin renvoient 100 comptes maximum ; utiliser la recherche pour retrouver un compte ancien. Les historiques sont paginés. Ces bornes doivent évoluer avec le volume réel.

Les notifications sont récupérées toutes les 30 secondes lorsque la page est visible ; le catalogue des rencontres également. Aucun système de WebSocket ou présence en ligne fictif n'est annoncé.

Ces consultations lisent uniquement SQLite. L’intégration API Football sous `/api/admin/football` est désactivée par défaut : seuls trois POST administrateur peuvent contacter le fournisseur, chacun avec une requête maximum. Aucune tâche planifiée, aucun appel au démarrage ou dans le build. Le cache et les réservations de quota sont persistants ; les erreurs ne sont pas retentées. Voir [API_FOOTBALL.md](API_FOOTBALL.md).

The Odds API possède un circuit séparé sous `/api/admin/odds`, désactivé par défaut : les POST `preview` (unique) et `preview-batch` (jusqu’à cinq compétitions choisies) sont les seules entrées réseau. Chaque compétition coûte au plus un appel (sept jours UTC, région France, marché 1N2). Le groupe réserve un reçu persistant, interdit les chargements concurrents, réutilise le cache et s’arrête au premier échec sans relance. Les POST `publish` et `publish-batch` copient les aperçus validés vers le catalogue commun Web/Android sans réseau externe ; la publication groupée est atomique. Les compteurs 24 h/31 jours, cache, brouillons et liens de publication sont persistants. Voir [THE_ODDS_API.md](THE_ODDS_API.md).
