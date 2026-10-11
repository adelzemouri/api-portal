package com.example.apiportal.wso2;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;

/**
 * DTO en liste blanche des réponses WSO2. Tout champ absent d'ici est ignoré à la lecture :
 * ne jamais y ajouter de clés, secrets ni attributs d'application, ni les remplacer par des
 * Map ou JsonNode génériques.
 */
public final class Wso2Models {

    private Wso2Models() {
    }

    /** Enveloppe paginée commune aux listes de la Publisher et de l'Admin API. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Page<T>(Integer count, List<T> list, Pagination pagination) {

        public List<T> items() {
            return list == null ? List.of() : list;
        }

        public Integer total() {
            return pagination == null ? null : pagination.total();
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Pagination(Integer offset, Integer limit, Integer total) {
    }

    /** API vue par la Publisher API. displayName n'existe que sur certaines versions 4.x. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Api(String id, String name, String displayName, String version, String context,
                      String lifeCycleStatus) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record RevisionList(Integer count, List<Revision> list) {

        public List<Revision> items() {
            return list == null ? List.of() : list;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Revision(String id, String displayName, List<RevisionDeployment> deploymentInfo) {
    }

    /** Déploiement d'une révision sur une gateway (name = environnement de gateway WSO2). */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record RevisionDeployment(String name, String vhost, String status) {
    }

    /** subscriber est une donnée personnelle : à filtrer par RBAC côté BFF. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Subscription(String subscriptionId, SubscribedApplication applicationInfo,
                               String throttlingPolicy, String subscriptionStatus) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record SubscribedApplication(String applicationId, String name, String subscriber) {
    }

    /** Application vue par l'Admin API. owner est une donnée personnelle. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Application(String applicationId, String name, String owner, String status) {
    }
}
