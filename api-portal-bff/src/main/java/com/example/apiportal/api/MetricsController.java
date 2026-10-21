package com.example.apiportal.api;

import com.example.apiportal.api.MetricsDtos.ApiMetricsDto;
import com.example.apiportal.api.MetricsDtos.ApiMetricsListDto;
import com.example.apiportal.api.MetricsDtos.AppMetricsListDto;
import com.example.apiportal.api.MetricsDtos.ApplicationMetricsDto;
import com.example.apiportal.api.MetricsDtos.MetricsOverviewDto;
import com.example.apiportal.metrics.MetricsModels.Window;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Métriques de trafic, lues dans le store : aucune requête Splunk n'est déclenchée par le navigateur. */
@RestController
@RequestMapping("/api/v1/environments/{environment}")
class MetricsController {

    private final MetricsQueryService queries;

    MetricsController(MetricsQueryService queries) {
        this.queries = queries;
    }

    @GetMapping("/metrics")
    MetricsOverviewDto overview(@PathVariable String environment, @RequestParam(defaultValue = "24h") String window) {
        return queries.overview(environment, window(window));
    }

    @GetMapping("/metrics/apis")
    ApiMetricsListDto apis(@PathVariable String environment, @RequestParam(defaultValue = "24h") String window) {
        return queries.apis(environment, window(window));
    }

    @GetMapping("/metrics/applications")
    AppMetricsListDto applications(@PathVariable String environment, @RequestParam(defaultValue = "24h") String window) {
        return queries.applications(environment, window(window));
    }

    @GetMapping("/apis/{apiId}/metrics")
    ApiMetricsDto apiMetrics(@PathVariable String environment, @PathVariable String apiId,
                             @RequestParam(defaultValue = "24h") String window) {
        return queries.apiMetrics(environment, apiId, window(window));
    }

    @GetMapping("/applications/{applicationId}/metrics")
    ApplicationMetricsDto applicationMetrics(@PathVariable String environment, @PathVariable String applicationId,
                                             @RequestParam(defaultValue = "24h") String window) {
        return queries.applicationMetrics(environment, applicationId, window(window));
    }

    /** Une période inconnue est une requête invalide (400), sans message. */
    private static Window window(String key) {
        return Window.of(key).orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST));
    }
}
