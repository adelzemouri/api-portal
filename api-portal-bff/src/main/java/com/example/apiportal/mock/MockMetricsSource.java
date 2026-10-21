package com.example.apiportal.mock;

import com.example.apiportal.metrics.MetricsException;
import com.example.apiportal.metrics.MetricsModels.ApiMetric;
import com.example.apiportal.metrics.MetricsModels.ApiSeries;
import com.example.apiportal.metrics.MetricsModels.AppMetric;
import com.example.apiportal.metrics.MetricsModels.ConsumerMetric;
import com.example.apiportal.metrics.MetricsModels.MetricsSnapshot;
import com.example.apiportal.metrics.MetricsModels.TimePoint;
import com.example.apiportal.metrics.MetricsModels.Totals;
import com.example.apiportal.metrics.MetricsModels.Window;
import com.example.apiportal.metrics.MetricsModels.WindowMetrics;
import com.example.apiportal.metrics.MetricsSources.MetricsSource;
import com.example.apiportal.sync.CatalogSnapshot;
import com.example.apiportal.wso2.Wso2Models.ApiSummary;
import com.example.apiportal.wso2.Wso2Models.ApplicationRef;
import com.example.apiportal.wso2.Wso2Models.Subscription;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Métriques factices, déterministes à l'horloge près (aucun aléa) et cohérentes avec le catalogue factice : seules les
 * API déployées et souscrites par une application active ont du trafic ; les appels d'une API se répartissent entre
 * ses applications, et les totaux sont les sommes des lignes. Le volume dépend de l'environnement (EXP ≫ DEV).
 */
final class MockMetricsSource implements MetricsSource {

    private static final Map<String, Integer> ENV_SCALE = Map.of("dev", 1, "sim", 4, "uat", 6, "exp", 40);

    private final String environment;
    private final MockCatalog catalog;
    private final Clock clock;
    private final boolean failing;

    MockMetricsSource(String environment, MockCatalog catalog, Clock clock, boolean failing) {
        this.environment = environment;
        this.catalog = catalog;
        this.clock = clock;
        this.failing = failing;
    }

    @Override
    public String environment() {
        return environment;
    }

    @Override
    public MetricsSnapshot fetch() {
        if (failing) {
            throw new MetricsException("Splunk unreachable (simulated)");
        }
        CatalogSnapshot snapshot = catalog.snapshotFor(environment);
        Map<Window, WindowMetrics> windows = new EnumMap<>(Window.class);
        for (Window window : Window.values()) {
            windows.put(window, build(window, snapshot));
        }
        return new MetricsSnapshot(windows);
    }

    private WindowMetrics build(Window window, CatalogSnapshot snapshot) {
        boolean hourly = window == Window.LAST_24H;
        ChronoUnit unit = hourly ? ChronoUnit.HOURS : ChronoUnit.DAYS;
        Instant end = clock.instant().truncatedTo(unit);

        List<ApiMetric> apis = new ArrayList<>();
        List<ApiSeries> series = new ArrayList<>();
        List<ConsumerMetric> consumers = new ArrayList<>();
        Map<String, long[]> apps = new LinkedHashMap<>();
        Map<String, String> appNames = new LinkedHashMap<>();
        long calls = 0;
        long e4Total = 0;
        long e5Total = 0;
        double latencySum = 0;
        double p95Sum = 0;

        for (ApiSummary api : snapshot.apis()) {
            List<ApplicationRef> active = activeConsumers(snapshot, api);
            if (active.isEmpty()) {
                continue;
            }
            int hash = Math.abs((environment + api.name() + api.version()).hashCode() % 100_000);
            long base = (1 + hash % 40L) * ENV_SCALE.getOrDefault(environment, 1) * (hourly ? 1 : 14);

            List<TimePoint> points = new ArrayList<>();
            long apiCalls = 0;
            long apiErrors = 0;
            double rate4 = (hash % 50) / 1000.0;
            double rate5 = ((hash / 7) % 15) / 1000.0;
            for (int i = window.buckets() - 1; i >= 0; i--) {
                Instant time = end.minus(i, unit);
                long bucketCalls = Math.round(base * curve(time, hourly));
                long bucketErrors = Math.round(bucketCalls * (rate4 + rate5));
                points.add(new TimePoint(time, bucketCalls, bucketErrors));
                apiCalls += bucketCalls;
                apiErrors += bucketErrors;
            }
            if (apiCalls == 0) {
                continue;
            }
            long e5 = rate4 + rate5 == 0 ? 0 : Math.round(apiErrors * rate5 / (rate4 + rate5));
            long e4 = apiErrors - e5;
            double avg = 30 + hash % 300;
            double p95 = avg * (2.2 + (hash % 10) / 10.0);

            apis.add(new ApiMetric(api.id(), api.name(), api.version(), apiCalls, e4, e5, avg, p95));
            series.add(new ApiSeries(api.id(), api.name(), api.version(), points));
            calls += apiCalls;
            e4Total += e4;
            e5Total += e5;
            latencySum += avg * apiCalls;
            p95Sum += p95 * apiCalls;

            split(api, active, apiCalls, apiErrors).forEach(consumer -> {
                consumers.add(consumer);
                apps.merge(consumer.applicationId(), new long[] {consumer.calls(), consumer.errors()},
                        (a, b) -> new long[] {a[0] + b[0], a[1] + b[1]});
                appNames.put(consumer.applicationId(), consumer.applicationName());
            });
        }

        List<AppMetric> applications = new ArrayList<>();
        apps.forEach((id, values) -> applications.add(new AppMetric(id, appNames.get(id), values[0], values[1])));
        applications.sort((a, b) -> Long.compare(b.calls(), a.calls()));
        apis.sort((a, b) -> Long.compare(b.calls(), a.calls()));

        Totals totals = calls == 0 ? Totals.none()
                : new Totals(calls, e4Total, e5Total, latencySum / calls, p95Sum / calls);
        return new WindowMetrics(totals, apis, applications, consumers, series);
    }

    /** Applications dont la souscription à l'API est active (les autres n'appellent pas). */
    private static List<ApplicationRef> activeConsumers(CatalogSnapshot snapshot, ApiSummary api) {
        if (snapshot.revisionsOf(api.id()).isEmpty()) {
            return List.of();
        }
        return snapshot.subscriptionsOf(api.id()).stream()
                .filter(s -> "UNBLOCKED".equals(s.subscriptionStatus()))
                .map(Subscription::applicationInfo)
                .toList();
    }

    /** Répartit appels et erreurs d'une API entre ses applications ; la dernière reçoit le reste (somme exacte). */
    private List<ConsumerMetric> split(ApiSummary api, List<ApplicationRef> apps, long calls, long errors) {
        int[] weights = apps.stream().mapToInt(a -> 1 + Math.abs((a.name() + api.name()).hashCode() % 9)).toArray();
        int totalWeight = java.util.Arrays.stream(weights).sum();
        List<ConsumerMetric> result = new ArrayList<>();
        long callsLeft = calls;
        long errorsLeft = errors;
        for (int i = 0; i < apps.size(); i++) {
            boolean last = i == apps.size() - 1;
            long c = last ? callsLeft : Math.round((double) calls * weights[i] / totalWeight);
            long e = last ? errorsLeft : Math.min(c, Math.round((double) errors * weights[i] / totalWeight));
            c = Math.min(c, callsLeft);
            e = Math.min(e, errorsLeft);
            callsLeft -= c;
            errorsLeft -= e;
            result.add(new ConsumerMetric(api.id(), api.name(), api.version(), apps.get(i).applicationId(),
                    apps.get(i).name(), c, e));
        }
        return result;
    }

    /** Profil de charge : creux la nuit, pic en journée ; les jours de week-end pèsent moins. */
    private static double curve(Instant time, boolean hourly) {
        var at = time.atZone(ZoneOffset.UTC);
        if (hourly) {
            return 0.25 + 0.75 * Math.max(0, Math.sin(Math.PI * (at.getHour() - 5) / 15.0));
        }
        DayOfWeek day = at.getDayOfWeek();
        return day == DayOfWeek.SATURDAY || day == DayOfWeek.SUNDAY ? 0.35 : 1.0;
    }
}
