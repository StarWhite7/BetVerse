# Dossier de préparation aux stores

État au 6 novembre 2026. Ce dossier prépare une soumission ; il ne vaut ni publication, ni validation juridique, ni garantie d’acceptation par un store. Les renseignements doivent correspondre au binaire réellement envoyé et aux services effectivement activés.

## Périmètre à présenter

BetVerse est un jeu de pronostics sportifs gratuit utilisant des Verse virtuels, sans conversion en argent. Le socle comprend comptes vérifiés par email, portefeuille virtuel, paris simples et combinés, bonus, classement et agences. Android utilise Kotlin/Compose, le web Angular et les deux un backend Node/SQLite. Les imports sportifs sont manuels : ouvrir l’application ou redéployer ne doit pas appeler le fournisseur.

À la rédaction, aucun achat, dépôt, retrait, lot monétaire, publicité, affiliation bookmaker ou SDK analytique n’est intégré. Firebase App Distribution est un canal de bêta privée. Le manifeste Android déclare Internet et POST_NOTIFICATIONS ; Firebase Messaging est intégré avec initialisation automatique désactivée et activation explicite. Le centre interne, les préférences et les parcours sociaux natifs sont présents. L’envoi distant reste désactivé côté serveur sans configuration FCM et sa réception réelle n’est pas validée. Ne pas confondre intégration du SDK et service actif.

Les routes d’export et suppression du compte sont présentes dans le chantier V1 ; leur présence dans le dépôt ne démontre pas leur déploiement ni leur recette sur téléphone. Vérifier ces deux points avant toute déclaration dans les consoles.

## Conditions de soumission

| Domaine | Critère de sortie vérifiable |
| --- | --- |
| Éditeur | Confirmer l’identité juridique derrière « StarWhite Interactive », le type de compte développeur et les coordonnées demandées ; France est le pays indiqué. |
| Support | Redirection Infomaniak vers le Gmail du studio enregistrée et routage MX corrigé. Tester réception et réponse avant validation ; son ajout comme expéditeur Brevo ne crée pas une boîte de réception. |
| Backend | URL HTTPS stable, certificat valide, sauvegarde restaurée en recette, surveillance et responsable d’incident identifiés. Aucun écran indispensable ne dépend d’un serveur local. |
| Android | Produire un AAB signé pour Play ; conserver identifiant d’application, clé et procédure de récupération. Distinguer identité bêta et identité publique avant la première publication. Vérifier les exigences SDK/API cibles affichées dans Play Console au moment de soumettre. |
| Accès revue | Fournir dans la console un compte de revue dédié, utilisable sans intervention humaine, et des instructions pour les fonctionnalités protégées. Aucun identifiant dans le dépôt. |
| Documents | Politique de confidentialité et parcours web de suppression publics, accessibles sans compte, avec une URL durable et le nom BetVerse. Aucun brouillon à champs manquants publié comme document final. |
| Données sportives | Afficher provenance et fraîcheur, gérer cotes indisponibles et matchs reportés. Les rencontres de recette sont clairement identifiées ; aucune promesse de données en direct. |
| Recette | Téléphone réel : inscription, email, reconnexion, perte réseau, double confirmation, combiné, résultat/remboursement, agence, export et suppression. Captures issues du binaire final, thèmes clair/sombre et tailles de police vérifiés. |

Pour les comptes développeur Google **personnels créés après le 13 novembre 2023**, le passage à la production exige notamment un test fermé Play avec au moins **12 testeurs inscrits en continu pendant 14 jours**, puis une demande d’accès à la production. Le statut du compte doit être vérifié ; cette règle ne s’applique pas indistinctement à tous les comptes. Une distribution Firebase ne remplace pas ce test Play. [Exigences officielles de test Google Play](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).

## Suppression du compte

Google demande aux applications créant des comptes un accès à la suppression dans l’application et une ressource web publique permettant de la demander ; le formulaire Data safety référence cette URL. Suspendre ou désactiver un compte ne suffit pas. Les éventuelles conservations justifiées doivent être expliquées. [Règles Google sur la suppression](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).

Le chantier actuel demande le mot de passe et une confirmation explicite avant effacement. Il supprime les données personnelles de jeu associées et transfère la direction d’une agence ou supprime une agence solitaire. La protection du dernier administrateur nécessite une transmission préalable. Tester aussi la révocation de toutes les sessions, la disparition des classements et le traitement des sauvegardes. L’export porte sur le compte du joueur, pas sur un téléchargement du catalogue brut du fournisseur.

## Inventaire pour les déclarations de confidentialité

Ce tableau est une base de travail, pas un formulaire déjà certifié. Les réponses finales tiennent compte des journaux et contrats des prestataires, pas seulement du code.

| Données observées | Usage et visibilité | Déclaration à examiner |
| --- | --- | --- |
| Email, pseudo, identifiant de compte | Authentification, récupération et correspondance ; pseudo visible aux autres joueurs, email privé | Coordonnées et identifiants utilisateur, liés au compte |
| Mot de passe transmis sous TLS, empreinte scrypt côté serveur | Vérification du compte ; aucun mot de passe sauvegardé sur mobile | Traitement d’authentification ; ne pas affirmer « aucune collecte » |
| Tickets, sélections, mises/gains virtuels, bonus, XP et classement | Exécution et historique du jeu ; certaines statistiques publiques | Activité/contenu de jeu ; les Verse ne sont pas des coordonnées bancaires |
| Agence, rôles, invitations et pronostics collectifs | Fonctionnement social, visibilité selon les écrans | Contenu utilisateur et activité liés au compte ; préciser la visibilité dans la politique |
| Cookie opaque de session, jetons de vérification/récupération | Sécurité et maintien de session ; stockage mobile chiffré par Android Keystore | Identifiants techniques et finalités de sécurité ; ne pas les qualifier de publicité |
| Notifications internes et préférences | Informations de compte/jeu, réglages | Données liées au compte ; push distant à déclarer seulement après intégration |
| Journaux applicatifs et infrastructure | Exploitation/sécurité ; rétention et accès à confirmer | Diagnostics et éventuelles adresses IP selon collecte réelle des prestataires |
| Demandes de support | Email et contenu que le joueur transmet | Assistance ; circuit et durée à définir avant ouverture de l’adresse |

Un traitement par un prestataire ne se classe pas automatiquement comme un partage au sens de Google : examiner les conditions de l’exception « service provider ». Les données envoyées hors appareil doivent être évaluées selon les définitions du formulaire. [Définitions Data safety de Google](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en-EN). Pour Apple, le contenu de jeu et les identifiants liés au compte doivent être examinés ; les informations restant uniquement sur l’appareil ne sont pas déclarées comme collectées selon la même définition. [Déclarations de confidentialité Apple](https://developer.apple.com/app-store/app-privacy-details/).

Prestataires identifiés : Render pour le backend et ses données, Brevo pour les emails transactionnels, The Odds API pour les données sportives, Google/Firebase pour la distribution privée et, après opt-in et configuration serveur, FCM pour un identifiant technique d’appareil. Déclarer ce dernier dans les formulaires du binaire qui intègre Messaging ; ne pas cocher « aucune collecte » sans analyser son fonctionnement réel. Vérifier les flux réels, sous-traitants, localisation et transferts. Si crash reporting, publicité ou achat sont ajoutés, refaire cet inventaire avant livraison.

## Pronostics virtuels et classification

Répondre honnêtement au questionnaire IARC sur les mises simulées et les interactions entre joueurs. Aucun classement d’âge précis n’est promis ici : le résultat dépend du questionnaire et des territoires. Ne pas annoncer « tout public » par défaut. [Questionnaire de classification Google](https://support.google.com/googleplay/android-developer/answer/9859655?hl=en&rd=1).

L’analyse retenue est celle d’un jeu gratuit sans argent ni récompense échangeable. Ce périmètre ne garantit pas l’acceptation. L’ajout de mises achetées, gains réels, liens d’affiliation ou annonces de bookmakers impose une nouvelle analyse. Les restrictions Google concernant les publicités de jeux d’argent comprennent des conditions particulières pour le contenu simulant des paris ; elles ne constituent pas une interdiction générale de tous les jeux virtuels. [Politique Google jeux d’argent et publicités](https://support.google.com/googleplay/android-developer/answer/9877032?hl=en).

## Préparation iPhone ultérieure

Le client SwiftUI doit être compilé, signé et testé avec le backend réel avant TestFlight/App Store. Préparer compte Apple, identité d’éditeur, accès App Store Connect et environnement Xcode ; contrôler les exigences SDK et les manifestes de confidentialité des dépendances effectivement utilisées. Une structure de projet ne remplace pas une recette iPhone.

Apple attend une application complète, un backend disponible et un accès de revue fonctionnel. La politique de confidentialité doit être accessible dans l’app et ses métadonnées ; les fonctionnalités de jeu sont à examiner au titre des règles applicables. [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/). La suppression doit pouvoir être initiée depuis l’app ; une simple désactivation ou une obligation générale d’écrire au support ne suffit pas. [Suppression de compte Apple](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion).

## Proposition de fiche française

Texte à publier seulement lorsque les fonctionnalités citées ont passé la recette du binaire soumis.

- **Nom :** BetVerse : pronostics
- **Description courte :** Pronostics sportifs en monnaie virtuelle, agences et classements.
- **Description :**

> Retrouvez les matchs disponibles, choisissez vos pronostics et jouez avec des Verse virtuels. Composez un pari simple ou un combiné, suivez vos tickets et consultez votre progression.
>
> Rejoignez une agence pour jouer en équipe et comparez vos résultats dans les classements. Gérez votre profil et retrouvez les informations de votre compte dans l’application.
>
> BetVerse est un jeu gratuit de pronostics : les Verse n’ont aucune valeur monétaire, ne s’achètent pas et ne peuvent pas être retirés ou échangés contre de l’argent. Aucun gain en argent n’est proposé.
>
> Les matchs et les cotes dépendent des données disponibles. Leur mise à jour n’est pas un service de paris en direct. BetVerse n’est affilié à aucun club, championnat ou bookmaker présenté.

Préparer captures, icône, coordonnées, territoire et public cible, déclaration des interactions sociales, réponses Data safety/App Privacy et notes de revue en une seule passe. Le propriétaire doit confirmer les informations externes une fois ; les tests techniques et corrections peuvent ensuite continuer de manière autonome.
