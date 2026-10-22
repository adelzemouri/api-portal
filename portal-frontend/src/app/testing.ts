import { computed, signal } from '@angular/core';
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
  MetricsOverview,
  MetricsStatus,
  Overview,
  Period,
  PortalInfo,
  Subscription,
} from './api.models';
import { CrossEnvIndex } from './cross-env';
import { EnvironmentStore, LoadState } from './environment.store';

/** Données et doublures partagées par les tests des composants. */
export const NOW = Date.parse('2026-01-01T10:10:00Z');

export const ENVIRONMENTS: Environment[] = [
  {
    key: 'dev',
    label: 'DEV',
    order: 0,
    sync: { state: 'OK', lastAttemptAt: '2026-01-01T10:05:00Z', lastSuccessAt: '2026-01-01T10:05:00Z', error: null, apis: 15, applications: 22, subscriptions: 26 },
    publisherUrl: 'https://apim-dev.bank.internal/publisher',
    devportalUrl: 'https://apim-dev.bank.internal/devportal',
    identityServerUrl: 'https://is-dev.bank.internal',
    gateways: [
      { name: 'Default', vhost: 'gw-dev.bank.internal', url: 'https://gw-dev.bank.internal:8243' },
      { name: 'Internal', vhost: 'gw-int-dev.bank.internal', url: 'https://gw-int-dev.bank.internal:8243' },
    ],
  },
  {
    key: 'sim',
    label: 'SIM',
    order: 1,
    sync: { state: 'OK', lastAttemptAt: '2026-01-01T10:05:00Z', lastSuccessAt: '2026-01-01T10:05:00Z', error: null, apis: 17, applications: 24, subscriptions: 38 },
    publisherUrl: null,
    devportalUrl: null,
    identityServerUrl: null,
    gateways: [],
  },
  {
    key: 'uat',
    label: 'UAT',
    order: 2,
    sync: { state: 'ERROR', lastAttemptAt: '2026-01-01T10:08:00Z', lastSuccessAt: '2026-01-01T09:50:00Z', error: '[uat] control plane unreachable', apis: 16, applications: 20, subscriptions: 30 },
    publisherUrl: null,
    devportalUrl: null,
    identityServerUrl: null,
    gateways: [],
  },
  {
    key: 'exp',
    label: 'EXP',
    order: 3,
    sync: { state: 'NEVER', lastAttemptAt: null, lastSuccessAt: null, error: null, apis: 0, applications: 0, subscriptions: 0 },
    publisherUrl: null,
    devportalUrl: null,
    identityServerUrl: null,
    gateways: [],
  },
];

export const APIS: Api[] = [
  { apiId: 'p-14', name: 'Payments', version: '1.4', context: '/payments/1.4', type: 'HTTP', lifeCycleStatus: 'PUBLISHED', subscriptionCount: 2 },
  { apiId: 'k-10', name: 'KYC Checks', version: '1.0', context: '/kyc/1.0', type: 'HTTP', lifeCycleStatus: 'DEPRECATED', subscriptionCount: 0 },
];

export const DEPLOYMENTS: Deployment[] = [
  { environment: 'exp', label: 'EXP', apiId: 'k-10', apiName: 'KYC Checks', apiVersion: '1.0', revision: 'Revision 3', gateways: ['Default', 'Internal'], deployedTime: '2026-01-01T09:10:00Z' },
  { environment: 'dev', label: 'DEV', apiId: 'p-14', apiName: 'Payments', apiVersion: '1.4', revision: 'Revision 7', gateways: ['Default'], deployedTime: '2026-01-01T08:10:00Z' },
];

export const PORTAL: PortalInfo = { deployComponentUrl: 'https://gitlab.bank.internal/platform/ci-components/swagger-deploy' };

export const API_DETAIL: ApiDetail = {
  api: APIS[0],
  gatewayUrls: [
    { gateway: 'Default', url: 'https://gw-dev.bank.internal:8243/payments/1.4' },
    { gateway: 'Internal', url: 'https://gw-int-dev.bank.internal:8243/payments/1.4' },
  ],
  revisions: [
    {
      id: 'rev-7',
      name: 'Revision 7',
      createdTime: '2026-01-01T07:00:00Z',
      gateways: [
        { name: 'Default', vhost: 'gw-dev.bank.internal', status: 'APPROVED', deployedTime: '2026-01-01T08:00:00Z' },
        { name: 'Internal', vhost: 'gw-int-dev.bank.internal', status: 'APPROVED', deployedTime: '2026-01-01T10:00:00Z' },
      ],
    },
  ],
  environments: [
    { environment: 'dev', label: 'DEV', stale: false, versions: [{ apiId: 'p-14', version: '1.4' }] },
    { environment: 'sim', label: 'SIM', stale: false, versions: [{ apiId: 's-13', version: '1.3' }, { apiId: 's-110', version: '1.10' }] },
    { environment: 'uat', label: 'UAT', stale: true, versions: [{ apiId: 'u-13', version: '1.3' }] },
    { environment: 'exp', label: 'EXP', stale: false, versions: [] },
  ],
};

export const APPLICATIONS: Application[] = [
  { environment: 'dev', applicationId: 'a1', name: 'Mobile Banking', owner: 'a.martin', status: 'APPROVED', subscriptionCount: 2 },
  { environment: 'dev', applicationId: 'a2', name: 'Sandbox', owner: null, status: 'CREATED', subscriptionCount: 0 },
];

export const SUBSCRIPTIONS: Subscription[] = [
  { environment: 'dev', subscriptionId: 's1', apiId: 'p-14', apiName: 'Payments', apiVersion: '1.4', applicationId: 'a1', applicationName: 'Mobile Banking', applicationOwner: 'a.martin', subscriber: 'a.martin', throttlingPolicy: 'Gold', status: 'UNBLOCKED' },
  { environment: 'dev', subscriptionId: 's2', apiId: 'p-14', apiName: 'Payments', apiVersion: '1.4', applicationId: 'a3', applicationName: 'Web Banking', applicationOwner: 'b.durand', subscriber: null, throttlingPolicy: 'Silver', status: 'BLOCKED' },
];

export const OVERVIEW: Overview = {
  apisByStatus: [
    { key: 'PUBLISHED', count: 12 },
    { key: 'DEPRECATED', count: 3 },
  ],
  subscriptionsByStatus: [
    { key: 'UNBLOCKED', count: 20 },
    { key: 'BLOCKED', count: 4 },
  ],
  subscriptionsByPolicy: [
    { key: 'Gold', count: 14 },
    { key: 'Silver', count: 10 },
  ],
  topApis: [
    { apiId: 'p-14', name: 'Payments', version: '1.4', subscriptionCount: 9 },
    { apiId: 'k-10', name: 'KYC Checks', version: '1.0', subscriptionCount: 3 },
  ],
};

const OK: MetricsStatus = { state: 'OK', lastSuccessAt: '2026-01-01T10:00:00Z', error: null };

/** 24 points horaires se terminant à 10:00 UTC ; le pic est à 09:00. */
export const TIMELINE = Array.from({ length: 24 }, (_, i) => ({
  time: new Date(Date.UTC(2026, 0, 1, 10) - (23 - i) * 3_600_000).toISOString(),
  calls: i === 22 ? 900 : 100 + i * 10,
  errors: i === 22 ? 45 : i % 5,
}));

export const METRICS_OVERVIEW: MetricsOverview = {
  window: '24h',
  status: OK,
  totals: { calls: 12_345, errors4xx: 300, errors5xx: 60, errorRate: 0.0292, avgLatencyMs: 120, p95LatencyMs: 480 },
  timeline: TIMELINE,
  topApis: [
    { apiId: 'p-14', name: 'Payments', version: '1.4', calls: 8000, errors4xx: 200, errors5xx: 40, errorRate: 0.03, avgLatencyMs: 100, p95LatencyMs: 300 },
    { apiId: 'k-10', name: 'KYC Checks', version: '1.0', calls: 3000, errors4xx: 90, errors5xx: 15, errorRate: 0.035, avgLatencyMs: 200, p95LatencyMs: 900 },
  ],
  highestErrorRate: [
    { apiId: 'k-10', name: 'KYC Checks', version: '1.0', calls: 3000, errors4xx: 90, errors5xx: 15, errorRate: 0.035, avgLatencyMs: 200, p95LatencyMs: 900 },
  ],
  slowest: [
    { apiId: 'k-10', name: 'KYC Checks', version: '1.0', calls: 3000, errors4xx: 90, errors5xx: 15, errorRate: 0.035, avgLatencyMs: 200, p95LatencyMs: 900 },
    { apiId: 'p-14', name: 'Payments', version: '1.4', calls: 8000, errors4xx: 200, errors5xx: 40, errorRate: 0.03, avgLatencyMs: 100, p95LatencyMs: 300 },
  ],
  topApplications: [
    { applicationId: 'a1', name: 'Mobile Banking', calls: 7000, errors: 210, errorRate: 0.03 },
    { applicationId: null, name: 'Legacy Batch', calls: 500, errors: 5, errorRate: 0.01 },
  ],
  activeApis: 2,
  catalogApis: 15,
  activeApplications: 2,
  catalogApplications: 22,
};

export const API_METRICS_LIST: ApiMetricsList = {
  window: '24h',
  status: OK,
  items: [
    { apiId: 'p-14', name: 'Payments', version: '1.4', calls: 8000, errors4xx: 200, errors5xx: 40, errorRate: 0.03, avgLatencyMs: 100, p95LatencyMs: 300 },
  ],
};

export const APP_METRICS_LIST: AppMetricsList = {
  window: '24h',
  status: OK,
  items: [{ applicationId: 'a1', name: 'Mobile Banking', calls: 7000, errors: 210, errorRate: 0.03 }],
};

export const API_METRICS: ApiMetrics = {
  window: '24h',
  status: OK,
  metrics: METRICS_OVERVIEW.topApis[0],
  timeline: TIMELINE,
  consumers: [
    { apiId: 'p-14', apiName: 'Payments', apiVersion: '1.4', applicationId: 'a1', applicationName: 'Mobile Banking', calls: 6000, errors: 180, errorRate: 0.03 },
    { apiId: 'p-14', apiName: 'Payments', apiVersion: '1.4', applicationId: null, applicationName: 'Legacy Batch', calls: 2000, errors: 60, errorRate: 0.03 },
  ],
};

export const APPLICATION_METRICS: ApplicationMetrics = {
  window: '24h',
  status: OK,
  metrics: APP_METRICS_LIST.items[0],
  apis: [
    { apiId: 'p-14', apiName: 'Payments', apiVersion: '1.4', applicationId: 'a1', applicationName: 'Mobile Banking', calls: 6000, errors: 180, errorRate: 0.03 },
  ],
};

export const DISABLED: MetricsStatus = { state: 'DISABLED', lastSuccessAt: null, error: null };

export function fakeStore(overrides: { state?: LoadState; demoMode?: boolean; selected?: string; portal?: PortalInfo; period?: Period } = {}) {
  const environments = signal(ENVIRONMENTS);
  const selectedKey = signal(overrides.selected ?? 'dev');
  const period = signal<Period>(overrides.period ?? '24h');
  const store = {
    environments,
    state: signal<LoadState>(overrides.state ?? 'ready'),
    selectedKey,
    selected: computed(() => environments().find((env) => env.key === selectedKey())),
    refreshTick: signal(0),
    now: signal(NOW),
    demoMode: signal(overrides.demoMode ?? false),
    period,
    setPeriod: jasmine.createSpy('setPeriod').and.callFake((value: Period) => period.set(value)),
    portal: signal<PortalInfo>(overrides.portal === undefined ? PORTAL : overrides.portal),
    select: jasmine.createSpy('select').and.callFake((key: string) => selectedKey.set(key)),
    labelOf: (key: string) => key.toUpperCase(),
  };
  return store as unknown as EnvironmentStore & { select: jasmine.Spy; setPeriod: jasmine.Spy };
}

/** Index inter-environnements figé : nom → environnements où l'API existe. */
export function fakeIndex(presence: Record<string, string[]> = { Payments: ['dev', 'sim', 'uat'], 'KYC Checks': ['dev', 'sim', 'uat', 'exp'] }, ready = true) {
  const byName = new Map(Object.entries(presence).map(([name, envs]) => [name, new Set(envs)]));
  const apis: Record<string, Api[]> = {};
  for (const env of ENVIRONMENTS) {
    apis[env.key] = APIS.filter((api) => presence[api.name]?.includes(env.key)).map((api) => ({ ...api, apiId: `${env.key}-${api.apiId}` }));
  }
  return {
    apis: signal(apis),
    byName: signal(byName),
    ready: signal(ready),
    presence: (name: string) => ENVIRONMENTS.map((env) => env.key).filter((key) => byName.get(name)?.has(key)),
  } as unknown as CrossEnvIndex;
}
