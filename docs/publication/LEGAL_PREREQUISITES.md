# Prérequis juridiques et services externes

État au 6 novembre 2026. Document de préparation interne ; les règles publiques doivent refléter le service livré. Aucun statut de société, droit sur une marque, autorisation réglementaire ou conformité globale n’est présumé.

## Informations reçues et informations manquantes

| Élément | État |
| --- | --- |
| Nom d’éditeur souhaité | StarWhite Interactive |
| Pays indiqué | France |
| Contact souhaité | `support@betverse.fr` ; réception et réponse non constatées |
| Domaine | `betverse.fr`, enregistré chez Infomaniak |
| Forme et identité juridique de l’exploitant | À confirmer : nom commercial ne prouve pas l’existence d’une société |
| Adresse, immatriculation, représentant/directeur de publication | Non communiqués ; fournir les éléments applicables au statut réel |
| Hébergeur, sous-traitants et durées contractuelles | Services techniques identifiés, coordonnées et conditions exactes à consolider |

Pour un site professionnel français, les mentions dépendent notamment du statut de l’éditeur ; ne pas remplacer une identité légale par un simple nom de marque. Compléter les coordonnées et mentions applicables, dont celles de l’hébergeur et de la publication. [Fiche officielle Service Public sur les mentions obligatoires](https://entreprendre.service-public.gouv.fr/vosdroits/F37351).

## Politique de confidentialité à finaliser

Reprendre l’inventaire du [dossier stores](STORE_READINESS.md) et documenter : responsable du traitement, finalités et bases légales retenues, destinataires, visibilité publique des pseudos/statistiques, transferts éventuels hors UE, durées ou critères de conservation, droits et point de contact. Identifier les informations obligatoires à l’inscription et les conséquences de leur absence. Ces décisions doivent être approuvées par l’exploitant et cohérentes avec les contrats. [Informations à fournir selon la CNIL](https://www.cnil.fr/fr/informer-les-personnes).

Ne pas inventer une durée standard : fixer et appliquer séparément les durées du compte actif/inactif, tickets et mouvements virtuels, sessions et jetons, journaux de sécurité, support et sauvegardes. Définir une purge mesurable, ses exceptions justifiées et le responsable de son contrôle. L’absence d’analytics ne signifie pas absence de données personnelles. Les cookies actuels servent la session/sécurité ; vérifier tout nouveau traceur avant de décider des informations et mécanismes de consentement nécessaires.

Les emails transactionnels ne valent pas consentement à la prospection. Le service actuel n’intègre ni publicité, ni achat, ni campagne marketing ; ne pas réutiliser les emails des joueurs pour une nouvelle finalité sans examen préalable.

## Export, effacement et sauvegardes

Le code V1 ajoute export et suppression authentifiés. L’export exclut empreintes de mot de passe et secrets de session. La suppression efface les données rattachées au compte et traite son agence. La suspension administrative reste une mesure différente. Confirmer par recette l’accès web et natif, les confirmations compréhensibles et l’absence du joueur dans les réponses suivantes.

Avant publication, formaliser la disparition des données des sauvegardes : rotation, échéance d’expiration, droits d’accès et procédure empêchant une restauration de ressusciter un compte effacé. Tester sur une copie isolée. Ne pas promettre une suppression immédiate de toutes les sauvegardes si seule la base active est effacée. Tout délai ou conservation résiduelle doit avoir un motif précis et être expliqué.

## Règles du jeu à publier

Faire valider un règlement lisible indiquant le caractère virtuel et non échangeable des Verse/Shards, leur attribution, les bonus, le calcul des combinés, les refus de ticket et les conditions de suspension. Expliquer le traitement des rencontres reportées/annulées, des sélections remboursées, des erreurs de cote, la source de résultat, les délais de règlement et le canal de contestation.

Définir les règles de pseudo, agence et modération, les responsabilités des rôles et les effets d’un départ/suppression sur une agence. Ne pas présenter les rencontres de recette comme de vraies affiches officielles. Les noms et visuels de clubs/bookmakers ne prouvent aucune affiliation.

Le périmètre retenu reste gratuit, sans lot réel, vente de monnaie, retrait, publicité ni affiliation. Un changement d’économie, de récompenses, de public cible ou de territoire nécessite une réévaluation des règles et de la qualification du service avant activation. Ce dossier ne certifie pas une exemption réglementaire.

## Licence des données sportives

Le fournisseur est **The Odds API, domaine `the-odds-api.com`**. Ses conditions autorisent stockage et affichage dans une interface web/mobile, y compris commerciale, ainsi que les calculs dérivés. Elles interdisent la revente ou redistribution comme source de données autonome, flux brut, API concurrente ou téléchargement de données brutes destiné à d’autres utilisateurs. La clé reste privée. L’exactitude et la fraîcheur ne sont pas garanties ; les marques restent celles de leurs titulaires. [Conditions du fournisseur, mises à jour le 31 août 2026](https://the-odds-api.com/terms-and-conditions.html).

Conséquence de conception : le catalogue authentifié sert le jeu ; il ne doit pas devenir une API publique de revente du fournisseur. L’export d’un joueur porte sur son activité personnelle, pas sur l’ensemble des réponses fournisseur. Les budgets manuels et caches persistants réduisent la consommation sans étendre la licence. Revoir les conditions et le plan avant une hausse d’usage. Les logos de clubs nécessitent leur propre examen de droits : l’accès aux cotes ne confère pas un droit général sur ces visuels.

## Brevo : réception, expéditeur et sous-domaine sont distincts

1. **Réception support.** Créer une boîte ou une redirection réellement réceptionnée pour `support@betverse.fr` chez un prestataire de messagerie. Vérifier les enregistrements/routages requis par ce prestataire. Tester depuis une adresse externe, puis répondre. La capacité restante du contrat mail Infomaniak doit être constatée avant de choisir boîte ou alias.
2. **Expéditeur Brevo.** Ajouter « BetVerse » avec cette adresse et effectuer la vérification requise. C’est une autorisation d’envoyer, pas la création d’une boîte. Configurer l’adresse de réponse et tester un véritable email transactionnel. [Expéditeurs et domaines Brevo](https://developers.brevo.com/docs/getting-started-with-senders-and-domains).
3. **Authentification.** Conserver les enregistrements de domaine fonctionnels ; contrôler DKIM/DMARC et le résultat reçu, pas seulement le voyant du tableau de bord. Ne pas supprimer les MX ou modifier la délégation DNS racine pour créer un expéditeur.
4. **Personnalisation ultérieure.** Un sous-domaine dédié peut personnaliser les domaines techniques et liens d’emails ; il est distinct de l’adresse support et de la réception. S’il est délégué à Brevo, ne déléguer que le sous-domaine prévu, en suivant ses valeurs exactes. Cette amélioration professionnelle était souhaitée pour plus tard. [Configuration de domaine Brevo](https://help.brevo.com/hc/en-us/articles/35337929909778-Set-up-your-domain-in-Brevo), [délivrabilité et sous-domaine](https://help.brevo.com/hc/en-us/articles/35852083084178-Domain-setup-for-better-email-deliverability).

Aucune création de service, modification DNS ou émission d’email n’a été effectuée pour rédiger ce dossier. Les clés SMTP et comptes de service restent dans les secrets autorisés, jamais dans ces documents.

## Actions externes à regrouper avant lancement

- Fournir en une fois identité juridique, coordonnées applicables, responsable de publication et décisions sur public cible/territoires.
- Rendre le support opérationnel ; approuver règles et politique renseignées, puis vérifier leurs URL publiques et celle de suppression.
- Compléter les comptes développeur avec les informations réelles, 2FA, accès de revue et déclarations du binaire final ; exécuter le test Play requis si le compte y est soumis.
- Confirmer les contrats de traitement, durées, sauvegarde hors serveur et restauration ; documenter les preuves de recette.
- Vérifier les droits des ressources visuelles et la licence fournisseur pour le périmètre commercial retenu.

Ces prérequis externes n’empêchent pas de terminer et tester le code. Ils empêchent de déclarer une ouverture publique entièrement prête tant que leur preuve manque.
