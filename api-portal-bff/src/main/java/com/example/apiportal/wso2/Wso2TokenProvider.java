package com.example.apiportal.wso2;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.locks.ReentrantLock;
import java.util.stream.Collectors;
import org.springframework.http.MediaType;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

/**
 * Obtient et met en cache le token d'un control plane.
 *
 * <p>Grant "password" : les REST API Publisher et Admin de WSO2 4.x exigent un contexte
 * utilisateur. Le client OAuth (clientId/secret) est enregistré une seule fois par DCR,
 * hors application, pour ne jamais avoir besoin de droits d'enregistrement au runtime.
 */
final class Wso2TokenProvider {

    private static final long MAX_EXPIRY_MARGIN_SECONDS = 60;

    private final String environment;
    private final Wso2Properties.EnvironmentProperties env;
    private final RestClient restClient;
    private final Set<String> requiredScopes;
    private final Clock clock;
    // ReentrantLock plutôt que synchronized : pas d'épinglage des virtual threads (Java 21).
    private final ReentrantLock lock = new ReentrantLock();
    private volatile CachedToken cached;

    Wso2TokenProvider(String environment,
                      Wso2Properties.EnvironmentProperties env,
                      RestClient restClient,
                      Collection<String> requiredScopes,
                      Clock clock) {
        this.environment = environment;
        this.env = env;
        this.restClient = restClient;
        this.requiredScopes = new LinkedHashSet<>(requiredScopes);
        this.clock = clock;
    }

    String accessToken() {
        CachedToken current = cached;
        if (current != null && current.isValidAt(clock.instant())) {
            return current.value();
        }
        lock.lock();
        try {
            current = cached;
            if (current == null || !current.isValidAt(clock.instant())) {
                current = fetchToken();
                cached = current;
            }
            return current.value();
        } finally {
            lock.unlock();
        }
    }

    /** Appelé sur 401 : le token a pu être révoqué côté WSO2 avant son expiration. */
    void invalidate() {
        cached = null;
    }

    private CachedToken fetchToken() {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "password");
        form.add("username", env.username());
        form.add("password", env.password());
        form.add("scope", String.join(" ", requiredScopes));

        TokenResponse response;
        try {
            response = restClient.post()
                    .uri(env.tokenUrl())
                    .headers(h -> h.setBasicAuth(env.clientId(), env.clientSecret()))
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .accept(MediaType.APPLICATION_JSON)
                    .body(form)
                    .retrieve()
                    .body(TokenResponse.class);
        } catch (RestClientResponseException e) {
            throw new Wso2ClientException(environment,
                    "token endpoint returned HTTP " + e.getStatusCode().value(), e);
        } catch (ResourceAccessException e) {
            throw new Wso2ClientException(environment, "token endpoint unreachable", e);
        } catch (RestClientException e) {
            // Réponse illisible (HTML, JSON invalide) : le message n'embarque pas le corps.
            throw new Wso2ClientException(environment, "token endpoint returned an unexpected response format", e);
        }

        if (response == null || response.accessToken() == null || response.expiresIn() <= 0) {
            throw new Wso2ClientException(environment, "invalid token response");
        }
        checkGrantedScopes(response.scope());

        long margin = Math.min(MAX_EXPIRY_MARGIN_SECONDS, response.expiresIn() / 2);
        Instant expiresAt = clock.instant()
                .plusSeconds(response.expiresIn())
                .minus(Duration.ofSeconds(margin));
        return new CachedToken(response.accessToken(), expiresAt);
    }

    /**
     * WSO2 ne rejette pas un scope non autorisé : il le retire silencieusement du token.
     * Sans ce contrôle, le problème n'apparaîtrait que plus tard, sous forme de 403 peu parlants.
     */
    private void checkGrantedScopes(String grantedScopes) {
        Set<String> granted = grantedScopes == null
                ? Set.of()
                : Arrays.stream(grantedScopes.split("\\s+"))
                        .filter(s -> !s.isBlank())
                        .collect(Collectors.toSet());
        Set<String> missing = new TreeSet<>(requiredScopes);
        missing.removeAll(granted);
        if (!missing.isEmpty()) {
            throw new Wso2ClientException(environment,
                    "scopes not granted to service account: " + missing
                            + " (check Admin Portal > Settings > Scope Assignments)");
        }
    }

    private record CachedToken(String value, Instant expiresAt) {
        boolean isValidAt(Instant now) {
            return now.isBefore(expiresAt);
        }

        @Override
        public String toString() {
            return "CachedToken[value=***, expiresAt=" + expiresAt + "]";
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record TokenResponse(
            @JsonProperty("access_token") String accessToken,
            @JsonProperty("expires_in") long expiresIn,
            @JsonProperty("scope") String scope) {

        @Override
        public String toString() {
            return "TokenResponse[accessToken=***, expiresIn=" + expiresIn + ", scope=" + scope + "]";
        }
    }
}
