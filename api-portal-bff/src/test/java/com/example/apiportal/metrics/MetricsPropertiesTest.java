package com.example.apiportal.metrics;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.example.apiportal.metrics.MetricsProperties.Fields;
import com.example.apiportal.metrics.MetricsProperties.Splunk;
import com.example.apiportal.metrics.MetricsProperties.SplunkEnvironment;
import java.net.URI;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class MetricsPropertiesTest {

    private static final Fields FIELDS = new Fields("apiName", "apiVersion", null, "applicationName", null,
            "proxyResponseCode", "responseLatency");

    private static Splunk splunk(String url, String token) {
        return new Splunk(URI.create(url), token, "group-ca", Duration.ofSeconds(5), Duration.ofSeconds(60), FIELDS, Map.of());
    }

    @Test
    @DisplayName("Splunk doit être en https et fournir un jeton")
    void requiresHttpsAndAToken() {
        assertThatThrownBy(() -> splunk("http://splunk.test:8089", "t")).isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("https");
        assertThatThrownBy(() -> splunk("https://splunk.test:8089", " ")).isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("token");
    }

    @Test
    @DisplayName("le jeton n'apparaît jamais dans toString()")
    void tokenIsMasked() {
        assertThat(splunk("https://splunk.test:8089", "s3cr3t").toString()).doesNotContain("s3cr3t").contains("token=***");
    }

    @Test
    @DisplayName("noms de champ et d'index : identifiants seuls, rien qui puisse ouvrir une commande SPL")
    void identifiersAreRestricted() {
        for (String bad : new String[] {"api name", "apiName|delete", "a\"b", "x; y", "a'b", "a)b"}) {
            assertThatThrownBy(() -> new Fields(bad, "v", null, "a", null, "s", "l")).as(bad)
                    .isInstanceOf(IllegalArgumentException.class);
            assertThatThrownBy(() -> new SplunkEnvironment(bad, "")).as(bad).isInstanceOf(IllegalArgumentException.class);
        }
        assertThat(new Fields("api.name", "v", "api:id", "a", null, "s", "l")).isNotNull();
        assertThatThrownBy(() -> new SplunkEnvironment(" ", "")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("le filtre facultatif ne peut contenir ni pipe, ni crochet, ni point-virgule, ni antiquote")
    void filterCannotOpenASubsearchOrCommand() {
        assertThat(new SplunkEnvironment("idx", "  sourcetype=\"wso2:apim\" ").filter()).isEqualTo("sourcetype=\"wso2:apim\"");
        assertThat(new SplunkEnvironment("idx", null).filter()).isEmpty();
        for (String bad : new String[] {"a | delete", "[search x]", "a; b", "`x`", "a\nb"}) {
            assertThatThrownBy(() -> new SplunkEnvironment("idx", bad)).as(bad).isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Test
    @DisplayName("les champs obligatoires ont des valeurs par défaut, les identifiants sont facultatifs")
    void optionalIdentifiers() {
        assertThat(FIELDS.apiId()).isNull();
        assertThatThrownBy(() -> new Fields(null, "v", null, "a", null, "s", "l")).isInstanceOf(IllegalArgumentException.class);
    }
}
