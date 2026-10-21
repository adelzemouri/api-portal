package com.example.apiportal.api;

import java.net.URI;
import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Adresses affichées aux développeurs, toutes facultatives et en https : interfaces WSO2 (Publisher, Devportal),
 * Identity Server et port des gateways de chaque environnement, composant GitLab de déploiement. Sans
 * configuration, le front n'affiche simplement rien. Ce ne sont jamais les URL des API d'administration
 * utilisées par la synchro.
 */
@ConfigurationProperties(prefix = "portal.links")
public record PortalLinks(@DefaultValue Map<String, EnvironmentLinks> environments, URI deployComponentUrl) {

    public PortalLinks {
        requireHttps(deployComponentUrl, "deploy-component-url");
    }

    /**
     * {@code gatewayHttpsPort} : port HTTPS des gateways ; absent, l'URL d'API n'en porte pas (443). WSO2 ne
     * fournit que l'hôte virtuel dans le déploiement d'une révision, jamais le port.
     */
    public record EnvironmentLinks(URI publisherUrl, URI devportalUrl, URI identityServerUrl,
                                   Integer gatewayHttpsPort) {

        public EnvironmentLinks {
            requireHttps(publisherUrl, "publisher-url");
            requireHttps(devportalUrl, "devportal-url");
            requireHttps(identityServerUrl, "identity-server-url");
            if (gatewayHttpsPort != null && (gatewayHttpsPort < 1 || gatewayHttpsPort > 65535)) {
                throw new IllegalArgumentException("portal.links.gateway-https-port must be between 1 and 65535");
            }
        }
    }

    private static void requireHttps(URI uri, String name) {
        if (uri != null && !"https".equalsIgnoreCase(uri.getScheme())) {
            throw new IllegalArgumentException("portal.links." + name + " must be an https URL");
        }
    }

    public static PortalLinks none() {
        return new PortalLinks(Map.of(), null);
    }

    public EnvironmentLinks of(String environment) {
        return environments.getOrDefault(environment, new EnvironmentLinks(null, null, null, null));
    }
}
