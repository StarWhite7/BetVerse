# BetVerse — directions visuelles mobile

**Direction choisie le 5 novembre 2026 : 02 — Club, avec mode sombre.** Voir ../CLUB_DECISION.md et ../club-theme-tokens.json. Variante sombre : 02-club-dark.png, générée avec image_gen à partir de 02-club.png. Prompt complet : 02-club-dark-prompt.txt. La recommandation initiale Tribune ci-dessous reste un historique de l'exploration, pas la direction retenue.

Date : 5 novembre 2026.

Décision produit : conserver le web Angular, développer Android en Kotlin/Jetpack Compose puis iOS en Swift/SwiftUI. Ces propositions n'effectuent aucune migration et ne modifient pas l'application.

Trois planches générées avec l'outil intégré image_gen, chacune montrant le catalogue des matchs et une confirmation de pari simple en Verse. Les rencontres, soldes et cotes sont des données de démonstration, sans import ni appel à API-Football.

| Direction              | Intention                                             | Palette de travail                                                  |
| ---------------------- | ----------------------------------------------------- | ------------------------------------------------------------------- |
| 01 — Tribune           | Sportive, dense et lisible ; recommandation de départ | Graphite #151719, surfaces #222528, craie #F4F4EE, citron #D7F75B   |
| 02 — Club              | Claire, accessible, collective                        | Ivoire #F5F3ED, encre #142234, cobalt #2458E8                       |
| 03 — Signature         | Sombre, chaude, compacte                              | Noir brun #1B1918, surfaces #292624, ivoire #F4EFE9, corail #F77754 |
| 04 — BetVerse originel | Palette actuelle avec hiérarchie simplifiée           | Nuit #050914, violet #7C3AED, rose #EC4899 / #F472B6, cyan #22D3EE  |

Quatrième proposition ajoutée à la demande de l'utilisateur pour conserver ses couleurs : 04-betverse-originel.png. Edition de la planche Tribune avec l'outil intégré image_gen ; prompt complet dans 04-prompt.txt. La génération conserve des nuances de surface : lors d'une éventuelle implémentation, définir des aplats déterministes et tester les contrastes.

## Avis sur l'existant

La combinaison des halos, dégradés violet/rose, polices futuristes et grandes cartes renforce un aspect générique. Priorité proposée : hiérarchie typographique, contenu sportif, densité raisonnable, une couleur d'action, navigation mobile stable et réduction des effets décoratifs.

## Principes à retenir

- Equipes, horaire, compétition et cotes immédiatement compréhensibles.
- Cotes sélectionnées identifiées par couleur et état explicite ; vérifier aussi les contrastes et lecteurs d'écran.
- Monnaie virtuelle explicite. Aucun dépôt, retrait, paiement ou gain en argent présenté.
- Confirmation présentant la sélection, la cote, la mise et le retour potentiel mise incluse.
- Navigation commune aux produits, avec adaptations aux conventions Android, iOS et web.
- Budget API-Football : cette exploration ne nécessite aucun appel fournisseur.

## Limites et étapes suivantes

Maquettes raster exploratoires. Les textes, couleurs et symboles générés ne constituent pas encore des composants ou un logo définitifs. Certains symboles de compétition devront être remplacés par des icônes neutres ou des éléments autorisés. Affiner la direction choisie, produire le système de composants natif et ses états (chargement, erreur, vide, sélection, match fermé), vérifier les contrastes, les zones tactiles (minimum 48 dp sur Android), clavier, grandes polices et petits écrans. Ne pas considérer les dimensions visuelles de ces planches comme des spécifications de développement.

Les deux premières pistes présentent les cotes sous les équipes ; la troisième les aligne à droite pour explorer une densité différente. Le logo, les arrondis et la typographie peuvent encore évoluer indépendamment de la palette.

## Références

Sources publiques consultées pour étudier la clarté des parcours et du catalogue, sans reprendre les marques ni les compositions exactes :

- Betclic, fiche officielle App Store : https://apps.apple.com/fr/app/betclic-paris-sportifs-poker/id441081528
- Winamax, fiche officielle App Store : https://apps.apple.com/fr/app/winamax-paris-sportifs-poker/id385720307
- Présentation du redesign par Betclic Group : https://dribbble.com/shots/20468759-Discover-our-revamped-sports-betting-app
- Illustration du cashout Winamax : https://www.winamax.fr/cashout?LICENSE=FR

Prompts complets dans prompts.json. Images : 01-tribune.png, 02-club.png et 03-signature.png. Aucun commit ou déploiement déclenché pour cette exploration.
