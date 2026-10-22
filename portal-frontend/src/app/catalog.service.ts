import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Api,
  ApiDetail,
  ApiMetrics,
  ApiMetricsList,
  AppMetricsList,
  Application,
  ApplicationMetrics,
  Deployment,
  Environment,
  InfoResponse,
  MetricsOverview,
  Overview,
  Period,
  PortalInfo,
  SearchResult,
  Subscription,
} from './api.models';

/** Accès à l'API du BFF. Le navigateur ne parle jamais à WSO2 et ne porte aucun token. */
@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly http = inject(HttpClient);

  environments(): Observable<Environment[]> {
    return this.http.get<Environment[]>('/api/v1/environments');
  }

  /** Toutes les API de l'environnement : la recherche, les filtres, le tri et la pagination se font dans le navigateur. */
  apis(environment: string): Observable<Api[]> {
    return this.http.get<Api[]>(`${this.base(environment)}/apis`);
  }

  applications(environment: string): Observable<Application[]> {
    return this.http.get<Application[]>(`${this.base(environment)}/applications`);
  }

  /** Derniers déploiements, tous environnements confondus, du plus récent au plus ancien. */
  deployments(limit = 20): Observable<Deployment[]> {
    return this.http.get<Deployment[]>('/api/v1/deployments', { params: { limit } });
  }

  portal(): Observable<PortalInfo> {
    return this.http.get<PortalInfo>('/api/v1/portal');
  }

  /** Métriques de trafic (lues par le BFF dans Splunk, jamais par le navigateur). */
  metrics(environment: string, period: Period): Observable<MetricsOverview> {
    return this.http.get<MetricsOverview>(`${this.base(environment)}/metrics`, { params: { window: period } });
  }

  apiMetricsList(environment: string, period: Period): Observable<ApiMetricsList> {
    return this.http.get<ApiMetricsList>(`${this.base(environment)}/metrics/apis`, { params: { window: period } });
  }

  applicationMetricsList(environment: string, period: Period): Observable<AppMetricsList> {
    return this.http.get<AppMetricsList>(`${this.base(environment)}/metrics/applications`, { params: { window: period } });
  }

  apiMetrics(environment: string, apiId: string, period: Period): Observable<ApiMetrics> {
    return this.http.get<ApiMetrics>(`${this.base(environment)}/apis/${encodeURIComponent(apiId)}/metrics`, {
      params: { window: period },
    });
  }

  applicationMetrics(environment: string, applicationId: string, period: Period): Observable<ApplicationMetrics> {
    return this.http.get<ApplicationMetrics>(
      `${this.base(environment)}/applications/${encodeURIComponent(applicationId)}/metrics`,
      { params: { window: period } },
    );
  }

  overview(environment: string): Observable<Overview> {
    return this.http.get<Overview>(`${this.base(environment)}/overview`);
  }

  /** Recherche globale : quelques API et applications, plafonnées par le BFF. */
  search(environment: string, query: string): Observable<SearchResult> {
    return this.http.get<SearchResult>(`${this.base(environment)}/search`, { params: new HttpParams().set('q', query.trim()) });
  }

  apiDetail(environment: string, apiId: string): Observable<ApiDetail> {
    return this.http.get<ApiDetail>(`${this.base(environment)}/apis/${encodeURIComponent(apiId)}`);
  }

  /** Applications souscrites à une API. */
  subscriptionsOfApi(environment: string, apiId: string): Observable<Subscription[]> {
    return this.http.get<Subscription[]>(`${this.base(environment)}/apis/${encodeURIComponent(apiId)}/subscriptions`);
  }

  /** API auxquelles une application est souscrite. */
  subscriptionsOfApplication(environment: string, applicationId: string): Observable<Subscription[]> {
    return this.http.get<Subscription[]>(
      `${this.base(environment)}/applications/${encodeURIComponent(applicationId)}/subscriptions`,
    );
  }

  info(): Observable<InfoResponse> {
    return this.http.get<InfoResponse>('/actuator/info');
  }

  private base(environment: string): string {
    return `/api/v1/environments/${encodeURIComponent(environment)}`;
  }
}
