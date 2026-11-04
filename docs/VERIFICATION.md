# Validation de la V1 — 3 novembre 2026

## Contrôles automatisés

Commande : `npm run check`.

- **26 tests backend réussis** : inscriptions, validation des mots de passe, sessions et déconnexion, expiration, droits admin, origine et CSRF, bonus concurrent, cotes serveur, idempotence, solde concurrent, coup d'envoi, clôture et rollback, historiques, classement, agences, rôles, invitations, pronostics, notifications privées, réinitialisation et confirmation d'email, transferts, annulations, sauvegarde/restauration, création admin et migration d'une base existante.
- **11 tests frontend réussis** : restauration et révocation de session, indisponibilité du backend au démarrage, transport CSRF, pagination, annulation des anciennes requêtes, changement de compte, validation des mots de passe et progression.
- **Build de production réussi** sous Angular 22 / TypeScript 6. Environ 359 ko initiaux avant compression. Les polices sont incluses localement : la compilation ne dépend plus de Google Fonts.
- `npm audit` et `npm --prefix server audit` : **0 vulnérabilité connue signalée**, dépendances de développement comprises, à la date du contrôle.
- `git diff --check` : aucun défaut d'espacement détecté.
- `docker compose config --no-env-resolution --quiet` : configuration analysée avec succès.

Les 9 anciens tests qui vérifiaient seulement la création de composants inutilisés ont été supprimés avec ces composants. Les tests livrés couvrent les comportements utiles de la V1.

## Recette dans le navigateur

Recette avec le build servi par le backend réel sur une base SQLite temporaire et des identités fictives :

| Parcours                         | Résultat observé                                                   |
| -------------------------------- | ------------------------------------------------------------------ |
| Créer un compte                  | Connexion, Verse à 0 et shards à 100                               |
| Bonus quotidien                  | Solde à 500, bouton verrouillé avec décompte                       |
| Miser 50 Verse à 1,80            | Solde à 450 et ticket présent dans « Mes paris »                   |
| Recharger la page                | Session et historique conservés                                    |
| Créer une agence                 | Agence visible et shards à 0                                       |
| Déconnexion puis connexion admin | Panneau de gestion accessible                                      |
| Saisir le score final 2–1        | Rencontre clôturée par le backend                                  |
| Revenir au joueur                | Gain de 90 Verse, solde à 540, XP à 60 et notification de victoire |
| Affichage mobile                 | Navigation et contenu contrôlés à 390 × 844                        |

La fenêtre de gain utilise un dialogue natif au premier plan, avec focus clavier et retour au contrôle précédent. Le premier contrôle visuel a révélé un problème de fenêtre contenue dans l'en-tête ; il a été corrigé et revérifié.

L'annulation/remboursement, les échecs de droits, les appels simultanés et les migrations ont été vérifiés par les tests HTTP. Les emails de production ont été testés avec une livraison substituée, sans envoi à une adresse réelle.

## Limites des vérifications

- Aucun hébergement public, DNS, certificat ou compte SMTP réel n'a été configuré. Leur fonctionnement reste à vérifier sur l'environnement choisi.
- La recette Docker n'a pas pu être exécutée : Docker est installé, mais le moteur Docker Desktop Linux n'est pas démarré. Le Dockerfile est fourni ; seule l'analyse du fichier Compose a été vérifiée ici.
- Deux avertissements de budget CSS subsistent sur les écrans agence et bureau d'agence (environ 12,4 et 13,8 ko pour une cible d'avertissement de 12 ko). Ils ne bloquent pas le build.
- Vitest sous Node 26 émet un avertissement expérimental relatif à son environnement de stockage ; les 11 tests passent. Node 24 LTS est recommandé pour le déploiement.
- Aucun test de charge massif, audit de sécurité indépendant ou test sur appareils physiques n'est revendiqué.

## Conditions d'ouverture publique

Configurer HTTPS et APP_ORIGIN, un SMTP fonctionnel, le compte administrateur, un volume persistant, les sauvegardes et la supervision. Vérifier une inscription avec confirmation d'email et une réinitialisation réelle sur cet environnement. Conserver une seule instance tant que le stockage reste SQLite.
