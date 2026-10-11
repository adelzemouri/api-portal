package com.example.apiportal.wso2;

import static com.example.apiportal.wso2.Wso2TestFixtures.BASE_URL;
import static com.example.apiportal.wso2.Wso2TestFixtures.TOKEN_URL;
import static com.example.apiportal.wso2.Wso2TestFixtures.apiPage;
import static com.example.apiportal.wso2.Wso2TestFixtures.tokenJson;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.example.apiportal.wso2.Wso2Models.Api;
import com.example.apiportal.wso2.Wso2Models.Application;
import com.example.apiportal.wso2.Wso2Models.Revision;
import com.example.apiportal.wso2.Wso2Models.Subscription;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class Wso2ClientTest {

    private static final String PUBLISHER = BASE_URL + "/api/am/publisher/v4";
    private static final String ADMIN = BASE_URL + "/api/am/admin/v4";

    private MockRestServiceServer server;

    // Le token provider réel partage le mock : on vérifie aussi les requêtes de jeton
    private Wso2Client client(int pageSize) {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        RestClient restClient = builder.build();
        var env = Wso2TestFixtures.env(pageSize);
        var clock = new MutableClock(Instant.parse("2026-01-01T00:00:00Z"));
        return new Wso2Client(env, restClient, new Wso2TokenProvider(env, restClient, clock));
    }

    private Wso2Client client() {
        return client(100);
    }

    private void expectToken(String token) {
        server.expect(requestTo(TOKEN_URL)).andRespond(withSuccess(tokenJson(token, 3600), MediaType.APPLICATION_JSON));
    }

    private static String apisUri(int offset, int limit) {
        return PUBLISHER + "/apis?limit=" + limit + "&offset=" + offset;
    }

    @Test
    void retriesOnceOn401WithRenewedToken() {
        Wso2Client client = client();
        expectToken("tok-1");
        server.expect(requestTo(apisUri(0, 100)))
                .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer tok-1"))
                .andRespond(withStatus(HttpStatus.UNAUTHORIZED));
        expectToken("tok-2");
        server.expect(requestTo(apisUri(0, 100)))
                .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer tok-2"))
                .andRespond(withSuccess(apiPage(0, 2, 2), MediaType.APPLICATION_JSON));

        assertThat(client.listApis()).hasSize(2);
        server.verify();
    }

    @Test
    void failsWhen401PersistsAfterRenewal() {
        Wso2Client client = client();
        expectToken("tok-1");
        server.expect(requestTo(apisUri(0, 100))).andRespond(withStatus(HttpStatus.UNAUTHORIZED));
        expectToken("tok-2");
        server.expect(requestTo(apisUri(0, 100))).andRespond(withStatus(HttpStatus.UNAUTHORIZED));

        assertThatThrownBy(client::listApis)
                .isInstanceOf(Wso2ClientException.class)
                .hasMessageStartingWith("[dev] HTTP 401 persists after token renewal");
        // Pas de troisième GET : une requête inattendue aurait fait échouer le mock
        server.verify();
    }

    @Test
    void explains403WithoutRetry() {
        Wso2Client client = client();
        expectToken("tok-1");
        server.expect(requestTo(apisUri(0, 100))).andRespond(withStatus(HttpStatus.FORBIDDEN));

        assertThatThrownBy(client::listApis)
                .isInstanceOf(Wso2ClientException.class)
                .hasMessageStartingWith("[dev] HTTP 403: service account lacks a scope for this resource");
        server.verify();
    }

    @Test
    void reports500WithoutRetry() {
        Wso2Client client = client();
        expectToken("tok-1");
        server.expect(requestTo(apisUri(0, 100))).andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));

        assertThatThrownBy(client::listApis)
                .isInstanceOf(Wso2ClientException.class)
                .hasMessageStartingWith("[dev] HTTP 500");
        server.verify();
    }

    @Test
    void followsPagesUntilTotal() {
        Wso2Client client = client();
        expectToken("tok-1");
        server.expect(requestTo(apisUri(0, 100))).andRespond(withSuccess(apiPage(0, 100, 250), MediaType.APPLICATION_JSON));
        server.expect(requestTo(apisUri(100, 100))).andRespond(withSuccess(apiPage(100, 100, 250), MediaType.APPLICATION_JSON));
        server.expect(requestTo(apisUri(200, 100))).andRespond(withSuccess(apiPage(200, 50, 250), MediaType.APPLICATION_JSON));

        List<Api> apis = client.listApis();

        assertThat(apis).hasSize(250);
        assertThat(apis.get(0).id()).isEqualTo("api-0");
        assertThat(apis.get(249).id()).isEqualTo("api-249");
        server.verify();
    }

    @Test
    void stopsOnShortPageWhenTotalIsMissing() {
        Wso2Client client = client();
        expectToken("tok-1");
        server.expect(requestTo(apisUri(0, 100))).andRespond(withSuccess(apiPage(0, 100, null), MediaType.APPLICATION_JSON));
        server.expect(requestTo(apisUri(100, 100))).andRespond(withSuccess(apiPage(100, 30, null), MediaType.APPLICATION_JSON));

        assertThat(client.listApis()).hasSize(130);
        server.verify();
    }

    @Test
    void requestsOneMorePageWhenLastPageIsFullAndTotalIsMissing() {
        Wso2Client client = client();
        expectToken("tok-1");
        server.expect(requestTo(apisUri(0, 100))).andRespond(withSuccess(apiPage(0, 100, null), MediaType.APPLICATION_JSON));
        server.expect(requestTo(apisUri(100, 100))).andRespond(withSuccess(apiPage(100, 0, null), MediaType.APPLICATION_JSON));

        assertThat(client.listApis()).hasSize(100);
        server.verify();
    }

    @Test
    void passesApiIdOnEverySubscriptionPage() {
        Wso2Client client = client(2);
        expectToken("tok-1");
        String sub = "{\"subscriptionId\":\"s%d\",\"applicationInfo\":{\"applicationId\":\"app\",\"name\":\"app\"},"
                + "\"throttlingPolicy\":\"Gold\",\"subscriptionStatus\":\"UNBLOCKED\"}";
        server.expect(requestTo(PUBLISHER + "/subscriptions?limit=2&offset=0&apiId=api-1"))
                .andRespond(withSuccess("{\"count\":2,\"list\":[" + sub.formatted(1) + "," + sub.formatted(2)
                        + "],\"pagination\":{\"total\":3}}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(PUBLISHER + "/subscriptions?limit=2&offset=2&apiId=api-1"))
                .andRespond(withSuccess("{\"count\":1,\"list\":[" + sub.formatted(3)
                        + "],\"pagination\":{\"total\":3}}", MediaType.APPLICATION_JSON));

        List<Subscription> subscriptions = client.listSubscriptions("api-1");

        assertThat(subscriptions).extracting(Subscription::subscriptionId).containsExactly("s1", "s2", "s3");
        server.verify();
    }

    @Test
    void stopsAtMaxItemsWhenPaginationDoesNotConverge() {
        int pageSize = 1000;
        Wso2Client client = client(pageSize);
        expectToken("tok-1");
        int expectedRequests = Wso2Client.MAX_ITEMS / pageSize;
        for (int i = 0; i < expectedRequests; i++) {
            server.expect(requestTo(apisUri(i * pageSize, pageSize)))
                    .andRespond(withSuccess(apiPage(i * pageSize, pageSize, null), MediaType.APPLICATION_JSON));
        }

        assertThatThrownBy(client::listApis)
                .isInstanceOf(Wso2ClientException.class)
                .hasMessageContaining("pagination did not converge");
        server.verify();
    }

    @Test
    void readsDeployedRevisionsInOneCall() {
        Wso2Client client = client();
        expectToken("tok-1");
        server.expect(requestTo(PUBLISHER + "/apis/api-1/revisions?query=deployed:true"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("{\"count\":1,\"list\":[{\"id\":\"rev-3\",\"displayName\":\"Revision 3\","
                        + "\"deploymentInfo\":[{\"name\":\"Default\",\"vhost\":\"gw.example.test\","
                        + "\"status\":\"APPROVED\"}]}]}", MediaType.APPLICATION_JSON));

        List<Revision> revisions = client.listDeployedRevisions("api-1");

        assertThat(revisions).singleElement().satisfies(r -> {
            assertThat(r.displayName()).isEqualTo("Revision 3");
            assertThat(r.deploymentInfo()).singleElement()
                    .satisfies(d -> assertThat(d.name()).isEqualTo("Default"));
        });
        server.verify();
    }

    @Test
    void listsApplicationsThroughAdminApi() {
        Wso2Client client = client();
        expectToken("tok-1");
        server.expect(requestTo(ADMIN + "/applications?limit=100&offset=0"))
                .andRespond(withSuccess("{\"count\":1,\"list\":[{\"applicationId\":\"app-1\",\"name\":\"billing\","
                        + "\"owner\":\"jdoe\",\"status\":\"APPROVED\"}],\"pagination\":{\"total\":1}}",
                        MediaType.APPLICATION_JSON));

        List<Application> applications = client.listApplications();

        assertThat(applications).singleElement()
                .isEqualTo(new Application("app-1", "billing", "jdoe", "APPROVED"));
        server.verify();
    }

    @Test
    void ignoresFieldsOutsideTheWhitelist() {
        Wso2Client client = client();
        expectToken("tok-1");
        server.expect(requestTo(ADMIN + "/applications?limit=100&offset=0"))
                .andRespond(withSuccess("{\"count\":1,\"list\":[{\"applicationId\":\"app-1\",\"name\":\"billing\","
                        + "\"consumerKey\":\"ck-123\",\"consumerSecret\":\"cs-456\",\"attributes\":{\"x\":\"y\"}}],"
                        + "\"pagination\":{\"total\":1}}", MediaType.APPLICATION_JSON));

        List<Application> applications = client.listApplications();

        assertThat(applications).singleElement().satisfies(a -> {
            assertThat(a.applicationId()).isEqualTo("app-1");
            assertThat(a.toString()).doesNotContain("ck-123", "cs-456");
        });
    }
}
