package com.example.apiportal.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.example.apiportal.sync.EnvironmentState;
import com.example.apiportal.sync.SnapshotStore;
import com.example.apiportal.sync.SyncStatus;
import java.time.Duration;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/** Planificateur activé (comportement par défaut) : la synchro initiale se déclenche seule, en arrière-plan. */
@SpringBootTest
@ActiveProfiles("mock")
class MockProfileStartupSyncTest {

    @Autowired
    SnapshotStore store;

    @Test
    @DisplayName("la synchro initiale démarre d'elle-même après le démarrage et alimente les 4 environnements")
    void initialSyncRunsAutomatically() {
        await().atMost(Duration.ofSeconds(15)).untilAsserted(() ->
                assertThat(store.all()).hasSize(4).extracting(EnvironmentState::status)
                        .extracting(SyncStatus::state).containsOnly(SyncStatus.State.OK));
    }
}
