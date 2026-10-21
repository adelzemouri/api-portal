package com.example.apiportal.metrics;

import com.example.apiportal.metrics.MetricsModels.MetricsSnapshot;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * Dernières métriques valides de chaque environnement, en mémoire. Un échec de lecture garde le dernier instantané
 * valide et n'en change que le statut, comme le store du catalogue.
 */
@Component
public class MetricsStore {

    public enum State { NEVER, OK, ERROR }

    public record Status(State state, Instant lastAttemptAt, Instant lastSuccessAt, String errorMessage) {
        static Status never() {
            return new Status(State.NEVER, null, null, null);
        }
    }

    public record EnvironmentMetrics(String key, Status status, MetricsSnapshot snapshot) {
    }

    private final Map<String, EnvironmentMetrics> states = new LinkedHashMap<>();

    public MetricsStore(MetricsSources sources) {
        sources.all().forEach(source -> states.put(source.environment(),
                new EnvironmentMetrics(source.environment(), Status.never(), MetricsSnapshot.empty())));
    }

    public synchronized void recordSuccess(String environment, MetricsSnapshot snapshot, Instant now) {
        requireKnown(environment);
        states.put(environment, new EnvironmentMetrics(environment, new Status(State.OK, now, now, null), snapshot));
    }

    public synchronized void recordFailure(String environment, String message, Instant now) {
        EnvironmentMetrics previous = requireKnown(environment);
        Instant lastSuccess = previous.status().lastSuccessAt();
        states.put(environment, new EnvironmentMetrics(environment,
                new Status(State.ERROR, now, lastSuccess, message), previous.snapshot()));
    }

    public synchronized Optional<EnvironmentMetrics> find(String environment) {
        return Optional.ofNullable(states.get(environment));
    }

    public synchronized List<EnvironmentMetrics> all() {
        return new ArrayList<>(states.values());
    }

    private EnvironmentMetrics requireKnown(String environment) {
        EnvironmentMetrics state = states.get(environment);
        if (state == null) {
            throw new IllegalArgumentException("Unknown metrics environment: " + environment);
        }
        return state;
    }
}
