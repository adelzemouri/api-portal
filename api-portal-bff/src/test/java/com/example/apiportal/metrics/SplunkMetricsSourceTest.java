package com.example.apiportal.metrics;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.apiportal.metrics.MetricsModels.MetricsSnapshot;
import com.example.apiportal.metrics.MetricsModels.Window;
import com.example.apiportal.metrics.MetricsModels.WindowMetrics;
import com.example.apiportal.metrics.MetricsProperties.Fields;
import com.example.apiportal.metrics.MetricsProperties.SplunkEnvironment;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SplunkMetricsSourceTest {

    private record Call(String spl, String earliest, String latest) {
    }

    private static final Fields DEFAULTS = new Fields("apiName", "apiVersion", null, "applicationName", null,
            "proxyResponseCode", "responseLatency");

    /** Faux Splunk : reconnaît chaque agrégation à sa clause BY et rend des lignes fixes. */
    private static final class FakeSplunk implements SplunkSearch {
        final List<Call> calls = new ArrayList<>();
        final Fields fields;

        FakeSplunk(Fields fields) {
            this.fields = fields;
        }

        @Override
        public List<Map<String, String>> search(String spl, String earliest, String latest) {
            calls.add(new Call(spl, earliest, latest));
            if (spl.contains("| bin _time")) {
                return List.of(
                        Map.of("_time", "2026-09-21T11:00:00.000+02:00", "apiName", "Payments", "apiVersion", "1.4", "calls", "10", "errors", "1"),
                        Map.of("_time", "2026-09-21T09:00:00.000+02:00", "apiName", "Payments", "apiVersion", "1.4", "calls", "30", "errors", "0"),
                        Map.of("_time", "not a date", "apiName", "Payments", "apiVersion", "1.4", "calls", "99", "errors", "9"));
            }
            if (!spl.contains(" by ")) {
                return List.of(Map.of("calls", "1000", "e4", "40", "e5", "10", "avg", "120.5", "p95", "480"));
            }
            if (spl.contains("apiName") && spl.contains("applicationName")) {
                return List.of(Map.of("apiName", "Payments", "apiVersion", "1.4", "applicationName", "Mobile", "calls", "700", "e4", "20", "e5", "5"));
            }
            if (spl.contains("apiName")) {
                return List.of(Map.of("apiName", "Payments", "apiVersion", "1.4", "calls", "1000", "e4", "40", "e5", "10", "avg", "120.5", "p95", "480"));
            }
            return List.of(Map.of("applicationName", "Mobile", "calls", "700", "e4", "20", "e5", "5"));
        }
    }

    @Test
    @DisplayName("cinq recherches par période, avec les bornes de temps de la période et l'index configuré")
    void runsFiveSearchesPerWindow() {
        FakeSplunk splunk = new FakeSplunk(DEFAULTS);
        new SplunkMetricsSource("dev", new SplunkEnvironment("wso2_dev", "sourcetype=\"wso2:apim\""), DEFAULTS, splunk).fetch();

        assertThat(splunk.calls).hasSize(10);
        assertThat(splunk.calls.subList(0, 5)).allSatisfy(c -> {
            assertThat(c.earliest()).isEqualTo("-24h@h");
            assertThat(c.latest()).isEqualTo("now");
            assertThat(c.spl()).startsWith("search index=\"wso2_dev\" sourcetype=\"wso2:apim\" | eval st=tonumber('proxyResponseCode'), lat=tonumber('responseLatency')");
        });
        assertThat(splunk.calls.subList(5, 10)).allSatisfy(c -> assertThat(c.earliest()).isEqualTo("-7d@d"));
        assertThat(splunk.calls.get(4).spl()).contains("bin _time span=1h");
        assertThat(splunk.calls.get(9).spl()).contains("bin _time span=1d");
    }

    @Test
    @DisplayName("sans identifiants configurés, on n'agrège que sur les noms (un champ absent ferait perdre des lignes)")
    void aggregatesOnNamesByDefault() {
        FakeSplunk splunk = new FakeSplunk(DEFAULTS);
        new SplunkMetricsSource("dev", new SplunkEnvironment("idx", ""), DEFAULTS, splunk).fetch();

        assertThat(splunk.calls).noneSatisfy(c -> assertThat(c.spl()).contains("apiId").contains("applicationId"));
        assertThat(splunk.calls.get(1).spl()).contains(" by apiName, apiVersion | sort - calls | head 2000");
        assertThat(splunk.calls.get(2).spl()).contains(" by applicationName | sort - calls");
        assertThat(splunk.calls.get(3).spl()).contains(" by apiName, apiVersion, applicationName | sort - calls");
    }

    @Test
    @DisplayName("avec des identifiants configurés, on agrège aussi dessus et on les remonte")
    void aggregatesOnIdentifiersWhenConfigured() {
        Fields withIds = new Fields("apiName", "apiVersion", "apiId", "applicationName", "applicationId",
                "proxyResponseCode", "responseLatency");
        List<Call> calls = new ArrayList<>();
        SplunkSearch splunk = (spl, earliest, latest) -> {
            calls.add(new Call(spl, earliest, latest));
            return spl.contains(" by apiId, apiName, apiVersion | sort")
                    ? List.of(Map.of("apiId", "uuid-1", "apiName", "Payments", "apiVersion", "1.4", "calls", "5"))
                    : List.of();
        };

        MetricsSnapshot snapshot = new SplunkMetricsSource("dev", new SplunkEnvironment("idx", ""), withIds, splunk).fetch();

        assertThat(calls.get(2).spl()).contains(" by applicationId, applicationName");
        assertThat(calls.get(3).spl()).contains(" by apiId, apiName, apiVersion, applicationId, applicationName");
        assertThat(snapshot.of(Window.LAST_24H).apis()).singleElement()
                .satisfies(api -> assertThat(api.apiId()).isEqualTo("uuid-1"));
    }

    @Test
    @DisplayName("les lignes sont converties : nombres lus dans le texte, erreurs cumulées pour les applications")
    void mapsRowsToMetrics() {
        FakeSplunk splunk = new FakeSplunk(DEFAULTS);
        WindowMetrics wm = new SplunkMetricsSource("dev", new SplunkEnvironment("idx", ""), DEFAULTS, splunk)
                .fetch().of(Window.LAST_24H);

        assertThat(wm.totals().calls()).isEqualTo(1000);
        assertThat(wm.totals().errors4xx()).isEqualTo(40);
        assertThat(wm.totals().avgLatencyMs()).isEqualTo(120.5);
        assertThat(wm.totals().p95LatencyMs()).isEqualTo(480);
        assertThat(wm.apis()).singleElement().satisfies(api -> {
            assertThat(api.name()).isEqualTo("Payments");
            assertThat(api.version()).isEqualTo("1.4");
            assertThat(api.apiId()).isNull();
            assertThat(api.errors5xx()).isEqualTo(10);
        });
        assertThat(wm.applications()).singleElement().satisfies(app -> {
            assertThat(app.name()).isEqualTo("Mobile");
            assertThat(app.errors()).isEqualTo(25);
        });
        assertThat(wm.consumers()).singleElement().satisfies(c -> {
            assertThat(c.apiName()).isEqualTo("Payments");
            assertThat(c.applicationName()).isEqualTo("Mobile");
            assertThat(c.calls()).isEqualTo(700);
        });
    }

    @Test
    @DisplayName("la courbe d'une API est triée par temps, l'heure Splunk avec décalage est ramenée à UTC, la ligne illisible ignorée")
    void seriesAreSortedAndTolerant() {
        FakeSplunk splunk = new FakeSplunk(DEFAULTS);
        WindowMetrics wm = new SplunkMetricsSource("dev", new SplunkEnvironment("idx", ""), DEFAULTS, splunk)
                .fetch().of(Window.LAST_24H);

        assertThat(wm.series()).singleElement().satisfies(series -> {
            assertThat(series.apiName()).isEqualTo("Payments");
            assertThat(series.points()).extracting(p -> p.time(), p -> p.calls()).containsExactly(
                    org.assertj.core.groups.Tuple.tuple(Instant.parse("2026-09-21T07:00:00Z"), 30L),
                    org.assertj.core.groups.Tuple.tuple(Instant.parse("2026-09-21T09:00:00Z"), 10L));
        });
    }

    @Test
    @DisplayName("aucune donnée : des listes vides et des totaux à zéro, pas d'erreur")
    void emptyResults() {
        SplunkSearch empty = (spl, earliest, latest) -> List.of();

        WindowMetrics wm = new SplunkMetricsSource("dev", new SplunkEnvironment("idx", ""), DEFAULTS, empty)
                .fetch().of(Window.LAST_7D);

        assertThat(wm.totals().calls()).isZero();
        assertThat(wm.apis()).isEmpty();
        assertThat(wm.series()).isEmpty();
    }

    @Test
    @DisplayName("une valeur illisible ou absente vaut 0")
    void badNumbersAreZero() {
        SplunkSearch odd = (spl, earliest, latest) -> spl.contains(" by ") ? List.of() : List.of(Map.of("calls", "abc", "avg", "NaN"));

        WindowMetrics wm = new SplunkMetricsSource("dev", new SplunkEnvironment("idx", ""), DEFAULTS, odd)
                .fetch().of(Window.LAST_24H);

        assertThat(wm.totals().calls()).isZero();
        assertThat(wm.totals().avgLatencyMs()).isZero();
    }
}
