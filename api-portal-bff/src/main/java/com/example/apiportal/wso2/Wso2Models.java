package com.example.apiportal.wso2;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;

/**
 * DTO WSO2 volontairement réduits : c'est une liste blanche.
 * Tout champ non déclaré ici est ignoré à la désérialisation. Consumer keys, secrets et
 * attributs d'application n'entrent donc jamais dans le portail, même si une future
 * version de l'API les ajoute aux réponses.
 */
public final class Wso2Models {

    private Wso2Models() {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Page<T>(Integer count, List<T> list, Pagination pagination) {
        public List<T> items() {
            return list == null ? List.of() : list;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Pagination(Integer offset, Integer limit, Integer total) {
    }

    /** Publisher v4 - GET /apis */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ApiSummary(
            String id,
            String name,
            String context,
            String version,
            String provider,
            String type,
            String lifeCycleStatus) {
    }

    /** Publisher v4 - GET /apis/{apiId}/revisions?query=deployed:true */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Revision(
            String id,
            String displayName,
            String createdTime,
            List<RevisionDeployment> deploymentInfo) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record RevisionDeployment(
            String name,
            String vhost,
            String deploymentStatus,
            String deployedTime) {
    }

    /** Publisher v4 - GET /subscriptions?apiId= */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Subscription(
            String subscriptionId,
            ApplicationRef applicationInfo,
            String throttlingPolicy,
            String subscriptionStatus) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ApplicationRef(String applicationId, String name, String subscriber) {
    }

    /** Admin v4 - GET /applications (toutes les applications, tous propriétaires) */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ApplicationSummary(
            String applicationId,
            String name,
            String owner,
            String status,
            String groupId) {
    }
}
