package com.example.apiportal.sync;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.example.apiportal.sync.SyncStatus.State;
import com.example.apiportal.wso2.Wso2Models.ApiSummary;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class InMemorySnapshotStoreTest {

    private static final Instant T0 = Instant.parse("2026-01-01T10:00:00Z");
    private static final Instant T1 = Instant.parse("2026-01-01T10:15:00Z");

    private final InMemorySnapshotStore store = new InMemorySnapshotStore(new CatalogSources(List.of(
            SyncTestSupport.source("dev", () -> CatalogSnapshot.empty()),
            SyncTestSupport.source("exp", () -> CatalogSnapshot.empty()))));

    private static CatalogSnapshot snapshotWithApi(String id) {
        return new CatalogSnapshot(List.of(new ApiSummary(id, "Payments", "/p/1.0", "1.0", "admin", "HTTP", "PUBLISHED")),
                Map.of(), Map.of(id, List.of()), List.of());
    }

    @Test
    @DisplayName("au départ, chaque environnement est « jamais synchronisé », dans l'ordre configuré")
    void startsAsNeverSyncedInConfiguredOrder() {
        assertThat(store.all()).extracting(EnvironmentState::key).containsExactly("dev", "exp");
        assertThat(store.all()).extracting(EnvironmentState::label).containsExactly("DEV", "EXP");
        assertThat(store.all()).allSatisfy(state -> {
            assertThat(state.status()).isEqualTo(SyncStatus.never());
            assertThat(state.snapshot().apis()).isEmpty();
        });
    }

    @Test
    @DisplayName("un succès remplace l'instantané et renseigne statut, compteurs et horodatages")
    void successReplacesSnapshot() {
        store.recordSuccess("dev", snapshotWithApi("a1"), T0);

        EnvironmentState dev = store.find("dev").orElseThrow();
        assertThat(dev.status().state()).isEqualTo(State.OK);
        assertThat(dev.status().lastAttemptAt()).isEqualTo(T0);
        assertThat(dev.status().lastSuccessAt()).isEqualTo(T0);
        assertThat(dev.status().apiCount()).isEqualTo(1);
        assertThat(dev.snapshot().apis()).hasSize(1);
        // Les autres environnements ne bougent pas.
        assertThat(store.find("exp").orElseThrow().status().state()).isEqualTo(State.NEVER);
    }

    @Test
    @DisplayName("un échec conserve le dernier instantané valide, sa date de succès et ses compteurs")
    void failureKeepsLastValidSnapshot() {
        store.recordSuccess("dev", snapshotWithApi("a1"), T0);
        store.recordFailure("dev", "[dev] control plane unreachable", T1);

        EnvironmentState dev = store.find("dev").orElseThrow();
        assertThat(dev.status().state()).isEqualTo(State.ERROR);
        assertThat(dev.status().errorMessage()).isEqualTo("[dev] control plane unreachable");
        assertThat(dev.status().lastAttemptAt()).isEqualTo(T1);
        assertThat(dev.status().lastSuccessAt()).isEqualTo(T0);
        assertThat(dev.status().apiCount()).isEqualTo(1);
        assertThat(dev.snapshot().apis()).hasSize(1);
    }

    @Test
    @DisplayName("un échec sans succès préalable : erreur, pas de date de succès, aucune donnée")
    void failureWithoutPreviousSuccess() {
        store.recordFailure("exp", "[exp] HTTP 500", T1);

        EnvironmentState exp = store.find("exp").orElseThrow();
        assertThat(exp.status().state()).isEqualTo(State.ERROR);
        assertThat(exp.status().lastSuccessAt()).isNull();
        assertThat(exp.snapshot().apis()).isEmpty();
    }

    @Test
    @DisplayName("un succès après un échec efface l'erreur")
    void successClearsError() {
        store.recordFailure("dev", "[dev] HTTP 500", T0);
        store.recordSuccess("dev", snapshotWithApi("a1"), T1);

        assertThat(store.find("dev").orElseThrow().status().errorMessage()).isNull();
        assertThat(store.find("dev").orElseThrow().status().state()).isEqualTo(State.OK);
    }

    @Test
    @DisplayName("un environnement inconnu est refusé")
    void unknownEnvironmentIsRejected() {
        assertThatThrownBy(() -> store.recordSuccess("prod", CatalogSnapshot.empty(), T0))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(store.find("prod")).isEmpty();
    }

    @Test
    @DisplayName("deux sources pour le même environnement sont refusées")
    void duplicateEnvironmentsAreRejected() {
        assertThatThrownBy(() -> new CatalogSources(List.of(
                SyncTestSupport.source("dev", CatalogSnapshot::empty),
                SyncTestSupport.source("dev", CatalogSnapshot::empty))))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
