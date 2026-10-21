package com.example.apiportal.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.apiportal.metrics.MetricsProperties;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.ConfigurationPropertySources;
import org.springframework.core.env.MutablePropertySources;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.env.SystemEnvironmentPropertySource;

/**
 * Vérifie que {@code PortalLinks} et {@code MetricsProperties} (structures optionnelles, cartes de records
 * imbriqués) se lient correctement à partir de variables d'environnement seules, sans aucune déclaration dans
 * application.yml — c'est le mécanisme documenté dans le fichier d'exemple pour l'exploitation. Utilise une
 * {@code SystemEnvironmentPropertySource} réelle (celle que Spring Boot construit depuis {@code System.getenv()})
 * pour exercer la même résolution de nom relâchée qu'en production, plutôt que de le supposer.
 */
class EnvironmentVariableBindingTest {

    private static Binder binderFrom(Map<String, Object> systemEnv) {
        MutablePropertySources sources = new MutablePropertySources();
        // Le nom seul ne suffit pas : c'est bien la classe SystemEnvironmentPropertySource (celle que Spring Boot
        // construit depuis System.getenv()) qui déclenche la résolution relâchée SCREAMING_SNAKE_CASE -> kebab-case.
        sources.addFirst(new SystemEnvironmentPropertySource(
                StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME, systemEnv));
        return new Binder(ConfigurationPropertySources.from(sources));
    }

    @Test
    @DisplayName("PortalLinks : liens d'un environnement et adresse du composant de déploiement, depuis des variables d'environnement seules")
    void portalLinksBindFromEnvironmentVariables() {
        Map<String, Object> env = new LinkedHashMap<>();
        env.put("PORTAL_LINKS_DEPLOY_COMPONENT_URL", "https://gitlab.bank.internal/platform/ci-components/swagger-deploy");
        env.put("PORTAL_LINKS_ENVIRONMENTS_DEV_PUBLISHER_URL", "https://apim-dev.bank.internal/publisher");
        env.put("PORTAL_LINKS_ENVIRONMENTS_DEV_DEVPORTAL_URL", "https://apim-dev.bank.internal/devportal");
        env.put("PORTAL_LINKS_ENVIRONMENTS_DEV_IDENTITY_SERVER_URL", "https://is-dev.bank.internal");
        env.put("PORTAL_LINKS_ENVIRONMENTS_DEV_GATEWAY_HTTPS_PORT", "8243");

        PortalLinks links = binderFrom(env).bind("portal.links", Bindable.of(PortalLinks.class)).get();

        assertThat(links.deployComponentUrl().toString())
                .isEqualTo("https://gitlab.bank.internal/platform/ci-components/swagger-deploy");
        PortalLinks.EnvironmentLinks dev = links.of("dev");
        assertThat(dev.publisherUrl().toString()).isEqualTo("https://apim-dev.bank.internal/publisher");
        assertThat(dev.devportalUrl().toString()).isEqualTo("https://apim-dev.bank.internal/devportal");
        assertThat(dev.identityServerUrl().toString()).isEqualTo("https://is-dev.bank.internal");
        assertThat(dev.gatewayHttpsPort()).isEqualTo(8243);
        // Un environnement dont aucune variable n'est posée reste absent de la carte : PortalLinks.of() rend
        // alors des liens vides plutôt que d'échouer — c'est ce qui permet de renseigner un seul environnement.
        assertThat(links.of("sim").publisherUrl()).isNull();
    }

    @Test
    @DisplayName("PortalLinks : totalement absent des variables d'environnement, aucune erreur, tout est vide")
    void portalLinksAreOptional() {
        PortalLinks links = binderFrom(Map.of()).bind("portal.links", Bindable.of(PortalLinks.class))
                .orElseGet(PortalLinks::none);

        assertThat(links.deployComponentUrl()).isNull();
        assertThat(links.of("dev").publisherUrl()).isNull();
    }

    @Test
    @DisplayName("MetricsProperties.Splunk : index par environnement et jeton, depuis des variables d'environnement seules")
    void splunkMetricsBindFromEnvironmentVariables() {
        Map<String, Object> env = new LinkedHashMap<>();
        env.put("PORTAL_METRICS_SPLUNK_BASE_URL", "https://splunk.bank.internal:8089");
        env.put("PORTAL_METRICS_SPLUNK_TOKEN", "s3cr3t-token");
        env.put("PORTAL_METRICS_SPLUNK_SSL_BUNDLE", "group-ca");
        env.put("PORTAL_METRICS_SPLUNK_ENVIRONMENTS_DEV_INDEX", "wso2_apim_dev");
        env.put("PORTAL_METRICS_SPLUNK_ENVIRONMENTS_EXP_INDEX", "wso2_apim_prod");
        env.put("PORTAL_METRICS_SPLUNK_ENVIRONMENTS_EXP_FILTER", "sourcetype=\"wso2:apim:analytics\"");

        MetricsProperties.Splunk splunk = binderFrom(env)
                .bind("portal.metrics.splunk", Bindable.of(MetricsProperties.Splunk.class)).get();

        assertThat(splunk.baseUrl().toString()).isEqualTo("https://splunk.bank.internal:8089");
        assertThat(splunk.token()).isEqualTo("s3cr3t-token");
        assertThat(splunk.environments()).containsOnlyKeys("dev", "exp");
        assertThat(splunk.environments().get("dev").index()).isEqualTo("wso2_apim_dev");
        assertThat(splunk.environments().get("exp").filter()).isEqualTo("sourcetype=\"wso2:apim:analytics\"");
        // Champs des événements non redéfinis : les valeurs par défaut (WSO2 4.x) s'appliquent.
        assertThat(splunk.fields().apiName()).isEqualTo("apiName");
    }

    @Test
    @DisplayName("MetricsProperties.Splunk : redéfinition d'un seul nom de champ, le reste garde sa valeur par défaut")
    void splunkFieldNamesCanBeOverriddenIndividually() {
        Map<String, Object> env = new LinkedHashMap<>();
        env.put("PORTAL_METRICS_SPLUNK_BASE_URL", "https://splunk.bank.internal:8089");
        env.put("PORTAL_METRICS_SPLUNK_TOKEN", "s3cr3t-token");
        env.put("PORTAL_METRICS_SPLUNK_FIELDS_STATUS", "http_status_code");

        MetricsProperties.Splunk splunk = binderFrom(env)
                .bind("portal.metrics.splunk", Bindable.of(MetricsProperties.Splunk.class)).get();

        assertThat(splunk.fields().status()).isEqualTo("http_status_code");
        assertThat(splunk.fields().latency()).isEqualTo("responseLatency");
    }
}
