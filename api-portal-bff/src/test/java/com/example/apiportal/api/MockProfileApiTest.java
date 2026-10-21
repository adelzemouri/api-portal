package com.example.apiportal.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.apiportal.sync.SyncService;
import com.example.apiportal.wso2.Wso2ClientRegistry;
import com.example.apiportal.wso2.Wso2Properties;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Démarre l'application complète en profil « mock », sans aucune variable d'environnement WSO2 ni PEM.
 * La synchro périodique est désactivée : le test la déclenche explicitement.
 */
@SpringBootTest(properties = "portal.sync.enabled=false")
@AutoConfigureMockMvc
@ActiveProfiles("mock")
class MockProfileApiTest {

    @Autowired
    MockMvc mvc;
    @Autowired
    SyncService syncService;
    @Autowired
    ApplicationContext context;

    @BeforeEach
    void sync() {
        syncService.syncAll();
    }

    private String body(String url) throws Exception {
        return mvc.perform(get(url)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    @Test
    @DisplayName("l'application démarre en profil mock sans couche WSO2 réelle")
    void startsWithoutRealWso2Layer() {
        assertThat(context.getBeanNamesForType(Wso2ClientRegistry.class)).isEmpty();
        assertThat(context.getBeanNamesForType(Wso2Properties.class)).isEmpty();
    }

    @Test
    @DisplayName("actuator : health UP, info accessible, aucun autre endpoint exposé")
    void exposesOnlyHealthAndInfo() throws Exception {
        mvc.perform(get("/actuator/health")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("UP"));
        // Le mode démo est annoncé au front (bandeau) : seule la propriété info.portal.mode est exposée.
        mvc.perform(get("/actuator/info")).andExpect(status().isOk()).andExpect(jsonPath("$.portal.mode").value("mock"));
        mvc.perform(get("/actuator/env")).andExpect(status().isNotFound());
        mvc.perform(get("/actuator/beans")).andExpect(status().isNotFound());
        mvc.perform(get("/actuator/metrics")).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("GET /environments : 4 environnements dans l'ordre, tous synchronisés")
    void listsEnvironments() throws Exception {
        mvc.perform(get("/api/v1/environments"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].key").value(org.hamcrest.Matchers.contains("dev", "sim", "uat", "exp")))
                .andExpect(jsonPath("$[*].label").value(org.hamcrest.Matchers.contains("DEV", "SIM", "UAT", "EXP")))
                .andExpect(jsonPath("$[*].sync.state").value(org.hamcrest.Matchers.everyItem(org.hamcrest.Matchers.is("OK"))))
                .andExpect(jsonPath("$[0].sync.lastSuccessAt").isNotEmpty())
                .andExpect(jsonPath("$[0].sync.apis").isNumber());
    }

    @Test
    @DisplayName("GET /environments/{env}/apis : APIs de l'environnement avec nombre de souscriptions")
    void listsApisOfAnEnvironment() throws Exception {
        mvc.perform(get("/api/v1/environments/exp/apis").param("q", "payments"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[*].version").value(org.hamcrest.Matchers.contains("1.1", "1.2")))
                .andExpect(jsonPath("$[0].name").value("Payments"))
                .andExpect(jsonPath("$[0].subscriptionCount").isNumber());
    }

    @Test
    @DisplayName("GET /environments/{env}/applications : filtre texte, nombre d'API souscrites")
    void listsApplicationsOfAnEnvironment() throws Exception {
        mvc.perform(get("/api/v1/environments/exp/applications").param("q", "mobile"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].name").value("Mobile Banking"))
                .andExpect(jsonPath("$[0].environment").value("exp"))
                .andExpect(jsonPath("$[0].subscriptionCount").isNumber());
    }

    @Test
    @DisplayName("les compteurs de souscriptions correspondent aux listes dépliées, côté API comme côté application")
    void countsMatchExpandedLists() throws Exception {
        String apis = body("/api/v1/environments/dev/apis");
        int checkedApis = 0;
        for (int i = 0; i < JsonPath.<Integer>read(apis, "$.length()"); i++) {
            String apiId = JsonPath.read(apis, "$[" + i + "].apiId");
            int count = JsonPath.read(apis, "$[" + i + "].subscriptionCount");
            String subscriptions = body("/api/v1/environments/dev/apis/" + apiId + "/subscriptions");
            assertThat(JsonPath.<Integer>read(subscriptions, "$.length()")).isEqualTo(count);
            checkedApis += count > 0 ? 1 : 0;
        }
        assertThat(checkedApis).isPositive();

        String apps = body("/api/v1/environments/dev/applications");
        int checkedApps = 0;
        for (int i = 0; i < JsonPath.<Integer>read(apps, "$.length()"); i++) {
            String appId = JsonPath.read(apps, "$[" + i + "].applicationId");
            int count = JsonPath.read(apps, "$[" + i + "].subscriptionCount");
            String subscriptions = body("/api/v1/environments/dev/applications/" + appId + "/subscriptions");
            assertThat(JsonPath.<Integer>read(subscriptions, "$.length()")).isEqualTo(count);
            checkedApps += count > 0 ? 1 : 0;
        }
        assertThat(checkedApps).isPositive();
    }

    @Test
    @DisplayName("GET /environments/{env}/apis/{apiId} : révision, gateways et présence dans les 4 environnements")
    void apiDetailShowsDeploymentAndPresence() throws Exception {
        String apis = body("/api/v1/environments/exp/apis?q=payments");
        java.util.List<String> ids = JsonPath.read(apis, "$[?(@.version=='1.2')].apiId");
        String apiId = ids.get(0);

        mvc.perform(get("/api/v1/environments/exp/apis/" + apiId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.revisions[0].name").isNotEmpty())
                .andExpect(jsonPath("$.revisions[0].gateways.length()").value(2))
                .andExpect(jsonPath("$.environments[*].environment")
                        .value(org.hamcrest.Matchers.contains("dev", "sim", "uat", "exp")))
                .andExpect(jsonPath("$.api.name").value("Payments"))
                .andExpect(jsonPath("$.gatewayUrls[*].url").value(org.hamcrest.Matchers.contains(
                        "https://gw-exp.bank.internal/payments/1.2", "https://gw-int-exp.bank.internal/payments/1.2")))
                .andExpect(jsonPath("$.environments[1].versions[*].version").value(org.hamcrest.Matchers.contains("1.3", "2.0")))
                .andExpect(jsonPath("$.environments[3].versions[*].version").value(org.hamcrest.Matchers.contains("1.1", "1.2")))
                .andExpect(jsonPath("$.environments[3].versions[0].apiId").isNotEmpty());
    }

    @Test
    @DisplayName("GET /environments : liens Publisher/Devportal en https et gateways de chaque environnement")
    void environmentsCarryLinksAndGateways() throws Exception {
        mvc.perform(get("/api/v1/environments"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].publisherUrl").value("https://apim-dev.bank.internal/publisher"))
                .andExpect(jsonPath("$[3].devportalUrl").value("https://apim.bank.internal/devportal"))
                .andExpect(jsonPath("$[0].identityServerUrl").value("https://is-dev.bank.internal"))
                .andExpect(jsonPath("$[0].gateways[0].url").value("https://gw-dev.bank.internal:8243"))
                .andExpect(jsonPath("$[3].gateways[0].url").value("https://gw-exp.bank.internal"))
                .andExpect(jsonPath("$[3].gateways[*].name").value(org.hamcrest.Matchers.hasItems("Default", "Internal")));
    }

    @Test
    @DisplayName("GET /environments/{env}/overview : répartitions, top API et éléments à surveiller")
    void overviewHasDistributionsAndAttention() throws Exception {
        mvc.perform(get("/api/v1/environments/exp/overview"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.apisByStatus[0].key").value("PUBLISHED"))
                .andExpect(jsonPath("$.subscriptionsByStatus[0].key").value("UNBLOCKED"))
                .andExpect(jsonPath("$.topApis.length()").value(org.hamcrest.Matchers.lessThanOrEqualTo(5)))
                .andExpect(jsonPath("$.attention").doesNotExist());
    }

    @Test
    @DisplayName("GET /portal : adresse du composant GitLab de déploiement")
    void portalExposesTheDeployComponent() throws Exception {
        mvc.perform(get("/api/v1/portal"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deployComponentUrl")
                        .value("https://gitlab.bank.internal/platform/ci-components/swagger-deploy"));
    }

    @Test
    @DisplayName("GET /environments/{env}/search : quelques API et applications, rien sans requête")
    void searchFindsApisAndApplications() throws Exception {
        mvc.perform(get("/api/v1/environments/exp/search").param("q", "pay"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.apis[*].name").value(org.hamcrest.Matchers.hasItem("Payments")))
                .andExpect(jsonPath("$.applications[*].name").value(org.hamcrest.Matchers.hasItem("Payroll Connector")));
        mvc.perform(get("/api/v1/environments/exp/search"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.apis.length()").value(0));
        mvc.perform(get("/api/v1/environments/exp/search").param("q", "x".repeat(101))).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/environments/prod/search").param("q", "a")).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("erreurs : 404 (environnement/API inconnus) et 400 (requête trop longue) sans aucun message")
    void errorsDoNotLeakMessages() throws Exception {
        String notFound = mvc.perform(get("/api/v1/environments/prod/applications"))
                .andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();
        String badRequest = mvc.perform(get("/api/v1/environments/dev/applications").param("q", "x".repeat(101)))
                .andExpect(status().isBadRequest()).andReturn().getResponse().getContentAsString();
        mvc.perform(get("/api/v1/environments/dev/apis/inconnu/subscriptions")).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/environments/dev/apis/inconnu")).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/environments/dev/applications/inconnu/subscriptions")).andExpect(status().isNotFound());

        assertThat(notFound).doesNotContain("unknown environment", "Exception", "at com.example");
        assertThat(badRequest).doesNotContain("Exception", "at com.example");
    }

    @Test
    @DisplayName("aucune réponse de l'API ne contient de clé, secret ni attribut d'application")
    void responsesNeverContainSecrets() throws Exception {
        String apiId = JsonPath.read(body("/api/v1/environments/dev/apis"), "$[0].apiId");
        String appId = JsonPath.read(body("/api/v1/environments/dev/applications"), "$[0].applicationId");
        for (String url : new String[] {"/api/v1/environments", "/api/v1/environments/dev/apis",
                "/api/v1/environments/dev/applications", "/api/v1/environments/dev/apis/" + apiId,
                "/api/v1/environments/dev/overview", "/api/v1/environments/dev/search?q=a", "/api/v1/portal",
                "/api/v1/environments/dev/apis/" + apiId + "/subscriptions",
                "/api/v1/environments/dev/applications/" + appId + "/subscriptions"}) {
            assertThat(body(url).toLowerCase()).as(url)
                    .doesNotContain("secret", "consumerkey", "password", "token", "attributes", "keys");
        }
    }
}
