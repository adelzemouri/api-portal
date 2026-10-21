package com.example.apiportal.sync;

import com.example.apiportal.wso2.Wso2ClientException;
import java.time.Clock;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Synchronise chaque environnement vers le store, de façon isolée : l'échec ou la lenteur d'un
 * environnement n'affecte ni les autres ni le démarrage du portail.
 */
@Service
public class SyncService {

    private static final Logger log = LoggerFactory.getLogger(SyncService.class);

    private final CatalogSources sources;
    private final SnapshotStore store;
    private final Clock clock;
    private final AtomicBoolean running = new AtomicBoolean();

    public SyncService(CatalogSources sources, SnapshotStore store, Clock clock) {
        this.sources = sources;
        this.store = store;
        this.clock = clock;
    }

    /**
     * Lance tous les environnements en parallèle (un thread virtuel chacun) et attend la fin.
     * Chaque environnement publie son résultat dès qu'il termine. Sans effet si une synchro est déjà en cours.
     */
    public void syncAll() {
        if (!running.compareAndSet(false, true)) {
            log.info("Synchronisation déjà en cours, exécution ignorée");
            return;
        }
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            sources.all().forEach(source -> executor.submit(() -> sync(source)));
        } finally {
            running.set(false);
        }
    }

    void sync(CatalogSource source) {
        String environment = source.environment();
        try {
            CatalogSnapshot snapshot = source.fetch();
            store.recordSuccess(environment, snapshot, clock.instant());
            log.info("Synchronisation de {} réussie : {} API, {} applications, {} souscriptions", environment,
                    snapshot.apis().size(), snapshot.applications().size(), snapshot.subscriptionCount());
        } catch (Wso2ClientException e) {
            // Le message d'une Wso2ClientException ne contient jamais de secret : il peut être affiché dans l'UI.
            log.warn("Synchronisation de {} en échec : {}", environment, e.getMessage());
            store.recordFailure(environment, e.getMessage(), clock.instant());
        } catch (RuntimeException e) {
            // Erreur imprévue : ni son message ni sa pile ne vont dans l'UI, seul son type est journalisé.
            log.warn("Synchronisation de {} en échec inattendu : {}", environment, e.getClass().getName());
            store.recordFailure(environment, "[" + environment + "] unexpected error during synchronization",
                    clock.instant());
        }
    }
}
