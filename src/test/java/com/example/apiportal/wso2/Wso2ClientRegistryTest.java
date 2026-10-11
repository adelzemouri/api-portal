package com.example.apiportal.wso2;

import static com.example.apiportal.wso2.Wso2TestFixtures.BASE_URL;
import static com.example.apiportal.wso2.Wso2TestFixtures.TOKEN_URL;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.http.HttpMessageConvertersAutoConfiguration;
import org.springframework.boot.autoconfigure.jackson.JacksonAutoConfiguration;
import org.springframework.boot.autoconfigure.ssl.SslAutoConfiguration;
import org.springframework.boot.autoconfigure.web.client.RestClientAutoConfiguration;
import org.springframework.boot.ssl.DefaultSslBundleRegistry;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.web.client.RestClient;

class Wso2ClientRegistryTest {

    private static Wso2ClientRegistry registry(Wso2Properties.EnvironmentProperties... envs) {
        return new Wso2ClientRegistry(new Wso2Properties(List.of(envs)), RestClient.builder(),
                new DefaultSslBundleRegistry(), Clock.systemUTC());
    }

    @Test
    void rejectsPlainHttpBaseUrl() {
        assertThatThrownBy(() -> registry(Wso2TestFixtures.env("http://apim-dev.example.test", TOKEN_URL, 100)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("[dev]")
                .hasMessageContaining("base-url must use https");
    }

    @Test
    void rejectsPlainHttpTokenUrl() {
        assertThatThrownBy(() -> registry(
                Wso2TestFixtures.env(BASE_URL, "http://apim-dev.example.test/oauth2/token", 100)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("[dev]")
                .hasMessageContaining("token-url must use https");
    }

    @Test
    void acceptsUppercaseHttpsScheme() {
        Wso2ClientRegistry registry = registry(Wso2TestFixtures.env("HTTPS://apim-dev.example.test",
                "HTTPS://apim-dev.example.test/oauth2/token", 100));

        assertThat(registry.get("dev")).isNotNull();
    }

    @Test
    void buildsClientsInConfigurationOrderWithoutNetworkCall() {
        // Hôtes .test non résolubles : la moindre connexion à la construction échouerait
        Wso2ClientRegistry registry = registry(
                Wso2TestFixtures.env("uat", "https://uat.example.test", "https://uat.example.test/token", 100),
                Wso2TestFixtures.env("dev", "https://dev.example.test", "https://dev.example.test/token", 100),
                Wso2TestFixtures.env("exp", "https://exp.example.test", "https://exp.example.test/token", 100));

        assertThat(registry.all()).extracting(Wso2Client::environment).containsExactly("uat", "dev", "exp");
        assertThat(registry.get("exp").environment()).isEqualTo("exp");
        assertThatThrownBy(() -> registry.get("unknown"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("unknown");
    }

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(JacksonAutoConfiguration.class,
                    HttpMessageConvertersAutoConfiguration.class, RestClientAutoConfiguration.class,
                    SslAutoConfiguration.class))
            .withUserConfiguration(Wso2Configuration.class)
            .withPropertyValues(
                    "portal.wso2.environments[0].name=dev",
                    "portal.wso2.environments[0].token-url=" + TOKEN_URL,
                    "portal.wso2.environments[0].client-id=portal-client",
                    "portal.wso2.environments[0].client-secret=s3cr3t-client",
                    "portal.wso2.environments[0].username=svc-portal-ro",
                    "portal.wso2.environments[0].password=s3cr3t-password",
                    "portal.wso2.environments[0].scopes=apim:api_view");

    @Test
    void contextStartsWithHttpsConfiguration() {
        contextRunner.withPropertyValues("portal.wso2.environments[0].base-url=" + BASE_URL)
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context.getBean(Wso2ClientRegistry.class).get("dev").environment())
                            .isEqualTo("dev");
                });
    }

    @Test
    void contextRefusesToStartWithPlainHttpUrl() {
        contextRunner.withPropertyValues("portal.wso2.environments[0].base-url=http://apim-dev.example.test")
                .run(context -> assertThat(context).getFailure()
                        .rootCause()
                        .isInstanceOf(IllegalStateException.class)
                        .hasMessageContaining("base-url must use https"));
    }
}
