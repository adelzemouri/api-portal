# api-portal

Portail développeurs interne : vue transverse, en lecture seule, des 4 environnements
WSO2 API Manager 4.x (DEV, SIM, UAT, EXP). Voir `CLAUDE.md` pour l'architecture et les règles.

## Prérequis WSO2 (une fois par environnement, hors application)

1. Créer un compte de service **lecture seule** dans chaque environnement.
2. Enregistrer un client OAuth par DCR (`POST /client-registration/v0.17/register`) avec
   `grantType: password`. Conserver `clientId` / `clientSecret` dans le coffre.
3. Vérifier que le compte obtient bien les scopes `apim:api_view`, `apim:subscription_view`
   et `apim:admin_application_view`. WSO2 retire silencieusement un scope non autorisé :
   le portail refuse alors le jeton avec un message explicite.

## Variables d'environnement

Injectées depuis le coffre, jamais dans un fichier du dépôt. `<ENV>` vaut `DEV`, `SIM`, `UAT`, `EXP`.

| Variable | Contenu |
|---|---|
| `WSO2_<ENV>_BASE_URL` | URL HTTPS du control plane, ex. `https://apim-dev.example.org:9443` |
| `WSO2_<ENV>_TOKEN_URL` | URL HTTPS du token endpoint, ex. `https://apim-dev.example.org:9443/oauth2/token` |
| `WSO2_<ENV>_CLIENT_ID` | client OAuth issu du DCR |
| `WSO2_<ENV>_CLIENT_SECRET` | secret du client OAuth |
| `WSO2_<ENV>_USERNAME` | compte de service lecture seule |
| `WSO2_<ENV>_PASSWORD` | mot de passe du compte de service |
| `GROUP_CA_PEM_PATH` | chemin du PEM de l'AC du groupe |

Une URL non HTTPS fait échouer le démarrage. Un environnement injoignable, lui, ne l'empêche pas.

## Commandes

```bash
mvn verify          # build + tests
mvn spring-boot:run # lancement local (nécessite les variables ci-dessus)
```
