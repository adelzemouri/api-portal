package com.example.apiportal.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.example.apiportal.api.MetricsDtos.ApiMetricDto;
import com.example.apiportal.metrics.MetricsModels.ApiMetric;
import com.example.apiportal.metrics.MetricsModels.ApiSeries;
import com.example.apiportal.metrics.MetricsModels.AppMetric;
import com.example.apiportal.metrics.MetricsModels.ConsumerMetric;
import com.example.apiportal.metrics.MetricsModels.MetricsSnapshot;
import com.example.apiportal.metrics.MetricsModels.TimePoint;
import com.example.apiportal.metrics.MetricsModels.Totals;
import com.example.apiportal.metrics.MetricsModels.Window;
import com.example.apiportal.metrics.MetricsModels.WindowMetrics;
import com.example.apiportal.metrics.MetricsSources;
import com.example.apiportal.metrics.MetricsSources.MetricsSource;
import com.example.apiportal.metrics.MetricsStore;
import com.example.apiportal.sync.CatalogSnapshot;
import com.example.apiportal.sync.CatalogSource;
import com.example.apiportal.sync.CatalogSources;
import com.example.apiportal.sync.InMemorySnapshotStore;
import com.example.apiportal.wso2.Wso2Models.ApiSummary;
import com.example.apiportal.wso2.Wso2Models.ApplicationSummary;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class MetricsQueryServiceTest {

    private static final Instant NOW = Instant.parse("2026-01-01T12:00:00Z");
    private static final Instant T11 = Instant.parse("2026-01-01T11:00:00Z");

    private MetricsStore metrics;
    private InMemorySnapshotStore catalog;
    private MetricsQueryService service;

    private static ApiSummary api(String id, String name, String version) {
        return new ApiSummary(id, name, "/" + name.toLowerCase() + "/" + version, version, "admin", "HTTP", "PUBLISHED");
    }

    private static ApplicationSummary app(String id, String name) {
        return new ApplicationSummary(id, name, "owner", "APPROVED", null);
    }

    private static CatalogSource catalogSource(String env) {
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

    private static MetricsSource metricsSource(String env) {
        return new MetricsSource() {
            public String environment() {
                return env;
            }

            public MetricsSnapshot fetch() {
                return MetricsSnapshot.empty();
            }
        };
    }

    private static ApiMetric apiMetric(String id, String name, String version, long calls, long e4, long e5, double p95) {
        return new ApiMetric(id, name, version, calls, e4, e5, p95 / 2, p95);
    }

    @BeforeEach
    void setUp() {
        catalog = new InMemorySnapshotStore(new CatalogSources(List.of(catalogSource("dev"), catalogSource("sim"))));
        metrics = new MetricsStore(new MetricsSources(List.of(metricsSource("dev"))));
        service = new MetricsQueryService(metrics, catalog);

        catalog.recordSuccess("dev", new CatalogSnapshot(
                List.of(api("p14", "Payments", "1.4"), api("p11", "Payments", "1.1"), api("k10", "KYC", "1.0")),
                Map.of(), Map.of(),
                List.of(app("a1", "Mobile"), app("a2", "Web"), app("a3", "Dup"), app("a4", "Dup"))), NOW);

        WindowMetrics wm = new WindowMetrics(
                new Totals(1310, 60, 15, 90, 400),
                List.of(apiMetric(null, "payments", "1.4", 1000, 40, 10, 400),
                        apiMetric(null, "Payments", "1.1", 300, 20, 5, 150),
                        apiMetric(null, "KYC", "1.0", 8, 4, 0, 900),
                        apiMetric(null, "Ghost", "0.1", 2, 0, 0, 10)),
                List.of(new AppMetric(null, "Mobile", 900, 40), new AppMetric("a2", "Web", 300, 20),
                        new AppMetric(null, "Dup", 100, 10)),
                List.of(new ConsumerMetric(null, "Payments", "1.4", null, "Mobile", 700, 30),
                        new ConsumerMetric(null, "Payments", "1.4", "a2", "Web", 300, 20),
                        new ConsumerMetric(null, "Payments", "1.1", null, "Mobile", 200, 10),
                        new ConsumerMetric(null, "Payments", "1.1", null, "Dup", 100, 10)),
                List.of(new ApiSeries(null, "Payments", "1.4", List.of(new TimePoint(T11.minusSeconds(7200), 100, 5),
                                new TimePoint(T11.minusSeconds(3600), 300, 20), new TimePoint(T11, 600, 25))),
                        new ApiSeries(null, "Payments", "1.1", List.of(new TimePoint(T11, 300, 25)))));
        metrics.recordSuccess("dev", new MetricsSnapshot(Map.of(Window.LAST_24H, wm)), NOW);
    }

    @Test
    @DisplayName("les lignes sont rapprochées du catalogue par nom et version (sans tenir compte de la casse), sinon sans identifiant")
    void resolvesApisByNameAndVersion() {
        var overview = service.overview("dev", Window.LAST_24H);

        assertThat(overview.topApis()).extracting(ApiMetricDto::apiId, ApiMetricDto::name)
                .containsExactly(org.assertj.core.groups.Tuple.tuple("p14", "payments"),
                        org.assertj.core.groups.Tuple.tuple("p11", "Payments"),
                        org.assertj.core.groups.Tuple.tuple("k10", "KYC"),
                        org.assertj.core.groups.Tuple.tuple(null, "Ghost"));
    }

    @Test
    @DisplayName("un identifiant fourni par la source prime sur le nom")
    void identifierWinsOverName() {
        WindowMetrics wm = new WindowMetrics(Totals.none(), List.of(apiMetric("p11", "Payments", "1.4", 5, 0, 0, 10)),
                List.of(new AppMetric("a2", "Mobile", 5, 0)), List.of(), List.of());
        metrics.recordSuccess("dev", new MetricsSnapshot(Map.of(Window.LAST_24H, wm)), NOW);

        var overview = service.overview("dev", Window.LAST_24H);
        assertThat(overview.topApis().get(0).apiId()).isEqualTo("p11");
        assertThat(overview.topApplications().get(0).applicationId()).isEqualTo("a2");
    }

    @Test
    @DisplayName("un nom d'application ambigu dans l'environnement n'est pas rapproché (on ne devine pas)")
    void ambiguousApplicationNamesAreNotResolved() {
        var apps = service.applications("dev", Window.LAST_24H).items();

        assertThat(apps).extracting(a -> a.name(), a -> a.applicationId()).containsExactly(
                org.assertj.core.groups.Tuple.tuple("Mobile", "a1"),
                org.assertj.core.groups.Tuple.tuple("Web", "a2"),
                org.assertj.core.groups.Tuple.tuple("Dup", null));
    }

    @Test
    @DisplayName("classements : taux d'erreur et latence ignorent les API trop peu appelées ; le top garde tout")
    void rankingsIgnoreLowVolume() {
        var overview = service.overview("dev", Window.LAST_24H);

        assertThat(overview.highestErrorRate()).extracting(ApiMetricDto::name).containsExactly("Payments", "payments");
        assertThat(overview.highestErrorRate().get(0).errorRate()).isEqualTo(25.0 / 300);
        assertThat(overview.slowest()).extracting(ApiMetricDto::name).containsExactly("payments", "Payments");
        assertThat(overview.slowest()).extracting(ApiMetricDto::p95LatencyMs).containsExactly(400.0, 150.0);
        assertThat(overview.topApis()).hasSize(4);
    }

    @Test
    @DisplayName("totaux, taux d'erreur, API et applications actives face au catalogue")
    void totalsAndActivity() {
        var overview = service.overview("dev", Window.LAST_24H);

        assertThat(overview.totals().calls()).isEqualTo(1310);
        assertThat(overview.totals().errorRate()).isEqualTo(75.0 / 1310);
        assertThat(overview.activeApis()).isEqualTo(4);
        assertThat(overview.catalogApis()).isEqualTo(3);
        assertThat(overview.activeApplications()).isEqualTo(3);
        assertThat(overview.catalogApplications()).isEqualTo(4);
        assertThat(overview.topApplications()).extracting(a -> a.name()).containsExactly("Mobile", "Web", "Dup");
    }

    @Test
    @DisplayName("la courbe globale additionne les API et n'a pas de trou : 24 points, les heures sans appel valent 0")
    void timelineIsSummedAndZeroFilled() {
        var timeline = service.overview("dev", Window.LAST_24H).timeline();

        assertThat(timeline).hasSize(24);
        assertThat(timeline.get(23).time()).isEqualTo(T11);
        assertThat(timeline.get(23).calls()).isEqualTo(900);
        assertThat(timeline.get(22).calls()).isEqualTo(300);
        assertThat(timeline.get(21).calls()).isEqualTo(100);
        assertThat(timeline.get(0).calls()).isZero();
        assertThat(timeline.get(0).time()).isEqualTo(T11.minusSeconds(23 * 3600));
    }

    @Test
    @DisplayName("des instants hors grille (changement d'heure) sont rendus tels quels, sans déformer la courbe")
    void irregularTimesAreLeftAlone() {
        WindowMetrics wm = new WindowMetrics(Totals.none(), List.of(), List.of(), List.of(),
                List.of(new ApiSeries(null, "Payments", "1.4", List.of(new TimePoint(T11, 5, 0),
                        new TimePoint(T11.minusSeconds(5400), 7, 1)))));
        metrics.recordSuccess("dev", new MetricsSnapshot(Map.of(Window.LAST_24H, wm)), NOW);

        assertThat(service.overview("dev", Window.LAST_24H).timeline()).extracting(p -> p.calls()).containsExactly(7L, 5L);
    }

    @Test
    @DisplayName("métriques d'une API : totaux, courbe et applications consommatrices triées par appels")
    void apiMetrics() {
        var result = service.apiMetrics("dev", "p14", Window.LAST_24H);

        assertThat(result.metrics().calls()).isEqualTo(1000);
        assertThat(result.timeline()).hasSize(24);
        assertThat(result.timeline().get(23).calls()).isEqualTo(600);
        assertThat(result.consumers()).extracting(c -> c.applicationName(), c -> c.applicationId(), c -> c.calls())
                .containsExactly(org.assertj.core.groups.Tuple.tuple("Mobile", "a1", 700L),
                        org.assertj.core.groups.Tuple.tuple("Web", "a2", 300L));
        assertThat(result.consumers().get(0).errorRate()).isEqualTo(30.0 / 700);
    }

    @Test
    @DisplayName("une API sans appel sur la période : pas de métriques, pas de courbe, pas de consommateur")
    void apiWithoutTraffic() {
        var quiet = new MetricsQueryService(metrics, catalog).apiMetrics("dev", "k10", Window.LAST_7D);

        assertThat(quiet.metrics()).isNull();
        assertThat(quiet.timeline()).isEmpty();
        assertThat(quiet.consumers()).isEmpty();
    }

    @Test
    @DisplayName("métriques d'une application : ses API triées par appels")
    void applicationMetrics() {
        var result = service.applicationMetrics("dev", "a1", Window.LAST_24H);

        assertThat(result.metrics().calls()).isEqualTo(900);
        assertThat(result.apis()).extracting(u -> u.apiName() + " " + u.apiVersion(), u -> u.apiId(), u -> u.calls())
                .containsExactly(org.assertj.core.groups.Tuple.tuple("Payments 1.4", "p14", 700L),
                        org.assertj.core.groups.Tuple.tuple("Payments 1.1", "p11", 200L));
    }

    @Test
    @DisplayName("statut : NEVER avant la première lecture, DISABLED sans source, ERROR avec les données précédentes")
    void statuses() {
        assertThat(service.overview("sim", Window.LAST_24H).status().state()).isEqualTo("DISABLED");
        assertThat(service.overview("sim", Window.LAST_24H).totals().calls()).isZero();

        MetricsStore fresh = new MetricsStore(new MetricsSources(List.of(metricsSource("dev"))));
        assertThat(new MetricsQueryService(fresh, catalog).overview("dev", Window.LAST_24H).status().state()).isEqualTo("NEVER");

        metrics.recordFailure("dev", "Splunk unreachable", NOW.plusSeconds(60));
        var afterFailure = service.overview("dev", Window.LAST_24H);
        assertThat(afterFailure.status().state()).isEqualTo("ERROR");
        assertThat(afterFailure.status().error()).isEqualTo("Splunk unreachable");
        assertThat(afterFailure.status().lastSuccessAt()).isEqualTo(NOW);
        assertThat(afterFailure.totals().calls()).isEqualTo(1310);
    }

    @Test
    @DisplayName("environnement, API ou application inconnus : 404")
    void unknownThings() {
        assertThatThrownBy(() -> service.overview("prod", Window.LAST_24H)).isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> service.apiMetrics("dev", "nope", Window.LAST_24H)).isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> service.applicationMetrics("dev", "nope", Window.LAST_24H)).isInstanceOf(NotFoundException.class);
    }
}
