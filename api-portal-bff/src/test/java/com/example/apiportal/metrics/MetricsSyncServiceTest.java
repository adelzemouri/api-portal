package com.example.apiportal.metrics;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.apiportal.metrics.MetricsModels.ApiMetric;
import com.example.apiportal.metrics.MetricsModels.MetricsSnapshot;
import com.example.apiportal.metrics.MetricsModels.Totals;
import com.example.apiportal.metrics.MetricsModels.Window;
import com.example.apiportal.metrics.MetricsModels.WindowMetrics;
import com.example.apiportal.metrics.MetricsSources.MetricsSource;
import com.example.apiportal.metrics.MetricsStore.State;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class MetricsSyncServiceTest {

    private static final Instant NOW = Instant.parse("2026-01-01T10:00:00Z");
    private static final Clock CLOCK = Clock.fixed(NOW, ZoneOffset.UTC);

    private static MetricsSource source(String environment, Supplier<MetricsSnapshot> fetch) {
        return new MetricsSource() {
            public String environment() {
                return environment;
            }

            public MetricsSnapshot fetch() {
                return fetch.get();
            }
        };
    }

    private static MetricsSnapshot snapshotWithCalls(long calls) {
        return new MetricsSnapshot(Map.of(Window.LAST_24H, new WindowMetrics(new Totals(calls, 0, 0, 0, 0),
                List.of(new ApiMetric(null, "Payments", "1.4", calls, 0, 0, 10, 20)), List.of(), List.of(), List.of())));
    }

    @Test
    @DisplayName("un environnement lu avec succès passe à OK avec son instantané")
    void successRecordsTheSnapshot() {
        MetricsSources sources = new MetricsSources(List.of(source("dev", () -> snapshotWithCalls(5))));
        MetricsStore store = new MetricsStore(sources);
        assertThat(store.find("dev").orElseThrow().status().state()).isEqualTo(State.NEVER);

        new MetricsSyncService(sources, store, CLOCK).syncAll();

        var dev = store.find("dev").orElseThrow();
        assertThat(dev.status().state()).isEqualTo(State.OK);
        assertThat(dev.status().lastSuccessAt()).isEqualTo(NOW);
        assertThat(dev.snapshot().of(Window.LAST_24H).totals().calls()).isEqualTo(5);
    }

    @Test
    @DisplayName("l'échec d'un environnement n'affecte pas les autres, et son message reste générique")
    void failuresAreIsolatedAndSafe() {
        MetricsSources sources = new MetricsSources(List.of(
                source("dev", () -> snapshotWithCalls(5)),
                source("uat", () -> {
                    throw new MetricsException("Splunk unreachable");
                }),
                source("exp", () -> {
                    throw new IllegalStateException("boom: token=s3cr3t index=prod");
                })));
        MetricsStore store = new MetricsStore(sources);

        new MetricsSyncService(sources, store, CLOCK).syncAll();

        assertThat(store.find("dev").orElseThrow().status().state()).isEqualTo(State.OK);
        assertThat(store.find("uat").orElseThrow().status().errorMessage()).isEqualTo("Splunk unreachable");
        var exp = store.find("exp").orElseThrow().status();
        assertThat(exp.state()).isEqualTo(State.ERROR);
        assertThat(exp.errorMessage()).isEqualTo("Metrics unavailable").doesNotContain("s3cr3t");
    }

    @Test
    @DisplayName("après un échec, le dernier instantané valide et sa date sont conservés")
    void failureKeepsTheLastGoodSnapshot() {
        boolean[] fail = {false};
        MetricsSources sources = new MetricsSources(List.of(source("dev", () -> {
            if (fail[0]) {
                throw new MetricsException("Splunk answered HTTP 503");
            }
            return snapshotWithCalls(42);
        })));
        MetricsStore store = new MetricsStore(sources);
        MetricsSyncService service = new MetricsSyncService(sources, store, CLOCK);

        service.syncAll();
        fail[0] = true;
        service.syncAll();

        var dev = store.find("dev").orElseThrow();
        assertThat(dev.status().state()).isEqualTo(State.ERROR);
        assertThat(dev.status().lastSuccessAt()).isEqualTo(NOW);
        assertThat(dev.snapshot().of(Window.LAST_24H).totals().calls()).isEqualTo(42);
    }

    @Test
    @DisplayName("sans source configurée, rien ne se passe et le store est vide")
    void noSourcesNoWork() {
        MetricsStore store = new MetricsStore(MetricsSources.none());

        new MetricsSyncService(MetricsSources.none(), store, CLOCK).syncAll();

        assertThat(store.all()).isEmpty();
        assertThat(store.find("dev")).isEmpty();
    }
}
