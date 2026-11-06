# Support BetVerse : procédure prête, activation non réalisée

Objectif confirmé : recevoir les messages de `support@betverse.fr` dans `starwhiteinteractive@gmail.com`. La réception n’est pas fournie par Brevo et n’est pas active à la livraison. Le 6 novembre 2026, la requête DNS MX auprès de 1.1.1.1 n’a retourné aucun MX pour `betverse.fr` ; ne pas confondre cette vérification avec une configuration effectuée.

1. Dans le Manager Infomaniak, ouvrir **Service Mail**, puis le service lié à `betverse.fr`. Contrôler le quota et les éventuelles redirections existantes ; aucun abonnement supplémentaire n’a été autorisé ou acheté pour cette opération.
2. Utiliser le menu de création d’une **adresse de redirection**, source `support`, destination `starwhiteinteractive@gmail.com`. Si une vraie adresse `support` existe déjà, configurer son transfert plutôt que créer un doublon.
3. Accepter la demande de confirmation reçue dans Gmail. Une redirection en attente de confirmation ne fonctionne pas.
4. Si le Service Mail n’est pas connecté au domaine, reprendre les valeurs DNS exactes proposées dans son Manager pour la réception. Préserver les enregistrements web Render et les CNAME DKIM de Brevo. Ne pas ajouter un second SPF ou un second DMARC au même nom ; ne pas utiliser les anciens serveurs Vercel.
5. Envoyer depuis une autre adresse un message à `support@betverse.fr`, vérifier son arrivée dans Gmail, puis vérifier la manière de répondre. Le relais entrant seul ne configure pas l’envoi de réponses sous l’identité `support@betverse.fr`.
6. Après réception et réponse validées, configurer si nécessaire l’expéditeur d’assistance dans Brevo. Conserver l’expéditeur transactionnel existant tant que ce nouveau parcours n’est pas validé. Alors seulement marquer `SUPPORT_VERIFIED=1` dans Render.

Le nom de studio n’étant pas encore immatriculé, cette activation ne rend pas les mentions légales définitives : conserver `LEGAL_READY=0` pendant les tests.

Procédures primaires vérifiées : [adresses de redirection Infomaniak](https://www.infomaniak.com/fr/support/faq/2524/gerer-les-adresses-mail-de-redirection), [transfert d’une adresse existante](https://www.infomaniak.com/fr/support/faq/2614/rediriger-une-adresse-mail-existante-vers-une-ou-plusieurs-autres-adresses).
