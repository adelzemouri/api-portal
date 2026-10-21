package com.example.apiportal.api;

import com.example.apiportal.api.ApiModels.ApiDetailDto;
import com.example.apiportal.api.ApiModels.ApiDto;
import com.example.apiportal.api.ApiModels.ApplicationDto;
import com.example.apiportal.api.ApiModels.EnvironmentDto;
import com.example.apiportal.api.ApiModels.OverviewDto;
import com.example.apiportal.api.ApiModels.PortalDto;
import com.example.apiportal.api.ApiModels.SearchDto;
import com.example.apiportal.api.ApiModels.SubscriptionDto;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * API en lecture seule consommée par le front. Elle ne lit que le store synchronisé : aucun appel WSO2
 * n'est déclenché par une requête du navigateur.
 */
@RestController
@RequestMapping("/api/v1")
class CatalogController {

    private static final int MAX_QUERY_LENGTH = 100;

    private final CatalogQueryService queries;
    private final OverviewService overviews;

    CatalogController(CatalogQueryService queries, OverviewService overviews) {
        this.queries = queries;
        this.overviews = overviews;
    }

    @GetMapping("/environments")
    List<EnvironmentDto> environments() {
        return queries.environments();
    }

    @GetMapping("/portal")
    PortalDto portal() {
        return queries.portal();
    }

    @GetMapping("/environments/{environment}/overview")
    OverviewDto overview(@PathVariable String environment) {
        return overviews.overview(environment);
    }

    @GetMapping("/environments/{environment}/search")
    SearchDto search(@PathVariable String environment, @RequestParam(defaultValue = "") String q) {
        return queries.search(environment, checked(q));
    }

    @GetMapping("/environments/{environment}/apis")
    List<ApiDto> apis(@PathVariable String environment, @RequestParam(required = false) String q) {
        return queries.apis(environment, checked(q));
    }

    @GetMapping("/environments/{environment}/apis/{apiId}")
    ApiDetailDto apiDetail(@PathVariable String environment, @PathVariable String apiId) {
        return queries.apiDetail(environment, apiId);
    }

    @GetMapping("/environments/{environment}/apis/{apiId}/subscriptions")
    List<SubscriptionDto> subscriptionsOfApi(@PathVariable String environment, @PathVariable String apiId) {
        return queries.subscriptionsOfApi(environment, apiId);
    }

    @GetMapping("/environments/{environment}/applications")
    List<ApplicationDto> applications(@PathVariable String environment, @RequestParam(required = false) String q) {
        return queries.applications(environment, checked(q));
    }

    @GetMapping("/environments/{environment}/applications/{applicationId}/subscriptions")
    List<SubscriptionDto> subscriptionsOfApplication(@PathVariable String environment,
                                                     @PathVariable String applicationId) {
        return queries.subscriptionsOfApplication(environment, applicationId);
    }

    private static String checked(String query) {
        if (query != null && query.length() > MAX_QUERY_LENGTH) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        return query;
    }
}
