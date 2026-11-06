# Recette V1 — 6 novembre 2026

## Vérifications effectuées

- `npm run check` : 77 tests backend, 25 tests Angular et compilation de production réussis. Avertissement connu : feuille CSS Bureau d’agence de 13,22 ko pour un seuil d’avertissement de 12 ko ; le seuil bloquant est de 20 ko.
- Android : `testDebugUnitTest lintDebug assembleDebug` réussis, 22 tests. Ils couvrent notamment contrat backend, cookies/CSRF, origine, refus de redirection/retry, reprise du pari, brouillon isolé et opérations de profil. Lint réussi ; un avertissement de dépréciation de l’icône retour ne bloque pas.
- Swift : trois tests du cœur passés et build non signé iPhone Simulator réussis dans le workflow `42197397830`. Les derniers ajustements d’isolation de session doivent aussi passer sur le commit final.
- Sauvegarde : copie cohérente, chiffrement, restauration indépendante, mauvais secret, fichier altéré et refus d’écrasement testés. Upload testé avec transport simulé ; aucun stockage distant réel configuré.
- Résultats : import manuel, contrôle des identités, rollback de tout le lot, reprise du reçu et versement unique testés.
- Push : opt-in, stockage chiffré des jetons, suppression à la déconnexion, file transactionnelle, contenu générique, OAuth/FCM avec transport simulé, absence de reprise automatique et de requête sportive testés.
- Charge locale : `load-result.json`, 1 000 comptes, 6 000 requêtes, 25 workers ; 1 000 réponses 409 attendues pour les doubles bonus. Soldes et clés étrangères cohérents, aucune requête sportive. Ce résultat n’est pas un test de capacité du plan Render.

## Recette visuelle web réalisée

Serveur dédié `localhost:3102`, base jetable et compte synthétique, sans secret sportif. Connexion, catalogue, marque, couleurs claires et sombres et tableau d’exploitation observés dans le navigateur. Une incompatibilité CSP a été corrigée : désactivation de l’inlining des styles critiques, qui créait un gestionnaire de chargement inline bloqué par notre CSP. La feuille complète est maintenant chargée sans affaiblir `script-src`. Après correction, les thèmes et le logo sont visibles et la console consultée ne contient pas d’erreur.

## Appareils et production : non constatés pour cette version

Avant d’appeler la bêta entièrement recettée sur appareil :

1. Mettre à jour le backend Render puis installer la dernière version distribuée dans Firebase ; vérifier son numéro.
2. Inscription/confirmation email/connexion et déconnexion ; passer ensuite sur un autre compte et vérifier qu’aucune donnée du premier ne reste affichée.
3. Bonus : 500 Verse une seule fois, compte à rebours de 24 h maximum après récupération.
4. Coupon simple et combiné : retoucher/désélectionner/retirer, gros texte, rotation, relance et restauration du brouillon.
5. Couper le réseau au moment de confirmer : reconnecter puis reprendre le même ticket ; vérifier une seule mise débitée et un seul ticket.
6. Agence à deux comptes : création, invitation/refus/acceptation, changement de rôle, transfert, pronostic, personnalisation, départ et suppression avec confirmations.
7. Clôture et annulation administrative : tickets simples/combinés, remboursement/neutralisation, bonus de mission une seule fois.
8. Export dans un emplacement valide et refusé ; suppression du compte, révocation des autres sessions et disparition du classement.
9. Clair/sombre, TalkBack, cibles tactiles et plus grande taille de police sur téléphone réel.
10. Seulement après configuration FCM : demande d’autorisation, refus, consentement, réception au premier plan/arrière-plan, déconnexion puis absence d’alerte liée à l’ancien compte.
11. iPhone signé : installation, Keychain réel, retour de liens de récupération, partage d’export et mêmes invariants de compte/coupon. Le build simulateur ne prouve pas ces points.

La dernière version n’a pas été installée physiquement sur Android ou iPhone par l’agent. Aucun résultat de cette liste n’est marqué acquis sur la seule base d’une compilation.
