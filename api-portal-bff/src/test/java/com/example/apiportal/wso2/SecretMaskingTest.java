package com.example.apiportal.wso2;

import static com.example.apiportal.wso2.Wso2TestSupport.ACCESS_TOKEN;
import static com.example.apiportal.wso2.Wso2TestSupport.CLIENT_ID;
import static com.example.apiportal.wso2.Wso2TestSupport.CLIENT_SECRET;
import static com.example.apiportal.wso2.Wso2TestSupport.PASSWORD;
import static com.example.apiportal.wso2.Wso2TestSupport.SCOPES;
import static com.example.apiportal.wso2.Wso2TestSupport.SECRET_MARKER;
import static org.assertj.core.api.Assertions.assertThat;

import com.example.apiportal.wso2.Wso2Properties.EnvironmentProperties;
import java.lang.reflect.Constructor;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Aucun secret dans les toString(). Les messages d'exception sont vérifiés dans les tests
 * de chaque scénario d'échec (voir {@link Wso2TestSupport#assertNoSecrets}).
 */
class SecretMaskingTest {

    @Test
    @DisplayName("EnvironmentProperties.toString() masque clientSecret et password")
    void environmentPropertiesMasksSecrets() {
        String text = Wso2TestSupport.env().toString();

        assertThat(text).doesNotContain(SECRET_MARKER, CLIENT_SECRET, PASSWORD)
                .contains("clientSecret=***", "password=***")
                // Les champs non sensibles restent lisibles pour le diagnostic.
                .contains(CLIENT_ID, "label=DEV");
    }

    @Test
    @DisplayName("Wso2Properties.toString() (record) ne divulgue rien via la map d'environnements")
    void wso2PropertiesMasksNestedSecrets() {
        Wso2Properties properties = new Wso2Properties(
                Duration.ofSeconds(5), Duration.ofSeconds(30), 100, SCOPES, Map.of("dev", Wso2TestSupport.env()));

        assertThat(properties.toString()).doesNotContain(SECRET_MARKER).contains("***");
    }

    @Test
    @DisplayName("TokenResponse.toString() masque l'access token")
    void tokenResponseMasksAccessToken() {
        Wso2TokenProvider.TokenResponse response =
                new Wso2TokenProvider.TokenResponse(ACCESS_TOKEN, 3600, "apim:api_view");

        assertThat(response.toString()).doesNotContain(SECRET_MARKER).contains("accessToken=***");
    }

    @Test
    @DisplayName("CachedToken.toString() masque la valeur du token")
    void cachedTokenMasksValue() throws Exception {
        Class<?> cachedToken = Class.forName(Wso2TokenProvider.class.getName() + "$CachedToken");
        Constructor<?> constructor = cachedToken.getDeclaredConstructors()[0];
        constructor.setAccessible(true);

        Object token = constructor.newInstance(ACCESS_TOKEN, Instant.parse("2026-01-01T00:00:00Z"));

        assertThat(token.toString()).doesNotContain(SECRET_MARKER).contains("value=***");
    }

    @Test
    @DisplayName("Wso2ClientException ne porte que l'environnement et le message fourni")
    void clientExceptionCarriesOnlyEnvironmentAndMessage() {
        Wso2ClientException exception = new Wso2ClientException("dev", "control plane unreachable");

        assertThat(exception).hasMessage("[dev] control plane unreachable");
        assertThat(exception.environment()).isEqualTo("dev");
    }

    @Test
    @DisplayName("aucun composant des DTO Wso2Models ne porte de clé, secret ou attribut d'application")
    void dtosAreWhitelistedWithoutSensitiveComponents() {
        Class<?>[] dtos = Wso2Models.class.getDeclaredClasses();
        var forbidden = java.util.Set.of("consumerkey", "consumersecret", "keys", "attributes", "secret",
                "token", "accesstoken", "password", "clientsecret");

        assertThat(dtos).isNotEmpty();
        for (Class<?> dto : dtos) {
            for (var component : dto.getRecordComponents()) {
                assertThat(forbidden)
                        .as("%s.%s", dto.getSimpleName(), component.getName())
                        .doesNotContain(component.getName().toLowerCase());
            }
        }
    }
}
