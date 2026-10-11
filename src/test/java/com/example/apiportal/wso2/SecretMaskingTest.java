package com.example.apiportal.wso2;

import static com.example.apiportal.wso2.Wso2TestFixtures.BASE_URL;
import static com.example.apiportal.wso2.Wso2TestFixtures.CLIENT_SECRET;
import static com.example.apiportal.wso2.Wso2TestFixtures.PASSWORD;
import static com.example.apiportal.wso2.Wso2TestFixtures.SECRETS;
import static com.example.apiportal.wso2.Wso2TestFixtures.TOKEN_URL;
import static com.example.apiportal.wso2.Wso2TestFixtures.apiPage;
import static com.example.apiportal.wso2.Wso2TestFixtures.tokenJson;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.function.Consumer;
import java.util.stream.Stream;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class SecretMaskingTest {

    private static final String API_LIST = BASE_URL + "/api/am/publisher/v4/apis?limit=100&offset=0";
    private static final String TOKEN = "tok-very-secret";

    @Test
    void environmentPropertiesMaskSecrets() {
        String text = Wso2TestFixtures.env().toString();

        assertThat(text).doesNotContain(CLIENT_SECRET, PASSWORD).contains("clientSecret=***", "password=***");
    }

    @Test
    void wso2PropertiesMaskSecretsOfEveryEnvironment() {
        String text = new Wso2Properties(List.of(Wso2TestFixtures.env(),
                Wso2TestFixtures.env("exp", BASE_URL, TOKEN_URL, 100))).toString();

        assertThat(text).doesNotContain(CLIENT_SECRET, PASSWORD).contains("dev", "exp");
    }

    @Test
    void tokenRecordsNeverPrintTheToken() {
        assertThat(new Wso2TokenProvider.TokenResponse(TOKEN, 3600L, "apim:api_view").toString())
                .doesNotContain(TOKEN);
        assertThat(new Wso2TokenProvider.CachedToken(TOKEN, Instant.EPOCH).toString())
                .doesNotContain(TOKEN);
    }

    static Stream<Arguments> failures() {
        String scopes = String.join(" ", Wso2TestFixtures.SCOPES);
        // Les corps d'erreur WSO2 reflètent volontairement les secrets : ils ne doivent jamais remonter
        String echo = "{\"error\":\"" + PASSWORD + " " + CLIENT_SECRET + " " + TOKEN + "\"}";
        return Stream.of(
                Arguments.of("token endpoint 401", (Consumer<MockRestServiceServer>) server ->
                        server.expect(requestTo(TOKEN_URL))
                                .andRespond(withStatus(HttpStatus.UNAUTHORIZED).body(echo)
                                        .contentType(MediaType.APPLICATION_JSON))),
                Arguments.of("token endpoint unreachable", (Consumer<MockRestServiceServer>) server ->
                        server.expect(requestTo(TOKEN_URL)).andRespond(withException(new IOException("refused")))),
                Arguments.of("token endpoint garbage", (Consumer<MockRestServiceServer>) server ->
                        server.expect(requestTo(TOKEN_URL))
                                .andRespond(withSuccess("{\"access_token\":\"" + TOKEN + "\",", MediaType.APPLICATION_JSON))),
                Arguments.of("missing scopes", (Consumer<MockRestServiceServer>) server ->
                        server.expect(requestTo(TOKEN_URL))
                                .andRespond(withSuccess(tokenJson(TOKEN, 3600, "apim:api_view"), MediaType.APPLICATION_JSON))),
                Arguments.of("API 401 twice", (Consumer<MockRestServiceServer>) server -> {
                    server.expect(requestTo(TOKEN_URL)).andRespond(withSuccess(tokenJson(TOKEN, 3600, scopes), MediaType.APPLICATION_JSON));
                    server.expect(requestTo(API_LIST)).andRespond(withStatus(HttpStatus.UNAUTHORIZED).body(echo));
                    server.expect(requestTo(TOKEN_URL)).andRespond(withSuccess(tokenJson(TOKEN, 3600, scopes), MediaType.APPLICATION_JSON));
                    server.expect(requestTo(API_LIST)).andRespond(withStatus(HttpStatus.UNAUTHORIZED).body(echo));
                }),
                Arguments.of("API 403", (Consumer<MockRestServiceServer>) server -> {
                    server.expect(requestTo(TOKEN_URL)).andRespond(withSuccess(tokenJson(TOKEN, 3600, scopes), MediaType.APPLICATION_JSON));
                    server.expect(requestTo(API_LIST)).andRespond(withStatus(HttpStatus.FORBIDDEN).body(echo));
                }),
                Arguments.of("API 500", (Consumer<MockRestServiceServer>) server -> {
                    server.expect(requestTo(TOKEN_URL)).andRespond(withSuccess(tokenJson(TOKEN, 3600, scopes), MediaType.APPLICATION_JSON));
                    server.expect(requestTo(API_LIST)).andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR).body(echo));
                }),
                Arguments.of("API garbage", (Consumer<MockRestServiceServer>) server -> {
                    server.expect(requestTo(TOKEN_URL)).andRespond(withSuccess(tokenJson(TOKEN, 3600, scopes), MediaType.APPLICATION_JSON));
                    server.expect(requestTo(API_LIST)).andRespond(withSuccess("{\"list\":[\"" + TOKEN, MediaType.APPLICATION_JSON));
                }),
                Arguments.of("pagination guard", (Consumer<MockRestServiceServer>) server -> {
                    server.expect(requestTo(TOKEN_URL)).andRespond(withSuccess(tokenJson(TOKEN, 3600, scopes), MediaType.APPLICATION_JSON));
                    for (int i = 0; i < Wso2Client.MAX_ITEMS / 1000; i++) {
                        server.expect(requestTo(BASE_URL + "/api/am/publisher/v4/apis?limit=1000&offset=" + i * 1000))
                                .andRespond(withSuccess(apiPage(i * 1000, 1000, null), MediaType.APPLICATION_JSON));
                    }
                }));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("failures")
    void exceptionChainNeverContainsSecrets(String scenario, Consumer<MockRestServiceServer> expectations) {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        RestClient restClient = builder.build();
        var env = scenario.equals("pagination guard") ? Wso2TestFixtures.env(1000) : Wso2TestFixtures.env();
        var client = new Wso2Client(env, restClient,
                new Wso2TokenProvider(env, restClient, new MutableClock(Instant.EPOCH)));
        expectations.accept(server);

        Throwable thrown = catchThrowable(client::listApis);

        assertThat(thrown).isInstanceOf(Wso2ClientException.class);
        for (Throwable t = thrown; t != null; t = t.getCause()) {
            assertThat(String.valueOf(t.getMessage())).as("message of %s", t.getClass().getName())
                    .doesNotContain(PASSWORD, CLIENT_SECRET, TOKEN);
            assertThat(t.toString()).doesNotContain(SECRETS.toArray(String[]::new));
        }
        server.verify();
    }
}
