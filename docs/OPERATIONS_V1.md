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

Restauration hors production : définir la clé dans l’environnement puis exécuter `node scripts/restore-backup.mjs chemin.bvbackup nouvelle-base.sqlite`. La destination doit être nouvelle, distincte de la base active. L’outil vérifie l’authenticité, l’intégrité et les clés étrangères. Il ne bascule pas le serveur. Tester ensuite les soldes et les tickets, révoquer les anciennes sessions avant toute remise en service.

**Suppression de compte et anciennes copies :** la suppression efface la base active mais ne réécrit pas les anciennes sauvegardes. Avant remise en service d’une restauration, réconcilier les demandes de suppression intervenues depuis la copie. Le journal de ces demandes et sa conservation hors de la base restaurée doivent être organisés avant l’activation en production. Ne pas promettre une suppression de toutes les sauvegardes instantanée ni une restauration automatique respectant les suppressions : ce rapprochement n’est pas automatisé. Limiter et documenter la rétention distante, et ne pas activer des sauvegardes réelles sans cette procédure.

## Push Android

Firebase Messaging est intégré sans Analytics. L’initialisation automatique de Messaging est désactivée. L’utilisateur doit demander l’activation et accepter l’autorisation Android quand elle est requise. Le serveur doit annoncer le service disponible avant la demande du jeton Firebase. Le centre de notifications interne fonctionne sans push.

Pour activer : préparer un compte de service dédié autorisé à envoyer via FCM dans le projet, déposer son JSON comme fichier secret Render et configurer `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_FILE`, `FCM_TOKEN_KEY` et enfin `FCM_ENABLED=1`. Le compte de service GitHub App Distribution ne possède pas automatiquement ces droits. Ne jamais déposer cette clé dans l’APK ni dans Git.

Les jetons sont chiffrés dans la base et liés à une session authentifiée. La déconnexion et la révocation de session détachent l’appareil. Les préférences sont contrôlées avant l’envoi. La file est alimentée dans la transaction de notification et traitée ensuite par un worker ; aucune requête réseau n’entre dans le règlement d’un pari. Les alertes distantes restent génériques, sans solde, score ou identité. Une interruption ou un échec n’est pas réessayé automatiquement. La réception sur appareil réel n’est pas validée tant que le service n’est pas configuré et qu’un test consenti n’a pas été reçu.

Sources techniques : [FCM Android](https://firebase.google.com/docs/cloud-messaging/android/get-started), [API HTTP v1 et autorisations](https://firebase.google.com/docs/cloud-messaging/send/v1-api).

## Support et documents

StarWhite Interactive est un nom de studio en phase de test, sans immatriculation déclarée. France. La redirection souhaitée est `support@betverse.fr` vers `starwhiteinteractive@gmail.com`. Il faut vérifier sa création effective chez Infomaniak et tester réception puis réponse ; Brevo configure l’expéditeur des envois et ne crée pas la boîte de réception. Le sous-domaine de marque des liens Brevo reste une amélioration prévue.

Les pages `/legal/privacy`, `/legal/rules`, `/legal/terms`, `/legal/support` sont accessibles sans compte. Elles restent provisoires (`LEGAL_READY=0`). L’export et la suppression authentifiée existent dans Android, iOS et le parcours web. Ne pas activer `SUPPORT_VERIFIED` sans test, ni `LEGAL_READY` sans informations légales complètes.

## Recette et charge

`node scripts/load-test.mjs` n’accepte pas d’URL externe : il lance sa base jetable et son serveur loopback. Le rapport `docs/qa/load-result.json` constate les invariants sur 1 000 comptes synthétiques et 6 000 requêtes avec 25 workers. Les 409 des doubles bonus sont attendus. Ce test ne certifie pas une capacité Render ni 1 000 utilisateurs simultanés.

Avant diffusion publique : recette réelle Android (permissions, relance, réseau coupé pendant le POST, export, retour arrière, gros texte), iPhone signé, validation des mentions légales/support et questionnaires des stores. Le dossier `docs/publication/STORE_READINESS.md` détaille ces prérequis.
