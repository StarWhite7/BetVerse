# Bêta sur Render

Configuration pour une seule instance Node.js avec SQLite sur disque persistant. Le compte Render et son crédit existent ; aucun service n’a encore été déployé par cette préparation. Cette page remplace le parcours Infomaniak pour l’hébergement du backend. Le domaine reste chez Infomaniak.

## Formulaire New Web Service

| Champ          | Valeur                                                                        |
| -------------- | ----------------------------------------------------------------------------- |
| Name           | `betverse-beta` ou un nom libre                                               |
| Language       | `Node`                                                                        |
| Branch         | `codex/private-beta`, une fois cette branche publiée                          |
| Region         | `Frankfurt (EU Central)` si disponible                                        |
| Root Directory | Laisser vide : le dépôt Git commence déjà au dossier contenant `package.json` |
| Build Command  | `npm run render:build`                                                        |
| Start Command  | `npm run render:start`                                                        |
| Compute        | Starter, 0.5 CPU / 512 Mo, affiché à 7 $/mois sur le formulaire fourni        |

`render:build` installe les outils Angular même avec NODE_ENV=production, les dépendances du backend, puis compile le frontend. Les clés privées et les bases locales ne sont pas dans Git et ne doivent pas être téléversées.

Le serveur conserve une origine unique : au premier déploiement, le lanceur utilise `RENDER_EXTERNAL_URL` fourni par Render. Ne pas deviner un nom `onrender.com`. Après validation d’un domaine personnalisé, `APP_ORIGIN` pourra le remplacer.

## Variables

| KEY             | VALUE                                                           |
| --------------- | --------------------------------------------------------------- |
| `NODE_ENV`      | `production`                                                    |
| `NODE_VERSION`  | `24` (dernière version de la branche 24)                        |
| `HOST`          | `0.0.0.0`                                                       |
| `DATABASE_PATH` | `/var/data/betverse.sqlite`                                     |
| `TRUST_PROXY`   | `1` pour le proxy Render, sans exposer directement le port Node |
| `SMTP_URL`      | URL SMTP TLS réelle, à saisir comme secret dans Render          |
| `MAIL_FROM`     | Adresse expéditrice réellement vérifiée auprès du service email |

Ne pas ajouter `PORT` : Render le fournit. Ne pas ajouter `APP_ORIGIN` au premier déploiement : `render:start` reprend l’adresse HTTPS attribuée. Aucun mot de passe administrateur ni clé Firebase/Android n’est requis sur ce serveur.

## Advanced

- Ajouter un **Persistent Disk**, taille initiale **1 GB**, montage **`/var/data`**. Le disque est facturé en plus du serveur. Vérifier le récapitulatif avant validation.
- Health Check Path : **`/api/health`**.
- Auto-Deploy : **Off** pour cette première mise en ligne. Nous activerons les déploiements après validation lorsque la recette sera terminée.
- Une seule instance, aucun autoscaling.

Le lanceur refuse une base ailleurs que sur `/var/data` et refuse de créer ce dossier comme repli local. Vérifier aussi dans le tableau de bord que le disque a bien été attaché : la seule existence d’un dossier ne prouve pas sa persistance. Une base SQLite exige des sauvegardes cohérentes, indépendamment des instantanés du disque.

## Email : à configurer avant le déploiement

Sans SMTP, le serveur de production refusera de démarrer. Ne pas employer une fausse URL SMTP ou basculer NODE_ENV en développement pour contourner la protection.

Un service SMTP transactionnel peut être utilisé, par exemple Brevo. Avec l’offre gratuite, vérifier les limites en vigueur (300 emails/jour annoncés lors de la préparation). Créer le compte puis suivre la vérification du domaine et de l’expéditeur : ajouter dans les DNS Infomaniak uniquement les enregistrements indiqués par le service, en conservant les autres enregistrements existants. Ne pas créer plusieurs enregistrements SPF concurrents.

Dans les réglages SMTP du fournisseur, récupérer le serveur, le port, l’identifiant et la **clé SMTP** (distincte du mot de passe de connexion ou d’une clé API). Si le fournisseur documente le port TLS implicite 465, l’URL sera :

`smtps://IDENTIFIANT_ENCODE:CLE_SMTP_ENCODEE@SERVEUR_SMTP:465`

Les identifiants doivent être encodés comme composants URL, notamment `@`, `:`, `/`, `#`, `%` et `?`. Les saisir directement dans Render, pas dans le chat ni dans Git. Pour utiliser le port 587 en STARTTLS, le schéma est `smtp://` ; le backend exige TLS dans les deux cas.

## À prévoir pour la version publique : personnalisation Brevo

Demande utilisateur du 4 novembre 2026 : configurer un sous-domaine personnalisé Brevo pour présenter des liens de suivi et des images d’emails sous le domaine BetVerse. Cette personnalisation est reportée pendant la bêta ; elle est distincte de l’authentification du domaine et de l’expéditeur.

- Choisir un sous-domaine disponible, par exemple `em.betverse.fr`, puis suivre les valeurs DNS fournies par Brevo dans la zone Infomaniak.
- Vérifier la validation du sous-domaine dans Brevo et le rendu des liens/images sur un email de test avant la diffusion publique.

## Recette

Pour les vraies rencontres, voir [API Football : imports manuels et protection du quota](API_FOOTBALL.md). Les appels fournisseur sont désactivés par défaut et ne sont jamais liés aux déploiements.

Après un premier déploiement réussi, ouvrir l’URL Render et `/api/health`, créer un compte de test, recevoir le mail, confirmer puis se connecter. Vérifier la persistance après redémarrage et redéploiement. Tester le bonus et les pronostics avant de distribuer l’APK.

Pour l’admin ou les sauvegardes via le shell Render : les commandes `npm run admin` et `npm run backup` attendent `APP_ORIGIN`. Définir `APP_ORIGIN` à la valeur de `RENDER_EXTERNAL_URL` dans le shell, puis utiliser les variables privées nécessaires. Lancer l’admin sur le service en fonctionnement, pas dans un one-off job qui ne monte pas le disque.

Le domaine `beta.betverse.fr` sera ajouté ensuite comme domaine personnalisé. Mettre `APP_ORIGIN=https://beta.betverse.fr` seulement après validation DNS/HTTPS, et utiliser cette même origine dans la configuration Android. Tant que cette configuration n’est pas faite, utiliser uniquement l’URL Render.

Références : <https://render.com/docs/disks>, <https://render.com/docs/node-version>, <https://render.com/docs/environment-variables>.
