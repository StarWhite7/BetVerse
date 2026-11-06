# BetVerse Club — éléments vectoriels

Éléments originaux créés le 6 novembre 2026 pour BetVerse, édité par StarWhite Interactive (France). Ils traduisent la direction Club choisie par le propriétaire ; aucun logo d’opérateur de paris, de club ou de compétition n’a été repris.

## Fichiers

Dans `public/brand/` :

- `betverse-wordmark-light.svg` et `betverse-wordmark-dark.svg` : signature horizontale avec monogramme et huit lettres dessinées en tracés, sans dépendance à une police.
- `bv-mark-light.svg` et `bv-mark-dark.svg` : monogramme BV seul.
- `app-icon.svg` : planche de 1024 × 1024 avec fond cobalt ; le monogramme est contenu dans la zone centrale et ne touche pas le masque. Ce SVG source doit être exporté aux tailles et formats demandés par chaque plateforme. Pour une icône adaptive Android, utiliser le monogramme comme foreground et le cobalt comme background, en laissant Android appliquer son masque ; ne pas réutiliser un carré déjà arrondi comme masque adaptive.
- `favicon.svg` : variante compacte.
- `club-tokens.css` et `club-tokens.json` : mêmes rôles sémantiques pour clair/sombre ; le CSS ne modifie pas le layout.

La planche locale `preview.html` permet d’examiner les variantes ; `preview.png` est un rendu hors écran inspecté, produit par les primitives vectorielles Windows via `render-preview.ps1`. Les actifs SVG contiennent des titres/descriptions et un `viewBox`. Aucun script, ressource distante, filtre, animation ou bitmap intégré dans les SVG.

## Utilisation

1. Choisir la variante correspondant au fond. Éviter d’inverser ou recolorer les lettres indépendamment de la variante prévue.
2. Garder une marge libre d’au moins un quart de la hauteur du monogramme. Ne pas étirer le logo.
3. Taille conseillée : signature à partir de 180 px de large, monogramme seul quand l’espace est réduit. Tester le favicon à 16 et 32 px et utiliser le monogramme plutôt que le mot-symbole à ces tailles.
4. Pour une image décorative auprès d’un nom déjà annoncé, utiliser `alt=""`. Pour une navigation vers l’accueil, nommer le lien « BetVerse — accueil » une seule fois.
5. Les textes et contrôles utilisent les tokens de texte/interaction, pas une couleur prélevée au hasard dans un logo.

## Thèmes et accessibilité

Préférence `system`, `light` ou `dark`. Le CSS suit `prefers-color-scheme` par défaut ; `data-theme="light"` et `data-theme="dark"` sur la racine fixent une préférence. La persistance du choix appartient à l’application, pas à cet asset.

Texte clair : `#142234` sur `#F5F3ED`. Texte sombre : `#F3F6FC` sur `#101722`. CTA : texte blanc sur `#2458E8`. Sur sombre, les liens et textes actifs utilisent `#86AAFF`, distinct du fond cobalt des boutons. Les ratios exacts contrôlés sont dans `validation.json`. Les frontières ne sont pas à elles seules un indicateur de sélection ; conserver libellés, états accessibles et focus visible. Cible tactile de référence : 48 dp sur Android.

Ces contrôles de fichiers et de contraste ne remplacent pas la recette de l’intégration aux composants réels, la validation des masques iOS/Android ou une recherche de disponibilité de marque.

## Reproduction

`node docs/design/brand/generate-assets.mjs` réécrit uniquement les SVG et tokens dans `public/brand/`. Le générateur ne contacte aucun service et n’utilise aucune clé.
