package com.example.apiportal.metrics;

import com.example.apiportal.metrics.MetricsModels.ApiMetric;
import com.example.apiportal.metrics.MetricsModels.ApiSeries;
import com.example.apiportal.metrics.MetricsModels.AppMetric;
import com.example.apiportal.metrics.MetricsModels.ConsumerMetric;
import com.example.apiportal.metrics.MetricsModels.MetricsSnapshot;
import com.example.apiportal.metrics.MetricsModels.TimePoint;
import com.example.apiportal.metrics.MetricsModels.Totals;
import com.example.apiportal.metrics.MetricsModels.Window;
import com.example.apiportal.metrics.MetricsModels.WindowMetrics;
import com.example.apiportal.metrics.MetricsProperties.Fields;
import com.example.apiportal.metrics.MetricsProperties.SplunkEnvironment;
import com.example.apiportal.metrics.MetricsSources.MetricsSource;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Stream;

/**
 * Métriques d'un environnement lues dans Splunk : cinq agrégations par période (totaux, par API, par application,
 * API × application, courbe par API). Les requêtes sont construites uniquement à partir de la configuration validée.
 */
public class SplunkMetricsSource implements MetricsSource {

    private static final int MAX_API_ROWS = 2000;
    private static final int MAX_CONSUMER_ROWS = 5000;
    private static final int MAX_SERIES_ROWS = 20000;

    private final String environment;
    private final SplunkEnvironment index;
    private final Fields fields;
    private final SplunkSearch splunk;

    public SplunkMetricsSource(String environment, SplunkEnvironment index, Fields fields, SplunkSearch splunk) {
        this.environment = environment;
        this.index = index;
        this.fields = fields;
        this.splunk = splunk;
    }

    @Override
    public String environment() {
        return environment;
    }

    @Override
    public MetricsSnapshot fetch() {
        Map<Window, WindowMetrics> windows = new EnumMap<>(Window.class);
        for (Window window : Window.values()) {
            windows.put(window, fetch(window));
        }
        return new MetricsSnapshot(windows);
    }

    private WindowMetrics fetch(Window window) {
        List<Map<String, String>> totalRows = run(window, stats(""));
        Totals totals = totalRows.isEmpty() ? Totals.none() : totals(totalRows.get(0));

        List<ApiMetric> apis = run(window, stats(by(apiKey())) + " | sort - calls | head " + MAX_API_ROWS)
                .stream().map(this::apiMetric).toList();
        List<AppMetric> apps = run(window, stats(by(appKey())) + " | sort - calls | head " + MAX_API_ROWS)
                .stream().map(this::appMetric).toList();
        List<ConsumerMetric> consumers = run(window,
                stats(by(Stream.concat(apiKey().stream(), appKey().stream()).toList()))
                        + " | sort - calls | head " + MAX_CONSUMER_ROWS)
                .stream().map(this::consumer).toList();
        List<ApiSeries> series = series(run(window, "| bin _time span=" + window.span()
                + " | stats count as calls, sum(eval(if(st>=400,1,0))) as errors by _time, "
                + String.join(", ", apiKey()) + " | head " + MAX_SERIES_ROWS));
        return new WindowMetrics(totals, apis, apps, consumers, series);
    }

    private List<Map<String, String>> run(Window window, String pipeline) {
        return splunk.search(base() + " " + pipeline, window.earliest(), "now");
    }

    /** Sélection de l'index et calcul des champs numériques. Les noms de champ sont validés (identifiants seuls). */
    String base() {
        return "search index=\"" + index.index() + "\" " + index.filter()
                + " | eval st=tonumber('" + fields.status() + "'), lat=tonumber('" + fields.latency() + "')";
    }

    private static String stats(String by) {
        return "| stats count as calls, sum(eval(if(st>=400 AND st<500,1,0))) as e4, "
                + "sum(eval(if(st>=500,1,0))) as e5, avg(lat) as avg, perc95(lat) as p95" + by;
    }

    private static String by(List<String> keys) {
        return " by " + String.join(", ", keys);
    }

    private List<String> apiKey() {
        List<String> keys = new ArrayList<>();
        if (fields.apiId() != null && !fields.apiId().isBlank()) {
            keys.add(fields.apiId());
        }
        keys.add(fields.apiName());
        keys.add(fields.apiVersion());
        return keys;
    }

    private List<String> appKey() {
        List<String> keys = new ArrayList<>();
        if (fields.applicationId() != null && !fields.applicationId().isBlank()) {
            keys.add(fields.applicationId());
        }
        keys.add(fields.applicationName());
        return keys;
    }

    private Totals totals(Map<String, String> row) {
        return new Totals(count(row, "calls"), count(row, "e4"), count(row, "e5"), number(row, "avg"), number(row, "p95"));
    }

    private ApiMetric apiMetric(Map<String, String> row) {
        return new ApiMetric(optional(row, fields.apiId()), row.getOrDefault(fields.apiName(), ""),
                row.getOrDefault(fields.apiVersion(), ""), count(row, "calls"), count(row, "e4"), count(row, "e5"),
                number(row, "avg"), number(row, "p95"));
    }

    private AppMetric appMetric(Map<String, String> row) {
        return new AppMetric(optional(row, fields.applicationId()), row.getOrDefault(fields.applicationName(), ""),
                count(row, "calls"), count(row, "e4") + count(row, "e5"));
    }

    private ConsumerMetric consumer(Map<String, String> row) {
        return new ConsumerMetric(optional(row, fields.apiId()), row.getOrDefault(fields.apiName(), ""),
                row.getOrDefault(fields.apiVersion(), ""), optional(row, fields.applicationId()),
                row.getOrDefault(fields.applicationName(), ""), count(row, "calls"), count(row, "e4") + count(row, "e5"));
    }

    /** Regroupe les lignes (temps × API) en une courbe par API, triée par temps. Les lignes illisibles sont ignorées. */
    private List<ApiSeries> series(List<Map<String, String>> rows) {
        Map<List<String>, List<TimePoint>> byApi = new LinkedHashMap<>();
        Map<List<String>, String[]> identity = new LinkedHashMap<>();
        for (Map<String, String> row : rows) {
            TimePoint point = point(row);
            if (point == null) {
                continue;
            }
            List<String> key = List.of(Objects.requireNonNullElse(optional(row, fields.apiId()), ""),
                    row.getOrDefault(fields.apiName(), ""), row.getOrDefault(fields.apiVersion(), ""));
            byApi.computeIfAbsent(key, k -> new ArrayList<>()).add(point);
            identity.putIfAbsent(key, new String[] {optional(row, fields.apiId()), key.get(1), key.get(2)});
        }
        List<ApiSeries> result = new ArrayList<>();
        byApi.forEach((key, points) -> {
            points.sort(Comparator.comparing(TimePoint::time));
            String[] id = identity.get(key);
            result.add(new ApiSeries(id[0], id[1], id[2], points));
        });
        return result;
    }

    private static TimePoint point(Map<String, String> row) {
        try {
            return new TimePoint(OffsetDateTime.parse(row.get("_time")).toInstant(), count(row, "calls"), count(row, "errors"));
        } catch (DateTimeParseException | NullPointerException e) {
            return null;
        }
    }

    private static String optional(Map<String, String> row, String field) {
        if (field == null || field.isBlank()) {
            return null;
        }
        String value = row.get(field);
        return value == null || value.isBlank() ? null : value;
    }

    private static long count(Map<String, String> row, String key) {
        return (long) number(row, key);
    }

    /** Splunk renvoie tout en texte ; une valeur absente ou illisible vaut 0. */
    private static double number(Map<String, String> row, String key) {
        String value = row.get(key);
        if (value == null || value.isBlank()) {
            return 0;
        }
        try {
            double parsed = Double.parseDouble(value);
            return Double.isFinite(parsed) ? parsed : 0;
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}
