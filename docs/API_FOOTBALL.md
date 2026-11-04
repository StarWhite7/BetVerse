# API Football : bêta strictement manuelle

Décision utilisateur du 4 novembre 2026 : aucun appel automatique pendant la bêta. Un push, un build, un déploiement, un redémarrage, une migration, un health check et l’ouverture d’une page ne doivent consommer aucune requête API Football.

## Activation volontaire

Le fournisseur est API-Sports direct, hôte fixe `https://v3.football.api-sports.io`, en-tête serveur `x-apisports-key`. La clé reste exclusivement dans les variables Render : jamais dans Git, Angular, l’APK, les journaux ou les captures.

Sur Render, ajouter :

- `API_FOOTBALL_MODE=manual` (défaut : `disabled` ; aucun mode automatique accepté).
- `API_FOOTBALL_KEY` : clé API-Sports réelle, saisie comme secret.
- `API_FOOTBALL_DAILY_LIMIT=10` : plafond local prudent, configurable de 1 à 100 appels sur **24 heures glissantes**, conservé en SQLite. Ce plafond est distinct du quota réel de l’abonnement et ne voit pas les appels d’autres projets utilisant la même clé.

La présence de la clé ne déclenche aucun appel. L’absence de clé n’empêche pas BetVerse de démarrer. Pour couper les imports, remettre le mode à `disabled` et déployer la configuration.

## Utilisation dans Administration → Matchs

L’administrateur doit cocher l’autorisation avant chaque action. Chaque action envoie **au maximum une requête fournisseur**, uniquement sur POST authentifié avec contrôle du rôle, de l’origine et du CSRF :

1. **Charger le calendrier** : une requête `/fixtures` pour une date UTC, avec éventuellement l’ID de compétition et la saison. Le calendrier est stocké comme brouillon ; aucun match sans cotes n’est proposé aux joueurs.
2. **Charger les bookmakers** : une requête `/odds/bookmakers`, seulement lorsque la liste doit être récupérée. Sélectionner ensuite le bookmaker réellement disponible dans l’abonnement ; la présence de Winamax, Unibet ou Betclic et de leurs cotes n’est pas garantie.
3. **Importer les cotes et publier** : une requête `/odds` pour un seul match, un bookmaker et le marché pré-match `bet=1` (Home/Draw/Away). Les trois cotes doivent être disponibles. Le match est alors publié ou actualisé, sans duplication.

Un premier match avec liste de bookmakers vide nécessite donc jusqu’à **trois requêtes volontaires distinctes**, pas une requête globale cachant plusieurs appels. Aucun chargement de page suivante, retry, fallback vers un autre bookmaker, live polling ou résolution automatique des résultats. Le calendrier chargé utilise l’heure UTC ; les heures affichées sont locales au navigateur.

## Protection du quota et des données

- Cache persistant d’une heure par endpoint et paramètres : une action identique dans cette période ne consomme pas de quota. Une clé d’idempotence déjà traitée ne relance pas l’appel, même après redémarrage.
- Les copies du cache partagent une seule réponse stockée. Les réponses brutes de plus de 24 heures sont purgées lors d’une action manuelle ; le journal des tentatives reste conservé. Une ancienne clé dont la réponse a expiré est refusée sans nouvel appel.
- Réservation en SQLite avant le réseau : double clic et appels concurrents bloqués. Une minute minimum entre deux appels distincts non servis du cache.
- Les échecs et délais dépassés sont comptés par précaution dans le plafond local, sans relance. Le quota fournisseur restant est celui de l’en-tête du dernier appel, sans requête `/status` supplémentaire.
- Les tests utilisent des réponses simulées, aucune clé réelle et aucun accès fournisseur. Les migrations ne contiennent aucun code réseau.
- Les paris existants conservent leurs cotes acceptées. Les équipes et le coup d’envoi d’un match avec des mises sont verrouillés. Les changements de calendrier nécessitant une annulation/remboursement doivent être traités dans l’administration.
- Les résultats restent à saisir et à valider manuellement pendant cette bêta. Sans mise à jour volontaire, le calendrier et les cotes peuvent être anciens.

Un processus tué entre la réservation et la fin de l’appel peut laisser une ligne `PENDING`. Par sécurité, elle bloque les prochains appels : **ne pas la rejouer automatiquement**. Dans le shell du service Render, examiner `SELECT id,cacheKey,state,createdAt FROM football_calls ORDER BY createdAt DESC LIMIT 10`, comparer au tableau de bord API-Sports et vérifier qu’aucun import n’est encore en cours. Un administrateur peut ensuite marquer uniquement cette réservation interrompue `FAILED` ; elle reste comptée dans le plafond local. Ne jamais supprimer le journal pour remettre le quota à zéro.

Référence fournisseur : [documentation API Football](https://www.api-football.com/documentation_v3). L’accès aux saisons et aux cotes dépend de l’abonnement ; une erreur ne provoque aucun appel de remplacement.
