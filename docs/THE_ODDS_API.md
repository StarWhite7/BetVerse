# The Odds API : actualisation depuis l’administration

Fournisseur : https://the-odds-api.com/ (avec tirets). Documentation consultée le 5 novembre 2026 :
https://the-odds-api.com/liveapi/guides/v4/ et https://the-odds-api.com/sports-odds-data/bookmaker-apis.html.

## Configuration Render

| Variable                     | Valeur                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `THE_ODDS_API_KEY`           | Clé secrète déjà ajoutée par le propriétaire dans Render ; jamais dans Git, Angular ou Android |
| `THE_ODDS_API_MODE`          | `manual` pour activer les actualisations ; défaut `disabled`, même avec une clé                |
| `THE_ODDS_API_DAILY_LIMIT`   | `10` par défaut, tentatives sur 24 h glissantes                                                |
| `THE_ODDS_API_MONTHLY_LIMIT` | `400` par défaut, crédits sur **31 jours glissants**, plafond configurable jusqu’à 500        |

Le stockage SQLite doit rester sur le disque persistant `/var/data`. Aucun secret GitHub ou Firebase supplémentaire.
Ces plafonds locaux conservateurs sont distincts de la facturation mensuelle du fournisseur et ne voient pas l’usage d’autres projets avec la même clé.

## Parcours administrateur

1. Ouvrir **Administration → Matchs**. Si la fenêtre de double authentification s’affiche, saisir le code pour ouvrir le panneau.
2. Sélectionner les compétitions, le bookmaker et le premier jour UTC de la fenêtre de sept jours (aujourd’hui à J+7).
3. **Actualiser les matchs et cotes** publie les matchs admissibles et met à jour leurs cotes dans le catalogue commun. Compter au plus un crédit par compétition.
4. **Actualiser les résultats** règle les matchs admissibles des trois derniers jours parmi les cinq grands championnats sélectionnés. Compter au plus deux crédits par championnat.
5. **Actualisation globale** combine ces deux actions. Pour une coupe, elle récupère uniquement les matchs et les cotes. Le bouton indique le coût maximal et le serveur vérifie les quotas après prise en compte du cache.

Le clic déclenche le chargement et applique les données valides. Le bilan liste les rencontres écartées avec leur motif. Un score doit concerner un match publié lié par son identifiant fournisseur, avec la même compétition, les mêmes équipes et le même coup d’envoi. Le fournisseur doit déclarer le match terminé et le coup d’envoi remonter à au moins 90 minutes. Les scores des coupes, les résultats plus anciens et les cas ambigus restent à traiter dans l’exploitation.

## Protection du quota et des paris

- Construction de l’application, migration, déploiement, redémarrage, pages publiques, GET administrateur et publication locale : **zéro appel fournisseur**.
- `POST /api/admin/odds/preview-batch`, authentifié administrateur avec CSRF, consentement explicite et UUID d’idempotence, peut charger jusqu’à cinq compétitions explicitement choisies. L’ancien `POST /preview` reste compatible pour un chargement unique. Les publications `/publish` et `/publish-batch` n’appellent jamais le fournisseur.
- Hôte HTTPS fixe, redirections interdites, délai 15 s, réponse plafonnée à 4 Mio ; aucun retry.
- Réservation atomique et persistante **avant** l’appel. Le groupe possède son propre reçu persistant : répétition de la même clé ne rejoue pas les appels. Un contrôle préalable vérifie le quota local/fournisseur disponible pour tout le groupe non caché. Un groupe en cours interdit tout autre groupe ou chargement unique ; les appels de ce groupe sont séquentiels, sans attente d’une minute entre ses compétitions. L’attente d’une minute s’applique entre deux chargements non cachés distincts. Un groupe interrompu reste bloqué pour examen manuel après redémarrage.
- Cache SQLite d’une heure pour les cotes et de cinq minutes pour les résultats. Les liens de publication et les compteurs survivent aux déploiements. Les réponses sont purgées après 24 h et les reçus conservés pour empêcher les rejeux. Rejouer une ancienne clé ne prolonge pas la fraîcheur des cotes.
- Échecs comptés par précaution dans les plafonds locaux, même si le fournisseur ne les facture pas. Son dernier `x-requests-remaining` est affiché avec sa date de consultation.
- Un quota fournisseur à zéro bloque les nouveaux appels pendant 31 jours au maximum. Un appel `PENDING` après interruption bloque aussi les nouveaux appels : faire examiner le journal et le tableau de bord par l’administrateur avant toute intervention manuelle ; aucune remise à zéro au redémarrage.
- Les textes d’erreur externes et l’URL contenant `apiKey` ne sont ni journalisés ni exposés. Seuls les champs de calendrier/cotes autorisés sont persistés.
- Publication transactionnelle et auditée, réutilisation d’un match existant identifié par équipes/date exactes, aucune réouverture d’un match annulé/terminé. Les paris déjà acceptés conservent leur cote ; leurs équipes/date restent verrouillées.
- Le panneau utilise `POST /api/admin/odds/sync` avec la sélection, le mode, le bookmaker et une clé d’idempotence. La publication et le règlement local des données admissibles sont enregistrés avec le reçu du lot. Le rejeu ne débite aucun crédit et ne paie aucun pari une deuxième fois.

## Validation

Tests avec clé et réponses **fictives**, sans connexion réelle au fournisseur : aperçu/publication, cinq compétitions, quota préalable, concurrence, erreurs et arrêt partiel, cache/rejeu après redémarrage, rollback de publication groupée, préservation des paris, autorisations/CSRF et tableau. Le propriétaire a confirmé un premier import réel de Ligue 1 avec cotes Winamax et publication côté joueur.
