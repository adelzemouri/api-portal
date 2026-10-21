package com.example.apiportal.wso2;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.example.apiportal.wso2.Wso2Properties.EnvironmentProperties;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.Base64;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** Fabriques et constantes partagées par les tests de la couche client WSO2. */
final class Wso2TestSupport {

    static final String ENV = "dev";
    static final String BASE_URL = "https://apim-dev.test:9443";
    static final String TOKEN_URL = BASE_URL + "/oauth2/token";
    static final String CLIENT_ID = "portal-client-id";

    /**
     * Les secrets de test partagent le marqueur {@link #SECRET_MARKER} : les tests vérifient
     * son absence des messages d'exception et des toString().
     */
    static final String SECRET_MARKER = "S3CR3T";
    static final String CLIENT_SECRET = SECRET_MARKER + "-client-secret";
    static final String USERNAME = "svc_apiportal_ro";
    static final String PASSWORD = SECRET_MARKER + "-password";
    static final String ACCESS_TOKEN = SECRET_MARKER + "-access-token";

    // Littéral (constante de compilation) : utilisé dans des annotations @ValueSource.
    static final String ALL_SCOPES = "apim:api_view apim:subscription_view apim:admin_application_view";
    static final List<String> SCOPES = List.of(ALL_SCOPES.split(" "));

    private Wso2TestSupport() {
    }

    /** Un RestClient dont tous les appels (token compris) sont interceptés par le serveur factice. */
    record Fixture(RestClient restClient, MockRestServiceServer server) {
    }

    static Fixture fixture() {
        RestClient.Builder builder = RestClient.builder().baseUrl(BASE_URL);
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        return new Fixture(builder.build(), server);
    }

    static EnvironmentProperties env() {
        return env(BASE_URL, TOKEN_URL);
    }

    static EnvironmentProperties env(String baseUrl, String tokenUrl) {
        return new EnvironmentProperties("DEV", URI.create(baseUrl), URI.create(tokenUrl),
                CLIENT_ID, CLIENT_SECRET, USERNAME, PASSWORD, null);
    }

    static Wso2TokenProvider tokenProvider(Fixture fixture, Clock clock) {
        return new Wso2TokenProvider(ENV, env(), fixture.restClient(), SCOPES, clock);
    }

    static Wso2Client client(Fixture fixture, Clock clock, int pageSize) {
        return new Wso2Client(ENV, "DEV", fixture.restClient(), tokenProvider(fixture, clock), pageSize);
    }

    static String basicAuthHeader() {
        String credentials = CLIENT_ID + ":" + CLIENT_SECRET;
        return "Basic " + Base64.getEncoder().encodeToString(credentials.getBytes(StandardCharsets.UTF_8));
    }

    /** Réponse du token endpoint ; un scope null est omis de la réponse. */
    static String tokenJson(String token, long expiresIn, String scope) {
        String scopePart = scope == null ? "" : ",\"scope\":\"%s\"".formatted(scope);
        return "{\"access_token\":\"%s\",\"token_type\":\"Bearer\",\"expires_in\":%d%s}"
                .formatted(token, expiresIn, scopePart);
    }

    /** Attend un POST sur le token endpoint et répond avec un token valide 1 h, tous scopes accordés. */
    static void expectToken(MockRestServiceServer server, String token) {
        server.expect(requestTo(TOKEN_URL))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess(tokenJson(token, 3600, ALL_SCOPES), MediaType.APPLICATION_JSON));
    }

    /** Page de l'API Publisher ; {@code total} null : le bloc "pagination" est absent. */
    static String apisPage(Integer total, String... ids) {
        String list = Stream.of(ids)
                .map(id -> "{\"id\":\"%s\",\"name\":\"api-%s\",\"version\":\"1.0\"}".formatted(id, id))
                .collect(Collectors.joining(","));
        String pagination = total == null ? "" : ",\"pagination\":{\"total\":%d}".formatted(total);
        return "{\"count\":%d,\"list\":[%s]%s}".formatted(ids.length, list, pagination);
    }

    /** Ni le message ni ceux de la chaîne de causes ne doivent contenir de secret. */
    static void assertNoSecrets(Throwable throwable) {
        for (Throwable t = throwable; t != null; t = t.getCause()) {
            assertThat(String.valueOf(t.getMessage()))
                    .as("message de %s", t.getClass().getSimpleName())
                    .doesNotContain(SECRET_MARKER);
        }
    }
}
