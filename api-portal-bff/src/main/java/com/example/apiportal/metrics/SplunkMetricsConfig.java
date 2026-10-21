package com.example.apiportal.metrics;

import com.example.apiportal.metrics.MetricsProperties.Splunk;
import com.example.apiportal.metrics.MetricsSources.MetricsSource;
import java.net.http.HttpClient;
import java.util.List;
import org.springframework.boot.ssl.SslBundles;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * Branche Splunk quand {@code portal.metrics.splunk} est configuré ; sinon aucune source, et le portail n'affiche
 * simplement pas de métriques. Aucun appel Splunk au démarrage. Absent en profil « mock ».
 */
@Configuration(proxyBeanMethods = false)
@Profile("!mock")
class SplunkMetricsConfig {

    @Bean
    MetricsSources metricsSources(MetricsProperties properties, SslBundles sslBundles, RestClient.Builder builder) {
        Splunk splunk = properties.splunk();
        if (splunk == null) {
            return MetricsSources.none();
        }
        HttpClient.Builder http = HttpClient.newBuilder()
                .connectTimeout(splunk.connectTimeout())
                // Une redirection (ex. vers une page de login) ne doit jamais passer pour un succès.
                .followRedirects(HttpClient.Redirect.NEVER);
        if (splunk.sslBundle() != null && !splunk.sslBundle().isBlank()) {
            http.sslContext(sslBundles.getBundle(splunk.sslBundle()).createSslContext());
        }
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(http.build());
        factory.setReadTimeout(splunk.readTimeout());
        SplunkClient client = new SplunkClient(
                builder.clone().baseUrl(splunk.baseUrl().toString()).requestFactory(factory).build(), splunk.token());

        List<MetricsSource> sources = splunk.environments().entrySet().stream()
                .<MetricsSource>map(e -> new SplunkMetricsSource(e.getKey(), e.getValue(), splunk.fields(), client))
                .toList();
        return new MetricsSources(sources);
    }
}
