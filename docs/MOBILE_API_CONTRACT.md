# Contrat mobile commun — Android, web et futur iPhone

L'API existante reste la source de vérité. Ce document décrit le premier lot Kotlin ; il ne crée pas une API distincte ou un mécanisme d'authentification parallèle.

## Transport

Origine HTTPS exacte, même backend que le web. Toutes les mutations sont JSON avec Origin égal à l'origine configurée du serveur, X-Requested-With: BetVerse, et X-CSRF-Token pour les routes authentifiées. La session est le cookie HttpOnly Secure __Host-betverse_session, path /, host-only (12 heures). GET /api/auth/me renouvelle le CSRF côté client via son en-tête X-CSRF-Token, sans prolonger automatiquement la durée de session.

Aucun mot de passe en stockage client, aucun token dans les URL, aucune clé fournisseur dans un client mobile. Un futur client Swift devra respecter les mêmes règles et conserver ses secrets de session dans le Keychain. Les appels natifs ne requièrent pas de relâcher le CORS ou le contrôle Origin du backend.

## Endpoints utilisés

| Méthode | Route                            | Données utiles                                                           |
| ------- | -------------------------------- | ------------------------------------------------------------------------ |
| POST    | /api/auth/login                  | identifier, password ; réponse user et csrfToken                         |
| GET     | /api/auth/me                     | profil public, en-tête CSRF                                              |
| POST    | /api/auth/logout                 | objet vide ; attendre la confirmation avant d'oublier la session         |
| POST    | /api/auth/register               | email, username, password ; confirmation email en production             |
| POST    | /api/auth/forgot-password        | identifier ; message générique                                           |
| POST    | /api/auth/resend-verification    | identifier ; message générique                                           |
| GET     | /api/wallet                      | balance, shards, serverTime, nextClaimAvailableAt                        |
| POST    | /api/wallet/claim                | objet vide ; une attribution toutes les 24 heures                        |
| GET     | /api/wallet/history?limit=25     | mouvements récents                                                       |
| GET     | /api/matches?status=UPCOMING     | jusqu'à 500 rencontres futures enregistrées ; aucune lecture fournisseur |
| POST    | /api/bet                         | matchId, betType, amount, odds ; Idempotency-Key UUID obligatoire        |
| GET     | /api/bet/my-bets?limit=25&skip=0 | tickets ; X-Total-Count ; filtre status facultatif                       |
| GET     | /api/agence/me                   | agence ou null                                                           |

Dates ISO 8601 UTC, affichées dans le fuseau local. Montants Verse entiers de 1 à 1 000 000 pour une mise ; solde entier. Cotes décimales avec deux chiffres maximum ; utiliser une représentation décimale exacte côté client. HOME/DRAW/AWAY pour les choix, PENDING/WON/LOST/VOID pour les tickets. Le serveur est seul à décider si une rencontre est ouverte et si une cote reste valide.

Le retour potentiel inclut la mise ; arrondi à l'entier le plus proche avec demi supérieur, comme le règlement serveur. Une valeur estimée n'est pas une promesse de règlement.

## Paris combinés

`POST /api/bet/combined`, avec la même session, CSRF et `Idempotency-Key` UUID que le pari simple :

```json
{
  "amount": 100,
  "selections": [
    { "matchId": "UUID-rencontre-1", "betType": "HOME", "odds": 1.91 },
    { "matchId": "UUID-rencontre-2", "betType": "AWAY", "odds": 2.1 }
  ]
}
```

2 à 10 rencontres distinctes ; un seul choix par rencontre. Chaque cote est vérifiée contre la base avant un débit unique. Produit exact des cotes serveur, arrondi à deux décimales une fois ; cote totale maximale 1 000 000. Retour = mise × cote totale, arrondi à l’entier demi supérieur. Un ticket et 10 XP à la prise de pari, pas une mise par sélection.

La réponse et l’historique exposent `kind: "COMBO"` et `selections: [{matchId,match,betType,odds,status}]`, dans l’ordre du coupon. Le `matchId` et le `betType` à la racine sont conservés pour compatibilité et correspondent à la première sélection ; un client doit lire le tableau pour afficher un combiné. `kind: "SINGLE"` identifie les paris simples.

Une sélection perdante fait perdre le ticket. Sinon, paiement unique lorsque toutes les sélections sont gagnantes ou annulées ; une annulation neutralise sa cote à 1, toutes annulées remboursent la mise. Les cotes individuelles acceptées et la cote totale d’origine restent conservées ; utiliser les sélections non `VOID` pour afficher le potentiel actualisé. Chaque règlement et chaque annulation sont transactionnels, y compris les mouvements, notifications et XP.

Le payload complet et la même clé doivent être repris après interruption, y compris toutes les rencontres et leurs cotes. Déployer le backend avec la migration `010-combined-bets.sql` avant de tester les combinés de l’APK mis à jour. Aucune variable d’environnement ni requête fournisseur supplémentaire n’est nécessaire.

## Idempotence et erreurs

Conserver la clé, le propriétaire et l'intégralité du payload d'une mise jusqu'à réponse définitive. Ne pas remplacer la clé après timeout, erreur de transport, réponse invalide ou erreur serveur : la mutation peut déjà avoir été enregistrée. La reprise du même payload avec la même clé retourne le ticket d'origine sans nouveau débit. Une modification du payload avec cette clé produit un conflit. Les clients doivent bloquer l'édition d'une demande indéterminée.

401 : reconnexion. 403 : origine/CSRF/droit ou email non confirmé selon la route. 409 : état incompatible, cote modifiée, bonus indisponible ou solde insuffisant. 429 : respecter le délai, aucun retry automatique. 5xx et transport interrompu : opération éventuellement indéterminée pour un POST de pari.

Les erreurs JSON comprennent message et requestId ; ne jamais exposer ou journaliser mots de passe, cookies ou CSRF. Une mise échouée ne doit jamais être débitée côté client. Une lecture d'actualisation échouée après un POST réussi ne justifie jamais un nouveau POST avec une nouvelle clé.

## Vérification

BackendContractTest lance server/test/native-contract-fixture.mjs sur localhost avec une base SQLite en mémoire, vérifie connexion, bonus, placement, replay après reconstruction du client, historique et déconnexion. Les tests MockWebServer simulent les coupures et redirections. Aucun appel API-Football n'est exécuté.
