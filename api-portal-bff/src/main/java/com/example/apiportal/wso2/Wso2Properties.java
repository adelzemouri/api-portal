package com.example.apiportal.wso2;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.context.annotation.Profile;
import org.springframework.validation.annotation.Validated;

/**
 * Configuration des control planes WSO2 (un par environnement).
 * L'ordre de déclaration est conservé et sert d'ordre d'affichage.
 */
// Absent en profil « mock » : la démo ne doit exiger aucune variable d'environnement WSO2.
@Profile("!mock")
@Validated
@ConfigurationProperties(prefix = "portal.wso2")
public record Wso2Properties(
        @DefaultValue("5s") Duration connectTimeout,
        @DefaultValue("30s") Duration readTimeout,
        @DefaultValue("100") @Min(1) @Max(1000) int pageSize,
        @NotEmpty List<@NotBlank String> scopes,
        @NotEmpty Map<String, @Valid EnvironmentProperties> environments) {

    public record EnvironmentProperties(
            @NotBlank String label,
            @NotNull URI baseUrl,
            @NotNull URI tokenUrl,
            @NotBlank String clientId,
            @NotBlank String clientSecret,
            @NotBlank String username,
            @NotBlank String password,
            String sslBundle) {

        /** Aucun secret dans les logs, y compris via un toString() implicite. */
        @Override
        public String toString() {
            return ("EnvironmentProperties[label=%s, baseUrl=%s, tokenUrl=%s, clientId=%s, "
                    + "username=%s, sslBundle=%s, clientSecret=***, password=***]")
                    .formatted(label, baseUrl, tokenUrl, clientId, username, sslBundle);
        }
    }
}
