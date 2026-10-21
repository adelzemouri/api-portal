package com.example.apiportal.metrics;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;

/**
 * Lit les métriques au démarrage (en tâche de fond) puis périodiquement. Distinct de la synchro du catalogue : les
 * recherches Splunk sont plus lourdes et leur rythme (30 minutes par défaut) n'est pas celui de WSO2.
 * Suit {@code portal.sync.enabled} : les tests qui coupent la synchro coupent aussi celle-ci.
 */
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "portal.sync.enabled", havingValue = "true", matchIfMissing = true)
class MetricsScheduler {

    private final MetricsSyncService service;

    MetricsScheduler(MetricsSyncService service) {
        this.service = service;
    }

    @EventListener(ApplicationReadyEvent.class)
    void readAtStartup() {
        Thread.ofVirtual().name("initial-metrics").start(service::syncAll);
    }

    @Scheduled(fixedDelayString = "${portal.metrics.interval:PT30M}", initialDelayString = "${portal.metrics.interval:PT30M}")
    void readPeriodically() {
        service.syncAll();
    }
}
