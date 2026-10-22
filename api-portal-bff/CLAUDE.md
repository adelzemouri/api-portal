# CLAUDE.md — Portail développeurs WSO2 APIM (BFF)

## Contexte

Portail web interne, dans une banque, destiné aux développeurs. Il donne une vue transverse, en
**lecture seule**, des 4 environnements WSO2 API Manager 4.x : DEV, SIM, UAT, EXP (EXP = production).
Il affiche les API (et la révision déployée par gateway), toutes les applications et toutes les
souscriptions. La valeur ajoutée par rapport au Devportal WSO2 natif est la vue croisée entre
environnements (ex. « API X : v1.3 en SIM et UAT, v1.2 en EXP »).

## Architecture actée

- **Topologie WSO2** : 4 control planes distincts, un par environnement → 4 jeux de credentials indépendants.
- **Réseau** : le portail est déployé dans le VLAN PROD et a accès à la non-prod. Modèle **pull** : le BFF interroge les control planes.
- **Backend** : BFF Java 21 / Spring Boot (ce dépôt). Le navigateur ne parle **jamais** directement à WSO2 et ne porte aucun token WSO2.
- **Front** : Angular (pas encore commencé).
- **Hébergement** : Virtuozzo.
- **Données** : synchronisation périodique de chaque environnement vers un stockage propre au portail, avec horodatage « dernière synchro » par environnement. Pas d'appel WSO2 temps réel à chaque affichage.
- **Métriques de trafic** : lues dans **Splunk** (événements d'analytique des gateways) par le BFF, en pull et par lecture périodique
  vers un store en mémoire, comme le catalogue ; statut par environnement, échec isolé, jamais un état de santé du portail.
- **Jamais de lecture directe de la base WSO2** : son schéma n'est pas un contrat.

## APIs WSO2 utilisées

- Publisher REST API v4 (`/api/am/publisher/v4`) : `GET /apis`, `GET /apis/{id}/revisions?query=deployed:true`, `GET /subscriptions?apiId=` (les souscriptions sont exposées par API → N appels par environnement).
- Admin REST API v4 (`/api/am/admin/v4`) : `GET /applications` (seule API qui liste les applications de tous les propriétaires).
- Authentification : client OAuth enregistré une fois par DCR (hors application), puis grant `password` avec un compte de service lecture seule par environnement.
- WSO2 retire **silencieusement** les scopes non autorisés du token : le provider vérifie les scopes accordés et échoue explicitement.

## Contraintes de sécurité — non négociables

- Lecture seule par construction : aucune méthode d'écriture vers WSO2.
- **DTO en liste blanche** (`Wso2Models`) : ne jamais ajouter de champ de clés, secrets ou attributs d'application. Ne pas remplacer par des `Map`/`JsonNode` génériques.
- Aucun secret dans le code, les fichiers de config, les logs ou les messages d'erreur. Secrets injectés par variables d'environnement depuis le coffre. Tout objet portant un secret masque son `toString()`.
- HTTPS obligatoire, confiance via le SSL bundle `group-ca` (CA groupe). Ne jamais désactiver la vérification TLS, y compris dans les tests d'intégration.
- Redirections HTTP non suivies.
- L'indisponibilité d'un environnement (surtout non-prod) ne doit **ni** empêcher le démarrage, **ni** faire passer le health/readiness du portail en DOWN. L'état de chaque environnement est une donnée métier affichée dans l'UI.
- Actuator : seuls `health` et `info` sont exposés.
- Données personnelles (propriétaires d'applications, subscribers) : minimiser, et prévoir leur filtrage par RBAC.
- Tout ajout de dépendance doit être justifié (validation sécurité en contexte bancaire).

## État actuel

- **Client WSO2** (`com.example.apiportal.wso2`) : compile, `mvn verify` vert, testé avec `MockRestServiceServer`
  (étapes 1 et 2 faites).
- **Synchronisation** (`sync`) : `CatalogSource` par environnement (WSO2 réel ou mock), store **en mémoire**
  (le choix de la base reste ouvert, question 2), statut par environnement, échec isolé, dernier instantané valide conservé.
- **API REST du BFF** (`api`, préfixe `/api/v1`) : environnements (statut, gateways avec adresse de base, liens Publisher/Devportal et Identity Server configurables en https),
  informations communes (composant GitLab de déploiement), vue d'ensemble (répartitions), recherche globale, APIs et applications **par environnement**
  avec leurs souscriptions et le détail d'une API (révision, URL complète par gateway, présence dans les autres environnements) ; plus de matrice croisée (les versions d'API ne changent pas). Les données personnelles passent par `PersonalDataPolicy` (point de
  branchement du RBAC). **Aucune authentification avant l'étape 5 : ne pas déployer.**
- **Métriques** (`metrics`, facultatives) : `SplunkMetricsSource` par environnement (recherches SPL construites uniquement à partir de la
  configuration validée, jamais d'une entrée du navigateur), `MetricsStore`/`MetricsSyncService` isolés du catalogue, endpoints
  `/environments/{env}/metrics…` (totaux, courbes, classements, par API, par application). Configuration `portal.metrics` dans le `README.md`.
- **Profil `mock`** : données factices déterministes, démarre sans variable d'environnement WSO2 ni PEM, écoute sur
  `127.0.0.1`. `--portal.mock.failing-environments=uat` simule une panne. Sans ce profil, le comportement est celui des vrais WSO2.
- **Front Angular** (`../portal-frontend`, dossier frère) : « API Portal » (logo « accolades » : `{ • }` à point orange, nom d'une seule couleur), style « Panorama », bilingue FR/EN (bouton dans la barre du haut, choix mémorisé dans le navigateur, sans dépendance : `i18n.ts` + dictionnaire `i18n.fr.ts`, le texte anglais sert de clé), couleurs WSO2 (orange #ff7300, anthracite). Rail à gauche (Accueil, API, Applications, Aide, état de synchro de chaque environnement) + barre du haut (recherche, **sélecteur d'environnement unique mémorisé** dans le navigateur, PROD signalé, heures de Lisbonne, Lausanne et Singapour). Règles d'UX actées avec Adel : un clic n'emmène pas ailleurs mais ouvre un **volet de détail non bloquant** à droite (la page se décale, la ligne d'origine reste en surbrillance, un clic sur une autre ligne remplace le contenu, pile API ↔ application avec retour) ; pas d'onglets quand tout tient en une page ; le volet et la fiche d'API suivent le sélecteur d'environnement (l'élément est retrouvé par son nom). Accueil (trafic, classements, fil des derniers déploiements tous environnements avec synchros en échec, API pas encore en production, abonnements, swagger-deploy, connexion, comparaison des environnements), API (parcours DEV → EXP par ligne, filtres rapides, copie de l'URL de la gateway interne depuis la ligne), Applications, fiche d'API par lien direct `/apis/{env}/{id}` sans onglets (parcours avec révision et date par environnement, trafic, URL, impact d'un changement, déploiement), Aide, recherche globale Ctrl/⌘+K (API, applications, ou URL de gateway collée). Pas de statut de cycle de vie dans les listes tant que la gouvernance ne le suit pas. Le proxy de dev et tout reverse proxy doivent router `/api/` (avec la barre finale) vers le BFF : `/apis/...` est une route du front. Pas de bouton de synchro : la synchro reste périodique côté serveur.
  Angular 17 est imposé par Node 18 : des avis de sécurité *high* existent pour cette branche (corrigés à partir d'Angular 19.2).
  **Démo locale uniquement** : migrer (Node 20+/22 LTS puis Angular supporté) avant tout déploiement.
- Configuration dans `src/main/resources/application.yml` (multi-documents : réel `!mock`, `mock`). Prérequis DCR, liste
  complète des variables (obligatoires et facultatives) et confirmation qu'aucune n'est codée en dur : `README.md` et
  `.env.example`. Coffre confirmé : **HashiCorp Vault**.

## Conventions

- Java 21, Spring Boot (version à aligner sur le socle validé ; éviter les API qui changent en Boot 4).
- Client HTTP : `RestClient` + `JdkClientHttpRequestFactory`.
- Code et identifiants en anglais, commentaires en français, concis et utiles (le « pourquoi », pas le « quoi »).
- Tests : JUnit 5, `MockRestServiceServer` ou WireMock pour les appels WSO2, horloge injectée (`Clock`) pour tout ce qui dépend du temps. Tout nouveau comportement est accompagné de tests.
- Commits au format **Conventional Commits** (`feat(wso2): …`, `fix(sync): …`, `test(…)`, `docs(…)`). Proposer le message de commit comme étape finale distincte de chaque tâche.

## Commandes

```bash
mvn verify          # build + tests (JDK 21 requis)
mvn spring-boot:run # lancement local (nécessite les variables d'environnement du README)
mvn spring-boot:run -Dspring-boot.run.profiles=mock   # démo sur données factices, sans variable d'environnement

# Front (../portal-frontend) : proxy vers le BFF sur 127.0.0.1:8080
npm start                                             # ng serve sur http://localhost:4200
npx ng test --watch=false --browsers=ChromeHeadless   # tests (Chrome requis)
```

## Questions ouvertes — ne pas trancher sans demander

1. ~~Virtuozzo : VM ou conteneurs ?~~ : tranché, **Application Platform (conteneurs)**. `Dockerfile` par module,
   `.gitlab-ci.yml` (squelette) à la racine du dépôt frère. Reste ouvert : registre cible, nommage des services/DNS
   interne à la plateforme, et comment elle injecte les secrets dans les conteneurs (quel coffre, sous quelle forme —
   variables d'environnement ou fichiers montés ; voir `README.md`).
2. ~~Stockage de la synchro : PostgreSQL disponible ?~~ : oui, provisionnable facilement sur Virtuozzo. Reste à
   implémenter (roadmap étape 3) : store persistant à la place du store en mémoire actuel.
3. ~~IdP d'entreprise pour le SSO~~ : tranché, **WSO2 Identity Server**. **Pas de RBAC dans l'immédiat** : tout
   compte du userstore peut se connecter au portail. `PersonalDataPolicy` reste donc en passthrough (aucun
   filtrage) tant que ça ne change pas — c'est un choix produit assumé, pas un oubli. Reste à implémenter
   (roadmap étape 5) : connexion OIDC du portail à ce WSO2 IS (à ne pas confondre avec les Identity Server par
   environnement de `portal.links`, qui servent aux développeurs à obtenir un token d'appel API, pas à la
   connexion au portail).
4. Version mineure exacte de WSO2 4.x par environnement → scopes exacts de l'Admin API (`apim:admin_application_view` est à valider ; si seul `apim:admin` fonctionne, c'est un sujet sécurité à remonter, pas à contourner).
5. ~~Organisation du front~~ : tranché, dossier frère `portal-frontend/` (déplaçable dans un dépôt séparé).
6. Splunk : noms exacts des index par environnement, des champs des événements (`apiName`, `apiVersion`, `applicationName`, `proxyResponseCode`, `responseLatency` par défaut, identifiants éventuels), filtre de sourcetype, compte et rôle de lecture, accès réseau depuis le VLAN PROD → à valider avec l'équipe Splunk avant de brancher (`portal.metrics.splunk`).

## Feuille de route

1. ✔ Faire compiler le projet, `mvn verify` vert.
2. ✔ Tests unitaires du client WSO2 (cache et renouvellement du token, contrôle des scopes, retry unique sur 401, 403, pagination, HTTPS obligatoire, masquage des secrets).
3. ◐ Service de synchronisation par environnement (isolé : l'échec d'un environnement n'affecte pas les autres), statut de synchro par environnement : fait avec stockage **en mémoire**. Reste : persistance (question 2).
4. ◐ API REST du BFF pour le front (APIs et applications par environnement, souscriptions) : faite, sans authentification (étape 5).
5. SSO OIDC (WSO2 IS, sans RBAC dans l'immédiat) ; journal d'audit des consultations — **pas de SIEM identifié
   pour l'instant** : journaliser en logs structurés (stdout/fichier) que la pile de logs existante peut
   récupérer, plutôt que d'intégrer un SIEM qui n'existe pas encore. À revoir si/quand un SIEM est désigné.
6. ◐ Front Angular : version démo faite (Angular 17, à migrer avant déploiement).
7. ◐ Packaging et déploiement Virtuozzo, pipeline GitLab CI (SAST, analyse des dépendances, SBOM). Fait : `Dockerfile`
   (BFF et front, multi-étage), `.gitlab-ci.yml` (build + tests + images, non testé faute de démon Docker/runner
   disponible ici). Reste : bascule vers l'image de base interne validée par la sécurité, manifest de déploiement
   Virtuozzo Application Platform, activation des scanners SAST/dépendances/SBOM (question 1).
