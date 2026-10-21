package com.example.apiportal.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.apiportal.sync.SyncService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/** Un environnement indisponible est une donnée métier : jamais un état DOWN du portail. */
@SpringBootTest(properties = {"portal.sync.enabled=false", "portal.mock.failing-environments=uat"})
@AutoConfigureMockMvc
@ActiveProfiles("mock")
class MockProfileFailingEnvironmentTest {

    @Autowired
    MockMvc mvc;
    @Autowired
    SyncService syncService;

    @BeforeEach
    void sync() {
        syncService.syncAll();
    }

    @Test
    @DisplayName("le health reste UP quand un environnement est en panne")
    void healthStaysUpWhenAnEnvironmentFails() throws Exception {
        mvc.perform(get("/actuator/health")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("UP"));
    }

    @Test
    @DisplayName("l'environnement en panne est exposé comme ERROR avec un message ; les autres restent OK")
    void failingEnvironmentIsReportedAsBusinessData() throws Exception {
        mvc.perform(get("/api/v1/environments"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.key=='uat')].sync.state").value("ERROR"))
                .andExpect(jsonPath("$[?(@.key=='uat')].sync.error").value("[uat] control plane unreachable (simulated)"))
                .andExpect(jsonPath("$[?(@.key=='uat')].sync.lastSuccessAt").value(org.hamcrest.Matchers.contains((Object) null)))
                .andExpect(jsonPath("$[?(@.key=='dev')].sync.state").value("OK"))
                .andExpect(jsonPath("$[?(@.key=='exp')].sync.state").value("OK"));
    }

    @Test
    @DisplayName("l'environnement en panne sert les données de sa dernière synchro ; ici jamais réussie, donc vide")
    void failingEnvironmentServesLastGoodDataAndOthersAreUnaffected() throws Exception {
        mvc.perform(get("/api/v1/environments/uat/apis"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/v1/environments/exp/apis").param("q", "payments"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));
    }
}
