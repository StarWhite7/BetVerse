# Livraison autonome V1 — 6 novembre 2026

Cette feuille suit les onze chantiers demandés. Un composant compilé, une fonctionnalité testée et un service activé en production sont des validations distinctes. Aucun appel sportif automatique, achat, publication store ou changement de DNS n’est autorisé implicitement par un test.

| Chantier | Critères de livraison | État de la livraison |
| --- | --- | --- |
| 1. Recette | Parcours end-to-end, reprise réseau, appareil réel et rapport | 77 tests backend + 25 Angular + 22 Android locaux ; cœur Swift et build simulateur en CI. Recette téléphone de cette version encore nécessaire. Rapport `docs/qa/RECIPE.md`. |
| 2. Agences Android | Recherche, création, invitations, membres/rôles, personnalisation, missions et pronostics sans navigateur | Parcours natifs livrés, mutations existantes protégées par le serveur. |
| 3. Profil/classements | Édition du compte, statistiques, profils publics et classements natifs | Parcours natifs livrés, changement de mot de passe et export/suppression compris. |
| 4. Coupon/historique | Retrait dans le coupon, brouillon chiffré, détail ticket et cotes modifiées | Retrait de chaque sélection, brouillon isolé compte/origine, reprise idempotente et contrôle des cotes côté serveur livrés. |
| 5. Résultats | File administrative des matchs à régler, aperçu manuel, validation et reports encadrés | Tableau `/admin/operations`, import manuel de scores vérifiés sans fournisseur, aperçu et validation atomique avec reçu réutilisable. Annulation motivée et verrouillage des dates engagées conservés. |
| 6. Notifications | Centre natif, préférences, push opt-in et état de configuration explicite | Centre/préférences livrés ; FCM Android et file après transaction intégrés/testés avec transport simulé. Compte de service Render et réception réelle non configurés/validés. |
| 7. Exploitation | Modération, audit, protection admin, sauvegarde chiffrée/restauration, supervision et test de charge | Suspension, journal, TOTP+secours, sauvegarde AES-GCM/PUT/restauration et métriques livrés. Ajout du journal chiffré des suppressions, de sa réconciliation lors d’une restauration et du mode maintenance. La commande de sauvegarde de production refuse une copie en clair. Charge locale 1 000 comptes/6 000 requêtes validée. Activation MFA, stockage distant réel et alerte externe restent à organiser. |
| 8. Identité/qualité | Logo vectoriel, thèmes, accessibilité, états réseau et registre clubs | Logo original et icône, thèmes Angular/Android, contrastes des tokens contrôlés. Recette web claire/sombre faite sous CSP réelle ; correction du chargement des styles. Vérification gros texte/appareils encore à effectuer. |
| 9. Publication | Suppression/export de compte, documents vérifiables, dossier Play et recette de publication | Parcours livrés et dossier préparé. Studio non immatriculé, tests uniquement ; pages marquées provisoires. Redirection support et soumission publique non réalisées. |
| 10. Web/iOS | Club Angular, contrats communs et véritable client SwiftUI compilable en CI | Angular Club et client SwiftUI livrés : comptes, matchs, coupon/combiné, historique, agences, profils, classements et notifications internes. Build iPhone Simulator vérifié en CI ; pas de signature ni recette iPhone, pas de push iOS. |
| 11. Économie | Simulation reproductible, règles publiées et décision de monétisation documentée | Simulation de trente jours/1 000 comptes et décisions documentées. Jeu gratuit conservé, aucun revenu fictif ni achats/publicités activés. |

## Informations et accès externes

- Le propriétaire confirme : StarWhite Interactive est un nom de studio sans formalités juridiques, en France ; projet de test uniquement. Support souhaité : `support@betverse.fr` redirigé vers `starwhiteinteractive@gmail.com`.
- La tentative d’accès au gestionnaire Infomaniak a été arrêtée par le contrôle navigateur, qui ne pouvait identifier la page active ; aucune redirection créée. Aucun achat ou changement de DNS effectué.
- Configuration de domaines/Brevo, push, sauvegarde hors serveur et comptes développeur à constater via accès autorisés. Une intégration désactivée ne sera pas présentée comme un service actif.
- Aucun Mac local : l’exécution iOS dépendra de la disponibilité d’un runner macOS/Xcode ; la validation sur iPhone reste une recette distincte.
- Aucune publicité, vente de monnaie virtuelle, abonnement ou récompense monétaire ne sera activée sans décision explicite.

## Limite de la livraison

Les onze chantiers ont reçu une implémentation ou un dossier concret, mais ils ne sont pas tous « activés en production ». Le propriétaire a déployé la version finale sur Render : santé, nouvelles métadonnées et pages publiques vérifiées à distance. La redirection email, les identifiants FCM, l’activation MFA, le stockage distant et les recettes physiques nécessitent encore accès/configuration ou intervention externe. Le dossier `OPERATIONS_V1.md` fournit les procédures. Cette distinction interdit d’annoncer une V1 publique certifiée, un support qui reçoit déjà les emails ou un push reçu sur téléphone.

## Reprise suivante — 6 novembre 2026

La bêta 13 et ses vérifications ont terminé avec succès. Cette reprise complète le code de restauration et son administration ; son déploiement distant sera suivi séparément. Les connecteurs Render et Firebase ont été trouvés, mais leur installation/connexion n’est pas confirmée. Aucun navigateur externe authentifié ni téléphone appairé n’était disponible lors du contrôle. Le fichier local `scripts/copy-brevo-smtp-url.ps1` reste inchangé et hors commit.
