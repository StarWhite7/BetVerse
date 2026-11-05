# Direction retenue : Club

Choix explicite de l'utilisateur le 5 novembre 2026 : proposition 02 — Club, avec un mode sombre complémentaire. Les autres pistes sont des archives d'exploration.

## Références

- Clair : 2026-11-mobile-directions/02-club.png
- Sombre : 2026-11-mobile-directions/02-club-dark.png
- Couleurs par rôle : club-theme-tokens.json
- Prompt de la variante sombre : 2026-11-mobile-directions/02-club-dark-prompt.txt

## Identité

Fond clair ivoire, bleu cobalt, encre foncée, typographie lisible et compacte, séparateurs discrets. Pour le sombre : bleu nuit et surfaces ardoise ; même hiérarchie et mêmes repères. Les textes actifs utilisent une teinte bleue plus claire sur fond sombre. Pas de halos, effets néon, dégradés décoratifs ou fonds transparents comme fondation du système.

Le monogramme et le mot-symbole sont des pistes de logo à finaliser en vectoriel. Les symboles de compétition seront neutres ou autorisés. Les rencontres et montants des maquettes sont fictifs, uniquement pour le design.

## Application aux plateformes

- Android : Kotlin et Jetpack Compose, priorité de réalisation.
- Web : conserver Angular et décliner Club avec une composition adaptée aux grands écrans.
- iPhone : future application Swift et SwiftUI, mêmes règles produit et identité, conventions de navigation iOS.
- Backend commun maintenu ; les règles de paris et soldes restent côté serveur.

## Comportement prévu des thèmes

Prévoir trois choix : Système, Clair, Sombre. Par défaut, suivre le système et mémoriser une préférence explicite. Adapter aussi les barres système, champs, clavier quand la plateforme le permet, feuilles de confirmation, erreurs, états désactivés et chargements. La couleur seule ne suffit pas à signaler une sélection ou une erreur.

## Validation avant livraison

Vérifier les contrastes sur les composants réellement développés, les grandes tailles de texte, TalkBack, les petits écrans, le clavier et les zones tactiles Android d'au moins 48 dp. Conserver les mentions de monnaie virtuelle et afficher le retour potentiel avec mise incluse. Les cotes de démonstration ne doivent jamais être importées en production par le travail de design.

Etat : décision et maquettes enregistrées. Aucun thème n'est encore intégré à l'application ; aucune migration, publication ou requête API-Football déclenchée par ce travail.
