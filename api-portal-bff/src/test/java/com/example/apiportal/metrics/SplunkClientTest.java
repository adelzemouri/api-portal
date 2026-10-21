package com.example.apiportal.metrics;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class SplunkClientTest {

    private static final String TOKEN = "s3cr3t-token-value";

    private MockRestServiceServer server;
    private SplunkClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://splunk.test:8089");
        server = MockRestServiceServer.bindTo(builder).build();
        client = new SplunkClient(builder.build(), TOKEN);
    }

    @Test
    @DisplayName("la recherche est un POST vers l'export, avec le jeton en Bearer, la requête et les bornes de temps")
    void sendsAReadOnlySearchWithABearerToken() {
        server.expect(requestTo("https://splunk.test:8089/services/search/v2/jobs/export"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer " + TOKEN))
                .andExpect(header("Content-Type", MediaType.APPLICATION_FORM_URLENCODED_VALUE))
                .andExpect(content().string(org.hamcrest.Matchers.allOf(
                        org.hamcrest.Matchers.containsString("output_mode=json"),
                        org.hamcrest.Matchers.containsString("earliest_time=-24h%40h"),
                        org.hamcrest.Matchers.containsString("latest_time=now"),
                        org.hamcrest.Matchers.containsString("search=search+index%3D%22x%22"))))
                .andRespond(withSuccess("", MediaType.APPLICATION_JSON));

        assertThat(client.search("search index=\"x\"", "-24h@h", "now")).isEmpty();
        server.verify();
    }

    @Test
    @DisplayName("une ligne JSON par résultat ; les valeurs restent du texte, les lignes sans résultat sont ignorées")
    void parsesOneRowPerResultLine() {
        server.expect(requestTo("https://splunk.test:8089/services/search/v2/jobs/export"))
                .andRespond(withSuccess("""
                        {"preview":false,"offset":0,"result":{"apiName":"Payments","calls":"120","p95":"310.5"}}
                        {"preview":false,"offset":1,"result":{"apiName":"Cards","calls":"7"}}

                        {"lastrow":true}
                        """, MediaType.APPLICATION_JSON));

        List<Map<String, String>> rows = client.search("search x", "-24h", "now");

        assertThat(rows).containsExactly(
                Map.of("apiName", "Payments", "calls", "120", "p95", "310.5"),
                Map.of("apiName", "Cards", "calls", "7"));
    }

    @Test
    @DisplayName("un refus HTTP donne un message générique : ni jeton, ni requête, ni corps de réponse")
    void httpErrorsNeverLeakAnything() {
        server.expect(requestTo("https://splunk.test:8089/services/search/v2/jobs/export"))
                .andRespond(withStatus(HttpStatus.UNAUTHORIZED).body("bad token " + TOKEN + " for search index=secret")
                        .contentType(MediaType.TEXT_PLAIN));

        assertThatThrownBy(() -> client.search("search index=secret", "-24h", "now"))
                .isInstanceOf(MetricsException.class)
                .hasMessage("Splunk answered HTTP 401")
                .satisfies(e -> assertThat(e.getMessage()).doesNotContain(TOKEN, "secret"));
    }

    @Test
    @DisplayName("Splunk injoignable : message générique")
    void networkFailure() {
        server.expect(requestTo("https://splunk.test:8089/services/search/v2/jobs/export"))
                .andRespond(withException(new IOException("connect to 10.1.2.3 failed")));

        assertThatThrownBy(() -> client.search("search x", "-24h", "now"))
                .isInstanceOf(MetricsException.class).hasMessage("Splunk unreachable");
    }

    @Test
    @DisplayName("une recherche rejetée (message FATAL) ou une réponse illisible échouent, sans reprendre le texte de Splunk")
    void rejectedSearchAndGarbage() {
        server.expect(requestTo("https://splunk.test:8089/services/search/v2/jobs/export"))
                .andRespond(withSuccess("{\"messages\":[{\"type\":\"FATAL\",\"text\":\"Unknown search command 'foo'\"}]}",
                        MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> client.search("search x", "-24h", "now"))
                .isInstanceOf(MetricsException.class).hasMessage("Splunk rejected the search");

        server.reset();
        server.expect(requestTo("https://splunk.test:8089/services/search/v2/jobs/export"))
                .andRespond(withSuccess("<html>login</html>", MediaType.TEXT_HTML));
        assertThatThrownBy(() -> client.search("search x", "-24h", "now"))
                .isInstanceOf(MetricsException.class).hasMessage("Splunk sent an unreadable answer");
    }
}
