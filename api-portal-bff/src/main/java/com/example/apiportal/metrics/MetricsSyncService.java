package com.example.apiportal.metrics;

import com.example.apiportal.metrics.MetricsModels.MetricsSnapshot;
import com.example.apiportal.metrics.MetricsSources.MetricsSource;
import java.time.Clock;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Lit les métriques de chaque environnement vers le store, de façon isolée : l'échec ou la lenteur de Splunk pour un
 * environnement n'affecte ni les autres, ni le catalogue, ni le démarrage, ni le health du portail.
 */
@Service
public class MetricsSyncService {

    private static final Logger log = LoggerFactory.getLogger(MetricsSyncService.class);

    private final MetricsSources sources;
    private final MetricsStore store;
    private final Clock clock;
    private final AtomicBoolean running = new AtomicBoolean();

    public MetricsSyncService(MetricsSources sources, MetricsStore store, Clock clock) {
        this.sources = sources;
        this.store = store;
        this.clock = clock;
    }

    /** Tous les environnements en parallèle (un thread virtuel chacun), sans effet si une lecture est déjà en cours. */
    public void syncAll() {
        if (sources.all().isEmpty() || !running.compareAndSet(false, true)) {
            return;
        }
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            sources.all().forEach(source -> executor.submit(() -> sync(source)));
        } finally {
            running.set(false);
        }
    }

    void sync(MetricsSource source) {
        String environment = source.environment();
        try {
            MetricsSnapshot snapshot = source.fetch();
            store.recordSuccess(environment, snapshot, clock.instant());
            log.info("Métriques de {} lues", environment);
        } catch (MetricsException e) {
            // Le message d'une MetricsException est sûr par construction : il peut être affiché dans l'UI.
            log.warn("Lecture des métriques de {} en échec : {}", environment, e.getMessage());
            store.recordFailure(environment, e.getMessage(), clock.instant());
        } catch (RuntimeException e) {
            // Erreur imprévue : ni son message ni sa pile ne vont dans l'UI, seul son type est journalisé.
            log.warn("Lecture des métriques de {} en échec inattendu : {}", environment, e.getClass().getName());
            store.recordFailure(environment, "Metrics unavailable", clock.instant());
        }
    }
}
