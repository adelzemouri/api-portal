package com.example.apiportal.wso2;

import com.example.apiportal.wso2.Wso2Properties.EnvironmentProperties;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.boot.ssl.SslBundles;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * Un client par environnement. La construction ne fait aucun appel réseau : un environnement
 * indisponible ne doit pas empêcher le démarrage du portail.
 */
public class Wso2ClientRegistry {

    private final Map<String, Wso2Client> clients = new LinkedHashMap<>();

    public Wso2ClientRegistry(Wso2Properties properties, RestClient.Builder builder, SslBundles sslBundles,
                              Clock clock) {
        for (EnvironmentProperties env : properties.environments()) {
            requireHttps(env.name(), "base-url", env.baseUrl());
            requireHttps(env.name(), "token-url", env.tokenUrl());
            if (clients.containsKey(env.name())) {
                throw new IllegalStateException("Duplicate WSO2 environment: " + env.name());
            }
            RestClient restClient = builder.clone()
                    .requestFactory(requestFactory(env, sslBundles))
                    .build();
            Wso2TokenProvider tokenProvider = new Wso2TokenProvider(env, restClient, clock);
            clients.put(env.name(), new Wso2Client(env, restClient, tokenProvider));
        }
    }

    public List<Wso2Client> all() {
        return List.copyOf(clients.values());
    }

    public Wso2Client get(String environment) {
        Wso2Client client = clients.get(environment);
        if (client == null) {
            throw new IllegalArgumentException("Unknown WSO2 environment: " + environment);
        }
        return client;
    }

    private static void requireHttps(String environment, String property, URI uri) {
        if (uri.getScheme() == null || !"https".equalsIgnoreCase(uri.getScheme())) {
            throw new IllegalStateException(
                    "[" + environment + "] " + property + " must use https: " + uri);
        }
    }

    // Vérification TLS toujours active ; redirections jamais suivies (pas de fuite du Bearer)
    private static JdkClientHttpRequestFactory requestFactory(EnvironmentProperties env, SslBundles sslBundles) {
        HttpClient.Builder http = HttpClient.newBuilder()
                .connectTimeout(env.connectTimeout())
                .followRedirects(HttpClient.Redirect.NEVER);
        if (env.sslBundle() != null && !env.sslBundle().isBlank()) {
            http.sslContext(sslBundles.getBundle(env.sslBundle()).createSslContext());
        }
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(http.build());
        factory.setReadTimeout(env.readTimeout());
        return factory;
    }
}
