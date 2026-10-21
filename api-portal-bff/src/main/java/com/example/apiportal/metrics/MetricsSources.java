package com.example.apiportal.metrics;

import com.example.apiportal.metrics.MetricsModels.MetricsSnapshot;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Sources de métriques (une par environnement configuré), dans l'ordre d'affichage. Peut être vide. */
public record MetricsSources(List<MetricsSource> all) {

    public MetricsSources {
        all = List.copyOf(all);
        Set<String> seen = new HashSet<>();
        for (MetricsSource source : all) {
            if (!seen.add(source.environment())) {
                throw new IllegalArgumentException("Duplicate metrics environment: " + source.environment());
            }
        }
    }

    public static MetricsSources none() {
        return new MetricsSources(List.of());
    }

    /** Lecture des métriques d'un environnement : tout ou rien, comme {@code CatalogSource}. */
    public interface MetricsSource {

        String environment();

        /** Lit toutes les périodes ; en cas d'échec, lève une exception dont le message est affichable. */
        MetricsSnapshot fetch();
    }
}
