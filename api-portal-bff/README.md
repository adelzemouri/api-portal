# api-portal-bff

BFF du portail développeurs multi-environnements WSO2 APIM 4.x (DEV, SIM, UAT, EXP).
Lecture seule par construction.

## Prérequis par control plane (à faire une fois, pour chacun des 4)

1. Créer un compte de service dédié (ex. `svc_apiportal_ro`) et un rôle dédié.
2. Associer à ce rôle uniquement les scopes listés dans `application.yml`
   (Admin Portal > Settings > Scope Assignments).
3. Enregistrer le client OAuth par DCR, puis stocker `clientId` / `clientSecret` dans le coffre :

```bash
curl --cacert group-ca.pem -u svc_apiportal_ro \
  -H "Content-Type: application/json" \
  -X POST https://<apim-host>:9443/client-registration/v0.17/register \
  -d '{"clientName":"api-portal-bff","owner":"svc_apiportal_ro","grantType":"password refresh_token","saasApp":true}'
```

L'application n'a jamais besoin de droits d'enregistrement au runtime.

## Variables d'environnement

Liste complète, avec les variables facultatives (adresses affichées aux développeurs, Splunk) : voir
**`.env.example`** à la racine du module. Rien n'y est codé en dur : chaque variable listée là est lue par
la configuration Spring (`${VAR}` pour les blocs obligatoires ci-dessous ; résolution relâchée standard de
Spring Boot pour les blocs facultatifs, qui ne figurent dans aucun fichier YAML du dépôt — vérifié par
`EnvironmentVariableBindingTest`). `.env.example` n'est pas chargé automatiquement par l'application ; c'est
un aide-mémoire à servir à ce qui injecte réellement les variables (gabarit Vault Agent, `--env-file`
docker, variables CI masquées…).

| Variable | Description |
|---|---|
| `GROUP_CA_PEM_PATH` | Chemin du PEM de la CA groupe |
| `WSO2_<ENV>_URL` | URL du control plane, ex. `https://apim-dev.internal:9443` |
| `WSO2_<ENV>_CLIENT_ID` / `WSO2_<ENV>_CLIENT_SECRET` | Client OAuth issu du DCR |
| `WSO2_<ENV>_USERNAME` / `WSO2_<ENV>_PASSWORD` | Compte de service lecture seule |

`<ENV>` ∈ `DEV`, `SIM`, `UAT`, `EXP`. Les secrets sont injectés depuis le coffre, jamais commités.

## Démo sur données factices (profil `mock`)

Sans aucun WSO2, sans variable d'environnement ni PEM :

```bash
export JAVA_HOME=<JDK 21>
mvn spring-boot:run -Dspring-boot.run.profiles=mock
# simuler la panne d'un environnement :
mvn spring-boot:run -Dspring-boot.run.profiles=mock -Dspring-boot.run.arguments=--portal.mock.failing-environments=uat
```

Puis le front : voir `../portal-frontend/README.md`. Le BFF écoute uniquement sur `127.0.0.1:8080` en profil `mock`.

Pour passer aux vrais WSO2 : retirer le profil `mock` et définir les variables ci-dessus. La même API REST est servie ;
seule la source de données change (`CatalogSource`).

> **L'API REST n'a aucune authentification tant que le SSO/RBAC (étape 5) n'est pas en place. Ne pas la déployer
> ni l'exposer hors de la machine locale.**

## API du BFF (`/api/v1`)

| Endpoint | Rôle |
|---|---|
| `GET /environments/{env}/metrics?window=24h\|7d` | Trafic : totaux (appels, erreurs 4xx/5xx, latence moyenne et p95), courbe, classements (plus appelées, taux d'erreur, plus lentes, applications), activité face au catalogue |
| `GET /environments/{env}/metrics/apis` `…/metrics/applications` | Trafic de chaque API / application sur la période, avec l'identifiant du catalogue (colonnes des listes) |
| `GET /environments/{env}/apis/{apiId}/metrics` | Trafic d'une API : totaux, courbe, applications consommatrices |
| `GET /environments/{env}/applications/{applicationId}/metrics` | Trafic d'une application : appels par API |
| `GET /portal` | Informations communes : adresse du composant GitLab de déploiement (si configurée) |
| `GET /environments` | Environnements dans l'ordre d'affichage : statut de synchro, gateways déployées (avec adresse de base), liens Publisher/Devportal et Identity Server (si configurés) |
| `GET /environments/{env}/overview` | Répartitions (statuts d'API et de souscription, politiques) et API les plus consommées |
| `GET /environments/{env}/search?q=` | Recherche globale : quelques API et applications (vide sans requête) |
| `GET /environments/{env}/apis` | APIs d'un environnement (nom, version, contexte, statut, nombre de souscriptions) |
| `GET /environments/{env}/apis/{apiId}` | Détail d'une API : révision déployée, URL complète par gateway, versions présentes dans chaque environnement (avec dernière révision déployée et sa date) |
| `GET /deployments?limit=20` | Derniers déploiements, tous environnements, du plus récent au plus ancien (`limit` de 1 à 100) |
| `GET /environments/{env}/apis/{apiId}/subscriptions` | Applications souscrites à une API (avec propriétaire de l'application) |
| `GET /environments/{env}/applications` | Applications d'un environnement (propriétaire, nombre d'API souscrites) |
| `GET /environments/{env}/applications/{applicationId}/subscriptions` | API auxquelles une application est souscrite |

Adresses affichées aux développeurs (toutes facultatives, **https obligatoire**, démarrage refusé sinon) :

```yaml
portal:
  links:
    deploy-component-url: https://gitlab.example/platform/ci-components/swagger-deploy
    environments:
      dev:
        publisher-url: https://apim-dev.example/publisher    # « Ouvrir dans le Publisher »
        devportal-url: https://apim-dev.example/devportal    # « Ouvrir dans le Devportal »
        identity-server-url: https://is-dev.example          # affichée dans Overview et Help
        gateway-https-port: 8243                             # port des gateways, absent = 443
```

WSO2 ne renvoie que l'hôte virtuel d'une gateway (jamais son port) : l'URL complète d'une API est
`https://hôte[:gateway-https-port]/contexte`, d'où ce paramètre.

## Métriques de trafic (Splunk)

Facultatives. Les événements d'analytique des gateways WSO2 sont lus dans **Splunk** par le BFF (jamais par le
navigateur), périodiquement (`portal.metrics.interval`, 30 minutes par défaut) et gardés en mémoire avec un statut par
environnement : une panne de Splunk ne touche ni le catalogue, ni le health, ni le démarrage, et les derniers chiffres
valides restent affichés avec un bandeau. Sans `portal.metrics.splunk.base-url`, le portail n'affiche simplement pas de trafic.

```yaml
portal:
  metrics:
    interval: PT30M
    splunk:
      base-url: https://splunk.example:8089      # https obligatoire
      token: ${SPLUNK_TOKEN}                      # jeton d'un compte en lecture seule : variable d'environnement, jamais dans un fichier
      ssl-bundle: group-ca
      environments:                               # clé = clé d'environnement du portail
        dev: { index: wso2_apim_dev }
        exp: { index: wso2_apim_prod, filter: 'sourcetype="wso2:apim:analytics"' }
      fields:                                     # facultatif : noms des champs si différents de WSO2 4.x
        api-name: apiName
        api-version: apiVersion
        application-name: applicationName
        status: proxyResponseCode
        latency: responseLatency
        # api-id: apiId                           # facultatifs : sans eux, rapprochement par nom
        # application-id: applicationId
```

- Le BFF envoie 5 recherches par période et par environnement (totaux, par API, par application, API × application,
  courbe par API) sur `POST /services/search/v2/jobs/export`, avec un jeton Bearer. Le rôle Splunk n'a besoin que du
  droit de recherche sur les index d'analytique.
- Rien de ce qui entre dans une requête SPL ne vient du navigateur : index, champs et filtre viennent de cette
  configuration, validés au démarrage (identifiants seuls ; le filtre refuse `|`, `[`, `]`, `;` et l'antiquote).
- Ne renseigner `api-id` / `application-id` que si ces champs existent dans **tous** les événements : Splunk écarte d'une
  agrégation les lignes où un champ de regroupement manque.
- Profil `mock` : métriques factices, déterministes et cohérentes avec le catalogue factice (les totaux sont les sommes
  des lignes) ; `--portal.mock.failing-environments=uat` simule aussi une panne de Splunk.

Le BFF ne lit que son store synchronisé : une requête du navigateur ne déclenche jamais d'appel WSO2.
Un environnement en erreur est une donnée (`sync.state = ERROR`) et ne change jamais le health du portail.

## Tests

`mvn verify`. Aucun test n'a besoin d'un WSO2 ni de variables d'environnement.
