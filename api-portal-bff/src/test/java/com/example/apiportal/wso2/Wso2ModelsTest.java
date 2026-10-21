package com.example.apiportal.wso2;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.example.apiportal.wso2.Wso2Models.ApplicationSummary;
import com.example.apiportal.wso2.Wso2Models.Page;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** Les DTO sont une liste blanche : les champs sensibles d'une réponse WSO2 n'entrent jamais dans le portail. */
class Wso2ModelsTest {

    @Test
    @DisplayName("les champs sensibles de l'Admin API sont ignorés, même avec un mapper strict")
    void sensitiveApplicationFieldsAreDropped() throws Exception {
        String json = """
                {"applicationId":"app1","name":"Mobile","owner":"jdoe","status":"APPROVED","groupId":"grp",
                 "keys":[{"consumerKey":"CK","consumerSecret":"CS"}],
                 "attributes":{"internal":"value"},
                 "description":"free text"}""";
        // Mapper volontairement strict : seule l'annotation du DTO doit éviter l'échec.
        ObjectMapper strict = new ObjectMapper().enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);

        ApplicationSummary application = strict.readValue(json, ApplicationSummary.class);

        assertThat(application).isEqualTo(new ApplicationSummary("app1", "Mobile", "jdoe", "APPROVED", "grp"));
        assertThat(application.toString()).doesNotContain("CK", "CS", "internal");
    }

    @Test
    @DisplayName("tous les DTO ignorent les champs inconnus (ajoutés par une future version de WSO2)")
    void everyDtoIgnoresUnknownProperties() {
        for (Class<?> dto : Wso2Models.class.getDeclaredClasses()) {
            JsonIgnoreProperties annotation = dto.getAnnotation(JsonIgnoreProperties.class);
            assertThat(annotation).as(dto.getSimpleName()).isNotNull();
            assertThat(annotation.ignoreUnknown()).as(dto.getSimpleName()).isTrue();
        }
    }

    @Test
    @DisplayName("Page.items() ne retourne jamais null")
    void pageItemsIsNeverNull() {
        assertThat(new Page<String>(0, null, null).items()).isEmpty();
    }
}
