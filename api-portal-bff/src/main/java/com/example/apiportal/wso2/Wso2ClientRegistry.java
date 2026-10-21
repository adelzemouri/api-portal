package com.example.apiportal.wso2;

import com.example.apiportal.wso2.Wso2Properties.EnvironmentProperties;
import java.net.http.HttpClient;
import java.time.Clock;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.boot.ssl.SslBundles;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * Un client par control plane. Aucun appel WSO2 au démarrage : un environnement
 * indisponible n'empêche pas l'application de démarrer.
 */
@Component
@Profile("!mock")
public class Wso2ClientRegistry {

    private final Map<String, Wso2Client> clients;

    public Wso2ClientRegistry(Wso2Properties properties,
                              SslBundles sslBundles,
                              RestClient.Builder restClientBuilder) {
        Map<String, Wso2Client> built = new LinkedHashMap<>();
        properties.environments().forEach((key, env) -> {
            requireHttps(key, env);
            RestClient restClient = restClientBuilder.clone()
                    .baseUrl(env.baseUrl().toString())
                    .requestFactory(requestFactory(properties, env, sslBundles))
                    .build();
            Wso2TokenProvider tokens = new Wso2TokenProvider(
                    key, env, restClient, properties.scopes(), Clock.systemUTC());
            built.put(key, new Wso2Client(key, env.label(), restClient, tokens, properties.pageSize()));
        });
        this.clients = Collections.unmodifiableMap(built);
    }

    /** Clients dans l'ordre de configuration (DEV, SIM, UAT, EXP). */
    public Collection<Wso2Client> all() {
        return clients.values();
    }

    public Wso2Client get(String environment) {
        Wso2Client client = clients.get(environment);
        if (client == null) {
            throw new IllegalArgumentException("Unknown WSO2 environment: " + environment);
        }
        return client;
    }

    private static void requireHttps(String key, EnvironmentProperties env) {
        if (!"https".equalsIgnoreCase(env.baseUrl().getScheme())
                || !"https".equalsIgnoreCase(env.tokenUrl().getScheme())) {
            throw new IllegalStateException("WSO2 environment '" + key + "' must use HTTPS");
        }
    }

    private static ClientHttpRequestFactory requestFactory(Wso2Properties properties,
                                                           EnvironmentProperties env,
                                                           SslBundles sslBundles) {
        HttpClient.Builder http = HttpClient.newBuilder()
                .connectTimeout(properties.connectTimeout())
                // Une redirection (ex. vers une page de login) ne doit jamais passer pour un succès.
                .followRedirects(HttpClient.Redirect.NEVER);
        if (env.sslBundle() != null) {
            http.sslContext(sslBundles.getBundle(env.sslBundle()).createSslContext());
        }
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(http.build());
        factory.setReadTimeout(properties.readTimeout());
        return factory;
    }
}
