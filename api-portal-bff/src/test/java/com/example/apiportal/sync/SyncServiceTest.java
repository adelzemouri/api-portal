package com.example.apiportal.sync;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.example.apiportal.sync.SyncStatus.State;
import com.example.apiportal.sync.SyncTestSupport.FakeSource;
import com.example.apiportal.wso2.MutableClock;
import com.example.apiportal.wso2.Wso2ClientException;
import com.example.apiportal.wso2.Wso2Models.ApiSummary;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SyncServiceTest {

    private final MutableClock clock = new MutableClock(Instant.parse("2026-01-01T10:00:00Z"));

    private static CatalogSnapshot oneApi() {
        return new CatalogSnapshot(List.of(new ApiSummary("a1", "Payments", "/p/1.0", "1.0", "admin", "HTTP", "PUBLISHED")),
                Map.of(), Map.of("a1", List.of()), List.of());
    }

    private record Fixture(SyncService service, InMemorySnapshotStore store) {
    }

    private Fixture fixture(FakeSource... sources) {
        CatalogSources catalogSources = new CatalogSources(List.of(sources));
        InMemorySnapshotStore store = new InMemorySnapshotStore(catalogSources);
        return new Fixture(new SyncService(catalogSources, store, clock), store);
    }

    private static void awaitLatch(CountDownLatch latch) {
        try {
            if (!latch.await(30, TimeUnit.SECONDS)) {
                throw new IllegalStateException("latch not released");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }

    @Test
    @DisplayName("chaque environnement synchronisé est enregistré avec la date fournie par l'horloge")
    void recordsSuccessWithClockTime() {
        Fixture f = fixture(SyncTestSupport.source("dev", SyncServiceTest::oneApi));

        f.service().syncAll();

        SyncStatus status = f.store().find("dev").orElseThrow().status();
        assertThat(status.state()).isEqualTo(State.OK);
        assertThat(status.lastSuccessAt()).isEqualTo(clock.instant());
        assertThat(status.apiCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("l'échec d'un environnement n'affecte pas les autres")
    void failureOfOneEnvironmentDoesNotAffectOthers() {
        Fixture f = fixture(
                SyncTestSupport.source("dev", SyncServiceTest::oneApi),
                SyncTestSupport.source("uat", () -> {
                    throw new Wso2ClientException("uat", "control plane unreachable");
                }),
                SyncTestSupport.source("exp", SyncServiceTest::oneApi));

        f.service().syncAll();

        assertThat(f.store().find("dev").orElseThrow().status().state()).isEqualTo(State.OK);
        assertThat(f.store().find("exp").orElseThrow().status().state()).isEqualTo(State.OK);
        SyncStatus uat = f.store().find("uat").orElseThrow().status();
        assertThat(uat.state()).isEqualTo(State.ERROR);
        assertThat(uat.errorMessage()).isEqualTo("[uat] control plane unreachable");
    }

    @Test
    @DisplayName("après un échec, le dernier instantané valide est conservé ; la synchro suivante se rétablit")
    void keepsLastSnapshotOnFailureAndRecovers() {
        AtomicBoolean failing = new AtomicBoolean();
        Fixture f = fixture(SyncTestSupport.source("dev", () -> {
            if (failing.get()) {
                throw new Wso2ClientException("dev", "HTTP 503");
            }
            return oneApi();
        }));

        f.service().syncAll();
        Instant firstSuccess = clock.instant();
        clock.advance(Duration.ofMinutes(15));
        failing.set(true);
        f.service().syncAll();

        EnvironmentState afterFailure = f.store().find("dev").orElseThrow();
        assertThat(afterFailure.status().state()).isEqualTo(State.ERROR);
        assertThat(afterFailure.status().lastSuccessAt()).isEqualTo(firstSuccess);
        assertThat(afterFailure.status().lastAttemptAt()).isEqualTo(clock.instant());
        assertThat(afterFailure.snapshot().apis()).hasSize(1);

        clock.advance(Duration.ofMinutes(15));
        failing.set(false);
        f.service().syncAll();
        assertThat(f.store().find("dev").orElseThrow().status().state()).isEqualTo(State.OK);
        assertThat(f.store().find("dev").orElseThrow().status().errorMessage()).isNull();
    }

    @Test
    @DisplayName("une erreur imprévue n'expose pas son message (potentiellement sensible) dans le statut")
    void unexpectedErrorDoesNotLeakItsMessage() {
        Fixture f = fixture(SyncTestSupport.source("dev", () -> {
            throw new IllegalStateException("password=S3CR3T-value");
        }));

        f.service().syncAll();

        SyncStatus status = f.store().find("dev").orElseThrow().status();
        assertThat(status.state()).isEqualTo(State.ERROR);
        assertThat(status.errorMessage()).isEqualTo("[dev] unexpected error during synchronization")
                .doesNotContain("S3CR3T");
    }

    @Test
    @DisplayName("un environnement lent n'empêche pas les autres de publier leur résultat")
    void slowEnvironmentDoesNotBlockOthers() throws Exception {
        CountDownLatch release = new CountDownLatch(1);
        Fixture f = fixture(
                SyncTestSupport.source("dev", () -> {
                    awaitLatch(release);
                    return oneApi();
                }),
                SyncTestSupport.source("exp", SyncServiceTest::oneApi));

        Thread syncThread = Thread.ofVirtual().start(f.service()::syncAll);
        try {
            await().atMost(Duration.ofSeconds(15)).untilAsserted(() ->
                    assertThat(f.store().find("exp").orElseThrow().status().state()).isEqualTo(State.OK));
            // exp est publié alors que dev n'a pas encore rendu la main.
            assertThat(f.store().find("dev").orElseThrow().status().state()).isEqualTo(State.NEVER);
        } finally {
            release.countDown();
            syncThread.join(15_000);
        }
        assertThat(f.store().find("dev").orElseThrow().status().state()).isEqualTo(State.OK);
    }

    @Test
    @DisplayName("une synchro déjà en cours n'est pas relancée en parallèle")
    void overlappingRunIsSkipped() throws Exception {
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        FakeSource dev = SyncTestSupport.source("dev", () -> {
            started.countDown();
            awaitLatch(release);
            return oneApi();
        });
        Fixture f = fixture(dev);

        Thread first = Thread.ofVirtual().start(f.service()::syncAll);
        try {
            assertThat(started.await(15, TimeUnit.SECONDS)).isTrue();
            f.service().syncAll(); // rend la main immédiatement : la première est encore en cours
        } finally {
            release.countDown();
            first.join(15_000);
        }
        assertThat(dev.fetchCount()).isEqualTo(1);
    }
}
