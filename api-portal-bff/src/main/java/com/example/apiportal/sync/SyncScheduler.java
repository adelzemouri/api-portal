package com.example.apiportal.sync;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

/**
 * Déclenche la synchro au démarrage puis périodiquement. La première synchro est asynchrone : un
 * environnement indisponible ne doit jamais retarder ni empêcher le démarrage du portail.
 */
@Configuration(proxyBeanMethods = false)
@EnableScheduling
@ConditionalOnProperty(name = "portal.sync.enabled", havingValue = "true", matchIfMissing = true)
class SyncScheduler {

    private final SyncService syncService;

    SyncScheduler(SyncService syncService) {
        this.syncService = syncService;
    }

    @EventListener(ApplicationReadyEvent.class)
    void syncAtStartup() {
        Thread.ofVirtual().name("initial-sync").start(syncService::syncAll);
    }

    @Scheduled(fixedDelayString = "${portal.sync.interval:PT15M}", initialDelayString = "${portal.sync.interval:PT15M}")
    void syncPeriodically() {
        syncService.syncAll();
    }
}
