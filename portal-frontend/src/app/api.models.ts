// Miroir des réponses de l'API du BFF (/api/v1). Aucun champ de clé ou de secret : le BFF n'en expose pas.

export type SyncState = 'NEVER' | 'OK' | 'ERROR';

export interface SyncStatus {
  state: SyncState;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  error: string | null;
  apis: number;
  applications: number;
  subscriptions: number;
}

export interface GatewayInfo {
  name: string;
  vhost: string;
  /** Adresse de base de la gateway : https://hôte[:port]. */
  url: string;
}

/** URL complète d'une API sur une gateway : https://hôte[:port]/contexte. */
export interface GatewayUrl {
  gateway: string;
  url: string;
}

export interface PortalInfo {
  /** Composant GitLab de déploiement (swagger-deploy) ; null si non configuré. */
  deployComponentUrl: string | null;
}

export interface Environment {
  key: string;
  label: string;
  order: number;
  sync: SyncStatus;
  /** URL de l'interface Publisher / Devportal de l'environnement ; null si non configurée côté BFF. */
  publisherUrl: string | null;
  devportalUrl: string | null;
  identityServerUrl: string | null;
  gateways: GatewayInfo[];
}

export interface Api {
  apiId: string;
  name: string;
  version: string;
  context: string;
  type: string;
  lifeCycleStatus: string;
  subscriptionCount: number;
}

export interface Gateway {
  name: string;
  vhost: string;
  status: string;
  deployedTime: string;
}

export interface Revision {
  id: string;
  name: string;
  createdTime: string;
  gateways: Gateway[];
}

export interface PresenceVersion {
  apiId: string;
  version: string;
}

/** Versions d'une API (par son nom) dans un environnement ; « stale » : données de la dernière synchro réussie. */
export interface Presence {
  environment: string;
  label: string;
  stale: boolean;
  versions: PresenceVersion[];
}

export interface ApiDetail {
  api: Api;
  revisions: Revision[];
  environments: Presence[];
  gatewayUrls: GatewayUrl[];
}

export interface Application {
  environment: string;
  applicationId: string;
  name: string;
  owner: string | null;
  status: string;
  /** Nombre d'API auxquelles l'application est souscrite. */
  subscriptionCount: number;
}

export interface Subscription {
  environment: string;
  subscriptionId: string;
  apiId: string;
  apiName: string;
  apiVersion: string;
  applicationId: string | null;
  applicationName: string | null;
  applicationOwner: string | null;
  subscriber: string | null;
  throttlingPolicy: string;
  status: string;
}

export interface InfoResponse {
  portal?: { mode?: string };
}

export interface Count {
  key: string;
  count: number;
}

export interface TopApi {
  apiId: string;
  name: string;
  version: string;
  subscriptionCount: number;
}

export interface Overview {
  apisByStatus: Count[];
  subscriptionsByStatus: Count[];
  subscriptionsByPolicy: Count[];
  topApis: TopApi[];
}

export interface SearchResult {
  apis: Api[];
  applications: Application[];
}

/** Périodes de métriques. */
export type Period = '24h' | '7d';
export const PERIODS: { key: Period; label: string }[] = [
  { key: '24h', label: 'Last 24 hours' },
  { key: '7d', label: 'Last 7 days' },
];

/** DISABLED : aucune source de métriques configurée pour l'environnement. */
export type MetricsState = 'OK' | 'ERROR' | 'NEVER' | 'DISABLED';

export interface MetricsStatus {
  state: MetricsState;
  lastSuccessAt: string | null;
  error: string | null;
}

export interface Totals {
  calls: number;
  errors4xx: number;
  errors5xx: number;
  errorRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
}

export interface TimePoint {
  time: string;
  calls: number;
  errors: number;
}

/** apiId : identifiant du catalogue ; null si la ligne de métrique n'a pas pu être rapprochée d'une API connue. */
export interface ApiMetric {
  apiId: string | null;
  name: string;
  version: string;
  calls: number;
  errors4xx: number;
  errors5xx: number;
  errorRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
}

export interface AppMetric {
  applicationId: string | null;
  name: string;
  calls: number;
  errors: number;
  errorRate: number;
}

/** Usage d'une API par une application. */
export interface Usage {
  apiId: string | null;
  apiName: string;
  apiVersion: string;
  applicationId: string | null;
  applicationName: string;
  calls: number;
  errors: number;
  errorRate: number;
}

export interface MetricsOverview {
  window: Period;
  status: MetricsStatus;
  totals: Totals;
  timeline: TimePoint[];
  topApis: ApiMetric[];
  highestErrorRate: ApiMetric[];
  slowest: ApiMetric[];
  topApplications: AppMetric[];
  activeApis: number;
  catalogApis: number;
  activeApplications: number;
  catalogApplications: number;
}

export interface ApiMetricsList {
  window: Period;
  status: MetricsStatus;
  items: ApiMetric[];
}

export interface AppMetricsList {
  window: Period;
  status: MetricsStatus;
  items: AppMetric[];
}

/** metrics est nul quand l'API n'a reçu aucun appel sur la période. */
export interface ApiMetrics {
  window: Period;
  status: MetricsStatus;
  metrics: ApiMetric | null;
  timeline: TimePoint[];
  consumers: Usage[];
}

export interface ApplicationMetrics {
  window: Period;
  status: MetricsStatus;
  metrics: AppMetric | null;
  apis: Usage[];
}

/** Ligne de la liste des API : l'API et ses métriques de la période (0 sans trafic ou sans métriques). */
export interface ApiRow extends Api {
  calls: number;
  errorRate: number;
  p95: number;
}

/** Ligne de la liste des applications avec ses métriques. */
export interface ApplicationRow extends Application {
  calls: number;
  errorRate: number;
}
