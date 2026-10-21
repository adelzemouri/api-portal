package com.example.apiportal.mock;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.example.apiportal.sync.CatalogSnapshot;
import com.example.apiportal.sync.CatalogSource;
import com.example.apiportal.sync.CatalogSources;
import com.example.apiportal.wso2.Wso2ClientException;
import com.example.apiportal.wso2.Wso2Models.ApiSummary;
import com.example.apiportal.wso2.Wso2Models.ApplicationSummary;
import com.example.apiportal.wso2.Wso2Models.Subscription;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

class MockCatalogTest {

    private final MockCatalog catalog = new MockCatalog();

    private Set<String> versionsOf(String environment, String apiName) {
        return catalog.snapshotFor(environment).apis().stream()
                .filter(api -> api.name().equals(apiName))
                .map(ApiSummary::version)
                .collect(Collectors.toSet());
    }

    @Test
    @DisplayName("les données sont déterministes : deux synchros donnent exactement le même résultat")
    void isDeterministic() {
        for (String environment : MockCatalog.ENVIRONMENTS) {
            assertThat(new MockCatalog().snapshotFor(environment)).isEqualTo(new MockCatalog().snapshotFor(environment));
        }
    }

    @Test
    @DisplayName("scénario phare : Payments v1.3 en SIM et UAT, v1.2 en EXP")
    void containsTheVersionDriftScenario() {
        assertThat(versionsOf("sim", "Payments")).contains("1.3");
        assertThat(versionsOf("uat", "Payments")).containsExactly("1.3");
        assertThat(versionsOf("exp", "Payments")).contains("1.2").doesNotContain("1.3");
    }

    @Test
    @DisplayName("les scénarios de variété sont présents : API absentes, multi-versions, gateway interne, sans révision")
    void containsVarietyScenarios() {
        assertThat(versionsOf("exp", "KYC Checks")).isEmpty();
        assertThat(versionsOf("sim", "Payments")).hasSizeGreaterThan(1);

        CatalogSnapshot exp = catalog.snapshotFor("exp");
        String paymentsId = exp.apis().stream().filter(a -> a.name().equals("Payments") && a.version().equals("1.2"))
                .findFirst().orElseThrow().id();
        assertThat(exp.revisionsOf(paymentsId)).singleElement()
                .satisfies(revision -> assertThat(revision.deploymentInfo()).hasSize(2));

        CatalogSnapshot dev = catalog.snapshotFor("dev");
        String kycId = dev.apis().stream().filter(a -> a.name().equals("KYC Checks")).findFirst().orElseThrow().id();
        assertThat(dev.revisionsOf(kycId)).isEmpty();
    }

    @Test
    @DisplayName("chaque environnement contient des API, des applications et des souscriptions")
    void everyEnvironmentIsPopulated() {
        for (String environment : MockCatalog.ENVIRONMENTS) {
            CatalogSnapshot snapshot = catalog.snapshotFor(environment);
            assertThat(snapshot.apis()).as(environment).isNotEmpty();
            assertThat(snapshot.applications()).as(environment).isNotEmpty();
            assertThat(snapshot.subscriptionCount()).as(environment).isPositive();
        }
    }

    @Test
    @DisplayName("les données sont cohérentes : ids uniques, souscriptions vers des applications et API existantes")
    void isReferentiallyConsistent() {
        for (String environment : MockCatalog.ENVIRONMENTS) {
            CatalogSnapshot snapshot = catalog.snapshotFor(environment);
            Set<String> apiIds = snapshot.apis().stream().map(ApiSummary::id).collect(Collectors.toSet());
            Set<String> appIds = snapshot.applications().stream().map(ApplicationSummary::applicationId)
                    .collect(Collectors.toSet());

            assertThat(apiIds).as(environment + " api ids").hasSize(snapshot.apis().size());
            assertThat(appIds).as(environment + " app ids").hasSize(snapshot.applications().size());
            assertThat(snapshot.subscriptionsByApiId().keySet()).isSubsetOf(apiIds);
            assertThat(snapshot.deployedRevisionsByApiId().keySet()).isSubsetOf(apiIds);
            Set<String> subscriptionIds = new HashSet<>();
            for (List<Subscription> subscriptions : snapshot.subscriptionsByApiId().values()) {
                for (Subscription subscription : subscriptions) {
                    assertThat(appIds).contains(subscription.applicationInfo().applicationId());
                    assertThat(subscriptionIds.add(subscription.subscriptionId())).isTrue();
                }
            }
        }
    }

    @Test
    @DisplayName("une source « en panne » échoue comme un control plane injoignable")
    void failingSourceSimulatesUnreachableControlPlane() {
        CatalogSource source = new MockCatalogSource("uat", "UAT", catalog, true);

        assertThatThrownBy(source::fetch)
                .isInstanceOf(Wso2ClientException.class)
                .hasMessage("[uat] control plane unreachable (simulated)");
    }

    @Test
    @DisplayName("la config crée les 4 sources dans l'ordre et applique portal.mock.failing-environments")
    void configBuildsSourcesInOrderAndAppliesFailingEnvironments() {
        MockEnvironment environment = new MockEnvironment().withProperty("portal.mock.failing-environments", "uat");

        CatalogSources sources = new MockCatalogConfig().mockCatalogSources(environment);

        assertThat(sources.all()).extracting(CatalogSource::environment).containsExactly("dev", "sim", "uat", "exp");
        assertThat(sources.all()).extracting(CatalogSource::label).containsExactly("DEV", "SIM", "UAT", "EXP");
        assertThat(sources.all().get(0).fetch().apis()).isNotEmpty();
        assertThatThrownBy(() -> sources.all().get(2).fetch()).isInstanceOf(Wso2ClientException.class);
    }

    @Test
    @DisplayName("un nom d'environnement inconnu dans portal.mock.failing-environments est refusé")
    void unknownFailingEnvironmentIsRejected() {
        MockEnvironment environment = new MockEnvironment().withProperty("portal.mock.failing-environments", "prod");

        assertThatThrownBy(() -> new MockCatalogConfig().mockCatalogSources(environment))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("prod");
    }
}
