package com.example.apiportal.api;

import java.time.Instant;
import java.util.List;

/**
 * Réponses de l'API du BFF pour le front. Distinctes de {@code Wso2Models} : le contrat du portail ne dépend
 * pas de celui de WSO2. Aucun champ de clé, secret ou attribut d'application.
 */
public final class ApiModels {

    private ApiModels() {
    }

    public record SyncDto(String state, Instant lastAttemptAt, Instant lastSuccessAt, String error,
                          int apis, int applications, int subscriptions) {
    }

    /** {@code url} : adresse de base de la gateway (https, port éventuel), sans le contexte d'une API. */
    public record GatewayInfoDto(String name, String vhost, String url) {
    }

    /** Adresses facultatives : null si non configurées. */
    public record EnvironmentDto(String key, String label, int order, SyncDto sync, String publisherUrl,
                                 String devportalUrl, String identityServerUrl, List<GatewayInfoDto> gateways) {
    }

    /** Informations communes à tous les environnements. */
    public record PortalDto(String deployComponentUrl) {
    }

    /** URL complète d'une API sur une gateway : {@code https://hôte[:port]/contexte}. */
    public record GatewayUrlDto(String gateway, String url) {
    }

    /** Une version d'API d'un environnement, avec son nombre de souscriptions. */
    public record ApiDto(String apiId, String name, String version, String context, String type,
                         String lifeCycleStatus, int subscriptionCount) {
    }

    public record GatewayDto(String name, String vhost, String status, String deployedTime) {
    }

    /** Révision déployée sur au moins une gateway. */
    public record RevisionDto(String id, String name, String createdTime, List<GatewayDto> gateways) {
    }

    /**
     * Versions d'une API (retrouvée par son nom) dans un environnement. {@code stale} : l'environnement est en
     * erreur, les versions sont celles de sa dernière synchro réussie.
     */
    public record PresenceDto(String environment, String label, boolean stale, List<PresenceVersionDto> versions) {
    }

    /**
     * {@code revision} : nom de la dernière révision déployée sur une gateway, {@code deployedTime} : date de ce
     * déploiement ; nuls si aucune révision n'est déployée. Le numéro de version ne change pas d'un environnement à
     * l'autre : c'est la révision qui dit où en est chaque environnement.
     */
    public record PresenceVersionDto(String apiId, String version, String revision, String deployedTime) {
    }

    /** Déploiement d'une révision dans un environnement, pour le fil d'activité. */
    public record DeploymentDto(String environment, String label, String apiId, String apiName, String apiVersion,
                                String revision, List<String> gateways, String deployedTime) {
    }

    /** Ce que la ligne d'API ne porte pas : où elle est déployée, et où elle existe ailleurs. */
    public record ApiDetailDto(ApiDto api, List<RevisionDto> revisions, List<PresenceDto> environments,
                               List<GatewayUrlDto> gatewayUrls) {
    }

    public record ApplicationDto(String environment, String applicationId, String name, String owner, String status,
                                 int subscriptionCount) {
    }

    public record SubscriptionDto(String environment, String subscriptionId, String apiId, String apiName,
                                  String apiVersion, String applicationId, String applicationName,
                                  String applicationOwner, String subscriber, String throttlingPolicy,
                                  String status) {
    }

    /** {@code key} : statut ou politique tel que WSO2 le nomme ; le front le traduit. */
    public record CountDto(String key, int count) {
    }

    public record TopApiDto(String apiId, String name, String version, int subscriptionCount) {
    }

    public record OverviewDto(List<CountDto> apisByStatus, List<CountDto> subscriptionsByStatus,
                              List<CountDto> subscriptionsByPolicy, List<TopApiDto> topApis) {
    }

    /** Résultat de la recherche globale : quelques éléments de chaque type, pas la liste complète. */
    public record SearchDto(List<ApiDto> apis, List<ApplicationDto> applications) {
    }
}
