package com.example.apiportal.api;

import java.time.Instant;
import java.util.List;

/**
 * Réponses de l'API du BFF pour les métriques de trafic. {@code apiId} et {@code applicationId} sont ceux du
 * catalogue quand la ligne de métrique a pu être rapprochée d'une API ou d'une application connue, sinon nuls.
 * Aucun utilisateur final, aucune adresse IP, aucun jeton.
 */
public final class MetricsDtos {

    private MetricsDtos() {
    }

    /** {@code state} : OK, ERROR, NEVER (pas encore lues) ou DISABLED (aucune source configurée pour l'environnement). */
    public record MetricsStatusDto(String state, Instant lastSuccessAt, String error) {
    }

    public record TotalsDto(long calls, long errors4xx, long errors5xx, double errorRate, double avgLatencyMs,
                            double p95LatencyMs) {
    }

    public record TimePointDto(Instant time, long calls, long errors) {
    }

    public record ApiMetricDto(String apiId, String name, String version, long calls, long errors4xx, long errors5xx,
                               double errorRate, double avgLatencyMs, double p95LatencyMs) {
    }

    public record AppMetricDto(String applicationId, String name, long calls, long errors, double errorRate) {
    }

    /** Usage d'une API par une application, ou d'une application sur une API. */
    public record UsageDto(String apiId, String apiName, String apiVersion, String applicationId,
                           String applicationName, long calls, long errors, double errorRate) {
    }

    public record MetricsOverviewDto(String window, MetricsStatusDto status, TotalsDto totals,
                                     List<TimePointDto> timeline, List<ApiMetricDto> topApis,
                                     List<ApiMetricDto> highestErrorRate, List<ApiMetricDto> slowest,
                                     List<AppMetricDto> topApplications, int activeApis, int catalogApis,
                                     int activeApplications, int catalogApplications) {
    }

    public record ApiMetricsListDto(String window, MetricsStatusDto status, List<ApiMetricDto> items) {
    }

    public record AppMetricsListDto(String window, MetricsStatusDto status, List<AppMetricDto> items) {
    }

    /** {@code metrics} est nul quand l'API n'a reçu aucun appel sur la période. */
    public record ApiMetricsDto(String window, MetricsStatusDto status, ApiMetricDto metrics,
                                List<TimePointDto> timeline, List<UsageDto> consumers) {
    }

    public record ApplicationMetricsDto(String window, MetricsStatusDto status, AppMetricDto metrics,
                                        List<UsageDto> apis) {
    }
}
