# Backend de bêta sur Infomaniak

Le domaine est acheté, mais aucun hébergement n’a encore été provisionné. Ce guide prépare un déploiement ; il ne commande aucun service et ne modifie pas le DNS.

## Vérifier l’offre avant de payer

Dans le Manager Infomaniak, ouvrir **Hébergement Web** et examiner la création d’un site **Node.js**. Il faut :

- Node **24.15+ dans la branche 24**, ou **26** ; le backend utilise `node:sqlite`. Une offre limitée à Node 20 ou 22 ne correspond pas au runtime validé.
- Un processus Node maintenu par l’hébergement et un port configurable.
- Un espace disque persistant accessible en écriture, conservé lors de l’importation d’une nouvelle version. SQLite doit rester sur un stockage local compatible avec son verrouillage/WAL, pas un montage réseau non validé.
- Une seule instance du backend pour cette bêta.
- HTTPS et l’envoi d’emails via SMTP TLS.

Faire confirmer le stockage persistant et sa compatibilité SQLite par le support si ce n’est pas précisé dans le Manager. Si ces conditions ne sont pas réunies, choisir un serveur avec disque persistant et Docker plutôt que de modifier le backend pour une offre incompatible.

Documentation officielle consultée : <https://www.infomaniak.com/en/support/faq/2537/create-a-nodejs-website-with-infomaniak>.

## Création du site

L’assistant documenté permet d’ajouter un projet avec technologies avancées, de choisir Node.js, sa version, puis un domaine ou sous-domaine et une méthode d’importation personnalisée.

Choisir **`beta.betverse.fr`** pour séparer le test de la future production. Vérifier le prix affiché et les conditions avant de confirmer un achat. Activer le certificat HTTPS pour ce sous-domaine.

Utiliser la méthode personnalisée avec import ZIP : pas besoin de donner un jeton GitHub au fournisseur pour ce premier déploiement.

## Archive préparée

`npm run deploy:package` compile Angular puis génère une archive sous `dist/deployment`. Elle contient uniquement :

- le frontend compilé ;
- le backend et ses migrations ;
- les manifestes npm et ce guide.

Elle n’inclut ni clé Android, ni configuration SMTP, ni base locale, ni comptes de recette, ni dépendances installées. La clé `.private/betverse-beta.p12` doit rester sur le PC et dans votre sauvegarde privée.

Importer le **contenu à la racine du projet Node**. Si l’importeur crée un sous-dossier supplémentaire, le sélectionner comme répertoire du projet. Le fichier `package.json` doit s’y trouver directement.

## Réglages du lancement

| Réglage                                             | Valeur             |
| --------------------------------------------------- | ------------------ |
| Installation/build                                  | `npm run build`    |
| Démarrage                                           | `npm start`        |
| Point d’entrée si demandé à la place d’une commande | `server/index.mjs` |
| Processus                                           | Une instance       |
| Contrôle de santé                                   | `/api/health`      |

Le frontend est déjà compilé dans l’archive ; `npm run build` installe uniquement les dépendances de production du backend. Aucun outil Android n’est requis sur cet hébergement.

## Variables d’environnement

Configurer dans le Manager, sans mettre les secrets dans Git :

| Variable        | Valeur                                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`      | `production`                                                                                             |
| `APP_ORIGIN`    | `https://beta.betverse.fr` sans slash final                                                              |
| `HOST`          | `0.0.0.0` si requis par le proxy de l’hébergement                                                        |
| `PORT`          | Le port demandé/attribué par le Manager ; ne pas supposer un numéro                                      |
| `DATABASE_PATH` | Chemin **absolu** vers la base dans le stockage persistant confirmé par l’hébergeur                      |
| `SMTP_URL`      | URL SMTP TLS fournie par votre service email                                                             |
| `MAIL_FROM`     | Expéditeur autorisé, par exemple `BetVerse <noreply@betverse.fr>` si cette adresse est configurée        |
| `TRUST_PROXY`   | `1` seulement si l’hébergeur confirme un unique proxy de confiance et bloque l’accès direct au processus |

Une URL SMTP a la forme `smtps://UTILISATEUR_ENCODE:MOT_DE_PASSE_ENCODE@HOTE:465`. Encoder les caractères spéciaux de l’utilisateur et du mot de passe comme composants URL. Utiliser les paramètres réellement fournis par le service email ; un domaine seul ne crée pas de boîte email.

Ne pas stocker la base dans le dossier remplacé lors des déploiements. La commande de démarrage refuse de lancer la production si SMTP ou HTTPS manque. Ne pas désactiver ces protections pour contourner un problème de configuration.

## Première validation

1. Depuis le téléphone, ouvrir `https://beta.betverse.fr/api/health` et vérifier `{"status":"ok"}`.
2. Ouvrir le site, créer un compte de test et vérifier la réception de l’email puis la connexion.
3. Redémarrer l’application depuis le Manager : le compte et les données doivent être conservés.
4. Tester une remise en ligne de l’archive, après sauvegarde : les données doivent rester conservées.

Pour créer l’admin, définir temporairement `ADMIN_EMAIL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` dans une session privée puis lancer `npm run admin`. Retirer ensuite ces variables. Ne pas créer de compte administrateur avec les identifiants de recette.

Configurer une sauvegarde régulière via `npm run backup` avec un `BACKUP_PATH` privé, hors du dossier publié, puis copier les sauvegardes hors de cet hébergement. Tester la restauration. Consulter le README du dépôt pour les détails ; la sauvegarde cohérente de SQLite ne consiste pas à copier le seul fichier d’une base active.

## Puis connecter Android

Lorsque le serveur est validé, définir la variable GitHub `BETVERSE_BETA_ORIGIN=https://beta.betverse.fr`. L’ID Firebase connu est **`1:472242612609:android:35986b1689d8864d5ba080`**. Suivre ensuite `docs/ANDROID_FIREBASE.md` pour les secrets de signature et le compte de distribution dédié. Rien n’est distribué automatiquement tant que `ANDROID_BETA_ENABLED` n’est pas `true`.
