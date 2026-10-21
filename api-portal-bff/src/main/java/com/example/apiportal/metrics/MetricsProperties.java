package com.example.apiportal.metrics;

import java.net.URI;
import java.time.Duration;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Lecture des métriques de trafic dans Splunk (facultative : sans {@code portal.metrics.splunk.base-url}, le portail
 * fonctionne sans métriques et le front l'indique). Splunk contient les événements d'analytique des gateways WSO2.
 *
 * <p>Tout ce qui entre dans une requête SPL vient d'ici (configuration d'administration, validée au démarrage) :
 * jamais d'une entrée du navigateur. Le jeton n'apparaît ni dans les logs ni dans {@code toString()}.
 */
@ConfigurationProperties(prefix = "portal.metrics")
public record MetricsProperties(@DefaultValue("PT30M") Duration interval, Splunk splunk) {

    private static final Pattern IDENTIFIER = Pattern.compile("[A-Za-z0-9_.:-]+");
    /** Pas de pipe, de crochet, de point-virgule ni d'antiquote : un filtre ne peut pas ouvrir une sous-recherche ni une commande. */
    private static final Pattern SAFE_FILTER = Pattern.compile("[^|\\[\\]`;\\n\\r]*");

    /**
     * @param environments clé = clé d'environnement du portail (dev, sim, uat, exp) ; l'ordre est conservé
     */
    public record Splunk(URI baseUrl, String token, String sslBundle,
                         @DefaultValue("5s") Duration connectTimeout,
                         @DefaultValue("60s") Duration readTimeout,
                         @DefaultValue Fields fields,
                         @DefaultValue Map<String, SplunkEnvironment> environments) {

        public Splunk {
            if (baseUrl == null || !"https".equalsIgnoreCase(baseUrl.getScheme())) {
                throw new IllegalArgumentException("portal.metrics.splunk.base-url must be an https URL");
            }
            if (token == null || token.isBlank()) {
                throw new IllegalArgumentException("portal.metrics.splunk.token is required");
            }
        }

        @Override
        public String toString() {
            return "Splunk[baseUrl=%s, sslBundle=%s, environments=%s, token=***]"
                    .formatted(baseUrl, sslBundle, environments.keySet());
        }
    }

    /**
     * Noms des champs des événements. Par défaut ceux de l'événement d'analytique des gateways WSO2 4.x. Les
     * identifiants ({@code apiId}, {@code applicationId}) sont facultatifs : sans eux, on rapproche par nom.
     * Un champ absent des événements ferait disparaître leurs lignes d'une agrégation : ne les renseigner que s'ils existent.
     */
    public record Fields(@DefaultValue("apiName") String apiName,
                         @DefaultValue("apiVersion") String apiVersion,
                         String apiId,
                         @DefaultValue("applicationName") String applicationName,
                         String applicationId,
                         @DefaultValue("proxyResponseCode") String status,
                         @DefaultValue("responseLatency") String latency) {

        public Fields {
            identifier(apiName, "api-name", true);
            identifier(apiVersion, "api-version", true);
            identifier(apiId, "api-id", false);
            identifier(applicationName, "application-name", true);
            identifier(applicationId, "application-id", false);
            identifier(status, "status", true);
            identifier(latency, "latency", true);
        }
    }

    /** {@code index} : index Splunk de l'environnement ; {@code filter} : restriction facultative (ex. {@code sourcetype="x"}). */
    public record SplunkEnvironment(String index, String filter) {

        public SplunkEnvironment {
            identifier(index, "index", true);
            filter = filter == null ? "" : filter.strip();
            if (!SAFE_FILTER.matcher(filter).matches()) {
                throw new IllegalArgumentException("portal.metrics.splunk filter must not contain | [ ] ` or ;");
            }
        }
    }

    private static void identifier(String value, String name, boolean required) {
        if (value == null || value.isBlank()) {
            if (required) {
                throw new IllegalArgumentException("portal.metrics.splunk " + name + " is required");
            }
            return;
        }
        if (!IDENTIFIER.matcher(value).matches()) {
            throw new IllegalArgumentException("portal.metrics.splunk " + name + " contains forbidden characters");
        }
    }
}
