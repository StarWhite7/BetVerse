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
2. Les cinq grands championnats sont **décochés par défaut**. Cocher ceux à charger et choisir le premier jour UTC (aujourd’hui à J+7). La fenêtre contient sept jours calendaires UTC. Les coupes restent accessibles sous « Autres compétitions » ; cinq compétitions maximum par chargement.
3. Le coût maximal est affiché **avant** consentement : jusqu’à un crédit par compétition cochée (cinq championnats = cinq crédits maximum). Un changement de sélection/date annule le consentement. **Charger l’aperçu** lance un groupe volontaire, séquentiel, avec un seul GET par compétition non cachée, `regions=fr`, `markets=h2h`, prix décimaux. Aucun retry, pagination ou remplacement implicite.
4. Le bilan distingue compétition chargée, cache, échec et compétition non appelée. Le groupe s’arrête au premier échec, en conservant les aperçus déjà chargés. Examiner ensuite le tableau : une ligne par match, cotes avant/après, ajout, changement de calendrier, cotes modifiées, inchangé ou indisponible. Winamax France est présélectionné ; Betclic France et Unibet France restent disponibles sans nouvel appel.
5. Les modifications publiables des compétitions effectivement chargées sont présélectionnées ; décocher les lignes à exclure, ou utiliser la case d’en-tête pour sélectionner toutes les lignes disponibles (200 maximum). **Valider la sélection (0 crédit)** publie la sélection en une transaction vers le catalogue commun Web/Android. Une seule ligne invalide au moment du clic fait échouer toute la transaction, sans publication partielle. Les lignes inchangées sont exclues de la sélection dans l’interface.

L’aperçu charge les matchs et les cotes ensemble ; ce n’est pas une garantie de calendrier exhaustif. Les rencontres déjà commencées, données malformées, cotes incomplètes, cotes avec plus de deux décimales et mises à jour de plus d’une heure sont exclues de la publication. Un aperçu expiré nécessite un nouveau clic manuel. Les heures d’affichage sont locales ; les filtres du fournisseur sont UTC.

## Protection du quota et des paris

- Construction de l’application, migration, déploiement, redémarrage, pages publiques, GET administrateur et publication locale : **zéro appel fournisseur**.
- `POST /api/admin/odds/preview-batch`, authentifié administrateur avec CSRF, consentement explicite et UUID d’idempotence, peut charger jusqu’à cinq compétitions explicitement choisies. L’ancien `POST /preview` reste compatible pour un chargement unique. Les publications `/publish` et `/publish-batch` n’appellent jamais le fournisseur.
- Hôte HTTPS fixe, redirections interdites, délai 15 s, réponse plafonnée à 4 Mio ; aucun retry.
- Réservation atomique et persistante **avant** l’appel. Le groupe possède son propre reçu persistant : répétition de la même clé ne rejoue pas les appels. Un contrôle préalable vérifie le quota local/fournisseur disponible pour tout le groupe non caché. Un groupe en cours interdit tout autre groupe ou chargement unique ; les appels de ce groupe sont séquentiels, sans attente d’une minute entre ses compétitions. L’attente d’une minute s’applique entre deux chargements non cachés distincts. Un groupe interrompu reste bloqué pour examen manuel après redémarrage.
- Cache d’une heure en SQLite. Les aperçus, liens de publication et compteurs survivent aux déploiements. Réponses conservées 24 h puis purgées, reçus de requêtes conservés pour empêcher les rejeux. Rejouer une ancienne clé ne prolonge pas la fraîcheur des cotes et ne remplace pas un aperçu plus récent.
- Échecs comptés par précaution dans les plafonds locaux, même si le fournisseur ne les facture pas. Son dernier `x-requests-remaining` est affiché avec sa date de consultation.
- Un quota fournisseur à zéro bloque les nouveaux appels pendant 31 jours au maximum. Un appel `PENDING` après interruption bloque aussi les nouveaux appels : faire examiner le journal et le tableau de bord par l’administrateur avant toute intervention manuelle ; aucune remise à zéro au redémarrage.
- Les textes d’erreur externes et l’URL contenant `apiKey` ne sont ni journalisés ni exposés. Seuls les champs de calendrier/cotes autorisés sont persistés.
- Publication transactionnelle et auditée, réutilisation d’un match existant identifié par équipes/date exactes, aucune réouverture d’un match annulé/terminé. Les paris déjà acceptés conservent leur cote ; leurs équipes/date restent verrouillées.
- **Pas d’import automatique de résultats** : règlement/annulation via les contrôles administrateur existants.

## Validation

Tests avec clé et réponses **fictives**, sans connexion réelle au fournisseur : aperçu/publication, cinq compétitions, quota préalable, concurrence, erreurs et arrêt partiel, cache/rejeu après redémarrage, rollback de publication groupée, préservation des paris, autorisations/CSRF et tableau. Le propriétaire a confirmé un premier import réel de Ligue 1 avec cotes Winamax et publication côté joueur.
