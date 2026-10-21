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
npx ng test --watch=false --browsers=ChromeHeadless    # Google Chrome requis
npx ng build
```

## Points d'attention

- **Angular 17** (dernière version compatible avec Node 18.17). Des avis de sécurité *high* existent pour cette branche
  (`npm audit`). Démo locale uniquement : migrer vers Node 20+/22 LTS et un Angular supporté avant tout déploiement.
- Dépendances volontairement minimales : paquets Angular de base, RxJS, zone.js. Pas de bibliothèque de composants ni de style.
