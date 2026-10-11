package com.example.apiportal.wso2;

import com.example.apiportal.wso2.Wso2Models.Api;
import com.example.apiportal.wso2.Wso2Models.Application;
import com.example.apiportal.wso2.Wso2Models.Page;
import com.example.apiportal.wso2.Wso2Models.Revision;
import com.example.apiportal.wso2.Wso2Models.RevisionList;
import com.example.apiportal.wso2.Wso2Models.Subscription;
import com.example.apiportal.wso2.Wso2Properties.EnvironmentProperties;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.function.IntFunction;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * Client lecture seule d'un environnement WSO2 APIM 4.x. Uniquement des GET, par construction :
 * aucune méthode de ce client ne doit modifier quoi que ce soit dans WSO2.
 */
public class Wso2Client {

    static final String PUBLISHER_PATH = "/api/am/publisher/v4";
    static final String ADMIN_PATH = "/api/am/admin/v4";

    // Garde-fou contre une pagination qui ne converge pas (total absent et pages toujours pleines)
    static final int MAX_ITEMS = 50_000;

    private static final ParameterizedTypeReference<Page<Api>> API_PAGE = new ParameterizedTypeReference<>() { };
    private static final ParameterizedTypeReference<Page<Subscription>> SUBSCRIPTION_PAGE =
            new ParameterizedTypeReference<>() { };
    private static final ParameterizedTypeReference<Page<Application>> APPLICATION_PAGE =
            new ParameterizedTypeReference<>() { };
    private static final ParameterizedTypeReference<RevisionList> REVISION_LIST =
            new ParameterizedTypeReference<>() { };

    private final EnvironmentProperties env;
    private final RestClient restClient;
    private final Wso2TokenProvider tokenProvider;

    public Wso2Client(EnvironmentProperties env, RestClient restClient, Wso2TokenProvider tokenProvider) {
        this.env = env;
        this.restClient = restClient;
        this.tokenProvider = tokenProvider;
    }

    public String environment() {
        return env.name();
    }

    public List<Api> listApis() {
        return fetchAll(offset -> get(pageUri(PUBLISHER_PATH + "/apis", offset).build().toUri(), API_PAGE));
    }

    /** Révisions déployées d'une API, avec la gateway de chaque déploiement. */
    public List<Revision> listDeployedRevisions(String apiId) {
        URI uri = UriComponentsBuilder.fromUri(env.baseUrl())
                .path(PUBLISHER_PATH + "/apis/{apiId}/revisions")
                .queryParam("query", "deployed:true")
                .encode()
                .buildAndExpand(apiId)
                .toUri();
        return get(uri, REVISION_LIST).items();
    }

    /** La Publisher API n'expose les souscriptions que par API : un appel paginé par API. */
    public List<Subscription> listSubscriptions(String apiId) {
        return fetchAll(offset -> get(pageUri(PUBLISHER_PATH + "/subscriptions", offset)
                .queryParam("apiId", "{apiId}").encode().buildAndExpand(apiId).toUri(), SUBSCRIPTION_PAGE));
    }

    /** Admin API : seule API qui liste les applications de tous les propriétaires. */
    public List<Application> listApplications() {
        return fetchAll(offset -> get(pageUri(ADMIN_PATH + "/applications", offset).build().toUri(), APPLICATION_PAGE));
    }

    private UriComponentsBuilder pageUri(String path, int offset) {
        return UriComponentsBuilder.fromUri(env.baseUrl())
                .path(path)
                .queryParam("limit", env.pageSize())
                .queryParam("offset", offset);
    }

    private <T> List<T> fetchAll(IntFunction<Page<T>> fetchPage) {
        List<T> all = new ArrayList<>();
        int offset = 0;
        while (true) {
            Page<T> page = fetchPage.apply(offset);
            List<T> items = page.items();
            all.addAll(items);
            Integer total = page.total();
            boolean done = total != null
                    ? items.isEmpty() || all.size() >= total
                    : items.size() < env.pageSize();
            if (done) {
                return all;
            }
            if (all.size() >= MAX_ITEMS) {
                throw new Wso2ClientException(env.name(),
                        "pagination did not converge after " + all.size() + " items");
            }
            offset += items.size();
        }
    }

    // Un seul retry sur 401 : le jeton a pu être révoqué avant son expiration
    private <T> T get(URI uri, ParameterizedTypeReference<T> type) {
        Outcome<T> outcome = exchange(uri, type, tokenProvider.accessToken());
        if (outcome.unauthorized()) {
            tokenProvider.invalidate();
            outcome = exchange(uri, type, tokenProvider.accessToken());
            if (outcome.unauthorized()) {
                throw new Wso2ClientException(env.name(),
                        "HTTP 401 persists after token renewal on GET " + uri.getPath());
            }
        }
        if (outcome.body() == null) {
            throw new Wso2ClientException(env.name(), "empty response on GET " + uri.getPath());
        }
        return outcome.body();
    }

    private <T> Outcome<T> exchange(URI uri, ParameterizedTypeReference<T> type, String token) {
        try {
            return restClient.get()
                    .uri(uri)
                    .accept(MediaType.APPLICATION_JSON)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .exchange((request, res) -> {
                        int status = res.getStatusCode().value();
                        if (status == 401) {
                            return new Outcome<T>(true, null);
                        }
                        if (status == 403) {
                            throw new Wso2ClientException(env.name(),
                                    "HTTP 403: service account lacks a scope for this resource (GET "
                                            + uri.getPath() + ")");
                        }
                        // Redirections non suivies : un 3xx est une erreur comme une autre
                        if (!res.getStatusCode().is2xxSuccessful()) {
                            throw new Wso2ClientException(env.name(),
                                    "HTTP " + status + " on GET " + uri.getPath());
                        }
                        return new Outcome<>(false, res.bodyTo(type));
                    });
        } catch (ResourceAccessException e) {
            throw new Wso2ClientException(env.name(), "unreachable on GET " + uri.getPath(), e);
        } catch (RestClientException e) {
            // Pas de cause : le message pourrait citer le corps de la réponse
            throw new Wso2ClientException(env.name(),
                    "invalid response on GET " + uri.getPath() + ": " + e.getClass().getSimpleName());
        }
    }

    private record Outcome<T>(boolean unauthorized, T body) {
    }
}
