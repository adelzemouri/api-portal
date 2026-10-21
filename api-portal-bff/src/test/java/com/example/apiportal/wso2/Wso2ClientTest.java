package com.example.apiportal.wso2;

import static com.example.apiportal.wso2.Wso2TestSupport.BASE_URL;
import static com.example.apiportal.wso2.Wso2TestSupport.ENV;
import static com.example.apiportal.wso2.Wso2TestSupport.apisPage;
import static com.example.apiportal.wso2.Wso2TestSupport.assertNoSecrets;
import static com.example.apiportal.wso2.Wso2TestSupport.expectToken;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.http.HttpHeaders.AUTHORIZATION;
import static org.springframework.test.web.client.ExpectedCount.manyTimes;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.example.apiportal.wso2.Wso2Models.ApiSummary;
import com.example.apiportal.wso2.Wso2Models.ApplicationSummary;
import com.example.apiportal.wso2.Wso2Models.Revision;
import com.example.apiportal.wso2.Wso2Models.Subscription;
import com.example.apiportal.wso2.Wso2TestSupport.Fixture;
import java.io.IOException;
import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClientException;

class Wso2ClientTest {

    private static final String APIS = BASE_URL + "/api/am/publisher/v4/apis";

    private final MutableClock clock = new MutableClock(Instant.parse("2026-01-01T00:00:00Z"));
    private Fixture fixture;

    @BeforeEach
    void setUp() {
        fixture = Wso2TestSupport.fixture();
    }

    private Wso2Client client(int pageSize) {
        return Wso2TestSupport.client(fixture, clock, pageSize);
    }

    private void expectApisPage(String query, String body) {
        fixture.server().expect(requestTo(APIS + query))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess(body, MediaType.APPLICATION_JSON));
    }

    private void expectApisStatus(HttpStatus status) {
        expectApisStatus("?limit=100&offset=0", status);
    }

    private void expectApisStatus(String query, HttpStatus status) {
        fixture.server().expect(requestTo(APIS + query))
                .andRespond(withStatus(status).contentType(MediaType.APPLICATION_JSON).body("{}"));
    }

    private static List<String> ids(List<ApiSummary> apis) {
        return apis.stream().map(ApiSummary::id).toList();
    }

    // ---------------------------------------------------------------- authentification, 401 / 403

    @Test
    @DisplayName("401 puis 200 : un seul retry avec un nouveau token")
    void retriesOnceOnUnauthorizedWithFreshToken() {
        expectToken(fixture.server(), "S3CR3T-token-1");
        fixture.server().expect(requestTo(APIS + "?limit=100&offset=0"))
                .andExpect(header(AUTHORIZATION, "Bearer S3CR3T-token-1"))
                .andRespond(withStatus(HttpStatus.UNAUTHORIZED));
        expectToken(fixture.server(), "S3CR3T-token-2");
        fixture.server().expect(requestTo(APIS + "?limit=100&offset=0"))
                .andExpect(header(AUTHORIZATION, "Bearer S3CR3T-token-2"))
                .andRespond(withSuccess(apisPage(1, "a1"), MediaType.APPLICATION_JSON));

        assertThat(ids(client(100).listApis())).containsExactly("a1");

        fixture.server().verify();
    }

    @Test
    @DisplayName("401 persistant : erreur après exactement un retry")
    void failsWhenUnauthorizedPersistsAfterRetry() {
        expectToken(fixture.server(), "S3CR3T-token-1");
        expectApisStatus(HttpStatus.UNAUTHORIZED);
        expectToken(fixture.server(), "S3CR3T-token-2");
        expectApisStatus(HttpStatus.UNAUTHORIZED);

        assertThatThrownBy(() -> client(100).listApis())
                .isInstanceOfSatisfying(Wso2ClientException.class, e -> {
                    assertThat(e.environment()).isEqualTo(ENV);
                    assertThat(e).hasMessage("[dev] HTTP 401 persists after token renewal");
                    assertNoSecrets(e);
                });

        // Exactement 2 GET et 2 tokens : un 3e essai ferait échouer le serveur factice (requête inattendue).
        fixture.server().verify();
    }

    @Test
    @DisplayName("un 401 sur une page suivante déclenche aussi le retry, sans perdre les pages déjà lues")
    void retriesOnUnauthorizedOnLaterPage() {
        expectToken(fixture.server(), "S3CR3T-token-1");
        expectApisPage("?limit=2&offset=0", apisPage(3, "a1", "a2"));
        expectApisStatus("?limit=2&offset=2", HttpStatus.UNAUTHORIZED);
        expectToken(fixture.server(), "S3CR3T-token-2");
        expectApisPage("?limit=2&offset=2", apisPage(3, "a3"));

        assertThat(ids(client(2).listApis())).containsExactly("a1", "a2", "a3");

        fixture.server().verify();
    }

    @Test
    @DisplayName("403 : message explicite sur le scope manquant, sans retry")
    void reportsExplicitMessageOnForbidden() {
        expectToken(fixture.server(), "S3CR3T-token-1");
        expectApisStatus(HttpStatus.FORBIDDEN);

        assertThatThrownBy(() -> client(100).listApis())
                .isInstanceOfSatisfying(Wso2ClientException.class, e -> {
                    assertThat(e).hasMessage("[dev] HTTP 403: service account lacks a scope for this resource");
                    assertNoSecrets(e);
                });

        // Un seul token et un seul GET : aucun retry sur 403.
        fixture.server().verify();
    }

    @ParameterizedTest
    @ValueSource(ints = {400, 404, 500, 503})
    @DisplayName("autres erreurs HTTP : message avec le code, rattaché à l'environnement")
    void wrapsOtherHttpErrors(int status) {
        expectToken(fixture.server(), "S3CR3T-token-1");
        expectApisStatus(HttpStatus.valueOf(status));

        assertThatThrownBy(() -> client(100).listApis())
                .isInstanceOfSatisfying(Wso2ClientException.class, e -> {
                    assertThat(e).hasMessage("[dev] HTTP " + status);
                    assertNoSecrets(e);
                });
    }

    @Test
    @DisplayName("control plane injoignable : erreur explicite")
    void wrapsUnreachableControlPlane() {
        expectToken(fixture.server(), "S3CR3T-token-1");
        fixture.server().expect(requestTo(APIS + "?limit=100&offset=0"))
                .andRespond(request -> {
                    throw new IOException("Connection refused");
                });

        assertThatThrownBy(() -> client(100).listApis())
                .isInstanceOfSatisfying(Wso2ClientException.class, e -> {
                    assertThat(e).hasMessage("[dev] control plane unreachable");
                    assertNoSecrets(e);
                });
    }

    @Test
    @DisplayName("corps de réponse vide : erreur explicite")
    void failsOnEmptyBody() {
        expectToken(fixture.server(), "S3CR3T-token-1");
        expectApisPage("?limit=100&offset=0", "");

        assertThatThrownBy(() -> client(100).listApis())
                .isInstanceOfSatisfying(Wso2ClientException.class, e -> {
                    assertThat(e).hasMessage("[dev] empty response body");
                    assertNoSecrets(e);
                });
    }

    @Test
    @DisplayName("redirection vers une page de login (non suivie) : jamais prise pour un succès")
    void redirectIsNeverTreatedAsSuccess() {
        expectToken(fixture.server(), "S3CR3T-token-1");
        fixture.server().expect(requestTo(APIS + "?limit=100&offset=0"))
                .andRespond(withStatus(HttpStatus.FOUND)
                        .location(URI.create("https://login.test/"))
                        .contentType(MediaType.TEXT_HTML)
                        .body("<html>login</html>"));

        assertThatThrownBy(() -> client(100).listApis())
                .isInstanceOfSatisfying(Wso2ClientException.class, e -> {
                    assertThat(e).hasMessage("[dev] unexpected response format").hasCauseInstanceOf(RestClientException.class);
                    assertNoSecrets(e);
                });
    }

    @Test
    @DisplayName("réponse 200 non JSON : erreur rattachée à l'environnement")
    void wrapsNonJsonResponse() {
        expectToken(fixture.server(), "S3CR3T-token-1");
        fixture.server().expect(requestTo(APIS + "?limit=100&offset=0"))
                .andRespond(withSuccess("<html>login</html>", MediaType.TEXT_HTML));

        assertThatThrownBy(() -> client(100).listApis())
                .isInstanceOfSatisfying(Wso2ClientException.class, e -> {
                    assertThat(e).hasMessage("[dev] unexpected response format").hasCauseInstanceOf(RestClientException.class);
                    assertNoSecrets(e);
                });
    }

    @Test
    @DisplayName("JSON malformé : erreur rattachée à l'environnement")
    void wrapsMalformedJson() {
        expectToken(fixture.server(), "S3CR3T-token-1");
        expectApisPage("?limit=100&offset=0", "{\"list\":[");

        assertThatThrownBy(() -> client(100).listApis())
                .isInstanceOfSatisfying(Wso2ClientException.class, e -> {
                    assertThat(e).hasMessage("[dev] unexpected response format").hasCauseInstanceOf(RestClientException.class);
                    assertNoSecrets(e);
                });
    }

    // ---------------------------------------------------------------- pagination

    @Test
    @DisplayName("pagination avec total : plusieurs pages agrégées dans l'ordre")
    void aggregatesPagesUsingTotal() {
        expectToken(fixture.server(), "S3CR3T-token-1");
        expectApisPage("?limit=2&offset=0", apisPage(5, "a1", "a2"));
        expectApisPage("?limit=2&offset=2", apisPage(5, "a3", "a4"));
        expectApisPage("?limit=2&offset=4", apisPage(5, "a5"));

        assertThat(ids(client(2).listApis())).containsExactly("a1", "a2", "a3", "a4", "a5");

        fixture.server().verify();
    }

    @Test
    @DisplayName("pagination avec total : pas d'appel superflu quand la dernière page est pleine")
    void stopsAtTotalWithoutExtraCall() {
        expectToken(fixture.server(), "S3CR3T-token-1");
        expectApisPage("?limit=2&offset=0", apisPage(4, "a1", "a2"));
        expectApisPage("?limit=2&offset=2", apisPage(4, "a3", "a4"));

        assertThat(ids(client(2).listApis())).containsExactly("a1", "a2", "a3", "a4");

        fixture.server().verify();
    }

    @Test
    @DisplayName("total absent : s'arrête sur la première page incomplète")
    void withoutTotalStopsOnShortPage() {
        expectToken(fixture.server(), "S3CR3T-token-1");
        expectApisPage("?limit=2&offset=0", apisPage(null, "a1", "a2"));
        expectApisPage("?limit=2&offset=2", apisPage(null, "a3"));

        assertThat(ids(client(2).listApis())).containsExactly("a1", "a2", "a3");

        fixture.server().verify();
    }

    @Test
    @DisplayName("total absent : continue tant que la page est pleine, s'arrête sur une page vide")
    void withoutTotalStopsOnEmptyPage() {
        expectToken(fixture.server(), "S3CR3T-token-1");
        expectApisPage("?limit=2&offset=0", apisPage(null, "a1", "a2"));
        expectApisPage("?limit=2&offset=2", apisPage(null));

        assertThat(ids(client(2).listApis())).containsExactly("a1", "a2");

        fixture.server().verify();
    }

    @Test
    @DisplayName("page vide alors que le total n'est pas atteint : arrêt, pas de boucle infinie")
    void emptyPageStopsEvenIfTotalNotReached() {
        expectToken(fixture.server(), "S3CR3T-token-1");
        expectApisPage("?limit=2&offset=0", apisPage(10, "a1", "a2"));
        expectApisPage("?limit=2&offset=2", apisPage(10));

        assertThat(ids(client(2).listApis())).containsExactly("a1", "a2");

        fixture.server().verify();
    }

    @Test
    @DisplayName("liste vide : retourne une liste vide")
    void emptyResultIsEmptyList() {
        expectToken(fixture.server(), "S3CR3T-token-1");
        expectApisPage("?limit=100&offset=0", "{\"count\":0,\"pagination\":{\"total\":0}}");

        assertThat(client(100).listApis()).isEmpty();
    }

    @Test
    @DisplayName("garde-fou MAX_ITEMS : une pagination qui ne converge pas échoue après 50 000 éléments")
    void guardsAgainstNonConvergingPagination() {
        // Serveur pathologique : renvoie toujours une page pleine et jamais de total.
        int pageSize = 1000;
        String[] fullPage = new String[pageSize];
        for (int i = 0; i < pageSize; i++) {
            fullPage[i] = "a" + i;
        }
        String body = apisPage(null, fullPage);
        AtomicInteger calls = new AtomicInteger();

        expectToken(fixture.server(), "S3CR3T-token-1");
        fixture.server().expect(manyTimes(), request ->
                        assertThat(request.getURI().toString()).startsWith(APIS + "?limit=1000&offset="))
                .andRespond(request -> {
                    calls.incrementAndGet();
                    return withSuccess(body, MediaType.APPLICATION_JSON).createResponse(request);
                });

        assertThatThrownBy(() -> client(pageSize).listApis())
                .isInstanceOfSatisfying(Wso2ClientException.class, e -> {
                    assertThat(e).hasMessageContaining("pagination did not converge");
                    assertNoSecrets(e);
                });
        assertThat(calls).hasValue(50);
    }

    @Test
    @DisplayName("la liste retournée n'est pas modifiable")
    void returnedListIsImmutable() {
        expectToken(fixture.server(), "S3CR3T-token-1");
        expectApisPage("?limit=100&offset=0", apisPage(1, "a1"));

        List<ApiSummary> apis = client(100).listApis();

        assertThatThrownBy(() -> apis.add(apis.get(0))).isInstanceOf(UnsupportedOperationException.class);
    }

    // ---------------------------------------------------------------- chemins, paramètres, mapping

    @Test
    @DisplayName("listApis : Publisher v4 /apis avec Bearer et mapping des champs")
    void listApisCallsPublisherApi() {
        expectToken(fixture.server(), "S3CR3T-token-1");
        fixture.server().expect(requestTo(APIS + "?limit=100&offset=0"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header(AUTHORIZATION, "Bearer S3CR3T-token-1"))
                .andExpect(header("Accept", MediaType.APPLICATION_JSON_VALUE))
                .andRespond(withSuccess("""
                        {"count":1,"list":[{"id":"a1","name":"Payments","context":"/payments/1.0",
                        "version":"1.0","provider":"admin","type":"HTTP","lifeCycleStatus":"PUBLISHED"}],
                        "pagination":{"total":1}}""", MediaType.APPLICATION_JSON));

        List<ApiSummary> apis = client(100).listApis();

        assertThat(apis).containsExactly(new ApiSummary(
                "a1", "Payments", "/payments/1.0", "1.0", "admin", "HTTP", "PUBLISHED"));
    }

    @Test
    @DisplayName("listDeployedRevisions : révisions déployées avec le détail par gateway")
    void listDeployedRevisionsCallsRevisionsEndpoint() {
        expectToken(fixture.server(), "S3CR3T-token-1");
        fixture.server().expect(requestTo(APIS + "/a1/revisions?query=deployed:true"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header(AUTHORIZATION, "Bearer S3CR3T-token-1"))
                .andRespond(withSuccess("""
                        {"count":1,"list":[{"id":"rev-7","displayName":"Revision 7",
                        "createdTime":"2026-01-01T10:00:00Z",
                        "deploymentInfo":[{"name":"Default","vhost":"gw.test","deploymentStatus":"APPROVED",
                        "deployedTime":"2026-01-01T10:05:00Z"}]}]}""", MediaType.APPLICATION_JSON));

        List<Revision> revisions = client(100).listDeployedRevisions("a1");

        assertThat(revisions).hasSize(1);
        assertThat(revisions.get(0).id()).isEqualTo("rev-7");
        assertThat(revisions.get(0).deploymentInfo()).singleElement().satisfies(deployment -> {
            assertThat(deployment.name()).isEqualTo("Default");
            assertThat(deployment.vhost()).isEqualTo("gw.test");
            assertThat(deployment.deploymentStatus()).isEqualTo("APPROVED");
        });
    }

    @Test
    @DisplayName("listSubscriptions : Publisher v4 /subscriptions?apiId= paginé")
    void listSubscriptionsCallsSubscriptionsEndpoint() {
        expectToken(fixture.server(), "S3CR3T-token-1");
        fixture.server().expect(requestTo(BASE_URL + "/api/am/publisher/v4/subscriptions?limit=100&offset=0&apiId=a1"))
                .andExpect(header(AUTHORIZATION, "Bearer S3CR3T-token-1"))
                .andRespond(withSuccess("""
                        {"count":1,"list":[{"subscriptionId":"s1","throttlingPolicy":"Gold",
                        "subscriptionStatus":"UNBLOCKED",
                        "applicationInfo":{"applicationId":"app1","name":"Mobile","subscriber":"jdoe"}}],
                        "pagination":{"total":1}}""", MediaType.APPLICATION_JSON));

        List<Subscription> subscriptions = client(100).listSubscriptions("a1");

        assertThat(subscriptions).hasSize(1);
        assertThat(subscriptions.get(0).subscriptionId()).isEqualTo("s1");
        assertThat(subscriptions.get(0).applicationInfo().applicationId()).isEqualTo("app1");
    }

    @Test
    @DisplayName("listApplications : Admin v4 /applications paginé")
    void listApplicationsCallsAdminEndpoint() {
        expectToken(fixture.server(), "S3CR3T-token-1");
        fixture.server().expect(requestTo(BASE_URL + "/api/am/admin/v4/applications?limit=100&offset=0"))
                .andExpect(header(AUTHORIZATION, "Bearer S3CR3T-token-1"))
                .andRespond(withSuccess("""
                        {"count":1,"list":[{"applicationId":"app1","name":"Mobile","owner":"jdoe",
                        "status":"APPROVED","groupId":"grp"}],"pagination":{"total":1}}""",
                        MediaType.APPLICATION_JSON));

        List<ApplicationSummary> applications = client(100).listApplications();

        assertThat(applications).containsExactly(
                new ApplicationSummary("app1", "Mobile", "jdoe", "APPROVED", "grp"));
    }

    @Test
    @DisplayName("le client expose l'environnement et son libellé")
    void exposesEnvironmentAndLabel() {
        Wso2Client client = client(100);

        assertThat(client.environment()).isEqualTo(ENV);
        assertThat(client.label()).isEqualTo("DEV");
    }
}
