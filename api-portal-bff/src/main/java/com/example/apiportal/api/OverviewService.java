package com.example.apiportal.api;

import com.example.apiportal.api.ApiModels.CountDto;
import com.example.apiportal.api.ApiModels.OverviewDto;
import com.example.apiportal.api.ApiModels.TopApiDto;
import com.example.apiportal.sync.CatalogSnapshot;
import com.example.apiportal.sync.SnapshotStore;
import com.example.apiportal.wso2.Wso2Models.ApiSummary;
import com.example.apiportal.wso2.Wso2Models.Subscription;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Stream;
import org.springframework.stereotype.Service;

/**
 * Répartitions d'un environnement, calculées à la demande sur le store (jamais WSO2). Ne renvoie aucune donnée
 * personnelle : que des statuts, des politiques et des noms d'API.
 */
@Service
public class OverviewService {

    private static final int TOP_APIS = 5;

    private static final List<String> API_STATUS_ORDER =
            List.of("PUBLISHED", "PROTOTYPED", "CREATED", "DEPRECATED", "BLOCKED", "RETIRED");
    private static final List<String> SUBSCRIPTION_STATUS_ORDER =
            List.of("UNBLOCKED", "ON_HOLD", "TIER_UPDATE_PENDING", "BLOCKED", "PROD_ONLY_BLOCKED", "REJECTED");

    private final SnapshotStore store;

    public OverviewService(SnapshotStore store) {
        this.store = store;
    }

    public OverviewDto overview(String environment) {
        CatalogSnapshot snapshot = store.find(environment)
                .orElseThrow(() -> new NotFoundException("unknown environment")).snapshot();
        List<Subscription> subscriptions = snapshot.subscriptionsByApiId().values().stream()
                .flatMap(List::stream).toList();

        return new OverviewDto(
                counts(snapshot.apis().stream().map(ApiSummary::lifeCycleStatus), API_STATUS_ORDER),
                counts(subscriptions.stream().map(Subscription::subscriptionStatus), SUBSCRIPTION_STATUS_ORDER),
                counts(subscriptions.stream().map(Subscription::throttlingPolicy), List.of()),
                topApis(snapshot));
    }

    /** Comptes par clé : d'abord l'ordre métier connu, puis le reste par effectif décroissant. */
    private static List<CountDto> counts(Stream<String> keys, List<String> preferredOrder) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        keys.filter(Objects::nonNull).forEach(key -> counts.merge(key, 1, Integer::sum));
        Comparator<Map.Entry<String, Integer>> order = Comparator
                .comparingInt((Map.Entry<String, Integer> e) -> {
                    int index = preferredOrder.indexOf(e.getKey());
                    return index < 0 ? Integer.MAX_VALUE : index;
                })
                .thenComparing(Map.Entry.<String, Integer>comparingByValue().reversed())
                .thenComparing(Map.Entry.comparingByKey());
        return counts.entrySet().stream().sorted(order).map(e -> new CountDto(e.getKey(), e.getValue())).toList();
    }

    private static List<TopApiDto> topApis(CatalogSnapshot snapshot) {
        return snapshot.apis().stream()
                .map(api -> new TopApiDto(api.id(), api.name(), api.version(), snapshot.subscriptionsOf(api.id()).size()))
                .filter(api -> api.subscriptionCount() > 0)
                .sorted(Comparator.comparingInt(TopApiDto::subscriptionCount).reversed()
                        .thenComparing(api -> Objects.requireNonNullElse(api.name(), ""), String.CASE_INSENSITIVE_ORDER))
                .limit(TOP_APIS)
                .toList();
    }
}
