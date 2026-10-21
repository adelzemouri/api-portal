package com.example.apiportal.wso2;

import com.example.apiportal.wso2.Wso2Models.ApiSummary;
import com.example.apiportal.wso2.Wso2Models.ApplicationSummary;
import com.example.apiportal.wso2.Wso2Models.Page;
import com.example.apiportal.wso2.Wso2Models.Revision;
import com.example.apiportal.wso2.Wso2Models.Subscription;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriBuilder;

/**
 * Client en lecture seule d'un control plane WSO2 APIM 4.x.
 * Aucune méthode d'écriture n'est exposée, par construction.
 */
public final class Wso2Client {

    private static final String PUBLISHER = "/api/am/publisher/v4";
    private static final String ADMIN = "/api/am/admin/v4";
    /** Garde-fou contre une pagination qui ne converge pas. */
    private static final int MAX_ITEMS = 50_000;

    private static final ParameterizedTypeReference<Page<ApiSummary>> API_PAGE =
            new ParameterizedTypeReference<>() { };
    private static final ParameterizedTypeReference<Page<Revision>> REVISION_PAGE =
            new ParameterizedTypeReference<>() { };
    private static final ParameterizedTypeReference<Page<Subscription>> SUBSCRIPTION_PAGE =
            new ParameterizedTypeReference<>() { };
    private static final ParameterizedTypeReference<Page<ApplicationSummary>> APPLICATION_PAGE =
            new ParameterizedTypeReference<>() { };

    private final String environment;
    private final String label;
    private final RestClient restClient;
    private final Wso2TokenProvider tokens;
    private final int pageSize;

    Wso2Client(String environment, String label, RestClient restClient,
               Wso2TokenProvider tokens, int pageSize) {
        this.environment = environment;
        this.label = label;
        this.restClient = restClient;
        this.tokens = tokens;
        this.pageSize = pageSize;
    }

    public String environment() {
        return environment;
    }

    public String label() {
        return label;
    }

    /** Toutes les API du control plane. */
    public List<ApiSummary> listApis() {
        return fetchAll(PUBLISHER + "/apis", Map.of(), API_PAGE);
    }

    /** Révisions déployées sur au moins une gateway, avec le détail par gateway. */
    public List<Revision> listDeployedRevisions(String apiId) {
        return get(uri -> uri.path(PUBLISHER + "/apis/{apiId}/revisions")
                        .queryParam("query", "deployed:true")
                        .build(apiId),
                REVISION_PAGE).items();
    }

    /** Souscriptions d'une API (la Publisher API les expose par API). */
    public List<Subscription> listSubscriptions(String apiId) {
        return fetchAll(PUBLISHER + "/subscriptions", Map.of("apiId", apiId), SUBSCRIPTION_PAGE);
    }

    /** Toutes les applications, quel que soit leur propriétaire (Admin API). */
    public List<ApplicationSummary> listApplications() {
        return fetchAll(ADMIN + "/applications", Map.of(), APPLICATION_PAGE);
    }

    private <T> List<T> fetchAll(String path, Map<String, String> params,
                                 ParameterizedTypeReference<Page<T>> type) {
        List<T> all = new ArrayList<>();
        int offset = 0;
        while (true) {
            int pageOffset = offset;
            Page<T> page = get(uri -> {
                uri.path(path)
                        .queryParam("limit", pageSize)
                        .queryParam("offset", pageOffset);
                params.forEach((key, value) -> uri.queryParam(key, value));
                return uri.build();
            }, type);

            List<T> items = page.items();
            all.addAll(items);
            offset += items.size();

            Integer total = page.pagination() == null ? null : page.pagination().total();
            boolean more = total != null ? offset < total : items.size() == pageSize;
            if (items.isEmpty() || !more) {
                return List.copyOf(all);
            }
            if (offset >= MAX_ITEMS) {
                throw new Wso2ClientException(environment, "pagination did not converge on " + path);
            }
        }
    }

    private <T> T get(Function<UriBuilder, URI> uriFunction, ParameterizedTypeReference<T> type) {
        for (int attempt = 1; ; attempt++) {
            try {
                T body = restClient.get()
                        .uri(uriFunction)
                        .headers(h -> h.setBearerAuth(tokens.accessToken()))
                        .accept(MediaType.APPLICATION_JSON)
                        .retrieve()
                        .body(type);
                if (body == null) {
                    throw new Wso2ClientException(environment, "empty response body");
                }
                return body;
            } catch (HttpClientErrorException.Unauthorized e) {
                // Token révoqué avant expiration (redémarrage, rotation) : un seul renouvellement.
                tokens.invalidate();
                if (attempt >= 2) {
                    throw new Wso2ClientException(environment, "HTTP 401 persists after token renewal", e);
                }
            } catch (HttpClientErrorException.Forbidden e) {
                throw new Wso2ClientException(environment,
                        "HTTP 403: service account lacks a scope for this resource", e);
            } catch (RestClientResponseException e) {
                throw new Wso2ClientException(environment, "HTTP " + e.getStatusCode().value(), e);
            } catch (ResourceAccessException e) {
                throw new Wso2ClientException(environment, "control plane unreachable", e);
            } catch (RestClientException e) {
                // Réponse illisible : page HTML (ex. login derrière une redirection non suivie) ou JSON invalide.
                // Le message n'embarque pas le corps de la réponse.
                throw new Wso2ClientException(environment, "unexpected response format", e);
            }
        }
    }
}
