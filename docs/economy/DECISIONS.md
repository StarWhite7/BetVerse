# Économie de la bêta

Décision au 6 novembre 2026 : conserver un jeu gratuit de pronostics en monnaie virtuelle. Aucun dépôt, retrait, achat, publicité, affiliation bookmaker ou gain échangeable n’est activé.

## Règles existantes

Le serveur attribue 500 Verse au maximum une fois par période de 24 heures. Un nouveau compte dispose de 100 Shards. Créer une agence coûte 100 Shards, une fois la confirmation donnée. Les Verse et Shards ne représentent pas une somme d’argent. Aucune vente ni conversion n’existe.

Les paris simples et combinés utilisent les cotes enregistrées lors de leur confirmation. Un combiné comporte au plus dix rencontres différentes. Une sélection annulée est neutralisée à la cote 1 ; si toutes le sont, la mise est remboursée. Les soldes, limites, dates et règlements sont vérifiés par le backend. Une mission collective donne de l’expérience et un trophée une seule fois.

## Simulation reproductible

Exécuter `node scripts/simulate-economy.mjs`. Le résultat est dans `simulation.json`. La graine fixe rend les résultats reproductibles. Ce modèle illustre trois comportements de 1 000 joueurs pendant trente jours, avec une probabilité de victoire de 50 %, une cote de 1,90 et une mise de 100 V. Il ne prédit ni les matchs ni le comportement réel des joueurs.

| Scénario | Verse créés | Verse en circulation à J30 | Solde médian |
| --- | ---: | ---: | ---: |
| Modéré | 3 810 000 | 3 656 250 | 3 580 |
| Régulier | 8 995 000 | 8 536 170 | 8 550 |
| Assidu | 14 278 000 | 13 127 280 | 13 110 |

Le bonus entretient une émission importante de Verse. Ne pas présenter le classement historique de richesse comme une mesure pure de talent : l’ancienneté et l’assiduité comptent. Pendant la bêta, mesurer la rétention, les mises, les soldes médians et les combinaisons extrêmes avant toute modification des récompenses. Ne pas réinitialiser les comptes ni retirer de monnaie sans annonce et décision explicite.

## Dépenses et rentabilité

Le revenu activé est de **0 €**. Aucun nombre de joueurs ne couvre donc automatiquement les dépenses. La formule future sera `dépenses mensuelles / revenu mensuel net par joueur actif`, après commissions, fiscalité, consentements et conditions des stores. Un CPM publicitaire ou un taux de conversion ne doit pas être inventé.

Choix pour cette livraison : financer une bêta limitée, suivre les factures réelles de Render, du domaine et des données sportives ; conserver les imports manuels et leurs plafonds. Toute monétisation constituera une décision distincte, suivie d’une nouvelle analyse des règles des stores et de l’équilibre du jeu.
