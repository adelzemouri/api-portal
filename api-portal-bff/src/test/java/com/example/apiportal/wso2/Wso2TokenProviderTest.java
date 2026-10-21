package com.example.apiportal.wso2;

import static com.example.apiportal.wso2.Wso2TestSupport.ALL_SCOPES;
import static com.example.apiportal.wso2.Wso2TestSupport.ENV;
import static com.example.apiportal.wso2.Wso2TestSupport.PASSWORD;
import static com.example.apiportal.wso2.Wso2TestSupport.SCOPES;
import static com.example.apiportal.wso2.Wso2TestSupport.TOKEN_URL;
import static com.example.apiportal.wso2.Wso2TestSupport.USERNAME;
import static com.example.apiportal.wso2.Wso2TestSupport.assertNoSecrets;
import static com.example.apiportal.wso2.Wso2TestSupport.basicAuthHeader;
import static com.example.apiportal.wso2.Wso2TestSupport.tokenJson;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.http.HttpHeaders.AUTHORIZATION;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.example.apiportal.wso2.Wso2TestSupport.Fixture;
import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

class Wso2TokenProviderTest {

    private static final String GRANTED = ALL_SCOPES;

    private final MutableClock clock = new MutableClock(Instant.parse("2026-01-01T00:00:00Z"));
    private Fixture fixture;
    private Wso2TokenProvider provider;

    @BeforeEach
    void setUp() {
        fixture = Wso2TestSupport.fixture();
        provider = Wso2TestSupport.tokenProvider(fixture, clock);
    }

    /** Attend un POST token bien formé (grant password, Basic auth du client, scopes demandés). */
    private void expectTokenRequest(String responseBody) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "password");
        form.add("username", USERNAME);
        form.add("password", PASSWORD);
        form.add("scope", String.join(" ", SCOPES));
        fixture.server().expect(requestTo(TOKEN_URL))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header(AUTHORIZATION, basicAuthHeader()))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_FORM_URLENCODED))
                .andExpect(content().formData(form))
                .andRespond(withSuccess(responseBody, MediaType.APPLICATION_JSON));
    }

    private void expectTokenRequest(String token, long expiresIn, String scope) {
        expectTokenRequest(tokenJson(token, expiresIn, scope));
    }

    @Test
    @DisplayName("le token est mis en cache entre deux appels")
    void cachesTokenBetweenCalls() {
        expectTokenRequest("S3CR3T-token-1", 3600, GRANTED);

        assertThat(provider.accessToken()).isEqualTo("S3CR3T-token-1");
        assertThat(provider.accessToken()).isEqualTo("S3CR3T-token-1");

        fixture.server().verify();
    }

    @Test
    @DisplayName("la requête token utilise le grant password, le Basic auth du client et les scopes configurés")
    void sendsPasswordGrantWithClientAuthAndScopes() {
        expectTokenRequest("S3CR3T-token-1", 3600, GRANTED);

        provider.accessToken();

        fixture.server().verify();
    }

    @Test
    @DisplayName("renouvellement anticipé : marge de 60 s avant l'expiration")
    void refreshesTokenBeforeExpiry() {
        expectTokenRequest("S3CR3T-token-1", 3600, GRANTED);
        expectTokenRequest("S3CR3T-token-2", 3600, GRANTED);

        assertThat(provider.accessToken()).isEqualTo("S3CR3T-token-1");

        // Valide jusqu'à t+3540 s (3600 - marge de 60 s) : à t+3539 s le cache sert encore.
        clock.advance(Duration.ofSeconds(3539));
        assertThat(provider.accessToken()).isEqualTo("S3CR3T-token-1");

        clock.advance(Duration.ofSeconds(1));
        assertThat(provider.accessToken()).isEqualTo("S3CR3T-token-2");

        fixture.server().verify();
    }

    @Test
    @DisplayName("la marge est plafonnée à la moitié de la durée de vie d'un token court")
    void capsMarginAtHalfLifetimeForShortTokens() {
        expectTokenRequest("S3CR3T-token-1", 100, GRANTED);
        expectTokenRequest("S3CR3T-token-2", 100, GRANTED);

        provider.accessToken();

        clock.advance(Duration.ofSeconds(49));
        assertThat(provider.accessToken()).isEqualTo("S3CR3T-token-1");

        clock.advance(Duration.ofSeconds(1));
        assertThat(provider.accessToken()).isEqualTo("S3CR3T-token-2");

        fixture.server().verify();
    }

    @Test
    @DisplayName("invalidate() force l'obtention d'un nouveau token")
    void invalidateForcesNewToken() {
        expectTokenRequest("S3CR3T-token-1", 3600, GRANTED);
        expectTokenRequest("S3CR3T-token-2", 3600, GRANTED);

        assertThat(provider.accessToken()).isEqualTo("S3CR3T-token-1");
        provider.invalidate();
        assertThat(provider.accessToken()).isEqualTo("S3CR3T-token-2");

        fixture.server().verify();
    }

    @Test
    @DisplayName("échec explicite si WSO2 retire un scope demandé, et rien n'est mis en cache")
    void failsWhenRequestedScopeIsNotGranted() {
        // WSO2 retire silencieusement le scope admin : le token reste émis, avec moins de scopes.
        expectTokenRequest("S3CR3T-token-1", 3600, "apim:api_view apim:subscription_view");
        expectTokenRequest("S3CR3T-token-2", 3600, "apim:api_view apim:subscription_view");

        assertThatThrownBy(provider::accessToken)
                .isInstanceOfSatisfying(Wso2ClientException.class, e -> {
                    assertThat(e.environment()).isEqualTo(ENV);
                    assertThat(e).hasMessageContaining("[dev]")
                            .hasMessageContaining("scopes not granted")
                            .hasMessageContaining("apim:admin_application_view")
                            .hasMessageNotContaining("apim:api_view");
                    assertNoSecrets(e);
                });

        // Un token refusé n'est pas mis en cache : l'appel suivant redemande un token.
        assertThatThrownBy(provider::accessToken).isInstanceOf(Wso2ClientException.class);

        fixture.server().verify();
    }

    @Test
    @DisplayName("échec explicite si la réponse ne contient aucun scope")
    void failsWhenResponseHasNoScope() {
        expectTokenRequest("S3CR3T-token-1", 3600, null);

        assertThatThrownBy(provider::accessToken)
                .isInstanceOfSatisfying(Wso2ClientException.class, e -> {
                    assertThat(e).hasMessageContaining("scopes not granted");
                    SCOPES.forEach(scope -> assertThat(e).hasMessageContaining(scope));
                    assertNoSecrets(e);
                });
    }

    @Test
    @DisplayName("des scopes accordés en plus de ceux demandés ne posent pas de problème")
    void acceptsExtraGrantedScopes() {
        expectTokenRequest("S3CR3T-token-1", 3600, GRANTED + " default");

        assertThat(provider.accessToken()).isEqualTo("S3CR3T-token-1");
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "",
            "{\"expires_in\":3600,\"scope\":\"" + GRANTED + "\"}",
            "{\"access_token\":\"S3CR3T-x\",\"scope\":\"" + GRANTED + "\"}",
            "{\"access_token\":\"S3CR3T-x\",\"expires_in\":0,\"scope\":\"" + GRANTED + "\"}",
            "{\"access_token\":\"S3CR3T-x\",\"expires_in\":-5,\"scope\":\"" + GRANTED + "\"}"
    })
    @DisplayName("une réponse token vide ou incomplète est refusée")
    void rejectsInvalidTokenResponses(String body) {
        expectTokenRequest(body);

        assertThatThrownBy(provider::accessToken)
                .isInstanceOfSatisfying(Wso2ClientException.class, e -> {
                    assertThat(e).hasMessage("[dev] invalid token response");
                    assertNoSecrets(e);
                });
    }

    @ParameterizedTest
    @ValueSource(ints = {400, 401, 500, 503})
    @DisplayName("une erreur HTTP du token endpoint est rattachée à l'environnement, sans secret")
    void wrapsTokenEndpointHttpErrors(int status) {
        fixture.server().expect(requestTo(TOKEN_URL))
                .andRespond(withStatus(HttpStatus.valueOf(status))
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("{\"error\":\"invalid_client\"}"));

        assertThatThrownBy(provider::accessToken)
                .isInstanceOfSatisfying(Wso2ClientException.class, e -> {
                    assertThat(e).hasMessage("[dev] token endpoint returned HTTP " + status);
                    assertNoSecrets(e);
                });
    }

    @Test
    @DisplayName("un token endpoint injoignable donne une erreur explicite")
    void wrapsUnreachableTokenEndpoint() {
        fixture.server().expect(requestTo(TOKEN_URL))
                .andRespond(request -> {
                    throw new IOException("Connection refused");
                });

        assertThatThrownBy(provider::accessToken)
                .isInstanceOfSatisfying(Wso2ClientException.class, e -> {
                    assertThat(e).hasMessage("[dev] token endpoint unreachable");
                    assertNoSecrets(e);
                });
    }

    @Test
    @DisplayName("une réponse non JSON (ex. page de login) est rattachée à l'environnement")
    void wrapsNonJsonTokenResponse() {
        fixture.server().expect(requestTo(TOKEN_URL))
                .andRespond(withSuccess("<html>login</html>", MediaType.TEXT_HTML));

        assertThatThrownBy(provider::accessToken)
                .isInstanceOfSatisfying(Wso2ClientException.class, e -> {
                    assertThat(e).hasMessage("[dev] token endpoint returned an unexpected response format");
                    assertNoSecrets(e);
                });
    }

    @Test
    @DisplayName("une erreur 5xx du token endpoint n'est pas mise en cache")
    void doesNotCacheFailures() {
        fixture.server().expect(requestTo(TOKEN_URL)).andRespond(withServerError());
        expectTokenRequest("S3CR3T-token-1", 3600, GRANTED);

        assertThatThrownBy(provider::accessToken).isInstanceOf(Wso2ClientException.class);
        assertThat(provider.accessToken()).isEqualTo("S3CR3T-token-1");

        fixture.server().verify();
    }
}
