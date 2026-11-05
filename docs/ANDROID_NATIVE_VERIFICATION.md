# Vérification du premier lot Android Kotlin

5 novembre 2026.

## Résultats locaux

- Compilation APK debug réussie (JDK 21, SDK 36).
- Compilation et réduction R8 release réussies ; lint debug et release sans erreur bloquante.
- 17 tests natifs réussis : 4 règles de mise/calendrier, 7 tests HTTP/cookies/reprise, 1 parcours avec le vrai backend SQLite en mémoire et 5 tests Compose dont petit écran 320 dp avec police 150 %.
- Backend : 44 tests réussis. Angular : 21 tests réussis et compilation réussie. Deux avertissements de budget CSS d'agence préexistants subsistent.
- Captures des composants Compose clair/sombre générées avec Robolectric puis inspectées. Ce sont des rendus isolés avec trois rencontres de démonstration, pas des captures d'un téléphone connecté à la production. Voir design/native-validation/club-light.png et club-dark.png.
- SDK et sorties de compilation exclus de Git et du contexte Docker, comme .private. Le script SMTP local non suivi n'est pas inclus dans ce lot.
- Aucun appel API-Football. Les tests HTTP utilisent MockWebServer ou un serveur Node éphémère en mémoire, sans charger .env.

## Périmètre à confirmer sur appareil

Installation en mise à jour signée depuis Firebase, connexion au backend Render avec un compte existant, persistance réelle Android Keystore, clavier et barres système selon le téléphone, mode Système, et recette d'un pari futur puis de sa reprise après coupure.

Les écrans d'agence complets, notifications et certaines fonctions de profil restent dans le web pour ce premier lot natif. L'interface Angular n'a pas reçu la refonte Club.

Les rapports Gradle sont sous mobile/android/app/build/reports ; les résultats XML sous mobile/android/app/build/test-results. Les captures ne sont pas un test de conformité visuelle pixel à pixel avec les images générées.
