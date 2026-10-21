package com.example.apiportal.mock;

import com.example.apiportal.metrics.MetricsSources;
import com.example.apiportal.metrics.MetricsSources.MetricsSource;
import com.example.apiportal.sync.CatalogSource;
import com.example.apiportal.sync.CatalogSources;
import java.time.Clock;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;

/**
 * Profil « mock » : remplace les control planes par des données factices. Ne démarre avec aucune variable
 * d'environnement WSO2. Pour simuler un environnement en panne : {@code --portal.mock.failing-environments=uat}.
 */
@Configuration(proxyBeanMethods = false)
@Profile("mock")
class MockCatalogConfig {

    private static final Logger log = LoggerFactory.getLogger(MockCatalogConfig.class);

    private static List<String> failingEnvironments(Environment environment) {
        return Binder.get(environment)
                .bind("portal.mock.failing-environments", Bindable.listOf(String.class))
                .orElse(List.of());
    }

    /** Métriques factices, avec la même simulation de panne que le catalogue : une panne touche aussi Splunk. */
    @Bean
    MetricsSources mockMetricsSources(Environment environment, Clock clock) {
        List<String> failing = failingEnvironments(environment);
        MockCatalog catalog = new MockCatalog();
        return new MetricsSources(MockCatalog.ENVIRONMENTS.stream()
                .<MetricsSource>map(env -> new MockMetricsSource(env, catalog, clock, failing.contains(env)))
                .toList());
    }

    @Bean
    CatalogSources mockCatalogSources(Environment environment) {
        List<String> failing = failingEnvironments(environment);
        failing.forEach(name -> {
            if (!MockCatalog.ENVIRONMENTS.contains(name)) {
                throw new IllegalArgumentException("portal.mock.failing-environments: unknown environment '"
                        + name + "' (expected one of " + MockCatalog.ENVIRONMENTS + ")");
            }
        });

        log.warn("Profil « mock » actif : données factices, aucun appel à WSO2. Environnements en panne simulée : {}",
                failing);
        MockCatalog catalog = new MockCatalog();
        return new CatalogSources(MockCatalog.ENVIRONMENTS.stream()
                .<CatalogSource>map(env -> new MockCatalogSource(env, env.toUpperCase(), catalog, failing.contains(env)))
                .toList());
    }
}
