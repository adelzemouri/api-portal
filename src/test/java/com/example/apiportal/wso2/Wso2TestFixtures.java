package com.example.apiportal.wso2;

import com.example.apiportal.wso2.Wso2Properties.EnvironmentProperties;
import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

/**
 * Données de test. Les secrets sont factices et reconnaissables : ils servent aussi de
 * sentinelles pour vérifier qu'aucun message ne les laisse fuiter.
 */
final class Wso2TestFixtures {

    static final String ENV = "dev";
    static final String BASE_URL = "https://apim-dev.example.test:9443";
    static final String TOKEN_URL = BASE_URL + "/oauth2/token";
    static final String CLIENT_ID = "portal-client";
    static final String CLIENT_SECRET = "s3cr3t-client";
    static final String USERNAME = "svc-portal-ro";
    static final String PASSWORD = "s3cr3t-password";
    static final List<String> SCOPES =
            List.of("apim:api_view", "apim:subscription_view", "apim:admin_application_view");

    static final List<String> SECRETS = List.of(CLIENT_SECRET, PASSWORD, "tok-");

    private Wso2TestFixtures() {
    }

    static EnvironmentProperties env() {
        return env(BASE_URL, TOKEN_URL, 100);
    }

    static EnvironmentProperties env(int pageSize) {
        return env(BASE_URL, TOKEN_URL, pageSize);
    }

    static EnvironmentProperties env(String baseUrl, String tokenUrl, int pageSize) {
        return env(ENV, baseUrl, tokenUrl, pageSize);
    }

    static EnvironmentProperties env(String name, String baseUrl, String tokenUrl, int pageSize) {
        return new EnvironmentProperties(name, URI.create(baseUrl), URI.create(tokenUrl), CLIENT_ID,
                CLIENT_SECRET, USERNAME, PASSWORD, SCOPES, null, pageSize, Duration.ofSeconds(5),
                Duration.ofSeconds(30));
    }

    static String tokenJson(String token, long expiresIn) {
        return tokenJson(token, expiresIn, String.join(" ", SCOPES));
    }

    static String tokenJson(String token, long expiresIn, String scope) {
        String scopeField = scope == null ? "" : ",\"scope\":\"" + scope + "\"";
        return "{\"access_token\":\"" + token + "\",\"token_type\":\"Bearer\",\"expires_in\":" + expiresIn
                + scopeField + "}";
    }

    /** Page d'API WSO2 ; total null = champ pagination.total absent. */
    static String apiPage(int from, int count, Integer total) {
        String items = IntStream.range(from, from + count)
                .mapToObj(i -> "{\"id\":\"api-" + i + "\",\"name\":\"api-" + i + "\",\"version\":\"1.0\"}")
                .collect(Collectors.joining(","));
        String pagination = total == null
                ? "{\"offset\":" + from + ",\"limit\":" + count + "}"
                : "{\"offset\":" + from + ",\"limit\":" + count + ",\"total\":" + total + "}";
        return "{\"count\":" + count + ",\"list\":[" + items + "],\"pagination\":" + pagination + "}";
    }
}
