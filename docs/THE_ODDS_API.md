# The Odds API : aperçu et publication manuels

Fournisseur : https://the-odds-api.com/ (avec tirets). Documentation consultée le 5 novembre 2026 :
https://the-odds-api.com/liveapi/guides/v4/ et https://the-odds-api.com/sports-odds-data/bookmaker-apis.html.

## Configuration Render

| Variable                     | Valeur                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `THE_ODDS_API_KEY`           | Clé secrète déjà ajoutée par le propriétaire dans Render ; jamais dans Git, Angular ou Android |
| `THE_ODDS_API_MODE`          | `manual` pour activer les aperçus ; défaut `disabled`, même avec une clé                       |
| `THE_ODDS_API_DAILY_LIMIT`   | `10` par défaut, tentatives sur 24 h glissantes                                                |
| `THE_ODDS_API_MONTHLY_LIMIT` | `400` par défaut, tentatives sur **31 jours glissants**, plafond configurable jusqu’à 500      |
| `API_FOOTBALL_MODE`          | `disabled` recommandé pour l’ancien fournisseur suspendu                                       |

Le stockage SQLite doit rester sur le disque persistant `/var/data`. Aucun secret GitHub ou Firebase supplémentaire.
Ces plafonds locaux conservateurs sont distincts de la facturation mensuelle du fournisseur et ne voient pas l’usage d’autres projets avec la même clé.

## Parcours administrateur

1. Administration → Matchs → **The Odds API — matchs et cotes 1N2**.
2. Choisir une compétition et le premier jour UTC (aujourd’hui à J+7). La fenêtre importée contient sept jours calendaires UTC.
3. Cocher le consentement, puis **Charger l’aperçu** : au maximum un GET fournisseur, `regions=fr`, `markets=h2h`, prix décimaux. Coût attendu : un crédit ; aucun parcours de pagination, autre région, compétition ou bookmaker n’est tenté automatiquement.
4. Examiner les rencontres et choisir Betclic France, Winamax France ou Unibet France. L’API peut ne pas encore proposer de cotes, ou refuser une compétition inactive/hors saison. Cela n’entraîne aucun appel de secours.
5. **Publier ce match (0 crédit)** copie les cotes affichées vers le catalogue commun Web/Android. Chaque publication est volontaire, depuis le dernier aperçu confirmé ; aucune publication en masse implicite.

L’aperçu charge les matchs et les cotes ensemble ; ce n’est pas une garantie de calendrier exhaustif. Les rencontres déjà commencées, données malformées, cotes incomplètes, cotes avec plus de deux décimales et mises à jour de plus d’une heure sont exclues de la publication. Un aperçu expiré nécessite un nouveau clic manuel. Les heures d’affichage sont locales ; les filtres du fournisseur sont UTC.

## Protection du quota et des paris

- Construction de l’application, migration, déploiement, redémarrage, pages publiques, GET administrateur et publication locale : **zéro appel fournisseur**.
- Seul `POST /api/admin/odds/preview`, authentifié administrateur avec CSRF, consentement explicite et UUID d’idempotence, peut appeler le fournisseur.
- Hôte HTTPS fixe, redirections interdites, délai 15 s, réponse plafonnée à 4 Mio ; aucun retry.
- Réservation atomique et persistante **avant** l’appel. Double clic, requête parallèle et répétition de la même clé n’envoient pas un second appel. Attente d’une minute entre appels non cachés.
- Cache d’une heure en SQLite. Les aperçus, liens de publication et compteurs survivent aux déploiements. Réponses conservées 24 h puis purgées, reçus de requêtes conservés pour empêcher les rejeux. Rejouer une ancienne clé ne prolonge pas la fraîcheur des cotes et ne remplace pas un aperçu plus récent.
- Échecs comptés par précaution dans les plafonds locaux, même si le fournisseur ne les facture pas. Son dernier `x-requests-remaining` est affiché avec sa date de consultation.
- Un quota fournisseur à zéro bloque les nouveaux appels pendant 31 jours au maximum. Un appel `PENDING` après interruption bloque aussi les nouveaux appels : faire examiner le journal et le tableau de bord par l’administrateur avant toute intervention manuelle ; aucune remise à zéro au redémarrage.
- Les textes d’erreur externes et l’URL contenant `apiKey` ne sont ni journalisés ni exposés. Seuls les champs de calendrier/cotes autorisés sont persistés.
- Publication transactionnelle et auditée, réutilisation d’un match existant identifié par équipes/date exactes, aucune réouverture d’un match annulé/terminé. Les paris déjà acceptés conservent leur cote ; leurs équipes/date restent verrouillées.
- **Pas d’import automatique de résultats** : règlement/annulation via les contrôles administrateur existants.

## Validation

Tests avec clé et réponses **fictives**, sans connexion réelle au fournisseur : aperçu/publication, quota, concurrence, erreurs, cache/redémarrage SQLite, préservation des paris, autorisations/CSRF et interface. La disponibilité réelle des trois bookmakers pour la clé gratuite reste à vérifier avec un premier clic manuel en production.
