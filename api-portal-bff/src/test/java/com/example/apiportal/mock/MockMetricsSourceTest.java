package com.example.apiportal.mock;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.example.apiportal.metrics.MetricsException;
import com.example.apiportal.metrics.MetricsModels.Window;
import com.example.apiportal.metrics.MetricsModels.WindowMetrics;
import com.example.apiportal.sync.CatalogSnapshot;
import com.example.apiportal.wso2.Wso2Models.ApplicationRef;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class MockMetricsSourceTest {

    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-01-14T10:37:00Z"), ZoneOffset.UTC);
    private final MockCatalog catalog = new MockCatalog();

    private WindowMetrics metrics(String environment, Window window) {
        return new MockMetricsSource(environment, catalog, CLOCK, false).fetch().of(window);
    }

    @Test
    @DisplayName("déterministe : deux lectures à la même heure donnent exactement le même résultat")
    void deterministic() {
        assertThat(metrics("exp", Window.LAST_24H)).isEqualTo(metrics("exp", Window.LAST_24H));
    }

    @Test
    @DisplayName("cohérence : les totaux sont la somme des API, des applications, des consommateurs et des courbes")
    void totalsAddUp() {
        for (Window window : Window.values()) {
            WindowMetrics wm = metrics("exp", window);

            long apiCalls = wm.apis().stream().mapToLong(a -> a.calls()).sum();
            assertThat(apiCalls).isPositive().isEqualTo(wm.totals().calls());
            assertThat(wm.consumers().stream().mapToLong(c -> c.calls()).sum()).isEqualTo(apiCalls);
            assertThat(wm.applications().stream().mapToLong(a -> a.calls()).sum()).isEqualTo(apiCalls);
            assertThat(wm.series().stream().flatMap(s -> s.points().stream()).mapToLong(p -> p.calls()).sum()).isEqualTo(apiCalls);
            assertThat(wm.apis().stream().mapToLong(a -> a.errors4xx()).sum()).isEqualTo(wm.totals().errors4xx());
            assertThat(wm.apis().stream().mapToLong(a -> a.errors5xx()).sum()).isEqualTo(wm.totals().errors5xx());
            assertThat(wm.apis()).allSatisfy(a -> {
                assertThat(a.errors4xx() + a.errors5xx()).isLessThanOrEqualTo(a.calls());
                assertThat(a.p95LatencyMs()).isGreaterThan(a.avgLatencyMs());
            });
            assertThat(wm.consumers()).allSatisfy(c -> assertThat(c.errors()).isLessThanOrEqualTo(c.calls()));
        }
    }

    @Test
    @DisplayName("chaque courbe couvre exactement la période, la dernière valeur étant l'heure ou le jour courant")
    void seriesCoverTheWindow() {
        WindowMetrics day = metrics("dev", Window.LAST_24H);
        WindowMetrics week = metrics("dev", Window.LAST_7D);

        assertThat(day.series()).isNotEmpty().allSatisfy(s -> assertThat(s.points()).hasSize(24));
        assertThat(week.series()).allSatisfy(s -> assertThat(s.points()).hasSize(7));
        var last = day.series().get(0).points().get(23).time();
        assertThat(last).isEqualTo(Instant.parse("2026-01-14T10:00:00Z"));
        assertThat(week.series().get(0).points().get(6).time()).isEqualTo(Instant.parse("2026-01-14T00:00:00Z"));
    }

    @Test
    @DisplayName("seules les API déployées et souscrites par une application active ont du trafic, et par elle seule")
    void onlyActiveSubscriptionsCall() {
        CatalogSnapshot snapshot = catalog.snapshotFor("exp");
        WindowMetrics wm = metrics("exp", Window.LAST_24H);

        Set<String> trafficApiIds = wm.apis().stream().map(a -> a.apiId()).collect(Collectors.toSet());
        for (var api : snapshot.apis()) {
            Set<String> active = snapshot.subscriptionsOf(api.id()).stream()
                    .filter(s -> "UNBLOCKED".equals(s.subscriptionStatus()))
                    .map(s -> s.applicationInfo().applicationId()).collect(Collectors.toSet());
            boolean deployed = !snapshot.revisionsOf(api.id()).isEmpty();
            assertThat(trafficApiIds.contains(api.id())).as(api.name() + " " + api.version())
                    .isEqualTo(deployed && !active.isEmpty());
            wm.consumers().stream().filter(c -> api.id().equals(c.apiId()))
                    .forEach(c -> assertThat(active).contains(c.applicationId()));
        }
        assertThat(snapshot.subscriptionsByApiId().values().stream().flatMap(l -> l.stream())
                .map(s -> s.applicationInfo()).map(ApplicationRef::applicationId)).isNotEmpty();
    }

    @Test
    @DisplayName("la production pèse bien plus que le développement")
    void productionIsBusierThanDevelopment() {
        assertThat(metrics("exp", Window.LAST_24H).totals().calls())
                .isGreaterThan(5 * metrics("dev", Window.LAST_24H).totals().calls());
    }

    @Test
    @DisplayName("une panne simulée échoue avec un message générique")
    void simulatedFailure() {
        assertThatThrownBy(() -> new MockMetricsSource("uat", catalog, CLOCK, true).fetch())
                .isInstanceOf(MetricsException.class).hasMessageContaining("simulated");
    }
}
