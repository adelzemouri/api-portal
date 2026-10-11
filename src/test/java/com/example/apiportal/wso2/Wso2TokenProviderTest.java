package com.example.apiportal.wso2;

import static com.example.apiportal.wso2.Wso2TestFixtures.CLIENT_ID;
import static com.example.apiportal.wso2.Wso2TestFixtures.CLIENT_SECRET;
import static com.example.apiportal.wso2.Wso2TestFixtures.PASSWORD;
import static com.example.apiportal.wso2.Wso2TestFixtures.TOKEN_URL;
import static com.example.apiportal.wso2.Wso2TestFixtures.USERNAME;
import static com.example.apiportal.wso2.Wso2TestFixtures.tokenJson;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

class Wso2TokenProviderTest {

    private MockRestServiceServer server;
    private MutableClock clock;
    private Wso2TokenProvider provider;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        clock = new MutableClock(Instant.parse("2026-01-01T00:00:00Z"));
        provider = new Wso2TokenProvider(Wso2TestFixtures.env(), builder.build(), clock);
    }

    private void expectToken(String json) {
        server.expect(once(), requestTo(TOKEN_URL))
                .andRespond(withSuccess(json, MediaType.APPLICATION_JSON));
    }

    @Test
    void cachesTokenBetweenCalls() {
        expectToken(tokenJson("tok-1", 3600));

        assertThat(provider.accessToken()).isEqualTo("tok-1");
        assertThat(provider.accessToken()).isEqualTo("tok-1");
        server.verify();
    }

    @Test
    void sendsPasswordGrantWithBasicClientAuth() {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "password");
        form.add("username", USERNAME);
        form.add("password", PASSWORD);
        form.add("scope", String.join(" ", Wso2TestFixtures.SCOPES));
        String basic = Base64.getEncoder()
                .encodeToString((CLIENT_ID + ":" + CLIENT_SECRET).getBytes(StandardCharsets.UTF_8));

        server.expect(requestTo(TOKEN_URL))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_FORM_URLENCODED))
                .andExpect(header(HttpHeaders.AUTHORIZATION, "Basic " + basic))
                .andExpect(content().formData(form))
                .andRespond(withSuccess(tokenJson("tok-1", 3600), MediaType.APPLICATION_JSON));

        provider.accessToken();
        server.verify();
    }

    @Test
    void renewsSixtySecondsBeforeExpiry() {
        expectToken(tokenJson("tok-1", 3600));
        expectToken(tokenJson("tok-2", 3600));

        assertThat(provider.accessToken()).isEqualTo("tok-1");
        clock.advance(Duration.ofSeconds(3539));
        assertThat(provider.accessToken()).isEqualTo("tok-1");
        clock.advance(Duration.ofSeconds(1));
        assertThat(provider.accessToken()).isEqualTo("tok-2");
        server.verify();
    }

    @Test
    void capsRenewalMarginAtHalfTheLifetime() {
        expectToken(tokenJson("tok-1", 30));
        expectToken(tokenJson("tok-2", 30));

        assertThat(provider.accessToken()).isEqualTo("tok-1");
        clock.advance(Duration.ofSeconds(14));
        assertThat(provider.accessToken()).isEqualTo("tok-1");
        clock.advance(Duration.ofSeconds(1));
        assertThat(provider.accessToken()).isEqualTo("tok-2");
        server.verify();
    }

    @Test
    void invalidateForcesNewRequest() {
        expectToken(tokenJson("tok-1", 3600));
        expectToken(tokenJson("tok-2", 3600));

        assertThat(provider.accessToken()).isEqualTo("tok-1");
        provider.invalidate();
        assertThat(provider.accessToken()).isEqualTo("tok-2");
        server.verify();
    }

    @Test
    void failsExplicitlyWhenAScopeIsNotGrantedAndCachesNothing() {
        expectToken(tokenJson("tok-1", 3600, "apim:api_view apim:subscription_view"));
        expectToken(tokenJson("tok-2", 3600, "apim:api_view apim:subscription_view"));

        assertThatThrownBy(provider::accessToken)
                .isInstanceOf(Wso2ClientException.class)
                .hasMessageStartingWith("[dev] ")
                .hasMessageContaining("apim:admin_application_view")
                .hasMessageNotContaining("apim:api_view");
        // Rien en cache : le second appel redemande un jeton
        assertThatThrownBy(provider::accessToken).isInstanceOf(Wso2ClientException.class);
        server.verify();
    }

    @Test
    void failsListingAllScopesWhenScopeFieldIsMissing() {
        expectToken(tokenJson("tok-1", 3600, null));

        assertThatThrownBy(provider::accessToken)
                .isInstanceOf(Wso2ClientException.class)
                .hasMessageContaining("apim:api_view")
                .hasMessageContaining("apim:subscription_view")
                .hasMessageContaining("apim:admin_application_view");
    }

    @Test
    void acceptsScopesInAnotherOrderOrWithExtras() {
        expectToken(tokenJson("tok-1", 3600,
                "openid apim:admin_application_view apim:subscription_view default apim:api_view"));

        assertThat(provider.accessToken()).isEqualTo("tok-1");
    }

    @Test
    void rejectsTokenResponseWithoutAccessToken() {
        expectToken("{\"expires_in\":3600,\"scope\":\"" + String.join(" ", Wso2TestFixtures.SCOPES) + "\"}");

        assertThatThrownBy(provider::accessToken)
                .isInstanceOf(Wso2ClientException.class)
                .hasMessage("[dev] invalid token response");
    }

    @Test
    void rejectsTokenResponseWithZeroLifetime() {
        expectToken(tokenJson("tok-1", 0));

        assertThatThrownBy(provider::accessToken)
                .isInstanceOf(Wso2ClientException.class)
                .hasMessage("[dev] invalid token response");
    }

    @Test
    void reportsHttpStatusOfTokenEndpoint() {
        server.expect(requestTo(TOKEN_URL)).andRespond(withStatus(HttpStatus.UNAUTHORIZED));
        server.expect(requestTo(TOKEN_URL)).andRespond(withStatus(HttpStatus.BAD_REQUEST));

        assertThatThrownBy(provider::accessToken)
                .isInstanceOf(Wso2ClientException.class)
                .hasMessage("[dev] token request failed: HTTP 401");
        assertThatThrownBy(provider::accessToken)
                .isInstanceOf(Wso2ClientException.class)
                .hasMessage("[dev] token request failed: HTTP 400");
    }
}
