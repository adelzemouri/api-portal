import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { EMPTY, catchError, combineLatest, filter, switchMap, tap } from 'rxjs';
import { Api, ApiMetric, Count, Deployment, Environment, MetricsOverview, Overview } from './api.models';
import { BarItem, BarListComponent } from './bar-list.component';
import { CatalogService } from './catalog.service';
import { CopyButtonComponent } from './copy-button.component';
import { CrossEnvIndex, productionKey } from './cross-env';
import { DetailPanel } from './detail-panel.service';
import { EnvDotsComponent } from './env-path.component';
import { EnvironmentStore, LoadState } from './environment.store';
import { compactNumber, formatDateTime, formatInt, formatMs, formatPercent, formatRelative, statusTone, subscriptionStatusLabel } from './format';
import { I18nService, TranslatePipe } from './i18n';
import { MetricsNoticeComponent } from './metrics-notice.component';
import { PeriodSwitchComponent } from './period-switch.component';
import { TimeSeriesChartComponent } from './time-series-chart.component';

/**
 * Vue d'ensemble de l'environnement choisi : trafic (appels, erreurs, latence, classements) lu dans Splunk par le BFF,
 * puis le catalogue (souscriptions), de quoi démarrer (déploiement, connexion) et la comparaison des environnements.
 */
@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [BarListComponent, CopyButtonComponent, EnvDotsComponent, MetricsNoticeComponent, PeriodSwitchComponent, RouterLink, TimeSeriesChartComponent, TranslatePipe],
  template: `
    <div class="page-head page-head-row">
      <div>
        <p class="eyebrow">{{ 'Overview' | t }} · {{ store.selected()?.label }}</p>
        <h1 class="page-title">{{ 'Your APIs at a glance' | t }}</h1>
        <p class="lede">{{ 'How your APIs are used in this environment, what was deployed lately, and how to reach them.' | t }}</p>
      </div>
      <app-period-switch />
    </div>

    <app-metrics-notice [status]="traffic()?.status" />

    @if (store.selected(); as env) {
      <p class="catalog-strip">
        <a routerLink="/apis"><strong>{{ env.sync.apis }}</strong> {{ 'APIs' | t }}</a>
        <a routerLink="/applications"><strong>{{ env.sync.applications }}</strong> {{ 'applications' | t }}</a>
        <span><strong>{{ env.sync.subscriptions }}</strong> {{ 'subscriptions' | t }}</span>
        <span class="strip-sync" [attr.data-state]="env.sync.state">{{ 'Catalog {state}' | t: { state: syncText() } }}</span>
      </p>
    }

    @if (showTraffic(); as t) {
      <section class="section" aria-labelledby="traffic-title">
        <div class="section-head">
          <h3 id="traffic-title" class="section-title">{{ 'Traffic' | t }}</h3>
          @if (t.status.lastSuccessAt) {
            <span class="muted section-meta">{{ 'Read from Splunk {ago}' | t: { ago: readAgo() } }}</span>
          }
        </div>

        <div class="kpis">
          <div class="kpi" [attr.title]="'Total calls on the period' | t">
            <span class="kpi-label">{{ 'Calls' | t }}</span>
            <span class="kpi-value">{{ compact(t.totals.calls) }}</span>
            <span class="kpi-note">{{ '{n} of {total} APIs called' | t: { n: t.activeApis, total: t.catalogApis } }}</span>
          </div>
          <div class="kpi">
            <span class="kpi-label">{{ 'Error rate' | t }}</span>
            <span class="kpi-value">{{ percent(t.totals.errorRate) }}</span>
            <span class="kpi-note">{{ '{client} client (4xx) · {server} server (5xx)' | t: { client: int(t.totals.errors4xx), server: int(t.totals.errors5xx) } }}</span>
          </div>
          <div class="kpi">
            <span class="kpi-label">{{ 'Latency p95' | t }}</span>
            <span class="kpi-value">{{ ms(t.totals.p95LatencyMs) }}</span>
            <span class="kpi-note">{{ 'average {value}' | t: { value: ms(t.totals.avgLatencyMs) } }}</span>
          </div>
          <div class="kpi">
            <span class="kpi-label">{{ 'Active applications' | t }}</span>
            <span class="kpi-value">{{ t.activeApplications }}</span>
            <span class="kpi-note">{{ 'of {total} applications' | t: { total: t.catalogApplications } }}</span>
          </div>
        </div>

        <div class="chart-pair">
          <article class="chart">
            <h4>{{ 'Calls' | t }}</h4>
            <app-time-series [points]="t.timeline" metric="calls" [title]="'Calls' | t" [period]="store.period()" />
          </article>
          <article class="chart">
            <h4>{{ 'Errors' | t }} <span class="muted">{{ '(status 400 and above)' | t }}</span></h4>
            <app-time-series [points]="t.timeline" metric="errors" [title]="'Errors' | t" tone="err" [period]="store.period()" />
          </article>
        </div>

        <div class="chart-grid">
          <article class="chart">
            <h4>{{ 'Most called APIs' | t }}</h4>
            <app-bar-list [label]="'Most called APIs' | t" empty="No call on this period" [items]="apiBars(t.topApis, 'calls')" [selected]="panel.origin()" [format]="compact" />
          </article>
          <article class="chart">
            <h4>{{ 'Highest error rate' | t }} <span class="muted">{{ '(20+ calls)' | t }}</span></h4>
            <app-bar-list [label]="'APIs with the highest error rate' | t" empty="No error on this period" [items]="apiBars(t.highestErrorRate, 'errorRate')" [selected]="panel.origin()" [format]="percent" />
          </article>
          <article class="chart">
            <h4>{{ 'Slowest APIs' | t }} <span class="muted">(p95)</span></h4>
            <app-bar-list [label]="'Slowest APIs' | t" empty="No call on this period" [items]="apiBars(t.slowest, 'p95LatencyMs')" [selected]="panel.origin()" [format]="ms" />
          </article>
          <article class="chart">
            <h4>{{ 'Top consumers' | t }}</h4>
            <app-bar-list [label]="'Applications with the most calls' | t" empty="No call on this period" [items]="appBars(t)" [selected]="panel.origin()" [format]="compact" />
          </article>
        </div>
      </section>
    }


    <div class="feed-grid">
      <section class="panel" aria-labelledby="feed-title">
        <div class="section-head">
          <h3 id="feed-title" class="section-title">{{ 'Latest deployments' | t }}</h3>
          <div class="chips" role="group" [attr.aria-label]="'Filter by environment' | t">
            <button type="button" class="chip" [attr.aria-pressed]="feedEnv() === ''" (click)="feedEnv.set('')">{{ 'All' | t }}</button>
            @for (env of store.environments(); track env.key) {
              <button type="button" class="chip" [attr.aria-pressed]="feedEnv() === env.key" (click)="feedEnv.set(env.key)">{{ env.label }}</button>
            }
          </div>
        </div>
        <ul class="feed">
          @for (env of failedEnvs(); track env.key) {
            <li class="feed-item feed-alert">
              <span class="env-tag" [attr.data-env]="env.key">{{ env.label }}</span>
              <span class="feed-text">{{ '{env} could not be synchronized: {error}.' | t: { env: env.label, error: env.sync.error ?? ('unknown error' | t) } }}</span>
              <span class="feed-when muted">{{ ago(env.sync.lastAttemptAt) }}</span>
            </li>
          }
          @for (d of feed(); track d.environment + d.apiId + d.revision) {
            <li class="feed-item" [class.is-sel]="panel.isSelected(feedFrom(d))">
              <span class="env-tag" [attr.data-env]="d.environment">{{ d.label }}</span>
              <span class="feed-text">
                <button type="button" class="linkbtn" [attr.data-panel-from]="feedFrom(d)" (click)="openDeployment(d)">{{ d.apiName }}</button>&ngsp;<span class="mono muted">{{ d.apiVersion }}</span>
                {{ '{revision} deployed on {gateways}' | t: { revision: d.revision, gateways: d.gateways.join(', ') } }}
              </span>
              <span class="feed-when muted" [attr.title]="date(d.deployedTime)">{{ ago(d.deployedTime) }}</span>
            </li>
          } @empty {
            @if (!failedEnvs().length) {
              <li class="feed-empty muted">{{ (deployments() === null ? 'Loading…' : 'No deployment recorded.') | t }}</li>
            }
          }
        </ul>
      </section>

      <section class="panel" aria-labelledby="notprod-title">
        <h3 id="notprod-title" class="section-title">{{ 'Not yet in {env}' | t: { env: prodLabel() } }}</h3>
        <p class="muted section-note">{{ 'APIs deployed in a test environment but not in production.' | t }}</p>
        @if (!index.ready()) {
          <p class="muted">{{ 'Loading…' | t }}</p>
        } @else {
          <ul class="notprod">
            @for (row of notInProd().slice(0, 8); track row.name) {
              <li [class.is-sel]="panel.isSelected('np-' + row.name)">
                <button type="button" class="linkbtn" [attr.data-panel-from]="'np-' + row.name" (click)="openNotProd(row)">{{ row.name }}</button>
                <app-env-dots [envs]="store.environments()" [present]="row.present" />
              </li>
            } @empty {
              <li class="muted">{{ 'Every API is in production.' | t }}</li>
            }
          </ul>
          @if (notInProd().length > 8) {
            <p class="muted">{{ '{n} more in the APIs page.' | t: { n: notInProd().length - 8 } }}</p>
          }
        }
      </section>
    </div>

    @switch (state()) {
      @case ('loading') {
        <p class="state-msg">{{ 'Loading the subscriptions…' | t }}</p>
      }
      @case ('error') {
        <p class="state-msg banner banner-error" role="alert">{{ 'Unable to load the overview.' | t }}</p>
      }
      @default {
        @if (data(); as overview) {
          <section class="section" aria-labelledby="subs-title">
            <h3 id="subs-title" class="section-title">{{ 'Subscriptions' | t }}</h3>
            <div class="chart-pair">
              <article class="chart">
                <h4>{{ 'By status' | t }}</h4>
                <app-bar-list [label]="'Subscriptions by status' | t" [items]="statusBars(overview.subscriptionsByStatus)" [total]="total(overview.subscriptionsByStatus)" />
              </article>
              <article class="chart">
                <h4>{{ 'By throttling policy' | t }}</h4>
                <app-bar-list [label]="'Subscriptions by policy' | t" [items]="policyBars(overview.subscriptionsByPolicy)" [total]="total(overview.subscriptionsByPolicy)" />
              </article>
            </div>
          </section>
        }
      }
    }

    <section class="section split" [attr.aria-label]="'Get started' | t">
      <aside class="callout callout-stack" aria-labelledby="deploy-callout">
        <h3 id="deploy-callout">{{ 'Deploying an API?' | t }}</h3>
        <p [innerHTML]="'Use the <strong>swagger-deploy</strong> GitLab component to deploy your API to WSO2.' | t"></p>
        <div class="callout-actions">
          @if (store.portal().deployComponentUrl; as url) {
            <a class="btn btn-primary" [href]="url" target="_blank" rel="noopener noreferrer">{{ 'Open the component' | t }} <span class="sr-only">{{ '(new tab)' | t }}</span><span aria-hidden="true">↗</span></a>
          }
          <a class="btn" routerLink="/help">{{ 'How to deploy' | t }}</a>
        </div>
      </aside>

      @if (store.selected(); as env) {
        <section class="panel" aria-labelledby="conn-title">
          <h3 id="conn-title" class="section-title">{{ 'Connection details' | t }} <span class="muted">· {{ env.label }}</span></h3>
          <dl class="conn">
            <dt>Identity Server</dt>
            <dd>
              @if (env.identityServerUrl) {
                <span class="url mono">{{ env.identityServerUrl }}</span>
                <app-copy-button [text]="env.identityServerUrl" [label]="'Identity Server URL' | t" />
              } @else {
                <span class="muted">{{ 'Not configured' | t }}</span>
              }
            </dd>

            <dt>{{ 'API gateways' | t }}</dt>
            <dd>
              @for (gateway of env.gateways; track gateway.name + gateway.vhost) {
                <div class="conn-line">
                  <span class="gw-name">{{ gateway.name }}</span>
                  <span class="url mono">{{ gateway.url }}</span>
                  <app-copy-button [text]="gateway.url" [label]="'{gateway} gateway URL' | t: { gateway: gateway.name }" />
                </div>
              } @empty {
                <span class="muted">{{ 'No gateway seen yet' | t }}</span>
              }
              @if (env.gateways.length) {
                <p class="conn-hint">{{ 'The URL of an API is this address followed by its context. Every API page lists its full URLs.' | t }}</p>
              }
            </dd>

            <dt>{{ 'WSO2 consoles' | t }}</dt>
            <dd>
              @if (env.publisherUrl) {
                <a [href]="env.publisherUrl" target="_blank" rel="noopener noreferrer">Publisher <span class="sr-only">{{ '(new tab)' | t }}</span><span aria-hidden="true">↗</span></a>
              }
              @if (env.devportalUrl) {
                <a [href]="env.devportalUrl" target="_blank" rel="noopener noreferrer">Devportal <span class="sr-only">{{ '(new tab)' | t }}</span><span aria-hidden="true">↗</span></a>
              }
              @if (!env.publisherUrl && !env.devportalUrl) {
                <span class="muted">{{ 'Not configured' | t }}</span>
              }
            </dd>
          </dl>
        </section>
      }
    </section>

    <section class="section" aria-labelledby="compare-title">
      <h3 id="compare-title" class="section-title">{{ 'Environments compared' | t }}</h3>
      <div class="table-wrap" tabindex="0" role="region" [attr.aria-label]="'Environments compared' | t">
        <table class="list compare">
          <thead>
            <tr>
              <th scope="col">{{ 'Environment' | t }}</th>
              <th scope="col">{{ 'APIs' | t }}</th>
              <th scope="col">{{ 'Applications' | t }}</th>
              <th scope="col">{{ 'Subscriptions' | t }}</th>
              <th scope="col">{{ 'Last synchronization' | t }}</th>
            </tr>
          </thead>
          <tbody>
            @for (env of store.environments(); track env.key) {
              <tr [class.current]="env.key === store.selectedKey()">
                <th scope="row">
                  <button type="button" class="link-btn" (click)="store.select(env.key)" [attr.aria-label]="'Show {env}' | t: { env: env.label }">{{ env.label }}</button>
                </th>
                <td><span class="minibar"><span class="minibar-fill" [style.width.%]="share(env.sync.apis, 'apis')"></span></span> {{ env.sync.apis }}</td>
                <td><span class="minibar"><span class="minibar-fill" [style.width.%]="share(env.sync.applications, 'applications')"></span></span> {{ env.sync.applications }}</td>
                <td><span class="minibar"><span class="minibar-fill" [style.width.%]="share(env.sync.subscriptions, 'subscriptions')"></span></span> {{ env.sync.subscriptions }}</td>
                <td>
                  <span class="sync-state" [attr.data-state]="env.sync.state">
                    <span aria-hidden="true">{{ symbol(env) }}</span> {{ syncOf(env) }}
                  </span>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
})
export class OverviewComponent {
  private readonly catalog = inject(CatalogService);
  readonly store = inject(EnvironmentStore);
  private readonly i18n = inject(I18nService);

  readonly data = signal<Overview | null>(null);
  readonly state = signal<LoadState>('loading');
  readonly traffic = signal<MetricsOverview | null>(null);
  readonly panel = inject(DetailPanel);
  readonly index = inject(CrossEnvIndex);

  /** Derniers déploiements tous environnements ; null tant que non lus. */
  readonly deployments = signal<Deployment[] | null>(null);
  /** Filtre du fil par environnement ; vide : tous. */
  readonly feedEnv = signal('');
  readonly feed = computed(() => (this.deployments() ?? []).filter((d) => !this.feedEnv() || d.environment === this.feedEnv()).slice(0, 10));
  /** Une synchro en échec est un événement du fil : on la montre en tête. */
  readonly failedEnvs = computed(() =>
    this.store.environments().filter((env) => env.sync.state === 'ERROR' && (!this.feedEnv() || env.key === this.feedEnv())),
  );

  private readonly prodKey = computed(() => productionKey(this.store.environments()));
  readonly prodLabel = computed(() => (this.prodKey() ? this.store.labelOf(this.prodKey()!) : 'EXP'));

  /** API présentes dans au moins un environnement de test, absentes de la production ; les plus avancées d'abord. */
  readonly notInProd = computed(() => {
    const prod = this.prodKey();
    if (!prod) {
      return [];
    }
    const order = this.store.environments().map((env) => env.key);
    return [...this.index.byName().entries()]
      .filter(([, envs]) => !envs.has(prod))
      .map(([name, envs]) => ({ name, present: order.filter((key) => envs.has(key)) }))
      .sort((a, b) => order.indexOf(b.present.at(-1)!) - order.indexOf(a.present.at(-1)!) || a.name.localeCompare(b.name));
  });

  /** Les chiffres de trafic ne s'affichent que si on a lu des métriques (au moins une fois) ; sinon, seul le bandeau parle. */
  readonly showTraffic = computed(() => {
    const t = this.traffic();
    return t && (t.status.state === 'OK' || (t.status.state === 'ERROR' && t.status.lastSuccessAt)) ? t : null;
  });

  readonly readAgo = computed(() => (this.i18n.lang(), formatRelative(this.traffic()?.status.lastSuccessAt, this.store.now())));

  readonly syncText = computed(() => {
    const sync = this.store.selected()?.sync;
    switch (sync?.state) {
      case 'OK':
        return this.i18n.t('synchronized {ago}', { ago: formatRelative(sync.lastSuccessAt, this.store.now()) });
      case 'ERROR':
        return this.i18n.t('synchronization failed');
      default:
        return this.i18n.t('not synchronized yet');
    }
  });

  private readonly maxima = computed(() => {
    const envs = this.store.environments();
    return {
      apis: Math.max(1, ...envs.map((e) => e.sync.apis)),
      applications: Math.max(1, ...envs.map((e) => e.sync.applications)),
      subscriptions: Math.max(1, ...envs.map((e) => e.sync.subscriptions)),
    };
  });

  readonly compact = compactNumber;
  readonly percent = formatPercent;
  readonly ms = formatMs;
  readonly int = formatInt;

  private loadedEnvironment = '';

  constructor() {
    combineLatest([toObservable(this.store.selectedKey), toObservable(this.store.refreshTick)])
      .pipe(
        filter(([environment]) => environment !== ''),
        tap(([environment]) => {
          if (environment !== this.loadedEnvironment) {
            this.loadedEnvironment = environment;
            this.data.set(null);
            this.state.set('loading');
          }
        }),
        switchMap(([environment]) =>
          this.catalog.overview(environment).pipe(
            catchError(() => {
              this.state.set('error');
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((overview) => {
        this.data.set(overview);
        this.state.set('ready');
      });

    // Le fil couvre tous les environnements : il ne dépend que de l'actualisation.
    toObservable(this.store.refreshTick)
      .pipe(
        switchMap(() => this.catalog.deployments(20).pipe(catchError(() => EMPTY))),
        takeUntilDestroyed(),
      )
      .subscribe((deployments) => this.deployments.set(deployments));

    // Le trafic dépend aussi de la période. Une panne de lecture est une donnée (le bandeau) ; seule une erreur
    // réseau (BFF injoignable) laisse la zone vide.
    let trafficEnvironment = '';
    combineLatest([toObservable(this.store.selectedKey), toObservable(this.store.period), toObservable(this.store.refreshTick)])
      .pipe(
        filter(([environment]) => environment !== ''),
        tap(([environment]) => {
          if (environment !== trafficEnvironment) {
            trafficEnvironment = environment;
            this.traffic.set(null);
          }
        }),
        switchMap(([environment, period]) => this.catalog.metrics(environment, period).pipe(catchError(() => EMPTY))),
        takeUntilDestroyed(),
      )
      .subscribe((metrics) => this.traffic.set(metrics));
  }

  apiBars(apis: ApiMetric[], measure: 'calls' | 'errorRate' | 'p95LatencyMs'): BarItem[] {
    const env = this.store.selectedKey();
    return apis
      .filter((api) => api[measure] > 0)
      .map((api) => {
        const from = `${measure}-${api.apiId}`;
        return {
          key: `${api.apiId ?? api.name}-${api.version}`,
          label: `${api.name} ${api.version}`,
          value: api[measure],
          tone: measure === 'errorRate' ? 'err' : undefined,
          from: api.apiId ? from : undefined,
          action: api.apiId
            ? () => this.panel.open({ kind: 'api', env, id: api.apiId, name: api.name, version: api.version, from })
            : undefined,
        };
      });
  }

  openDeployment(d: Deployment): void {
    this.panel.open({ kind: 'api', env: d.environment, id: d.apiId, name: d.apiName, version: d.apiVersion, from: this.feedFrom(d) });
  }

  feedFrom(d: Deployment): string {
    return `feed-${d.environment}-${d.apiId}-${d.revision}`;
  }

  /** Ouvre l'API dans l'environnement le plus avancé où elle se trouve. */
  openNotProd(row: { name: string; present: string[] }): void {
    const env = row.present.includes(this.store.selectedKey()) ? this.store.selectedKey() : row.present.at(-1)!;
    const api: Api | undefined = (this.index.apis()[env] ?? []).find((a) => a.name === row.name);
    if (api) {
      this.panel.open({ kind: 'api', env, id: api.apiId, name: api.name, version: api.version, from: 'np-' + row.name });
    }
  }

  ago(iso: string | null): string {
    return formatRelative(iso, this.store.now());
  }

  date(iso: string): string {
    return formatDateTime(iso);
  }

  appBars(traffic: MetricsOverview): BarItem[] {
    const env = this.store.selectedKey();
    return traffic.topApplications.map((app) => ({
      key: app.applicationId ?? app.name,
      label: app.name,
      value: app.calls,
      // Une application hors catalogue (non rapprochée) n'a pas de détail à ouvrir.
      from: app.applicationId ? `app-top-${app.applicationId}` : undefined,
      action: app.applicationId
        ? () => this.panel.open({ kind: 'app', env, id: app.applicationId, name: app.name, from: `app-top-${app.applicationId}` })
        : undefined,
    }));
  }

  statusBars(counts: Count[]): BarItem[] {
    return counts.map((c) => ({ key: c.key, label: subscriptionStatusLabel(c.key), value: c.count, tone: statusTone(c.key) }));
  }

  policyBars(counts: Count[]): BarItem[] {
    return counts.map((c) => ({ key: c.key, label: c.key, value: c.count }));
  }

  total(counts: Count[]): number {
    return counts.reduce((sum, c) => sum + c.count, 0);
  }

  share(value: number, column: 'apis' | 'applications' | 'subscriptions'): number {
    return value > 0 ? Math.max(2, (value / this.maxima()[column]) * 100) : 0;
  }

  symbol(env: Environment): string {
    return env.sync.state === 'OK' ? '●' : env.sync.state === 'ERROR' ? '▲' : '○';
  }

  syncOf(env: Environment): string {
    if (env.sync.state === 'NEVER') {
      return this.i18n.t('Never synchronized');
    }
    if (env.sync.state === 'ERROR') {
      return env.sync.lastSuccessAt
        ? this.i18n.t('Failed (last success {ago})', { ago: formatRelative(env.sync.lastSuccessAt, this.store.now()) })
        : this.i18n.t('Failed (never succeeded)');
    }
    return formatRelative(env.sync.lastSuccessAt, this.store.now());
  }
}
