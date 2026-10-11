# CLAUDE.md — Portail développeurs WSO2 APIM (BFF)

## Contexte

Portail web interne, dans une banque, destiné aux développeurs. Il donne une vue transverse, en
**lecture seule**, des 4 environnements WSO2 API Manager 4.x : DEV, SIM, UAT, EXP (EXP = production).
Il affiche les API (avec la révision déployée par gateway), toutes les applications et toutes les
souscriptions. La valeur ajoutée par rapport au Devportal WSO2 natif est la vue croisée entre
environnements (ex. « API X : v1.3 en SIM et UAT, v1.2 en EXP »).

Le portail est en lecture seule : il ne crée ni ne modifie rien dans WSO2. Les déploiements d'API
restent faits par le composant GitLab CI `swagger-deploy` (apictl), qui est un projet distinct.

## Architecture actée

**Topologie WSO2** : 4 control planes distincts, un par environnement → 4 jeux de credentials indépendants.

**Réseau** : le portail est déployé dans le VLAN PROD et a accès à la non-prod. Modèle **pull** :
le BFF interroge les control planes. Le reverse proxy / WAF est le seul point d'entrée des développeurs.

**Deux circuits indépendants** :

1. *Consultation* : développeur → reverse proxy → BFF. Le BFF authentifie via l'IdP d'entreprise
   (OIDC), applique le RBAC selon les groupes AD, lit **uniquement** dans sa propre base, et trace
   chaque consultation vers le SIEM. Aucune action utilisateur ne déclenche d'appel vers WSO2.
2. *Synchronisation* : job planifié dans le BFF → les 4 control planes, via un compte de service en
   lecture seule par environnement (secrets issus du coffre). Chaque environnement est synchronisé
   isolément : l'échec de l'un n'affecte pas les autres, et l'UI affiche un statut « dernière synchro »
   par environnement.

**Stack** : Java 21 / Spring Boot pour le BFF (ce dépôt), Angular pour le front. Le BFF sert aussi
les fichiers statiques Angular : un seul livrable, une seule origine, donc pas de CORS ni de jeton
côté navigateur. Persistance pressentie : PostgreSQL (à confirmer). Hébergement : Virtuozzo.

**Jamais de lecture directe de la base WSO2** : son schéma n'est pas un contrat.

## APIs WSO2 utilisées

- Publisher REST API v4 (`/api/am/publisher/v4`) : `GET /apis`, `GET /apis/{id}/revisions?query=deployed:true`,
  `GET /subscriptions?apiId=` (les souscriptions sont exposées par API → N appels par environnement).
- Admin REST API v4 (`/api/am/admin/v4`) : `GET /applications` (seule API listant les applications de tous les propriétaires).
- Authentification : client OAuth enregistré une fois par DCR (hors application), puis grant `password`
  avec un compte de service lecture seule par environnement.
- WSO2 retire **silencieusement** les scopes non autorisés du token : le provider vérifie les scopes
  accordés et échoue explicitement.

## Nommage et affichage des API

Les API sont nommées en kebab-case (convention imposée par `swagger-deploy`). Le champ `name` est
l'identifiant technique : il ne doit jamais être modifié (renommer = nouvelle API côté WSO2, et perte
des souscriptions). Le libellé lisible vient d'un champ séparé :

- si la version de WSO2 expose `displayName` sur l'API, c'est ce champ qui est utilisé ;
- sinon, une propriété personnalisée `display-name` dans `additionalProperties`. Attention :
  `additionalProperties` est renvoyé vide dans le listing de la Publisher API en 4.x, il faut alors
  un `GET /apis/{id}` par API lors de la synchro.

Règle d'affichage : le libellé s'il existe, sinon le `name`. Le `name` reste visible en second plan,
car c'est ce que les développeurs utilisent dans leurs échanges avec l'équipe plateforme.

## Contraintes de sécurité — non négociables

- Lecture seule par construction : aucune méthode d'écriture vers WSO2.
- **DTO en liste blanche** (`Wso2Models`) : ne jamais ajouter de champ de clés, secrets ou attributs
  d'application. Ne pas remplacer par des `Map`/`JsonNode` génériques.
- Aucun secret dans le code, les fichiers de config, les logs ou les messages d'erreur. Secrets injectés
  par variables d'environnement depuis le coffre. Tout objet portant un secret masque son `toString()`.
- HTTPS obligatoire, confiance via le SSL bundle `group-ca`. Ne jamais désactiver la vérification TLS,
  y compris dans les tests.
- Redirections HTTP non suivies.
- L'indisponibilité d'un environnement (surtout non-prod) ne doit **ni** empêcher le démarrage, **ni**
  faire passer le health/readiness du portail en DOWN. L'état de chaque environnement est une donnée
  métier affichée dans l'UI.
- Actuator : seuls `health` et `info` sont exposés.
- Journal d'audit des consultations (qui a vu quoi, quand) vers le SIEM.
- Données personnelles (propriétaires d'applications, subscribers) : minimiser et filtrer par RBAC.
  La cartographie « qui consomme quoi » en EXP est sensible.
- Tout ajout de dépendance doit être justifié (validation sécurité en contexte bancaire).

## État actuel

Couche client WSO2 écrite mais **jamais compilée** (package `com.example.apiportal.wso2`) :
`Wso2Properties`, `Wso2TokenProvider`, `Wso2Client`, `Wso2ClientRegistry`, `Wso2Models`, `Wso2ClientException`.
Configuration dans `src/main/resources/application.yml`. Prérequis DCR et variables d'environnement dans `README.md`.
Rien d'autre n'existe : ni synchro, ni persistance, ni API REST du BFF, ni front.

## Conventions

- Java 21, Spring Boot (version à aligner sur le socle validé ; éviter les API qui changent en Boot 4).
- Client HTTP : `RestClient` + `JdkClientHttpRequestFactory`.
- Code et identifiants en anglais, commentaires en français, concis (le « pourquoi », pas le « quoi »).
- Tests : JUnit 5, `MockRestServiceServer` ou WireMock pour les appels WSO2, horloge injectée (`Clock`)
  pour tout ce qui dépend du temps. Tout nouveau comportement est accompagné de tests.
- Commits au format **Conventional Commits** (`feat(wso2): …`, `fix(sync): …`, `test(…)`, `docs(…)`).
  Proposer le message de commit comme étape finale distincte de chaque tâche.

## Commandes

```bash
mvn verify          # build + tests
mvn spring-boot:run # lancement local (nécessite les variables d'environnement du README)
```

## Questions ouvertes — ne pas trancher sans demander

1. Virtuozzo : VM (Hybrid Infrastructure) ou plateforme applicative avec conteneurs ? → impacte le packaging.
2. Stockage de la synchro : PostgreSQL disponible ? (ne pas choisir de base à la place de l'équipe).
3. IdP d'entreprise pour le SSO (Entra ID, ADFS, Keycloak) et groupes AD pour le RBAC.
4. Version mineure exacte de WSO2 4.x par environnement → scopes exacts de l'Admin API et présence de
   `displayName`. `apim:admin_application_view` est à valider ; si seul `apim:admin` fonctionne, c'est
   un sujet sécurité à remonter, pas à contourner.
5. Organisation du front : module du même dépôt ou dépôt séparé.

## Feuille de route

1. Faire compiler le projet, `mvn verify` vert.
2. Tests unitaires du client WSO2 (cache et renouvellement du token, contrôle des scopes, retry unique
   sur 401, 403, pagination, HTTPS obligatoire, masquage des secrets).
3. Modèle de données et persistance du portail, puis service de synchronisation par environnement
   (isolé, planifié, avec statut et horodatage par environnement).
4. API REST du BFF pour le front : matrice API × environnement, applications, souscriptions.
5. SSO OIDC + RBAC par groupe AD, journal d'audit vers le SIEM.
6. Front Angular.
7. Packaging et déploiement Virtuozzo, pipeline GitLab CI (SAST, analyse des dépendances, SBOM).
