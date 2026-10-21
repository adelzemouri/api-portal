package com.example.apiportal.api;

import com.example.apiportal.api.MetricsDtos.ApiMetricDto;
import com.example.apiportal.api.MetricsDtos.ApiMetricsDto;
import com.example.apiportal.api.MetricsDtos.ApiMetricsListDto;
import com.example.apiportal.api.MetricsDtos.AppMetricDto;
import com.example.apiportal.api.MetricsDtos.AppMetricsListDto;
import com.example.apiportal.api.MetricsDtos.ApplicationMetricsDto;
import com.example.apiportal.api.MetricsDtos.MetricsOverviewDto;
import com.example.apiportal.api.MetricsDtos.MetricsStatusDto;
import com.example.apiportal.api.MetricsDtos.TimePointDto;
import com.example.apiportal.api.MetricsDtos.TotalsDto;
import com.example.apiportal.api.MetricsDtos.UsageDto;
import com.example.apiportal.metrics.MetricsModels.ApiMetric;
import com.example.apiportal.metrics.MetricsModels.ApiSeries;
import com.example.apiportal.metrics.MetricsModels.AppMetric;
import com.example.apiportal.metrics.MetricsModels.ConsumerMetric;
import com.example.apiportal.metrics.MetricsModels.TimePoint;
import com.example.apiportal.metrics.MetricsModels.Window;
import com.example.apiportal.metrics.MetricsModels.WindowMetrics;
import com.example.apiportal.metrics.MetricsStore;
import com.example.apiportal.metrics.MetricsStore.EnvironmentMetrics;
import com.example.apiportal.sync.CatalogSnapshot;
import com.example.apiportal.sync.SnapshotStore;
import com.example.apiportal.wso2.Wso2Models.ApiSummary;
import com.example.apiportal.wso2.Wso2Models.ApplicationSummary;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import org.springframework.stereotype.Service;

/**
 * Construit les vues de métriques en rapprochant les lignes lues dans Splunk du catalogue synchronisé (par identifiant
 * quand la source en porte, sinon par nom et version). Lit uniquement les stores : aucune requête Splunk ni WSO2 ici.
 */
@Service
public class MetricsQueryService {

    /** Sous ce volume d'appels, un taux d'erreur ou une latence n'a pas de sens : la ligne n'entre pas dans les classements. */
    static final long MIN_CALLS_FOR_RANKING = 20;
    private static final int RANKING_SIZE = 10;
    private static final int CONSUMERS_SIZE = 20;

    private final MetricsStore metrics;
    private final SnapshotStore catalog;

    public MetricsQueryService(MetricsStore metrics, SnapshotStore catalog) {
        this.metrics = metrics;
        this.catalog = catalog;
    }

    public MetricsOverviewDto overview(String environment, Window window) {
        CatalogSnapshot snapshot = catalogOf(environment);
        Resolver resolver = new Resolver(snapshot);
        WindowMetrics wm = windowOf(environment, window);

        List<ApiMetricDto> apis = wm.apis().stream().map(resolver::api).toList();
        List<ApiMetricDto> top = apis.stream()
                .sorted(Comparator.comparingLong(ApiMetricDto::calls).reversed()).limit(RANKING_SIZE).toList();
        List<ApiMetricDto> ranked = apis.stream().filter(a -> a.calls() >= MIN_CALLS_FOR_RANKING).toList();
        List<ApiMetricDto> errors = ranked.stream().filter(a -> a.errors4xx() + a.errors5xx() > 0)
                .sorted(Comparator.comparingDouble(ApiMetricDto::errorRate).reversed()).limit(RANKING_SIZE).toList();
        List<ApiMetricDto> slowest = ranked.stream()
                .sorted(Comparator.comparingDouble(ApiMetricDto::p95LatencyMs).reversed()).limit(RANKING_SIZE).toList();
        List<AppMetricDto> apps = wm.applications().stream().map(resolver::app)
                .sorted(Comparator.comparingLong(AppMetricDto::calls).reversed()).limit(RANKING_SIZE).toList();

        var totals = wm.totals();
        long errorCount = totals.errors4xx() + totals.errors5xx();
        return new MetricsOverviewDto(window.key(), status(environment),
                new TotalsDto(totals.calls(), totals.errors4xx(), totals.errors5xx(), rate(errorCount, totals.calls()),
                        totals.avgLatencyMs(), totals.p95LatencyMs()),
                timeline(sum(wm.series().stream().flatMap(s -> s.points().stream()).toList()), window),
                top, errors, slowest, apps,
                (int) apis.stream().filter(a -> a.calls() > 0).count(), snapshot.apis().size(),
                (int) wm.applications().stream().filter(a -> a.calls() > 0).count(), snapshot.applications().size());
    }

    /** Toutes les API avec trafic sur la période, pour les colonnes des listes. */
    public ApiMetricsListDto apis(String environment, Window window) {
        Resolver resolver = new Resolver(catalogOf(environment));
        return new ApiMetricsListDto(window.key(), status(environment),
                windowOf(environment, window).apis().stream().map(resolver::api).toList());
    }

    public AppMetricsListDto applications(String environment, Window window) {
        Resolver resolver = new Resolver(catalogOf(environment));
        return new AppMetricsListDto(window.key(), status(environment),
                windowOf(environment, window).applications().stream().map(resolver::app).toList());
    }

    public ApiMetricsDto apiMetrics(String environment, String apiId, Window window) {
        CatalogSnapshot snapshot = catalogOf(environment);
        ApiSummary api = snapshot.apis().stream().filter(a -> Objects.equals(a.id(), apiId)).findFirst()
                .orElseThrow(() -> new NotFoundException("unknown api"));
        Resolver resolver = new Resolver(snapshot);
        WindowMetrics wm = windowOf(environment, window);

        ApiMetricDto own = wm.apis().stream().filter(m -> resolver.matches(api, m.apiId(), m.name(), m.version()))
                .findFirst().map(resolver::api).orElse(null);
        List<TimePoint> points = wm.series().stream()
                .filter(s -> resolver.matches(api, s.apiId(), s.apiName(), s.apiVersion()))
                .flatMap(s -> s.points().stream()).toList();
        List<UsageDto> consumers = wm.consumers().stream()
                .filter(c -> resolver.matches(api, c.apiId(), c.apiName(), c.apiVersion()))
                .map(resolver::usage)
                .sorted(Comparator.comparingLong(UsageDto::calls).reversed()).limit(CONSUMERS_SIZE).toList();
        return new ApiMetricsDto(window.key(), status(environment), own, timeline(sum(points), window), consumers);
    }

    public ApplicationMetricsDto applicationMetrics(String environment, String applicationId, Window window) {
        CatalogSnapshot snapshot = catalogOf(environment);
        ApplicationSummary app = snapshot.applications().stream()
                .filter(a -> Objects.equals(a.applicationId(), applicationId)).findFirst()
                .orElseThrow(() -> new NotFoundException("unknown application"));
        Resolver resolver = new Resolver(snapshot);
        WindowMetrics wm = windowOf(environment, window);

        AppMetricDto own = wm.applications().stream().filter(m -> resolver.matches(app, m.applicationId(), m.name()))
                .findFirst().map(resolver::app).orElse(null);
        List<UsageDto> apis = wm.consumers().stream()
                .filter(c -> resolver.matches(app, c.applicationId(), c.applicationName()))
                .map(resolver::usage)
                .sorted(Comparator.comparingLong(UsageDto::calls).reversed()).toList();
        return new ApplicationMetricsDto(window.key(), status(environment), own, apis);
    }

    private CatalogSnapshot catalogOf(String environment) {
        return catalog.find(environment).orElseThrow(() -> new NotFoundException("unknown environment")).snapshot();
    }

    private WindowMetrics windowOf(String environment, Window window) {
        return metrics.find(environment).map(m -> m.snapshot().of(window)).orElse(WindowMetrics.empty());
    }

    private MetricsStatusDto status(String environment) {
        return metrics.find(environment)
                .map((EnvironmentMetrics m) -> new MetricsStatusDto(m.status().state().name(),
                        m.status().lastSuccessAt(), m.status().errorMessage()))
                .orElse(new MetricsStatusDto("DISABLED", null, null));
    }

    static double rate(long errors, long calls) {
        return calls == 0 ? 0 : (double) errors / calls;
    }

    /** Additionne les points de même instant (toutes API confondues). */
    private static Map<Instant, long[]> sum(List<TimePoint> points) {
        Map<Instant, long[]> byTime = new TreeMap<>();
        points.forEach(p -> byTime.merge(p.time(), new long[] {p.calls(), p.errors()},
                (a, b) -> new long[] {a[0] + b[0], a[1] + b[1]}));
        return byTime;
    }

    /**
     * Courbe sans trou : les périodes sans appel valent 0, et l'axe couvre toute la période. Si les instants ne tombent
     * pas sur une grille régulière (changement d'heure), on rend les points tels quels plutôt que de les déformer.
     */
    static List<TimePointDto> timeline(Map<Instant, long[]> byTime, Window window) {
        if (byTime.isEmpty()) {
            return List.of();
        }
        Duration step = window == Window.LAST_24H ? Duration.ofHours(1) : Duration.ofDays(1);
        Instant first = byTime.keySet().iterator().next();
        Instant last = ((TreeMap<Instant, long[]>) byTime).lastKey();
        boolean regular = byTime.keySet().stream()
                .allMatch(t -> Duration.between(first, t).toMillis() % step.toMillis() == 0);
        if (!regular) {
            List<TimePointDto> raw = new ArrayList<>();
            byTime.forEach((t, v) -> raw.add(new TimePointDto(t, v[0], v[1])));
            return raw;
        }
        Instant start = first;
        while (Duration.between(start, last).dividedBy(step) < window.buckets() - 1) {
            start = start.minus(step);
        }
        List<TimePointDto> points = new ArrayList<>();
        for (Instant t = start; !t.isAfter(last); t = t.plus(step)) {
            long[] v = byTime.getOrDefault(t, new long[] {0, 0});
            points.add(new TimePointDto(t, v[0], v[1]));
        }
        return points;
    }

    /** Rapproche une ligne de métrique d'une API ou d'une application du catalogue. */
    private static final class Resolver {
        private final CatalogSnapshot snapshot;
        private final Map<String, Long> appNameCount = new java.util.HashMap<>();

        Resolver(CatalogSnapshot snapshot) {
            this.snapshot = snapshot;
            snapshot.applications().forEach(a -> appNameCount.merge(lower(a.name()), 1L, Long::sum));
        }

        boolean matches(ApiSummary api, String metricId, String name, String version) {
            if (metricId != null && !metricId.isBlank()) {
                return metricId.equals(api.id());
            }
            return lower(name).equals(lower(api.name())) && Objects.equals(version, api.version());
        }

        /** Par identifiant quand la source en porte un ; par nom seulement s'il est unique dans l'environnement. */
        boolean matches(ApplicationSummary app, String metricId, String name) {
            if (metricId != null && !metricId.isBlank()) {
                return metricId.equals(app.applicationId());
            }
            return lower(name).equals(lower(app.name())) && appNameCount.getOrDefault(lower(app.name()), 0L) == 1;
        }

        ApiSummary findApi(String metricId, String name, String version) {
            return snapshot.apis().stream().filter(a -> matches(a, metricId, name, version)).findFirst().orElse(null);
        }

        ApplicationSummary findApp(String metricId, String name) {
            return snapshot.applications().stream().filter(a -> matches(a, metricId, name)).findFirst().orElse(null);
        }

        ApiMetricDto api(ApiMetric m) {
            ApiSummary api = findApi(m.apiId(), m.name(), m.version());
            long errors = m.errors4xx() + m.errors5xx();
            return new ApiMetricDto(api == null ? null : api.id(), m.name(), m.version(), m.calls(), m.errors4xx(),
                    m.errors5xx(), rate(errors, m.calls()), m.avgLatencyMs(), m.p95LatencyMs());
        }

        AppMetricDto app(AppMetric m) {
            ApplicationSummary app = findApp(m.applicationId(), m.name());
            return new AppMetricDto(app == null ? null : app.applicationId(), m.name(), m.calls(), m.errors(),
                    rate(m.errors(), m.calls()));
        }

        UsageDto usage(ConsumerMetric c) {
            ApiSummary api = findApi(c.apiId(), c.apiName(), c.apiVersion());
            ApplicationSummary app = findApp(c.applicationId(), c.applicationName());
            return new UsageDto(api == null ? null : api.id(), c.apiName(), c.apiVersion(),
                    app == null ? null : app.applicationId(), c.applicationName(), c.calls(), c.errors(),
                    rate(c.errors(), c.calls()));
        }

        private static String lower(String value) {
            return value == null ? "" : value.toLowerCase(Locale.ROOT);
        }
    }
}
