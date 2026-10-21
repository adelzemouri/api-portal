import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { EMPTY, catchError, combineLatest, filter, switchMap, tap } from 'rxjs';
import { ApiMetric, Count, Environment, MetricsOverview, Overview } from './api.models';
import { BarItem, BarListComponent } from './bar-list.component';
import { CatalogService } from './catalog.service';
import { CopyButtonComponent } from './copy-button.component';
import { EnvironmentStore, LoadState } from './environment.store';
import { compactNumber, formatInt, formatMs, formatPercent, formatRelative, statusTone, subscriptionStatusLabel } from './format';
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
  imports: [BarListComponent, CopyButtonComponent, MetricsNoticeComponent, PeriodSwitchComponent, RouterLink, TimeSeriesChartComponent],
  template: `
    <div class="page-head page-head-row">
      <div>
        <h2>Overview <span class="page-env">{{ store.selected()?.label }}</span></h2>
        <p class="lede">How your APIs are used in this environment, and how to reach them.</p>
      </div>
      <app-period-switch />
    </div>

    <app-metrics-notice [status]="traffic()?.status" />

    @if (store.selected(); as env) {
      <p class="catalog-strip">
        <a routerLink="/apis"><strong>{{ env.sync.apis }}</strong> APIs</a>
        <a routerLink="/applications"><strong>{{ env.sync.applications }}</strong> applications</a>
        <span><strong>{{ env.sync.subscriptions }}</strong> subscriptions</span>
        <span class="strip-sync" [attr.data-state]="env.sync.state">Catalog {{ syncText() }}</span>
      </p>
    }

    @if (showTraffic(); as t) {
      <section class="section" aria-labelledby="traffic-title">
        <div class="section-head">
          <h3 id="traffic-title" class="section-title">Traffic</h3>
          @if (t.status.lastSuccessAt) {
            <span class="muted section-meta">Read from Splunk {{ readAgo() }}</span>
          }
        </div>

        <div class="kpis">
          <div class="kpi" title="Total calls on the period">
            <span class="kpi-label">Calls</span>
            <span class="kpi-value">{{ compact(t.totals.calls) }}</span>
            <span class="kpi-note">{{ t.activeApis }} of {{ t.catalogApis }} APIs called</span>
          </div>
          <div class="kpi">
            <span class="kpi-label">Error rate</span>
            <span class="kpi-value">{{ percent(t.totals.errorRate) }}</span>
            <span class="kpi-note">{{ int(t.totals.errors4xx) }} client (4xx) · {{ int(t.totals.errors5xx) }} server (5xx)</span>
          </div>
          <div class="kpi">
            <span class="kpi-label">Latency p95</span>
            <span class="kpi-value">{{ ms(t.totals.p95LatencyMs) }}</span>
            <span class="kpi-note">average {{ ms(t.totals.avgLatencyMs) }}</span>
          </div>
          <div class="kpi">
            <span class="kpi-label">Active applications</span>
            <span class="kpi-value">{{ t.activeApplications }}</span>
            <span class="kpi-note">of {{ t.catalogApplications }} applications</span>
          </div>
        </div>

        <div class="chart-pair">
          <article class="chart">
            <h4>Calls</h4>
            <app-time-series [points]="t.timeline" metric="calls" title="Calls" [period]="store.period()" />
          </article>
          <article class="chart">
            <h4>Errors <span class="muted">(status 400 and above)</span></h4>
            <app-time-series [points]="t.timeline" metric="errors" title="Errors" tone="err" [period]="store.period()" />
          </article>
        </div>

        <div class="chart-grid">
          <article class="chart">
            <h4>Most called APIs</h4>
            <app-bar-list label="Most called APIs" empty="No call on this period" [items]="apiBars(t.topApis, 'calls')" [format]="compact" />
          </article>
          <article class="chart">
            <h4>Highest error rate <span class="muted">(20+ calls)</span></h4>
            <app-bar-list label="APIs with the highest error rate" empty="No error on this period" [items]="apiBars(t.highestErrorRate, 'errorRate')" [format]="percent" />
          </article>
          <article class="chart">
            <h4>Slowest APIs <span class="muted">(p95)</span></h4>
            <app-bar-list label="Slowest APIs" empty="No call on this period" [items]="apiBars(t.slowest, 'p95LatencyMs')" [format]="ms" />
          </article>
          <article class="chart">
            <h4>Top consumers</h4>
            <app-bar-list label="Applications with the most calls" empty="No call on this period" [items]="appBars(t)" [format]="compact" />
          </article>
        </div>
      </section>
    }

    @switch (state()) {
      @case ('loading') {
        <p class="state-msg">Loading the subscriptions…</p>
      }
      @case ('error') {
        <p class="state-msg banner banner-error" role="alert">Unable to load the overview.</p>
      }
      @default {
        @if (data(); as overview) {
          <section class="section" aria-labelledby="subs-title">
            <h3 id="subs-title" class="section-title">Subscriptions</h3>
            <div class="chart-pair">
              <article class="chart">
                <h4>By status</h4>
                <app-bar-list label="Subscriptions by status" [items]="statusBars(overview.subscriptionsByStatus)" [total]="total(overview.subscriptionsByStatus)" />
              </article>
              <article class="chart">
                <h4>By throttling policy</h4>
                <app-bar-list label="Subscriptions by policy" [items]="policyBars(overview.subscriptionsByPolicy)" [total]="total(overview.subscriptionsByPolicy)" />
              </article>
            </div>
          </section>
        }
      }
    }

    <section class="section split" aria-label="Get started">
      <aside class="callout callout-stack" aria-labelledby="deploy-callout">
        <h3 id="deploy-callout">Deploying an API?</h3>
        <p>Use the <strong>swagger-deploy</strong> GitLab component to deploy your API to WSO2.</p>
        <div class="callout-actions">
          @if (store.portal().deployComponentUrl; as url) {
            <a class="btn btn-primary" [href]="url" target="_blank" rel="noopener noreferrer">Open the component <span class="sr-only">(new tab)</span><span aria-hidden="true">↗</span></a>
          }
          <a class="btn" routerLink="/help">How to deploy</a>
        </div>
      </aside>

      @if (store.selected(); as env) {
        <section class="panel" aria-labelledby="conn-title">
          <h3 id="conn-title" class="section-title">Connection details <span class="muted">· {{ env.label }}</span></h3>
          <dl class="conn">
            <dt>Identity Server</dt>
            <dd>
              @if (env.identityServerUrl) {
                <span class="url mono">{{ env.identityServerUrl }}</span>
                <app-copy-button [text]="env.identityServerUrl" label="Identity Server URL" />
              } @else {
                <span class="muted">Not configured</span>
              }
            </dd>

            <dt>API gateways</dt>
            <dd>
              @for (gateway of env.gateways; track gateway.name + gateway.vhost) {
                <div class="conn-line">
                  <span class="gw-name">{{ gateway.name }}</span>
                  <span class="url mono">{{ gateway.url }}</span>
                  <app-copy-button [text]="gateway.url" [label]="gateway.name + ' gateway URL'" />
                </div>
              } @empty {
                <span class="muted">No gateway seen yet</span>
              }
              @if (env.gateways.length) {
                <p class="conn-hint">The URL of an API is this address followed by its context. Every API page lists its full URLs.</p>
              }
            </dd>

            <dt>WSO2 consoles</dt>
            <dd>
              @if (env.publisherUrl) {
                <a [href]="env.publisherUrl" target="_blank" rel="noopener noreferrer">Publisher <span class="sr-only">(new tab)</span><span aria-hidden="true">↗</span></a>
              }
              @if (env.devportalUrl) {
                <a [href]="env.devportalUrl" target="_blank" rel="noopener noreferrer">Devportal <span class="sr-only">(new tab)</span><span aria-hidden="true">↗</span></a>
              }
              @if (!env.publisherUrl && !env.devportalUrl) {
                <span class="muted">Not configured</span>
              }
            </dd>
          </dl>
        </section>
      }
    </section>

    <section class="section" aria-labelledby="compare-title">
      <h3 id="compare-title" class="section-title">Environments compared</h3>
      <div class="table-wrap" tabindex="0" role="region" aria-label="Environments compared">
        <table class="list compare">
          <thead>
            <tr>
              <th scope="col">Environment</th>
              <th scope="col">APIs</th>
              <th scope="col">Applications</th>
              <th scope="col">Subscriptions</th>
              <th scope="col">Last synchronization</th>
            </tr>
          </thead>
          <tbody>
            @for (env of store.environments(); track env.key) {
              <tr [class.current]="env.key === store.selectedKey()">
                <th scope="row">
                  <button type="button" class="link-btn" (click)="store.select(env.key)" [attr.aria-label]="'Show ' + env.label">{{ env.label }}</button>
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

  readonly data = signal<Overview | null>(null);
  readonly state = signal<LoadState>('loading');
  readonly traffic = signal<MetricsOverview | null>(null);

  /** Les chiffres de trafic ne s'affichent que si on a lu des métriques (au moins une fois) ; sinon, seul le bandeau parle. */
  readonly showTraffic = computed(() => {
    const t = this.traffic();
    return t && (t.status.state === 'OK' || (t.status.state === 'ERROR' && t.status.lastSuccessAt)) ? t : null;
  });

  readonly readAgo = computed(() => formatRelative(this.traffic()?.status.lastSuccessAt, this.store.now()));

  readonly syncText = computed(() => {
    const sync = this.store.selected()?.sync;
    switch (sync?.state) {
      case 'OK':
        return `synchronized ${formatRelative(sync.lastSuccessAt, this.store.now())}`;
      case 'ERROR':
        return 'synchronization failed';
      default:
        return 'not synchronized yet';
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
    return apis
      .filter((api) => api[measure] > 0)
      .map((api) => ({
        key: `${api.apiId ?? api.name}-${api.version}`,
        label: `${api.name} ${api.version}`,
        value: api[measure],
        tone: measure === 'errorRate' ? 'err' : undefined,
        link: api.apiId ? ['/apis', this.store.selectedKey(), api.apiId] : undefined,
      }));
  }

  appBars(traffic: MetricsOverview): BarItem[] {
    return traffic.topApplications.map((app) => ({
      key: app.applicationId ?? app.name,
      label: app.name,
      value: app.calls,
      // L'application est retrouvée par son nom dans la liste : un lien n'a de sens que si elle existe au catalogue.
      link: app.applicationId ? ['/applications'] : undefined,
      queryParams: app.applicationId ? { q: app.name } : undefined,
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
      return 'Never synchronized';
    }
    if (env.sync.state === 'ERROR') {
      return env.sync.lastSuccessAt
        ? `Failed (last success ${formatRelative(env.sync.lastSuccessAt, this.store.now())})`
        : 'Failed (never succeeded)';
    }
    return formatRelative(env.sync.lastSuccessAt, this.store.now());
  }
}
