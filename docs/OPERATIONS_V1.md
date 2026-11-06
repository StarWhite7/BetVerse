# Exploitation de la bêta

## Statut et déploiement

Le code est livré sur `codex/private-beta`. GitHub vérifie le backend, Angular, Android et Swift. Le push Git ne déclenche aucun appel sportif. Render étant en déploiement manuel, un build Firebase ne prouve pas que le backend correspondant soit déjà déployé.

Avant un déploiement Render : conserver le disque `/var/data`, sa base et les clés privées ; créer une sauvegarde indépendante, appliquer la version de la branche, puis vérifier `/api/health` et les parcours de connexion, bonus, coupon et agences. Les migrations sont appliquées au démarrage. Ne jamais remplacer la base par celle de recette. Ne pas supprimer une migration déjà appliquée pour revenir à une ancienne version.

## Administration

`/admin/operations` présente les rencontres commencées à régler, les compteurs, les dernières actions administratives et l’état de sauvegarde. L’import de résultats accepte `UUID;scoreDomicile;scoreExterieur`, une ligne par rencontre. Il vérifie les identités et les dates, produit un aperçu de quinze minutes et applique le lot atomiquement après confirmation. Une répétition du même reçu ne règle pas une seconde fois les tickets. Ce parcours ne contacte aucun fournisseur. Les annulations restent motivées et journalisées dans la gestion des matchs ; une date déjà engagée par des paris ne peut pas être déplacée arbitrairement.

Configurer une `ADMIN_MFA_KEY` aléatoire de 32 octets en hexadécimal dans Render, puis ouvrir `/admin/security`. Le secret TOTP et les codes de secours ne doivent pas quitter le gestionnaire de mots de passe. Une fois un administrateur enrôlé, ses actions administratives demandent une vérification de session (30 minutes). Après enrôlement et vérification des secours, `ADMIN_MFA_REQUIRED=1` impose ce contrôle à tous les administrateurs. La clé de chiffrement est nécessaire à toute restauration ; la conserver séparément de la base.

La suspension révoque les sessions ; un administrateur ne peut pas suspendre un autre administrateur via cette action. La levée de suspension et son motif sont journalisés. Les métriques restent en mémoire, sans données personnelles : requêtes, erreurs serveur, p95 des 1 000 dernières requêtes, mémoire et durée de fonctionnement. Elles repartent à zéro au redémarrage. Un monitoring externe avec alerte n’est pas activé.

## Sauvegarde chiffrée et restauration

Le service est **désactivé par défaut**. Préparer un stockage privé acceptant des PUT HTTPS, ses identifiants, sa rétention et `BACKUP_ENCRYPTION_KEY`. La clé doit être sauvegardée séparément, jamais dans Git. Configurer les variables de `server/.env.example`. L’interface permet un premier transfert manuel ; activer le rythme quotidien seulement après avoir téléchargé une sauvegarde distante et testé sa restauration. Aucun premier transfert n’est lancé au démarrage. Les trois dernières copies chiffrées locales sont conservées après un transfert réussi ; la rétention distante se configure chez le fournisseur et ne découle pas du nettoyage local.

Le format utilise une copie SQLite cohérente, compression et AES-256-GCM. La taille de base est limitée à 32 Mio dans cette implémentation ; surveiller ce seuil. Une erreur apparaît dans l’état administratif, sans divulguer le secret du stockage.

En production, `npm run backup` utilise également le parcours chiffré et distant ; une configuration manquante le fait échouer. La copie SQLite en clair reste réservée au développement.

**Journal des suppressions :** chaque effacement de compte ajoute dans la même transaction un reçu pseudonyme (hash de l’identifiant, date, sans email ni pseudo). Le stockage configuré reçoit un journal AES-GCM cumulatif, lié à l’identifiant de cette installation. Une suppression demande sa synchronisation ; si le transfert n’aboutit pas rapidement, l’effacement actif reste acquis et le reçu est repris en arrière-plan. La vérification périodique reprend les changements toutes les minutes ; sans changement, elle ne retransmet pas. Les sauvegardes quotidiennes renouvellent aussi le journal. Un échec bloque la sauvegarde suivante et apparaît dans `/admin/operations`. Le dernier journal est nommé `erasures-latest.bverasures`, avec des copies datées. Définir la rétention des versions chez le fournisseur, en conservant toujours le journal cumulatif actuel.

Restauration hors production, vers un fichier nouveau :

1. Figer les écritures de la source (`MAINTENANCE_MODE=1`, redémarrer avec cette configuration), puis utiliser **Synchroniser le journal chiffré** dans l’administration. Le mode maintenance conserve les lectures, la connexion et la vérification MFA, ainsi que cette synchronisation ; il refuse les écritures du jeu et les suppressions avec HTTP 503.
2. Vérifier le succès distant puis télécharger depuis le stockage privé la sauvegarde et **le dernier journal**, pas simplement celui joint à l’ancienne copie. En cas de perte totale de la source avant l’accusé de réception d’une suppression, vérifier les demandes intervenues depuis le dernier journal distant ; le code ne peut pas reconstituer des informations jamais transférées.
3. Définir `BACKUP_ENCRYPTION_KEY` dans l’environnement puis exécuter `node scripts/restore-backup.mjs chemin.bvbackup nouvelle-base.sqlite erasures-latest.bverasures --source-stopped`. Le drapeau confirme une action faite par l’opérateur ; il ne prouve pas techniquement que la source est arrêtée.
4. L’outil refuse un journal absent, altéré, vieux de plus de 24 h, d’une autre installation ou incomplet par rapport aux reçus déjà présents dans la copie. Il applique les suppressions et révoque toutes les anciennes sessions, liens de récupération et confirmations d’email. Il vérifie l’intégrité et les clés étrangères ; aucun remplacement automatique de la base active n’est effectué.
5. Tester soldes et tickets, vérifier l’accès d’un administrateur autorisé, puis organiser la bascule. Le journal peut supprimer le dernier administrateur historique si son compte a réellement été effacé depuis la copie ; ne pas réactiver un compte supprimé pour retrouver un accès. Utiliser le bootstrap contrôlé d’un nouveau compte si nécessaire. Le retour à une ancienne copie peut perdre les opérations postérieures à cette copie : définir le RPO et annoncer les éventuelles reprises des données de jeu.

La réconciliation est automatisée **avec le journal fourni**, pas avec une certitude indépendante qu’il est le tout dernier. Les archives antérieures à la migration 015 n’ont pas d’identifiant d’installation et nécessitent une procédure de reprise spécifique ; l’outil ne les remet pas automatiquement en service. Ne pas purger des reçus tant qu’une copie susceptible de contenir le compte pourrait encore être restaurée. Ces reçus sont pseudonymes, pas anonymes.

Une clé séparée de journal est possible via `ERASURE_ENCRYPTION_KEY` ; sinon la clé de sauvegarde est utilisée. Lors d’une rotation, conserver la clé de chaque ancienne archive et fournir la clé actuelle du journal dans `ERASURE_ENCRYPTION_KEY` au moment de la restauration.

## Push Android

Firebase Messaging est intégré sans Analytics. L’initialisation automatique de Messaging est désactivée. L’utilisateur doit demander l’activation et accepter l’autorisation Android quand elle est requise. Le serveur doit annoncer le service disponible avant la demande du jeton Firebase. Le centre de notifications interne fonctionne sans push.

Pour activer : préparer un compte de service dédié autorisé à envoyer via FCM dans le projet, déposer son JSON comme fichier secret Render et configurer `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_FILE`, `FCM_TOKEN_KEY` et enfin `FCM_ENABLED=1`. Le compte de service GitHub App Distribution ne possède pas automatiquement ces droits. Ne jamais déposer cette clé dans l’APK ni dans Git.

Les jetons sont chiffrés dans la base et liés à une session authentifiée. La déconnexion et la révocation de session détachent l’appareil. Les préférences sont contrôlées avant l’envoi. La file est alimentée dans la transaction de notification et traitée ensuite par un worker ; aucune requête réseau n’entre dans le règlement d’un pari. Les alertes distantes restent génériques, sans solde, score ou identité. Une interruption ou un échec n’est pas réessayé automatiquement. La réception sur appareil réel n’est pas validée tant que le service n’est pas configuré et qu’un test consenti n’a pas été reçu.

Sources techniques : [FCM Android](https://firebase.google.com/docs/cloud-messaging/android/get-started), [API HTTP v1 et autorisations](https://firebase.google.com/docs/cloud-messaging/send/v1-api).

## Support et documents

StarWhite Interactive est un nom de studio en phase de test, sans immatriculation déclarée. France. La redirection `support@betverse.fr` vers `starwhiteinteractive@gmail.com` a été enregistrée chez Infomaniak le 6 novembre 2026, sans copie locale. MX, SPF, autoconfig/autodiscover et DKIM sont affichés valides par son diagnostic. Tester encore la réception dans Gmail puis la réponse : la redirection ne suffit pas à configurer l’envoi Gmail avec l’identité support. Les messages classés spam par Infomaniak ne sont pas transférés, et Gmail peut filtrer les messages redirigés. Brevo configure l’expéditeur des envois et ne crée pas la boîte de réception. Le sous-domaine de marque des liens Brevo reste une amélioration prévue.

Les pages `/legal/privacy`, `/legal/rules`, `/legal/terms`, `/legal/support` sont accessibles sans compte. Elles restent provisoires (`LEGAL_READY=0`). L’export et la suppression authentifiée existent dans Android, iOS et le parcours web. Ne pas activer `SUPPORT_VERIFIED` sans test, ni `LEGAL_READY` sans informations légales complètes.

## Recette et charge

`node scripts/load-test.mjs` n’accepte pas d’URL externe : il lance sa base jetable et son serveur loopback. Le rapport `docs/qa/load-result.json` constate les invariants sur 1 000 comptes synthétiques et 6 000 requêtes avec 25 workers. Les 409 des doubles bonus sont attendus. Ce test ne certifie pas une capacité Render ni 1 000 utilisateurs simultanés.

Avant diffusion publique : recette réelle Android (permissions, relance, réseau coupé pendant le POST, export, retour arrière, gros texte), iPhone signé, validation des mentions légales/support et questionnaires des stores. Le dossier `docs/publication/STORE_READINESS.md` détaille ces prérequis.
