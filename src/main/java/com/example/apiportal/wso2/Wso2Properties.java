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
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

/**
 * Configuration des environnements WSO2. Une liste plutôt qu'une map pour garder l'ordre
 * d'affichage (DEV, SIM, UAT, EXP).
 */
@Validated
@ConfigurationProperties("portal.wso2")
public record Wso2Properties(@NotEmpty List<@Valid EnvironmentProperties> environments) {

    /**
     * Un control plane WSO2. Les secrets viennent du coffre via des variables d'environnement.
     *
     * @param sslBundle bundle de confiance (group-ca en production) ; absent, c'est le truststore
     *                  de la JVM qui s'applique, la vérification TLS reste active dans tous les cas
     */
    public record EnvironmentProperties(
            @NotBlank String name,
            @NotNull URI baseUrl,
            @NotNull URI tokenUrl,
            @NotBlank String clientId,
            @NotBlank String clientSecret,
            @NotBlank String username,
            @NotBlank String password,
            @NotEmpty List<@NotBlank String> scopes,
            String sslBundle,
            @DefaultValue("100") @Min(1) @Max(1000) int pageSize,
            @DefaultValue("5s") Duration connectTimeout,
            @DefaultValue("30s") Duration readTimeout) {

        // Masqué : ce record finit dans les logs de démarrage et les messages de binding
        @Override
        public String toString() {
            return "EnvironmentProperties[name=" + name
                    + ", baseUrl=" + baseUrl
                    + ", tokenUrl=" + tokenUrl
                    + ", clientId=" + clientId
                    + ", clientSecret=***"
                    + ", username=" + username
                    + ", password=***"
                    + ", scopes=" + scopes
                    + ", sslBundle=" + sslBundle
                    + ", pageSize=" + pageSize
                    + ", connectTimeout=" + connectTimeout
                    + ", readTimeout=" + readTimeout + "]";
        }
    }
}
