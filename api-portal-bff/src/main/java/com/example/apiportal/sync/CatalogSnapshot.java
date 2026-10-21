package com.example.apiportal.sync;

import com.example.apiportal.wso2.Wso2Models.ApiSummary;
import com.example.apiportal.wso2.Wso2Models.ApplicationSummary;
import com.example.apiportal.wso2.Wso2Models.Revision;
import com.example.apiportal.wso2.Wso2Models.Subscription;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Photo d'un environnement à un instant donné. Réutilise les DTO en liste blanche de {@code Wso2Models} :
 * aucune clé, aucun secret ni attribut d'application n'y figure. Les révisions et souscriptions sont
 * indexées par {@code apiId} car l'API Publisher ne le répète pas dans {@code Subscription}.
 */
public record CatalogSnapshot(
        List<ApiSummary> apis,
        Map<String, List<Revision>> deployedRevisionsByApiId,
        Map<String, List<Subscription>> subscriptionsByApiId,
        List<ApplicationSummary> applications) {

    public CatalogSnapshot {
        apis = List.copyOf(apis);
        deployedRevisionsByApiId = immutableCopy(deployedRevisionsByApiId);
        subscriptionsByApiId = immutableCopy(subscriptionsByApiId);
        applications = List.copyOf(applications);
    }

    public static CatalogSnapshot empty() {
        return new CatalogSnapshot(List.of(), Map.of(), Map.of(), List.of());
    }

    public List<Revision> revisionsOf(String apiId) {
        return deployedRevisionsByApiId.getOrDefault(apiId, List.of());
    }

    public List<Subscription> subscriptionsOf(String apiId) {
        return subscriptionsByApiId.getOrDefault(apiId, List.of());
    }

    public int subscriptionCount() {
        return subscriptionsByApiId.values().stream().mapToInt(List::size).sum();
    }

    private static <T> Map<String, List<T>> immutableCopy(Map<String, List<T>> source) {
        Map<String, List<T>> copy = new LinkedHashMap<>();
        source.forEach((key, value) -> copy.put(key, List.copyOf(value)));
        return Collections.unmodifiableMap(copy);
    }
}
