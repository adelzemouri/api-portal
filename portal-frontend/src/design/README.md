# Design System — Graphite Premium

Refonte graphique du portail. Aucune logique métier, aucun composant Angular, aucune route et rien dans le BFF
n'est modifié : la refonte est une couche de présentation activée par un attribut sur `<html>`.

Le design retenu est « Graphite Premium » : mode nuit graphite et ambre, mode jour papier chaud et orange,
typographie Geist / Geist Mono, barre latérale à sections, léger relief (boutons, champs, élément actif) et
illustrations de fond sur certaines tuiles de l'accueil. Les trois autres directions étudiées et le sélecteur
de comparaison ont été retirés après ce choix ; ils restent dans l'historique Git.

## Architecture

```
design/
  design-fonts.css        polices auto-hébergées (OFL), aucune requête externe
  design-tokens.css       le contrat de tokens --ds-* et ses valeurs jour / nuit
  design-components.css   composants : ne lisent QUE des tokens
  design-layouts.css      navigation, grille, volet et retouches du design
  design-motion.css       animations (entrées, décalages, appui, popovers)
  design-motion.js        animations qui demandent du script (sorties, élément actif partagé, appui glissé,
                          pulsation de réussite, élastique aux limites) ; isolé, sans dépendance
  design-b-extras.js      retouches de structure (« next sync » recopié dans Environment health, état « copié »
                          des boutons, titres de page factuels, guide d'aide assagi) ; à reporter dans les templates Angular
  art/                    illustrations de fond des tuiles, une variante jour et une nuit
  tools/build-preview.py  injecte le tout dans un export statique, pour démonstration
  tools/build-art.py      régénère art/*.svg
  tools/verify-parity.js  rejoue le même parcours sur l'export d'origine et sur l'export avec le design
```

- **Activation** : `<html data-design="b">`. Sans cet attribut, l'interface d'origine est strictement
  inchangée (toutes les règles sont préfixées `:root[data-design]`).
- **Tokens** : couleurs, typographie, espacements (base 4 px), rayons, ombres, hauteurs de contrôle,
  densité des tableaux, largeur de navigation. Les anciennes variables (`--bg`, `--accent`…) sont
  branchées sur les tokens, donc tout écran futur hérite du design.
- **Mode nuit et FR/EN** existants : conservés.

## Intégration dans le front Angular

Dans `index.html`, écrire `<html data-design="b">`. Dans `angular.json`, cible `build` (et `test`) :

```json
"styles": ["src/styles.css", "src/design/design-fonts.css", "src/design/design-tokens.css",
           "src/design/design-components.css", "src/design/design-layouts.css", "src/design/design-motion.css"],
"scripts": ["src/design/design-motion.js", "src/design/design-b-extras.js"]
```

Les sélecteurs visent les classes de la version du front dont provient l'export statique
(`.shell`, `.sidebar`, `.topbar`, `.side-drawer`, `table.list`…).

## Animations

Règles appliquées : entrées en ease-out, menus en 200 ms, lignes décalées de 30 ms, appui à 0,97, popovers
depuis 0,95 et depuis leur déclencheur, sorties 20 % plus courtes et vers le déclencheur, aucun ressort sur les
transitions, volet plus lent (poids), jauges qui se remplissent, fondu flouté des icônes jour / nuit et du libellé
« Copy », pulsation à la réussite d'une copie, élastique en bout de défilement du volet et de la palette, pastille
de l'élément actif qui glisse (navigation, environnement) en ease-in-out, étirée de 12 % sur une légère courbe.

Tout est coupé par `prefers-reduced-motion`. `design-motion.js` n'intercepte aucun événement de l'application : il
observe le DOM et ajoute des éléments décoratifs. Appui maintenu et glissé sur la navigation et le sélecteur
d'environnement : la pastille suit le bouton survolé, la destination est décidée au relâchement (le script
déclenche alors le clic du bouton d'arrivée, donc le gestionnaire de l'application). À l'intégration définitive, préférer `animate.leave` pour les sorties
et `withViewTransitions()` sur le routeur, plus robustes que des copies.

## Vérification

`node tools/verify-parity.js <export.html> <export-avec-design.html>` : changement d'environnement, filtres, tri,
volet de détail et pile API ↔ application, recherche Ctrl+K, bascule de langue, aide, copie.
Résultat attendu : `IDENTIQUE à l'original`.

## Suite possible

Retirer le préfixe `:root[data-design="b"]` et fusionner la couche dans `styles.css`, puis reporter dans les
templates Angular ce que fait `design-b-extras.js`.
