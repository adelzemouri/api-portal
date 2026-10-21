package com.example.apiportal.api;

import com.example.apiportal.api.ApiModels.ApiDetailDto;
import com.example.apiportal.api.ApiModels.ApiDto;
import com.example.apiportal.api.ApiModels.ApplicationDto;
import com.example.apiportal.api.ApiModels.EnvironmentDto;
import com.example.apiportal.api.ApiModels.GatewayDto;
import com.example.apiportal.api.ApiModels.GatewayInfoDto;
import com.example.apiportal.api.ApiModels.GatewayUrlDto;
import com.example.apiportal.api.ApiModels.PortalDto;
import com.example.apiportal.api.ApiModels.PresenceDto;
import com.example.apiportal.api.ApiModels.PresenceVersionDto;
import com.example.apiportal.api.ApiModels.RevisionDto;
import com.example.apiportal.api.ApiModels.SearchDto;
import com.example.apiportal.api.ApiModels.SubscriptionDto;
import com.example.apiportal.api.ApiModels.SyncDto;
import com.example.apiportal.sync.CatalogSnapshot;
import com.example.apiportal.sync.EnvironmentState;
import com.example.apiportal.sync.SnapshotStore;
import com.example.apiportal.sync.SyncStatus;
import com.example.apiportal.wso2.Wso2Models.ApiSummary;
import com.example.apiportal.wso2.Wso2Models.ApplicationSummary;
import com.example.apiportal.wso2.Wso2Models.Revision;
import com.example.apiportal.wso2.Wso2Models.RevisionDeployment;
import com.example.apiportal.wso2.Wso2Models.Subscription;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import org.springframework.stereotype.Service;

/** Lit exclusivement le store (jamais WSO2) et construit les vues du portail. */
@Service
public class CatalogQueryService {

    private static final Comparator<SubscriptionDto> BY_APPLICATION = Comparator.comparing(
            (SubscriptionDto s) -> Objects.requireNonNullElse(s.applicationName(), ""), String.CASE_INSENSITIVE_ORDER);

    private static final int SEARCH_LIMIT = 8;

    private final SnapshotStore store;
    private final PersonalDataPolicy personalData;
    private final PortalLinks links;

    public CatalogQueryService(SnapshotStore store, PersonalDataPolicy personalData, PortalLinks links) {
        this.store = store;
        this.personalData = personalData;
        this.links = links;
    }

    public List<EnvironmentDto> environments() {
        List<EnvironmentState> states = store.all();
        List<EnvironmentDto> result = new ArrayList<>();
        for (int i = 0; i < states.size(); i++) {
            EnvironmentState state = states.get(i);
            PortalLinks.EnvironmentLinks configured = links.of(state.key());
            result.add(new EnvironmentDto(state.key(), state.label(), i, toDto(state.status()),
                    asString(configured.publisherUrl()), asString(configured.devportalUrl()),
                    asString(configured.identityServerUrl()), gatewaysOf(state.key(), state.snapshot())));
        }
        return result;
    }

    /** Adresse de base d'une gateway : {@code https://hôte[:port]}. Sans port configuré, le 443 implicite. */
    private String gatewayBase(String environment, String vhost) {
        Integer port = links.of(environment).gatewayHttpsPort();
        return "https://" + vhost + (port == null || port == 443 ? "" : ":" + port);
    }

    private static String asString(java.net.URI uri) {
        return uri == null ? null : uri.toString();
    }

    /** Gateways sur lesquelles au moins une révision est déployée, sans doublon. */
    private List<GatewayInfoDto> gatewaysOf(String environment, CatalogSnapshot snapshot) {
        var gateways = new LinkedHashSet<GatewayInfoDto>();
        snapshot.deployedRevisionsByApiId().values().forEach(revisions -> revisions.forEach(revision -> {
            if (revision.deploymentInfo() != null) {
                revision.deploymentInfo().stream().filter(d -> d.vhost() != null && !d.vhost().isBlank())
                        .forEach(d -> gateways.add(new GatewayInfoDto(d.name(), d.vhost(),
                                gatewayBase(environment, d.vhost()))));
            }
        }));
        return gateways.stream()
                .sorted(Comparator.comparing((GatewayInfoDto g) -> Objects.requireNonNullElse(g.name(), ""))
                        .thenComparing(g -> Objects.requireNonNullElse(g.vhost(), "")))
                .toList();
    }

    public PortalDto portal() {
        return new PortalDto(asString(links.deployComponentUrl()));
    }

    /** URL complète de l'API sur chaque gateway où une révision est déployée : {@code base + contexte}. */
    private List<GatewayUrlDto> gatewayUrlsOf(String environment, CatalogSnapshot snapshot, ApiSummary api) {
        if (api.context() == null) {
            return List.of();
        }
        String context = api.context().startsWith("/") ? api.context() : "/" + api.context();
        var urls = new LinkedHashSet<GatewayUrlDto>();
        snapshot.revisionsOf(api.id()).forEach(revision -> {
            if (revision.deploymentInfo() != null) {
                revision.deploymentInfo().stream().filter(d -> d.vhost() != null && !d.vhost().isBlank())
                        .forEach(d -> urls.add(new GatewayUrlDto(d.name(), gatewayBase(environment, d.vhost()) + context)));
            }
        });
        return List.copyOf(urls);
    }

    /** Recherche globale : les premières API et applications qui correspondent (vide si la requête est vide). */
    public SearchDto search(String environment, String query) {
        if (query == null || query.isBlank()) {
            environment(environment);
            return new SearchDto(List.of(), List.of());
        }
        return new SearchDto(apis(environment, query).stream().limit(SEARCH_LIMIT).toList(),
                applications(environment, query).stream().limit(SEARCH_LIMIT).toList());
    }

    /** APIs d'un environnement, triées par nom puis version, avec leur nombre de souscriptions. */
    public List<ApiDto> apis(String environment, String query) {
        EnvironmentState state = environment(environment);
        CatalogSnapshot snapshot = state.snapshot();
        return sortedApis(snapshot.apis()).stream()
                .map(api -> toApiDto(api, snapshot))
                .filter(api -> matches(query, api.name(), api.context()))
                .toList();
    }

    /** Révision déployée (avec ses gateways) et présence de l'API, par son nom, dans chaque environnement. */
    public ApiDetailDto apiDetail(String environment, String apiId) {
        CatalogSnapshot snapshot = environment(environment).snapshot();
        ApiSummary api = snapshot.apis().stream().filter(a -> Objects.equals(a.id(), apiId)).findFirst()
                .orElseThrow(() -> new NotFoundException("unknown api"));
        List<PresenceDto> presence = store.all().stream()
                .map(state -> new PresenceDto(state.key(), state.label(),
                        state.status().state() == SyncStatus.State.ERROR,
                        state.snapshot().apis().stream()
                                .filter(other -> other.name() != null && other.name().equalsIgnoreCase(api.name())
                                        && other.version() != null)
                                .sorted(Comparator.comparing(ApiSummary::version, VersionComparator.INSTANCE))
                                .map(other -> new PresenceVersionDto(other.id(), other.version()))
                                .toList()))
                .toList();
        return new ApiDetailDto(toApiDto(api, snapshot),
                snapshot.revisionsOf(api.id()).stream().map(CatalogQueryService::toDto).toList(), presence,
                gatewayUrlsOf(environment, snapshot, api));
    }

    public List<ApplicationDto> applications(String environment, String query) {
        EnvironmentState state = environment(environment);
        Map<String, Integer> counts = new HashMap<>();
        state.snapshot().subscriptionsByApiId().values().forEach(subscriptions -> subscriptions.stream()
                .map(Subscription::applicationInfo)
                .filter(Objects::nonNull)
                .forEach(application -> counts.merge(application.applicationId(), 1, Integer::sum)));
        return state.snapshot().applications().stream()
                .sorted(Comparator.comparing(ApplicationSummary::name, Comparator.nullsLast(String.CASE_INSENSITIVE_ORDER)))
                .map(app -> new ApplicationDto(state.key(), app.applicationId(), app.name(),
                        personalData.owner(app.owner()), app.status(), counts.getOrDefault(app.applicationId(), 0)))
                .filter(app -> matches(query, app.name(), app.owner()))
                .toList();
    }

    /** Applications souscrites à une API. */
    public List<SubscriptionDto> subscriptionsOfApi(String environment, String apiId) {
        EnvironmentState state = environment(environment);
        CatalogSnapshot snapshot = state.snapshot();
        ApiSummary api = snapshot.apis().stream().filter(a -> Objects.equals(a.id(), apiId)).findFirst()
                .orElseThrow(() -> new NotFoundException("unknown api"));
        Map<String, String> owners = ownersById(snapshot);
        return snapshot.subscriptionsOf(api.id()).stream()
                .map(subscription -> toDto(state.key(), api, subscription, owners))
                .sorted(BY_APPLICATION)
                .toList();
    }

    /** APIs auxquelles une application est souscrite. */
    public List<SubscriptionDto> subscriptionsOfApplication(String environment, String applicationId) {
        EnvironmentState state = environment(environment);
        CatalogSnapshot snapshot = state.snapshot();
        if (snapshot.applications().stream().noneMatch(app -> Objects.equals(app.applicationId(), applicationId))) {
            throw new NotFoundException("unknown application");
        }
        Map<String, String> owners = ownersById(snapshot);
        return sortedApis(snapshot.apis()).stream()
                .flatMap(api -> snapshot.subscriptionsOf(api.id()).stream()
                        .filter(subscription -> subscription.applicationInfo() != null
                                && Objects.equals(subscription.applicationInfo().applicationId(), applicationId))
                        .map(subscription -> toDto(state.key(), api, subscription, owners)))
                .toList();
    }

    private static List<ApiSummary> sortedApis(List<ApiSummary> apis) {
        return apis.stream()
                .sorted(Comparator.comparing((ApiSummary a) -> Objects.requireNonNullElse(a.name(), ""),
                                String.CASE_INSENSITIVE_ORDER)
                        .thenComparing(a -> Objects.requireNonNullElse(a.version(), ""), VersionComparator.INSTANCE))
                .toList();
    }

    private static ApiDto toApiDto(ApiSummary api, CatalogSnapshot snapshot) {
        return new ApiDto(api.id(), api.name(), api.version(), api.context(), api.type(), api.lifeCycleStatus(),
                snapshot.subscriptionsOf(api.id()).size());
    }

    private static Map<String, String> ownersById(CatalogSnapshot snapshot) {
        Map<String, String> owners = new HashMap<>();
        snapshot.applications().forEach(app -> owners.put(app.applicationId(), app.owner()));
        return owners;
    }

    private SubscriptionDto toDto(String environment, ApiSummary api, Subscription subscription,
                                  Map<String, String> owners) {
        var application = subscription.applicationInfo();
        return new SubscriptionDto(environment, subscription.subscriptionId(), api.id(), api.name(), api.version(),
                application == null ? null : application.applicationId(),
                application == null ? null : application.name(),
                application == null ? null : personalData.owner(owners.get(application.applicationId())),
                application == null ? null : personalData.subscriber(application.subscriber()),
                subscription.throttlingPolicy(), subscription.subscriptionStatus());
    }

    private EnvironmentState environment(String key) {
        return store.find(key).orElseThrow(() -> new NotFoundException("unknown environment"));
    }

    private static boolean matches(String query, String... fields) {
        if (query == null || query.isBlank()) {
            return true;
        }
        String needle = query.strip().toLowerCase(Locale.ROOT);
        for (String field : fields) {
            if (field != null && field.toLowerCase(Locale.ROOT).contains(needle)) {
                return true;
            }
        }
        return false;
    }

    private static RevisionDto toDto(Revision revision) {
        List<RevisionDeployment> deployments = revision.deploymentInfo() == null ? List.of() : revision.deploymentInfo();
        return new RevisionDto(revision.id(), revision.displayName(), revision.createdTime(),
                deployments.stream()
                        .map(d -> new GatewayDto(d.name(), d.vhost(), d.deploymentStatus(), d.deployedTime()))
                        .toList());
    }

    private static SyncDto toDto(SyncStatus status) {
        return new SyncDto(status.state().name(), status.lastAttemptAt(), status.lastSuccessAt(),
                status.errorMessage(), status.apiCount(), status.applicationCount(), status.subscriptionCount());
    }
}
