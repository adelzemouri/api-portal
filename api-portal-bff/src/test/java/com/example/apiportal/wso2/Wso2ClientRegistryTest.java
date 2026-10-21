package com.example.apiportal.wso2;

import static com.example.apiportal.wso2.Wso2TestSupport.BASE_URL;
import static com.example.apiportal.wso2.Wso2TestSupport.SCOPES;
import static com.example.apiportal.wso2.Wso2TestSupport.TOKEN_URL;
import static com.example.apiportal.wso2.Wso2TestSupport.assertNoSecrets;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.apiportal.wso2.Wso2Properties.EnvironmentProperties;
import java.net.URI;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.net.ssl.SSLContext;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.ssl.SslBundle;
import org.springframework.boot.ssl.SslBundles;
import org.springframework.web.client.RestClient;

class Wso2ClientRegistryTest {

    private final SslBundles sslBundles = mock(SslBundles.class);

    private static EnvironmentProperties env(String label, String baseUrl, String tokenUrl, String sslBundle) {
        return new EnvironmentProperties(label, URI.create(baseUrl), URI.create(tokenUrl),
                Wso2TestSupport.CLIENT_ID, Wso2TestSupport.CLIENT_SECRET,
                Wso2TestSupport.USERNAME, Wso2TestSupport.PASSWORD, sslBundle);
    }

    private static Wso2Properties properties(Map<String, EnvironmentProperties> environments) {
        return new Wso2Properties(Duration.ofSeconds(5), Duration.ofSeconds(30), 100, SCOPES, environments);
    }

    private Wso2ClientRegistry registry(Map<String, EnvironmentProperties> environments) {
        return new Wso2ClientRegistry(properties(environments), sslBundles, RestClient.builder());
    }

    // ---------------------------------------------------------------- HTTPS obligatoire

    @ParameterizedTest
    @ValueSource(strings = {
            "http://apim-dev.test:9443",
            "ftp://apim-dev.test",
            "//apim-dev.test:9443",
            "apim-dev.test:9443"
    })
    @DisplayName("une baseUrl qui n'est pas en HTTPS est refusée au démarrage")
    void rejectsNonHttpsBaseUrl(String baseUrl) {
        Map<String, EnvironmentProperties> environments = Map.of("dev", env("DEV", baseUrl, TOKEN_URL, null));

        assertThatThrownBy(() -> registry(environments))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("WSO2 environment 'dev' must use HTTPS")
                .satisfies(e -> assertNoSecrets(e));
    }

    @ParameterizedTest
    @ValueSource(strings = {"http://apim-dev.test:9443/oauth2/token", "//apim-dev.test/oauth2/token"})
    @DisplayName("une tokenUrl qui n'est pas en HTTPS est refusée même si la baseUrl l'est")
    void rejectsNonHttpsTokenUrl(String tokenUrl) {
        Map<String, EnvironmentProperties> environments = Map.of("dev", env("DEV", BASE_URL, tokenUrl, null));

        assertThatThrownBy(() -> registry(environments))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("WSO2 environment 'dev' must use HTTPS")
                .satisfies(e -> assertNoSecrets(e));
    }

    @Test
    @DisplayName("HTTPS est accepté quelle que soit la casse du schéma")
    void acceptsHttpsSchemeCaseInsensitively() {
        Map<String, EnvironmentProperties> environments = Map.of("dev",
                env("DEV", "HTTPS://apim-dev.test:9443", "HTTPS://apim-dev.test:9443/oauth2/token", null));

        assertThat(registry(environments).all()).hasSize(1);
    }

    @Test
    @DisplayName("un seul environnement non HTTPS fait échouer tout le registre, et le nomme")
    void oneInsecureEnvironmentFailsFast() {
        Map<String, EnvironmentProperties> environments = new LinkedHashMap<>();
        environments.put("dev", env("DEV", BASE_URL, TOKEN_URL, null));
        environments.put("exp", env("EXP", "http://apim-exp.test:9443", "https://apim-exp.test:9443/oauth2/token", null));

        assertThatThrownBy(() -> registry(environments))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("WSO2 environment 'exp' must use HTTPS");
    }

    // ---------------------------------------------------------------- construction

    @Test
    @DisplayName("les clients sont exposés dans l'ordre de configuration")
    void keepsConfigurationOrder() {
        Map<String, EnvironmentProperties> environments = new LinkedHashMap<>();
        for (String key : List.of("dev", "sim", "uat", "exp")) {
            environments.put(key, env(key.toUpperCase(), "https://apim-" + key + ".test:9443",
                    "https://apim-" + key + ".test:9443/oauth2/token", null));
        }

        Wso2ClientRegistry registry = registry(environments);

        assertThat(registry.all()).extracting(Wso2Client::environment).containsExactly("dev", "sim", "uat", "exp");
        assertThat(registry.all()).extracting(Wso2Client::label).containsExactly("DEV", "SIM", "UAT", "EXP");
        assertThat(registry.get("uat").label()).isEqualTo("UAT");
    }

    @Test
    @DisplayName("un environnement inconnu est signalé")
    void unknownEnvironmentIsRejected() {
        Wso2ClientRegistry registry = registry(Map.of("dev", env("DEV", BASE_URL, TOKEN_URL, null)));

        assertThatThrownBy(() -> registry.get("prod"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Unknown WSO2 environment: prod");
    }

    @Test
    @DisplayName("un environnement injoignable n'empêche pas la construction (aucun appel au démarrage)")
    void unreachableEnvironmentDoesNotPreventStartup() {
        Map<String, EnvironmentProperties> environments = Map.of("dev",
                env("DEV", "https://apim-unreachable.invalid:9443",
                        "https://apim-unreachable.invalid:9443/oauth2/token", null));

        // Le client est construit sans résolution DNS ni connexion ; l'échec n'apparaît qu'au premier appel.
        assertThat(registry(environments).get("dev").environment()).isEqualTo("dev");
    }

    @Test
    @DisplayName("le SSL bundle configuré (group-ca) est celui utilisé pour le contexte TLS")
    void usesConfiguredSslBundle() throws Exception {
        SslBundle bundle = mock(SslBundle.class);
        when(sslBundles.getBundle("group-ca")).thenReturn(bundle);
        when(bundle.createSslContext()).thenReturn(SSLContext.getDefault());

        registry(Map.of("dev", env("DEV", BASE_URL, TOKEN_URL, "group-ca")));

        verify(sslBundles).getBundle("group-ca");
        verify(bundle).createSslContext();
    }
}
