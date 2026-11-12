# Design System — quatre directions graphiques

Refonte graphique du portail, livrée en quatre directions comparables **dans l'application réelle**.
Aucune logique métier, aucun composant Angular, aucune route et rien dans le BFF n'est modifié :
la refonte est une couche de présentation pilotée par un attribut sur `<html>`.

| | Direction | Typographie | Navigation | Densité |
|---|---|---|---|---|
| A | Executive Corporate | IBM Plex Sans / Plex Mono | barre latérale large, encre marine | élevée |
| B | Graphite Premium | Geist / Geist Mono | barre latérale à sections | moyenne |
| C | Minimalist Luxury | Newsreader (titres) + Albert Sans | colonne de texte, sans icône | aérée |
| D | Contemporary Enterprise | Archivo / JetBrains Mono | bandeau horizontal pétrole | moyenne-élevée |

B réunit deux anciennes directions : « Graphite » en donne la composition et le mode nuit, « Modern Premium SaaS »
la palette du mode jour. Elle porte aussi un léger relief (boutons, champs, élément actif) et des illustrations
de fond sur certaines tuiles de l'accueil.

## Architecture

```
design/
  design-fonts.css        polices auto-hébergées (OFL), aucune requête externe
  design-tokens.css       le contrat de tokens --ds-* et ses 4 jeux de valeurs (+ mode nuit)
  design-components.css   composants : ne lisent QUE des tokens, communs aux 4 designs
  design-layouts.css      variantes de navigation / grille / volet, une section par design
  art/                    illustrations de fond des tuiles (B), une variante jour et une nuit
  design-switcher.js      sélecteur temporaire (isolé, Shadow DOM, sans dépendance)
  tools/build-preview.py  injecte le tout dans un export statique, pour démonstration
  tools/build-art.py      régénère art/*.svg
  tools/verify-parity.js  rejoue le même parcours sur l'original et les 4 designs
```

- **Un seul code applicatif** : le design actif est `<html data-design="a|b|c|d">`. Sans cet attribut,
  l'interface d'origine est strictement inchangée (toutes les règles sont préfixées `:root[data-design]`).
- **Tokens** : couleurs, typographie, espacements (base 4 px), rayons, ombres, hauteurs de contrôle,
  densité des tableaux, largeur de navigation. Les anciennes variables (`--bg`, `--accent`…) sont
  branchées sur les tokens, donc tout écran futur hérite du design actif.
- **Mode nuit et FR/EN** existants : conservés, chaque design a sa palette nuit.

## Intégration dans le front Angular

Dans `angular.json`, cible `build` (et `test`) :

```json
"styles": ["src/styles.css", "src/design/design-fonts.css", "src/design/design-tokens.css",
           "src/design/design-components.css", "src/design/design-layouts.css"],
"scripts": ["src/design/design-switcher.js"]
```

Les sélecteurs visent les classes de la version du front dont provient l'export statique
(`.shell`, `.sidebar`, `.topbar`, `.side-drawer`, `table.list`…).

## Sélecteur et comparaison

- Pastille en bas à droite : nom du design actif, menu des quatre directions (+ interface d'origine).
- Raccourcis : `Alt+1` à `Alt+4`, `Alt+0` (origine), `Alt+H` (masquer / réafficher).
- Comparaison au choix : cocher les versions voulues (deux au minimum, origine comprise), puis « Comparer ».
  Les vignettes sont l'application réelle, navigables ; on ajoute ou retire une version depuis la barre du haut.
- Le choix est mémorisé (`localStorage`, clé `api-portal-design`) et suit la navigation.

## Vérification

`node tools/verify-parity.js <export-avec-design.html>` : changement d'environnement, filtres, tri,
volet de détail et pile API ↔ application, recherche Ctrl+K, bascule de langue, aide, copie.
Résultat attendu : `IDENTIQUE à l'original` pour A, B, C et D.

## Après le choix définitif

1. `index.html` : écrire `<html data-design="x">` en dur.
2. Supprimer `design-switcher.js` et son entrée `scripts` dans `angular.json`.
3. `design-tokens.css` : supprimer les blocs des trois autres directions.
4. `design-layouts.css` : supprimer les sections des trois autres directions.
5. `design-fonts.css` et `fonts/` : ne garder que les polices de la direction retenue ; supprimer `art/` si B n'est pas retenue.
6. Facultatif : retirer le préfixe `:root[data-design]` et fusionner dans `styles.css`.
