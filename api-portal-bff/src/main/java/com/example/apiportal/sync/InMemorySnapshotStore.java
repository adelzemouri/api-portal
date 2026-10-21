package com.example.apiportal.sync;

import com.example.apiportal.sync.SyncStatus.State;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

@Component
public class InMemorySnapshotStore implements SnapshotStore {

    private final List<String> order;
    private final Map<String, EnvironmentState> states = new ConcurrentHashMap<>();

    public InMemorySnapshotStore(CatalogSources sources) {
        this.order = sources.all().stream().map(CatalogSource::environment).toList();
        sources.all().forEach(source -> states.put(source.environment(), new EnvironmentState(
                source.environment(), source.label(), SyncStatus.never(), CatalogSnapshot.empty())));
    }

    @Override
    public void recordSuccess(String environment, CatalogSnapshot snapshot, Instant at) {
        // compute() rend le remplacement atomique : un lecteur voit l'ancien ou le nouvel état, jamais un mélange.
        update(environment, previous -> new EnvironmentState(previous.key(), previous.label(),
                new SyncStatus(State.OK, at, at, null,
                        snapshot.apis().size(), snapshot.applications().size(), snapshot.subscriptionCount()),
                snapshot));
    }

    @Override
    public void recordFailure(String environment, String errorMessage, Instant at) {
        update(environment, previous -> {
            SyncStatus old = previous.status();
            return new EnvironmentState(previous.key(), previous.label(),
                    new SyncStatus(State.ERROR, at, old.lastSuccessAt(), errorMessage,
                            old.apiCount(), old.applicationCount(), old.subscriptionCount()),
                    previous.snapshot());
        });
    }

    @Override
    public List<EnvironmentState> all() {
        return order.stream().map(states::get).toList();
    }

    @Override
    public Optional<EnvironmentState> find(String environment) {
        return Optional.ofNullable(states.get(environment));
    }

    private void update(String environment, java.util.function.UnaryOperator<EnvironmentState> change) {
        if (!states.containsKey(environment)) {
            throw new IllegalArgumentException("Unknown environment: " + environment);
        }
        states.computeIfPresent(environment, (key, previous) -> change.apply(previous));
    }
}
