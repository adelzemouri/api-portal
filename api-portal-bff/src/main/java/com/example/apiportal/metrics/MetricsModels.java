package com.example.apiportal.metrics;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Modèle interne des métriques de trafic (lues dans Splunk, ou factices en profil « mock »). Ne contient que
 * des compteurs et des noms d'API ou d'application : jamais d'utilisateur final, d'adresse IP ni de jeton.
 */
public final class MetricsModels {

    private MetricsModels() {
    }

    /** Périodes disponibles. Fixes et énumérées : rien de ce que saisit l'utilisateur n'entre dans une requête. */
    public enum Window {
        LAST_24H("24h", "-24h@h", "1h", 24),
        LAST_7D("7d", "-7d@d", "1d", 7);

        private final String key;
        private final String earliest;
        private final String span;
        private final int buckets;

        Window(String key, String earliest, String span, int buckets) {
            this.key = key;
            this.earliest = earliest;
            this.span = span;
            this.buckets = buckets;
        }

        public String key() {
            return key;
        }

        /** Borne de début d'une recherche Splunk. */
        public String earliest() {
            return earliest;
        }

        /** Largeur d'un point de la courbe, au format Splunk (« 1h », « 1d »). */
        public String span() {
            return span;
        }

        public int buckets() {
            return buckets;
        }

        public static Optional<Window> of(String key) {
            for (Window window : values()) {
                if (window.key.equals(key)) {
                    return Optional.of(window);
                }
            }
            return Optional.empty();
        }
    }

    /** {@code apiId} et {@code applicationId} sont nuls quand la source ne les porte pas : on rapproche alors par nom. */
    public record Totals(long calls, long errors4xx, long errors5xx, double avgLatencyMs, double p95LatencyMs) {
        public static Totals none() {
            return new Totals(0, 0, 0, 0, 0);
        }
    }

    public record ApiMetric(String apiId, String name, String version, long calls, long errors4xx, long errors5xx,
                            double avgLatencyMs, double p95LatencyMs) {
    }

    public record AppMetric(String applicationId, String name, long calls, long errors) {
    }

    /** Usage d'une API par une application. */
    public record ConsumerMetric(String apiId, String apiName, String apiVersion, String applicationId,
                                 String applicationName, long calls, long errors) {
    }

    public record TimePoint(Instant time, long calls, long errors) {
    }

    /** Courbe de trafic d'une API. */
    public record ApiSeries(String apiId, String apiName, String apiVersion, List<TimePoint> points) {
    }

    public record WindowMetrics(Totals totals, List<ApiMetric> apis, List<AppMetric> applications,
                                List<ConsumerMetric> consumers, List<ApiSeries> series) {
        public WindowMetrics {
            apis = List.copyOf(apis);
            applications = List.copyOf(applications);
            consumers = List.copyOf(consumers);
            series = List.copyOf(series);
        }

        public static WindowMetrics empty() {
            return new WindowMetrics(Totals.none(), List.of(), List.of(), List.of(), List.of());
        }
    }

    public record MetricsSnapshot(Map<Window, WindowMetrics> windows) {
        public MetricsSnapshot {
            windows = Map.copyOf(windows);
        }

        public static MetricsSnapshot empty() {
            return new MetricsSnapshot(Map.of());
        }

        public WindowMetrics of(Window window) {
            return windows.getOrDefault(window, WindowMetrics.empty());
        }
    }
}
