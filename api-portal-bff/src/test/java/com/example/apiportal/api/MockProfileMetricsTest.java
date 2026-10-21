package com.example.apiportal.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.apiportal.metrics.MetricsSyncService;
import com.example.apiportal.sync.SyncService;
import com.jayway.jsonpath.JsonPath;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/** Application complète en profil « mock » : catalogue et métriques factices, lues explicitement (planificateur coupé). */
@SpringBootTest(properties = {"portal.sync.enabled=false", "portal.mock.failing-environments=uat"})
@AutoConfigureMockMvc
@ActiveProfiles("mock")
class MockProfileMetricsTest {

    @Autowired
    MockMvc mvc;
    @Autowired
    SyncService catalogSync;
    @Autowired
    MetricsSyncService metricsSync;

    @BeforeEach
    void sync() {
        catalogSync.syncAll();
        metricsSync.syncAll();
    }

    private String body(String url) throws Exception {
        return mvc.perform(get(url)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    @Test
    @DisplayName("GET /metrics : totaux, courbe de 24 points, classements et activité face au catalogue")
    void overviewOf24Hours() throws Exception {
        mvc.perform(get("/api/v1/environments/exp/metrics"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.window").value("24h"))
                .andExpect(jsonPath("$.status.state").value("OK"))
                .andExpect(jsonPath("$.totals.calls").value(Matchers.greaterThan(0)))
                .andExpect(jsonPath("$.totals.errorRate").isNumber())
                .andExpect(jsonPath("$.timeline.length()").value(24))
                .andExpect(jsonPath("$.topApis.length()").value(Matchers.allOf(Matchers.greaterThan(0), Matchers.lessThanOrEqualTo(10))))
                .andExpect(jsonPath("$.topApis[0].apiId").isNotEmpty())
                .andExpect(jsonPath("$.topApplications[0].applicationId").isNotEmpty())
                .andExpect(jsonPath("$.activeApis").value(Matchers.lessThanOrEqualTo(16)))
                .andExpect(jsonPath("$.catalogApis").value(16));
    }

    @Test
    @DisplayName("GET /metrics?window=7d : sept points ; une période inconnue est une erreur 400 sans message")
    void sevenDaysAndInvalidWindow() throws Exception {
        mvc.perform(get("/api/v1/environments/exp/metrics").param("window", "7d"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.timeline.length()").value(7));
        String bad = mvc.perform(get("/api/v1/environments/exp/metrics").param("window", "1y; drop"))
                .andExpect(status().isBadRequest()).andReturn().getResponse().getContentAsString();
        assertThat(bad).doesNotContain("drop", "Exception");
    }

    @Test
    @DisplayName("les listes pour les colonnes portent l'identifiant du catalogue")
    void listsForColumns() throws Exception {
        mvc.perform(get("/api/v1/environments/dev/metrics/apis"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].apiId").isNotEmpty())
                .andExpect(jsonPath("$.items[0].calls").isNumber());
        mvc.perform(get("/api/v1/environments/dev/metrics/applications"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].applicationId").isNotEmpty());
    }

    @Test
    @DisplayName("métriques d'une API et d'une application : cohérentes avec les listes")
    void perEntityMetrics() throws Exception {
        String apis = body("/api/v1/environments/exp/metrics/apis");
        String apiId = JsonPath.read(apis, "$.items[0].apiId");
        long calls = ((Number) JsonPath.read(apis, "$.items[0].calls")).longValue();

        String api = body("/api/v1/environments/exp/apis/" + apiId + "/metrics");
        assertThat(((Number) JsonPath.read(api, "$.metrics.calls")).longValue()).isEqualTo(calls);
        assertThat(JsonPath.<Integer>read(api, "$.timeline.length()")).isEqualTo(24);
        long consumerCalls = JsonPath.<java.util.List<Number>>read(api, "$.consumers[*].calls").stream().mapToLong(Number::longValue).sum();
        assertThat(consumerCalls).isEqualTo(calls);

        String appId = JsonPath.read(api, "$.consumers[0].applicationId");
        mvc.perform(get("/api/v1/environments/exp/applications/" + appId + "/metrics"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.metrics.calls").isNumber())
                .andExpect(jsonPath("$.apis[*].apiId").value(Matchers.hasItem(apiId)));
    }

    @Test
    @DisplayName("une panne de métriques d'un environnement est une donnée (ERROR), le catalogue et le health restent intacts")
    void failingEnvironmentIsBusinessData() throws Exception {
        mvc.perform(get("/api/v1/environments/uat/metrics"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status.state").value("ERROR"))
                .andExpect(jsonPath("$.status.error").value("Splunk unreachable (simulated)"))
                .andExpect(jsonPath("$.totals.calls").value(0))
                .andExpect(jsonPath("$.timeline.length()").value(0));
        mvc.perform(get("/api/v1/environments/dev/metrics"))
                .andExpect(jsonPath("$.status.state").value("OK"));
        mvc.perform(get("/actuator/health")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("UP"));
    }

    @Test
    @DisplayName("404 pour un environnement, une API ou une application inconnus, sans message")
    void unknownThings() throws Exception {
        mvc.perform(get("/api/v1/environments/prod/metrics")).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/environments/dev/apis/inconnu/metrics")).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/environments/dev/applications/inconnu/metrics")).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("aucune réponse ne contient de jeton, d'utilisateur final, d'adresse IP ni d'attribut d'application")
    void responsesAreClean() throws Exception {
        String apiId = JsonPath.read(body("/api/v1/environments/exp/metrics/apis"), "$.items[0].apiId");
        for (String url : new String[] {"/api/v1/environments/exp/metrics", "/api/v1/environments/exp/metrics/apis",
                "/api/v1/environments/exp/metrics/applications", "/api/v1/environments/exp/apis/" + apiId + "/metrics"}) {
            assertThat(body(url).toLowerCase()).as(url)
                    .doesNotContain("token", "secret", "password", "username", "ipaddress", "useragent", "attributes");
        }
    }
}
