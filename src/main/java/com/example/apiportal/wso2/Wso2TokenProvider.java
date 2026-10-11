package com.example.apiportal.wso2;

import com.example.apiportal.wso2.Wso2Properties.EnvironmentProperties;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.springframework.http.MediaType;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Jeton OAuth d'un environnement (grant password, compte de service lecture seule).
 * Le jeton est mis en cache et renouvelé avant son expiration.
 */
public class Wso2TokenProvider {

    // Renouvellement anticipé : absorbe le décalage d'horloge et la latence réseau
    static final Duration MAX_REFRESH_MARGIN = Duration.ofSeconds(60);

    private final EnvironmentProperties env;
    private final RestClient restClient;
    private final Clock clock;

    private CachedToken cached;

    public Wso2TokenProvider(EnvironmentProperties env, RestClient restClient, Clock clock) {
        this.env = env;
        this.restClient = restClient;
        this.clock = clock;
    }

    public synchronized String accessToken() {
        Instant now = clock.instant();
        if (cached == null || !now.isBefore(cached.refreshAt())) {
            cached = requestToken(now);
        }
        return cached.value();
    }

    /** Appelé sur 401 : le jeton a pu être révoqué côté WSO2 avant son expiration. */
    public synchronized void invalidate() {
        cached = null;
    }

    private CachedToken requestToken(Instant now) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "password");
        form.add("username", env.username());
        form.add("password", env.password());
        form.add("scope", String.join(" ", env.scopes()));

        TokenResponse response;
        try {
            response = restClient.post()
                    .uri(env.tokenUrl())
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .accept(MediaType.APPLICATION_JSON)
                    .headers(h -> h.setBasicAuth(env.clientId(), env.clientSecret(), StandardCharsets.UTF_8))
                    .body(form)
                    .exchange((request, res) -> {
                        if (!res.getStatusCode().is2xxSuccessful()) {
                            // Corps de réponse volontairement ignoré : il peut refléter la requête
                            throw new Wso2ClientException(env.name(),
                                    "token request failed: HTTP " + res.getStatusCode().value());
                        }
                        return res.bodyTo(TokenResponse.class);
                    });
        } catch (ResourceAccessException e) {
            throw new Wso2ClientException(env.name(), "token endpoint unreachable", e);
        } catch (RestClientException e) {
            // Pas de cause : une erreur de parsing peut citer le corps, donc le jeton
            throw new Wso2ClientException(env.name(),
                    "token request failed: " + e.getClass().getSimpleName());
        }

        if (response == null || response.accessToken() == null || response.accessToken().isBlank()
                || response.expiresIn() == null || response.expiresIn() <= 0) {
            throw new Wso2ClientException(env.name(), "invalid token response");
        }
        checkGrantedScopes(response.scope());

        Duration lifetime = Duration.ofSeconds(response.expiresIn());
        Duration margin = lifetime.dividedBy(2).compareTo(MAX_REFRESH_MARGIN) < 0
                ? lifetime.dividedBy(2) : MAX_REFRESH_MARGIN;
        return new CachedToken(response.accessToken(), now.plus(lifetime).minus(margin));
    }

    // WSO2 retire silencieusement les scopes non autorisés : on échoue plutôt que d'avoir des 403 diffus
    private void checkGrantedScopes(String grantedScopes) {
        Set<String> granted = grantedScopes == null
                ? Set.of() : new HashSet<>(Arrays.asList(grantedScopes.trim().split("\\s+")));
        List<String> missing = new ArrayList<>();
        for (String scope : env.scopes()) {
            if (!granted.contains(scope)) {
                missing.add(scope);
            }
        }
        if (!missing.isEmpty()) {
            throw new Wso2ClientException(env.name(), "WSO2 did not grant requested scopes: " + missing);
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record TokenResponse(@JsonProperty("access_token") String accessToken,
                         @JsonProperty("expires_in") Long expiresIn,
                         @JsonProperty("scope") String scope) {

        @Override
        public String toString() {
            return "TokenResponse[accessToken=***, expiresIn=" + expiresIn + ", scope=" + scope + "]";
        }
    }

    record CachedToken(String value, Instant refreshAt) {

        @Override
        public String toString() {
            return "CachedToken[value=***, refreshAt=" + refreshAt + "]";
        }
    }
}
