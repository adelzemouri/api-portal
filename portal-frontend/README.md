# portal-frontend

Front Angular 17 du portail développeurs WSO2 (démo). Il ne parle qu'au BFF (`/api/v1`) : jamais à WSO2, aucun token dans le navigateur.

## Lancer la démo

```bash
# 1. le BFF en profil mock (voir ../api-portal-bff/README.md)
cd ../api-portal-bff && mvn spring-boot:run -Dspring-boot.run.profiles=mock

# 2. le front, avec proxy /api -> http://127.0.0.1:8080 (proxy.conf.json)
cd ../portal-frontend && npm install && npm start      # http://localhost:4200
```

## Tests et build

```bash
npx ng test --watch=false --browsers=ChromeHeadless    # Google Chrome requis (CHROME_BIN si besoin)
npx ng build
```

## Interface (« API Portal », style Panorama)

- Rail à gauche (logo « accolades », navigation, état de synchro par environnement) et barre du haut avec **un seul
  sélecteur d'environnement**, gardé dans `localStorage` (`api-portal.environment`).
- Un clic sur une ligne ouvre le **volet de détail** (`detail-panel.service.ts`, `detail-panel.component.ts`) : non
  bloquant, la page se décale, la ligne reste en surbrillance (`is-sel`), un clic sur une autre ligne remplace le
  contenu, pile API ↔ application avec retour, Échap pour fermer. Changer d'environnement recherche le même élément
  par son nom.
- Parcours DEV → EXP (`env-path.component.ts`) : alimenté par la présence de l'API dans chaque environnement
  (révision et date de déploiement) ; les points des listes viennent de `cross-env.ts`, qui lit la liste des API de
  chaque environnement au BFF.
- Pas d'onglets quand tout tient sur une page (fiche d'API, volet).

## Langues

Interface en français et en anglais (bouton FR/EN de la barre du haut, choix gardé dans `localStorage`, sinon langue du
navigateur). Sans bibliothèque : `src/app/i18n.ts` (service, pipe `t`) et `src/app/i18n.fr.ts`. Le texte anglais sert
de clé ; un texte absent du dictionnaire s'affiche en anglais. Tout nouveau libellé passe par `| t` ou `i18n.t()` et
reçoit sa traduction dans `i18n.fr.ts`.

## Points d'attention

- **Angular 17** (dernière version compatible avec Node 18.17). Des avis de sécurité *high* existent pour cette branche
  (`npm audit`). Démo locale uniquement : migrer vers Node 20+/22 LTS et un Angular supporté avant tout déploiement.
- Dépendances volontairement minimales : paquets Angular de base, RxJS, zone.js. Pas de bibliothèque de composants ni de style.
