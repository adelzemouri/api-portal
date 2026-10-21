package com.example.apiportal.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.example.apiportal.api.ApiModels.CountDto;
import com.example.apiportal.api.ApiModels.OverviewDto;
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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class OverviewServiceTest {

    private static final Instant NOW = Instant.parse("2026-01-01T10:00:00Z");

    private InMemorySnapshotStore store;
    private OverviewService service;

    private static ApiSummary api(String id, String name, String version, String status) {
        return new ApiSummary(id, name, "/" + id, version, "admin", "HTTP", status);
    }

    private static Subscription sub(String id, String appId, String policy, String status) {
        return new Subscription(id, new ApplicationRef(appId, "App " + appId, "someone"), policy, status);
    }

    private static Revision deployed() {
        return new Revision("r", "Revision 1", "2026-01-01T00:00:00Z",
                List.of(new RevisionDeployment("Default", "gw.test", "APPROVED", "2026-01-01T01:00:00Z")));
    }

    @BeforeEach
    void setUp() {
        store = new InMemorySnapshotStore(new CatalogSources(List.of(new CatalogSource() {
            public String environment() {
                return "dev";
            }

            public String label() {
                return "DEV";
            }

            public CatalogSnapshot fetch() {
                return CatalogSnapshot.empty();
            }
        })));
        service = new OverviewService(store);

        List<ApiSummary> apis = List.of(
                api("pay", "Payments", "1.4", "PUBLISHED"),
                api("old", "Payments", "1.1", "DEPRECATED"),
                api("kyc", "KYC", "1.0", "PUBLISHED"),
                api("ghost", "Ghost", "1.0", "PUBLISHED"),
                api("draft", "Draft", "0.1", "CREATED"));
        Map<String, List<Revision>> revisions = new LinkedHashMap<>();
        revisions.put("pay", List.of(deployed()));
        revisions.put("old", List.of(deployed()));
        revisions.put("kyc", List.of(deployed()));
        // « ghost » est publiée mais déployée sur aucune gateway.
        revisions.put("ghost", List.of(new Revision("r2", "Revision 2", "2026-01-01T00:00:00Z", List.of())));
        Map<String, List<Subscription>> subscriptions = new LinkedHashMap<>();
        subscriptions.put("pay", List.of(sub("s1", "a1", "Gold", "UNBLOCKED"), sub("s2", "a2", "Gold", "BLOCKED"),
                sub("s3", "a3", "Silver", "ON_HOLD")));
        subscriptions.put("old", List.of(sub("s4", "a1", "Silver", "UNBLOCKED")));
        store.recordSuccess("dev", new CatalogSnapshot(apis, revisions, subscriptions, List.of(
                new ApplicationSummary("a1", "App a1", "o1", "APPROVED", null),
                new ApplicationSummary("a4", "Sandbox", "o2", "CREATED", null))), NOW);
    }

    @Test
    @DisplayName("répartitions : statuts d'API et de souscriptions dans l'ordre métier, politiques par effectif")
    void countsAreOrderedByBusinessOrder() {
        OverviewDto overview = service.overview("dev");

        assertThat(overview.apisByStatus()).extracting(CountDto::key, CountDto::count).containsExactly(
                org.assertj.core.groups.Tuple.tuple("PUBLISHED", 3),
                org.assertj.core.groups.Tuple.tuple("CREATED", 1),
                org.assertj.core.groups.Tuple.tuple("DEPRECATED", 1));
        assertThat(overview.subscriptionsByStatus()).extracting(CountDto::key).containsExactly(
                "UNBLOCKED", "ON_HOLD", "BLOCKED");
        assertThat(overview.subscriptionsByPolicy()).extracting(CountDto::key, CountDto::count).containsExactly(
                org.assertj.core.groups.Tuple.tuple("Gold", 2), org.assertj.core.groups.Tuple.tuple("Silver", 2));
    }

    @Test
    @DisplayName("les API les plus consommées, sans celles qui n'ont aucun abonné")
    void topApisSkipUnusedOnes() {
        assertThat(service.overview("dev").topApis()).extracting(ApiModels.TopApiDto::apiId, ApiModels.TopApiDto::subscriptionCount)
                .containsExactly(org.assertj.core.groups.Tuple.tuple("pay", 3), org.assertj.core.groups.Tuple.tuple("old", 1));
    }

    @Test
    @DisplayName("aucune donnée personnelle dans la vue d'ensemble ; environnement inconnu : 404")
    void noPersonalDataAndUnknownEnvironment() {
        assertThat(service.overview("dev").toString()).doesNotContain("someone", "o1", "o2");
        assertThatThrownBy(() -> service.overview("prod")).isInstanceOf(NotFoundException.class);
    }
}
