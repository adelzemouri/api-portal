package com.example.apiportal.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.example.apiportal.sync.CatalogSnapshot;
import com.example.apiportal.sync.CatalogSource;
import com.example.apiportal.sync.CatalogSources;
import com.example.apiportal.sync.InMemorySnapshotStore;
import com.example.apiportal.wso2.Wso2Models.ApiSummary;
import com.example.apiportal.wso2.Wso2Models.ApplicationRef;
import com.example.apiportal.wso2.Wso2Models.ApplicationSummary;
import com.example.apiportal.wso2.Wso2Models.Revision;
import com.example.apiportal.wso2.Wso2Models.RevisionDeployment;
import com.example.apiportal.wso2.Wso2Models.Subscription;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class CatalogQueryServiceTest {

    private static final Instant NOW = Instant.parse("2026-01-01T10:00:00Z");

    private InMemorySnapshotStore store;
    private CatalogQueryService service;

    private static CatalogSource source(String env) {
        return new CatalogSource() {
            public String environment() {
                return env;
            }

            public String label() {
                return env.toUpperCase();
            }

            public CatalogSnapshot fetch() {
                return CatalogSnapshot.empty();
            }
        };
    }

    private static ApiSummary api(String id, String name, String version) {
        return new ApiSummary(id, name, "/" + name.toLowerCase() + "/" + version, version, "admin", "HTTP", "PUBLISHED");
    }

    private static CatalogSnapshot snapshot(List<ApiSummary> apis, Map<String, List<Subscription>> subs,
                                            List<ApplicationSummary> apps) {
        Revision revision = new Revision("rev", "Revision 1", "2026-01-01T00:00:00Z",
                List.of(new RevisionDeployment("Default", "gw.test", "APPROVED", "2026-01-01T01:00:00Z")));
        Map<String, List<Revision>> revisions = new java.util.LinkedHashMap<>();
        apis.forEach(a -> revisions.put(a.id(), List.of(revision)));
        return new CatalogSnapshot(apis, revisions, subs, apps);
    }

    @BeforeEach
    void setUp() {
        store = new InMemorySnapshotStore(new CatalogSources(
                List.of(source("dev"), source("sim"), source("uat"), source("exp"))));
        service = new CatalogQueryService(store, new PersonalDataPolicy(), PortalLinks.none());

        Subscription sub = new Subscription("s1", new ApplicationRef("app1", "Mobile", "jdoe"), "Gold", "UNBLOCKED");
        store.recordSuccess("dev", snapshot(
                List.of(api("d-pay", "Payments", "1.4"), api("d-kyc", "KYC", "1.0"), api("d-fraud", "fraud scoring", "0.9")),
                Map.of("d-pay", List.of(sub)),
                List.of(new ApplicationSummary("app1", "Mobile", "jdoe", "APPROVED", null))), NOW);
        store.recordSuccess("sim", snapshot(
                List.of(api("s-pay", "Payments", "1.3"), api("s-pay2", "Payments", "1.10"), api("s-kyc", "KYC", "1.0")),
                Map.of(), List.of()), NOW);
        store.recordSuccess("exp", snapshot(
                List.of(api("e-pay", "Payments", "1.2")), Map.of(), List.of()), NOW);
        // uat : jamais synchronisé.
    }

    @Test
    @DisplayName("les environnements sont listés dans l'ordre configuré, avec leur statut")
    void listsEnvironmentsInOrder() {
        assertThat(service.environments()).extracting(ApiModels.EnvironmentDto::key)
                .containsExactly("dev", "sim", "uat", "exp");
        assertThat(service.environments()).extracting(ApiModels.EnvironmentDto::order).containsExactly(0, 1, 2, 3);
        assertThat(service.environments().get(2).sync().state()).isEqualTo("NEVER");
    }

    @Test
    @DisplayName("apis : triées par nom (sans tenir compte de la casse) puis par version naturelle (1.3 < 1.10)")
    void listsApisSortedByNameThenVersion() {
        assertThat(service.apis("dev", null)).extracting(ApiModels.ApiDto::name)
                .containsExactly("fraud scoring", "KYC", "Payments");
        assertThat(service.apis("sim", null)).extracting(a -> a.name() + " " + a.version())
                .containsExactly("KYC 1.0", "Payments 1.3", "Payments 1.10");
    }

    @Test
    @DisplayName("apis : nombre de souscriptions et filtre sur le nom ou le contexte")
    void apisExposeSubscriptionCountAndFilter() {
        assertThat(service.apis("dev", "payments")).singleElement().satisfies(api -> {
            assertThat(api.apiId()).isEqualTo("d-pay");
            assertThat(api.subscriptionCount()).isEqualTo(1);
            assertThat(api.context()).isEqualTo("/payments/1.4");
        });
        assertThat(service.apis("dev", "kyc").get(0).subscriptionCount()).isZero();
        assertThat(service.apis("dev", "/fraud")).hasSize(1);
        assertThat(service.apis("dev", "zzz")).isEmpty();
    }

    @Test
    @DisplayName("souscriptions : portent le propriétaire de l'application (pour prévenir les équipes touchées)")
    void subscriptionsCarryTheApplicationOwner() {
        assertThat(service.subscriptionsOfApi("dev", "d-pay")).singleElement()
                .satisfies(sub -> assertThat(sub.applicationOwner()).isEqualTo("jdoe"));
        assertThat(service.subscriptionsOfApplication("dev", "app1")).singleElement()
                .satisfies(sub -> assertThat(sub.applicationOwner()).isEqualTo("jdoe"));
    }

    @Test
    @DisplayName("recherche globale : API et applications qui correspondent, plafonnées ; requête vide = rien")
    void searchReturnsAFewOfEachKind() {
        ApiModels.SearchDto result = service.search("dev", "pay");
        assertThat(result.apis()).extracting(ApiModels.ApiDto::name).containsExactly("Payments");
        assertThat(result.applications()).isEmpty();
        assertThat(service.search("dev", "mobile").applications()).hasSize(1);
        assertThat(service.search("dev", "  ").apis()).isEmpty();
        assertThatThrownBy(() -> service.search("prod", "x")).isInstanceOf(NotFoundException.class);
    }

    @Test
    @DisplayName("environnements : adresses configurées (https) et gateways déployées avec leur adresse de base")
    void environmentsExposeLinksAndGateways() {
        PortalLinks links = new PortalLinks(Map.of("dev", new PortalLinks.EnvironmentLinks(
                java.net.URI.create("https://apim-dev.test/publisher"), null,
                java.net.URI.create("https://is-dev.test"), 8243)), null);
        CatalogQueryService withLinks = new CatalogQueryService(store, new PersonalDataPolicy(), links);

        ApiModels.EnvironmentDto dev = withLinks.environments().get(0);
        assertThat(dev.publisherUrl()).isEqualTo("https://apim-dev.test/publisher");
        assertThat(dev.devportalUrl()).isNull();
        assertThat(dev.identityServerUrl()).isEqualTo("https://is-dev.test");
        assertThat(dev.gateways()).singleElement().satisfies(gateway -> {
            assertThat(gateway.name()).isEqualTo("Default");
            assertThat(gateway.vhost()).isEqualTo("gw.test");
            assertThat(gateway.url()).isEqualTo("https://gw.test:8243");
        });
        ApiModels.EnvironmentDto sim = withLinks.environments().get(1);
        assertThat(sim.publisherUrl()).isNull();
        assertThat(sim.identityServerUrl()).isNull();
    }

    @Test
    @DisplayName("URL complète d'une API : hôte de la gateway, port configuré (aucun pour le 443) et contexte")
    void apiDetailExposesFullGatewayUrls() {
        assertThat(service.apiDetail("dev", "d-pay").gatewayUrls()).singleElement().satisfies(url -> {
            assertThat(url.gateway()).isEqualTo("Default");
            assertThat(url.url()).isEqualTo("https://gw.test/payments/1.4");
        });
        PortalLinks withPort = new PortalLinks(Map.of("dev", new PortalLinks.EnvironmentLinks(null, null, null, 8243),
                "sim", new PortalLinks.EnvironmentLinks(null, null, null, 443)), null);
        CatalogQueryService custom = new CatalogQueryService(store, new PersonalDataPolicy(), withPort);
        assertThat(custom.apiDetail("dev", "d-pay").gatewayUrls().get(0).url())
                .isEqualTo("https://gw.test:8243/payments/1.4");
        assertThat(custom.apiDetail("sim", "s-pay").gatewayUrls().get(0).url())
                .isEqualTo("https://gw.test/payments/1.3");
    }

    @Test
    @DisplayName("l'URL d'une API est normalisée quand son contexte n'a pas de barre initiale, vide sans révision")
    void gatewayUrlIsNormalizedAndEmptyWithoutRevision() {
        store.recordSuccess("dev", new CatalogSnapshot(
                List.of(new ApiSummary("x", "Bare", "bare/1.0", "1.0", "admin", "HTTP", "PUBLISHED"),
                        api("y", "NoRevision", "1.0")),
                Map.of("x", List.of(new Revision("r", "Revision 1", "2026-01-01T00:00:00Z",
                        List.of(new RevisionDeployment("Default", "gw.test", "APPROVED", "2026-01-01T01:00:00Z"))))),
                Map.of(), List.of()), NOW);

        assertThat(service.apiDetail("dev", "x").gatewayUrls().get(0).url()).isEqualTo("https://gw.test/bare/1.0");
        assertThat(service.apiDetail("dev", "y").gatewayUrls()).isEmpty();
    }

    @Test
    @DisplayName("informations communes : adresse du composant GitLab de déploiement, si configurée")
    void portalExposesTheDeployComponentUrl() {
        assertThat(service.portal().deployComponentUrl()).isNull();
        CatalogQueryService withComponent = new CatalogQueryService(store, new PersonalDataPolicy(),
                new PortalLinks(Map.of(), java.net.URI.create("https://gitlab.test/swagger-deploy")));
        assertThat(withComponent.portal().deployComponentUrl()).isEqualTo("https://gitlab.test/swagger-deploy");
    }

    @Test
    @DisplayName("les liens vers WSO2 doivent être en https")
    void linksMustBeHttps() {
        assertThatThrownBy(() -> new PortalLinks.EnvironmentLinks(java.net.URI.create("http://apim.test/publisher"),
                null, null, null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new PortalLinks.EnvironmentLinks(null, null,
                java.net.URI.create("http://is.test"), null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new PortalLinks(Map.of(), java.net.URI.create("http://gitlab.test/c")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new PortalLinks.EnvironmentLinks(null, null, null, 70000))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("un environnement jamais synchronisé n'a aucune API, sans erreur")
    void neverSyncedEnvironmentIsEmpty() {
        assertThat(service.apis("uat", null)).isEmpty();
        assertThat(service.applications("uat", null)).isEmpty();
    }

    @Test
    @DisplayName("un environnement en erreur garde les données de la dernière synchro réussie")
    void failedEnvironmentKeepsLastGoodData() {
        store.recordFailure("sim", "[sim] HTTP 503", NOW.plusSeconds(900));

        assertThat(service.apis("sim", null)).hasSize(3);
        assertThat(service.environments().get(1).sync().state()).isEqualTo("ERROR");
        assertThat(service.environments().get(1).sync().error()).isEqualTo("[sim] HTTP 503");
    }

    @Test
    @DisplayName("applications : filtre par texte (nom ou propriétaire) et nombre d'API souscrites")
    void filtersApplicationsAndCountsSubscriptions() {
        assertThat(service.applications("dev", null)).singleElement()
                .satisfies(app -> assertThat(app.subscriptionCount()).isEqualTo(1));
        assertThat(service.applications("dev", "MOBI")).hasSize(1);
        assertThat(service.applications("dev", "jdoe")).hasSize(1);
        assertThat(service.applications("dev", "zzz")).isEmpty();
        assertThat(service.applications("sim", null)).isEmpty();
    }

    @Test
    @DisplayName("applications d'une API : nom de l'application, abonné, politique et statut")
    void listsSubscriptionsOfAnApi() {
        assertThat(service.subscriptionsOfApi("dev", "d-pay")).singleElement().satisfies(sub -> {
            assertThat(sub.environment()).isEqualTo("dev");
            assertThat(sub.apiName()).isEqualTo("Payments");
            assertThat(sub.apiVersion()).isEqualTo("1.4");
            assertThat(sub.applicationName()).isEqualTo("Mobile");
            assertThat(sub.subscriber()).isEqualTo("jdoe");
            assertThat(sub.throttlingPolicy()).isEqualTo("Gold");
            assertThat(sub.status()).isEqualTo("UNBLOCKED");
        });
        assertThat(service.subscriptionsOfApi("dev", "d-kyc")).isEmpty();
    }

    @Test
    @DisplayName("API d'une application : souscriptions triées par API, sans celles des autres applications")
    void listsSubscriptionsOfAnApplication() {
        Subscription other = new Subscription("s2", new ApplicationRef("app2", "Web", "adupont"), "Silver", "UNBLOCKED");
        Subscription second = new Subscription("s3", new ApplicationRef("app1", "Mobile", "jdoe"), "Gold", "UNBLOCKED");
        store.recordSuccess("dev", snapshot(
                List.of(api("d-pay", "Payments", "1.4"), api("d-kyc", "KYC", "1.0")),
                Map.of("d-pay", List.of(sub("s1", "app1"), other), "d-kyc", List.of(second)),
                List.of(new ApplicationSummary("app1", "Mobile", "jdoe", "APPROVED", null),
                        new ApplicationSummary("app2", "Web", "adupont", "APPROVED", null))), NOW);

        assertThat(service.subscriptionsOfApplication("dev", "app1")).extracting(ApiModels.SubscriptionDto::apiName)
                .containsExactly("KYC", "Payments");
        assertThat(service.applications("dev", null)).extracting(ApiModels.ApplicationDto::subscriptionCount)
                .containsExactly(2, 1);
    }

    @Test
    @DisplayName("détail d'une API : révision déployée avec ses gateways")
    void apiDetailExposesRevisionAndGateways() {
        ApiModels.ApiDetailDto detail = service.apiDetail("dev", "d-pay");

        assertThat(detail.revisions()).singleElement().satisfies(revision -> {
            assertThat(revision.name()).isEqualTo("Revision 1");
            assertThat(revision.gateways()).singleElement().satisfies(gateway -> {
                assertThat(gateway.name()).isEqualTo("Default");
                assertThat(gateway.vhost()).isEqualTo("gw.test");
                assertThat(gateway.status()).isEqualTo("APPROVED");
            });
        });
    }

    @Test
    @DisplayName("détail d'une API : présence par nom dans chaque environnement, dans l'ordre, versions triées")
    void apiDetailListsPresenceInEveryEnvironment() {
        assertThat(service.apiDetail("dev", "d-pay").environments()).extracting(
                ApiModels.PresenceDto::environment,
                presence -> presence.versions().stream().map(ApiModels.PresenceVersionDto::version).toList())
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("dev", List.of("1.4")),
                        org.assertj.core.groups.Tuple.tuple("sim", List.of("1.3", "1.10")),
                        org.assertj.core.groups.Tuple.tuple("uat", List.of()),
                        org.assertj.core.groups.Tuple.tuple("exp", List.of("1.2")));
    }

    @Test
    @DisplayName("détail d'une API : la présence garde l'identifiant de chaque version, pour naviguer entre environnements")
    void presenceKeepsApiIdsToLinkAcrossEnvironments() {
        assertThat(service.apiDetail("dev", "d-pay").environments().get(1).versions())
                .extracting(ApiModels.PresenceVersionDto::apiId).containsExactly("s-pay", "s-pay2");
    }

    @Test
    @DisplayName("détail d'une API : porte aussi les champs de la ligne d'API (page accessible par lien direct)")
    void apiDetailCarriesTheApiItself() {
        assertThat(service.apiDetail("dev", "d-pay").api()).satisfies(api -> {
            assertThat(api.name()).isEqualTo("Payments");
            assertThat(api.version()).isEqualTo("1.4");
            assertThat(api.context()).isEqualTo("/payments/1.4");
            assertThat(api.subscriptionCount()).isEqualTo(1);
        });
    }

    @Test
    @DisplayName("détail d'une API : un environnement en erreur est marqué « stale »")
    void apiDetailMarksFailedEnvironmentStale() {
        store.recordFailure("exp", "[exp] HTTP 503", NOW.plusSeconds(900));

        assertThat(service.apiDetail("dev", "d-pay").environments()).extracting(ApiModels.PresenceDto::stale)
                .containsExactly(false, false, false, true);
    }

    private static Subscription sub(String id, String applicationId) {
        return new Subscription(id, new ApplicationRef(applicationId, "Mobile", "jdoe"), "Gold", "UNBLOCKED");
    }

    @Test
    @DisplayName("environnement ou API inconnus : 404")
    void unknownEnvironmentOrApiIsNotFound() {
        assertThatThrownBy(() -> service.applications("prod", null)).isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> service.subscriptionsOfApi("prod", "d-pay")).isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> service.subscriptionsOfApi("dev", "nope")).isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> service.apiDetail("dev", "nope")).isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> service.apis("prod", null)).isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> service.subscriptionsOfApplication("dev", "nope")).isInstanceOf(NotFoundException.class);
    }

    @Test
    @DisplayName("les données personnelles passent toutes par PersonalDataPolicy (point de branchement du RBAC)")
    void personalDataGoesThroughPolicy() {
        CatalogQueryService masked = new CatalogQueryService(store, new PersonalDataPolicy() {
            @Override
            public String owner(String owner) {
                return "***";
            }

            @Override
            public String subscriber(String subscriber) {
                return "***";
            }
        }, PortalLinks.none());

        assertThat(masked.applications("dev", null)).extracting(ApiModels.ApplicationDto::owner).containsOnly("***");
        assertThat(masked.subscriptionsOfApi("dev", "d-pay")).extracting(ApiModels.SubscriptionDto::subscriber)
                .containsOnly("***");
        assertThat(masked.subscriptionsOfApplication("dev", "app1")).extracting(ApiModels.SubscriptionDto::subscriber)
                .containsOnly("***");
    }

    @Test
    @DisplayName("présence : chaque version porte sa dernière révision déployée et sa date")
    void presenceCarriesLatestDeployedRevision() {
        assertThat(service.apiDetail("dev", "d-pay").environments().get(3).versions()).singleElement().satisfies(v -> {
            assertThat(v.revision()).isEqualTo("Revision 1");
            assertThat(v.deployedTime()).isEqualTo("2026-01-01T01:00:00Z");
        });
    }

    @Test
    @DisplayName("présence : sans révision déployée, révision et date sont nulles")
    void presenceWithoutDeploymentHasNoRevision() {
        store.recordSuccess("uat", new CatalogSnapshot(List.of(api("u-pay", "Payments", "1.2")), Map.of(), Map.of(),
                List.of()), NOW);

        assertThat(service.apiDetail("dev", "d-pay").environments().get(2).versions()).singleElement().satisfies(v -> {
            assertThat(v.revision()).isNull();
            assertThat(v.deployedTime()).isNull();
        });
    }

    @Test
    @DisplayName("derniers déploiements : tous environnements, du plus récent au plus ancien, une ligne par révision")
    void recentDeploymentsAcrossEnvironmentsNewestFirst() {
        Revision older = new Revision("r1", "Revision 1", "2026-01-01T00:00:00Z", List.of(
                new RevisionDeployment("Default", "gw.test", "APPROVED", "2026-01-02T08:00:00Z"),
                new RevisionDeployment("Internal", "gw-int.test", "APPROVED", "2026-01-02T09:00:00Z")));
        Revision newer = new Revision("r2", "Revision 2", "2026-01-03T00:00:00Z", List.of(
                new RevisionDeployment("Default", "gw.test", "APPROVED", "2026-01-03T10:00:00Z")));
        Revision undated = new Revision("r3", "Revision 3", "2026-01-04T00:00:00Z", List.of(
                new RevisionDeployment("Default", "gw.test", "CREATED", null)));
        store.recordSuccess("uat", new CatalogSnapshot(List.of(api("u-pay", "Payments", "1.2")),
                Map.of("u-pay", List.of(older, undated)), Map.of(), List.of()), NOW);
        store.recordSuccess("exp", new CatalogSnapshot(List.of(api("e-pay", "Payments", "1.2")),
                Map.of("e-pay", List.of(newer)), Map.of(), List.of()), NOW);

        List<ApiModels.DeploymentDto> deployments = service.recentDeployments(10);

        assertThat(deployments).extracting(ApiModels.DeploymentDto::environment, ApiModels.DeploymentDto::revision,
                        ApiModels.DeploymentDto::deployedTime)
                .startsWith(
                        org.assertj.core.groups.Tuple.tuple("exp", "Revision 2", "2026-01-03T10:00:00Z"),
                        org.assertj.core.groups.Tuple.tuple("uat", "Revision 1", "2026-01-02T09:00:00Z"));
        assertThat(deployments.get(1).gateways()).containsExactly("Default", "Internal");
        assertThat(deployments.get(1).label()).isEqualTo("UAT");
        assertThat(deployments).extracting(ApiModels.DeploymentDto::revision).doesNotContain("Revision 3");
    }

    @Test
    @DisplayName("derniers déploiements : la liste est plafonnée")
    void recentDeploymentsAreLimited() {
        assertThat(service.recentDeployments(2)).hasSize(2);
    }
}
