import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EMPTY, catchError, combineLatest, forkJoin, map, switchMap, tap } from 'rxjs';
import { ApiDetail, ApiMetrics, Environment, Subscription, Usage } from './api.models';
import { BarItem, BarListComponent } from './bar-list.component';
import { CatalogService } from './catalog.service';
import { CopyButtonComponent } from './copy-button.component';
import { EnvironmentStore } from './environment.store';
import { compactNumber, formatDateTime, formatInt, formatMs, formatPercent, lifeCycleLabel, subscriptionStatusLabel } from './format';
import { MetricsNoticeComponent } from './metrics-notice.component';
import { PeriodSwitchComponent } from './period-switch.component';
import { TimeSeriesChartComponent } from './time-series-chart.component';

type PageState = 'loading' | 'ready' | 'error' | 'notfound';
type Tab = 'traffic' | 'endpoints' | 'consumers' | 'deployment';

interface ApiPageData {
  detail: ApiDetail;
  subscriptions: Subscription[];
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'traffic', label: 'Traffic' },
  { key: 'endpoints', label: 'Endpoints' },
  { key: 'consumers', label: 'Consumers' },
  { key: 'deployment', label: 'Deployment' },
];

/**
 * Fiche d'une API, accessible par lien direct (/apis/{environnement}/{id}) : trafic (appels, erreurs, latence,
 * consommateurs), URL d'appel, impact d'un changement (qui prévenir) et déploiement.
 */
@Component({
  selector: 'app-api-page',
  standalone: true,
  imports: [BarListComponent, CopyButtonComponent, MetricsNoticeComponent, PeriodSwitchComponent, RouterLink, TimeSeriesChartComponent],
  template: `
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a routerLink="/apis">APIs</a>
      <span aria-hidden="true">›</span>
      <span aria-current="page">{{ data() ? data()!.detail.api.name + ' ' + data()!.detail.api.version : 'API' }}</span>
    </nav>

    @switch (state()) {
      @case ('loading') {
        <p class="state-msg">Loading the API…</p>
      }
      @case ('notfound') {
        <p class="state-msg banner" role="alert">
          This API does not exist in {{ envLabel() }} (it may have been removed since the last synchronization).
          <a routerLink="/apis">Back to the APIs</a>
        </p>
      }
      @case ('error') {
        <p class="state-msg banner banner-error" role="alert">Unable to load this API.</p>
      }
      @default {
        @if (data(); as page) {
          <header class="api-head">
            <div>
              <h2>{{ page.detail.api.name }} <span class="mono api-version">{{ page.detail.api.version }}</span></h2>
              <p class="api-meta">
                <span class="env-tag">{{ envLabel() }}</span>
                <span class="mono muted">{{ page.detail.api.context }}</span>
                <span class="muted">{{ page.detail.api.type }}</span>
                <span class="pill" [attr.data-status]="page.detail.api.lifeCycleStatus">{{ life(page.detail.api.lifeCycleStatus) }}</span>
              </p>
            </div>
            <div class="api-actions">
              @if (publisherLink(); as href) {
                <a class="btn" [href]="href" target="_blank" rel="noopener noreferrer">Open in Publisher <span class="sr-only">(new tab)</span><span aria-hidden="true">↗</span></a>
              }
              @if (devportalLink(); as href) {
                <a class="btn" [href]="href" target="_blank" rel="noopener noreferrer">Open in Devportal <span class="sr-only">(new tab)</span><span aria-hidden="true">↗</span></a>
              }
              <button type="button" class="btn" (click)="copyLink()">{{ linkCopied() ? 'Link copied' : 'Copy link' }}</button>
            </div>
          </header>

          <section class="kpis kpis-compact" aria-label="Summary">
            <div class="kpi">
              <span class="kpi-label">Calls</span>
              <span class="kpi-value">{{ traffic() ? compact(traffic()!.calls) : '—' }}</span>
              <span class="kpi-note">{{ store.period() === '24h' ? 'last 24 hours' : 'last 7 days' }}</span>
            </div>
            <div class="kpi">
              <span class="kpi-label">Error rate</span>
              <span class="kpi-value">{{ traffic() ? percent(traffic()!.errorRate) : '—' }}</span>
              <span class="kpi-note">{{ traffic() ? int(traffic()!.errors4xx) + ' 4xx · ' + int(traffic()!.errors5xx) + ' 5xx' : '' }}</span>
            </div>
            <div class="kpi">
              <span class="kpi-label">Latency p95</span>
              <span class="kpi-value">{{ traffic() ? ms(traffic()!.p95LatencyMs) : '—' }}</span>
              <span class="kpi-note">{{ traffic() ? 'average ' + ms(traffic()!.avgLatencyMs) : '' }}</span>
            </div>
            <div class="kpi" [attr.data-state]="notActive() ? 'ERROR' : 'OK'">
              <span class="kpi-label">Subscribers</span>
              <span class="kpi-value">{{ page.subscriptions.length }}</span>
              <span class="kpi-note">{{ active() }} active{{ notActive() ? ' · ' + notActive() + ' blocked or waiting' : '' }}</span>
            </div>
          </section>

          <div class="tabs" role="tablist" aria-label="API sections">
            @for (t of tabs; track t.key) {
              <button type="button" role="tab" [id]="'tab-' + t.key" [attr.aria-controls]="'panel-' + t.key" [attr.aria-selected]="tab() === t.key" (click)="tab.set(t.key)">{{ t.label }}</button>
            }
          </div>

          @switch (tab()) {
            @case ('traffic') {
              <section class="tabpanel" role="tabpanel" id="panel-traffic" aria-labelledby="tab-traffic">
                <div class="tab-tools"><app-period-switch /></div>
                <app-metrics-notice [status]="metrics()?.status" />
                @if (hasMetrics()) {
                  @if (!metrics()?.metrics) {
                    <p class="state-msg">No call recorded on this API in the period.</p>
                  } @else {
                    <div class="chart-pair">
                      <article class="chart">
                        <h4>Calls</h4>
                        <app-time-series [points]="metrics()!.timeline" metric="calls" title="Calls" [period]="store.period()" />
                      </article>
                      <article class="chart">
                        <h4>Errors <span class="muted">(status 400 and above)</span></h4>
                        <app-time-series [points]="metrics()!.timeline" metric="errors" title="Errors" tone="err" [period]="store.period()" />
                      </article>
                    </div>
                    <div class="chart-pair">
                      <article class="chart">
                        <h4>Top consumers</h4>
                        <app-bar-list label="Applications calling this API" empty="No consumer" [items]="consumerBars()" [format]="compact" />
                      </article>
                      <article class="chart">
                        <h4>Errors by kind</h4>
                        <app-bar-list label="Errors by kind" empty="No error" [items]="errorBars()" [format]="compact" />
                      </article>
                    </div>
                  }
                }
              </section>
            }
            @case ('endpoints') {
              <section class="tabpanel" role="tabpanel" id="panel-endpoints" aria-labelledby="tab-endpoints">
                <div class="panel">
                  <h3 class="section-title">Call this API</h3>
                  @if (page.detail.gatewayUrls.length === 0) {
                    <p class="detail-msg">No gateway serves this API yet: deploy a revision to get its URL.</p>
                  } @else {
                    <ul class="url-list">
                      @for (u of page.detail.gatewayUrls; track u.gateway + u.url) {
                        <li>
                          <span class="gw-name">{{ u.gateway }}</span>
                          <span class="url mono">{{ u.url }}</span>
                          <app-copy-button [text]="u.url" [label]="u.gateway + ' URL'" />
                        </li>
                      }
                    </ul>
                  }
                  @if (environment()?.identityServerUrl; as identityServer) {
                    <p class="conn-hint">
                      Get an access token from the {{ envLabel() }} Identity Server:
                      <span class="url mono">{{ identityServer }}</span>
                      <app-copy-button [text]="identityServer" label="Identity Server URL" />
                    </p>
                  }
                </div>
              </section>
            }
            @case ('consumers') {
              <section class="tabpanel" role="tabpanel" id="panel-consumers" aria-labelledby="tab-consumers">
                <div class="panel">
                  <div class="section-head">
                    <h3 class="section-title">Impact of a change</h3>
                    @if (page.subscriptions.length > 0) {
                      <button type="button" class="btn" (click)="copyContacts()">{{ contactsCopied() ? 'Contacts copied' : 'Copy contacts' }}</button>
                    }
                  </div>
                  <p class="lede">
                    {{ page.subscriptions.length }} subscribed application{{ page.subscriptions.length === 1 ? '' : 's' }},
                    {{ owners().length }} owner{{ owners().length === 1 ? '' : 's' }} to contact before deprecating, blocking or
                    retiring this version in {{ envLabel() }}.
                  </p>
                  @if (page.subscriptions.length === 0) {
                    <p class="detail-msg">No application is subscribed to this API: changing it affects nobody in {{ envLabel() }}.</p>
                  } @else {
                    <div class="table-wrap" tabindex="0" role="region" aria-label="Subscribed applications">
                      <table class="list">
                        <thead>
                          <tr>
                            <th scope="col">Application</th>
                            <th scope="col">Owner</th>
                            <th scope="col">Subscriber</th>
                            <th scope="col">Policy</th>
                            <th scope="col">Status</th>
                            @if (hasMetrics()) {
                              <th scope="col" class="num">Calls</th>
                              <th scope="col" class="num">Error rate</th>
                            }
                          </tr>
                        </thead>
                        <tbody>
                          @for (sub of page.subscriptions; track sub.subscriptionId) {
                            <tr>
                              <th scope="row">{{ sub.applicationName ?? '—' }}</th>
                              <td>{{ sub.applicationOwner ?? '—' }}</td>
                              <td>{{ sub.subscriber ?? '—' }}</td>
                              <td>{{ sub.throttlingPolicy }}</td>
                              <td><span class="pill" [attr.data-status]="sub.status">{{ subscriptionStatus(sub.status) }}</span></td>
                              @if (hasMetrics()) {
                                <td class="num">{{ usageOf(sub) ? compact(usageOf(sub)!.calls) : '—' }}</td>
                                <td class="num">{{ usageOf(sub) ? percent(usageOf(sub)!.errorRate) : '—' }}</td>
                              }
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  }
                </div>
              </section>
            }
            @case ('deployment') {
              <section class="tabpanel" role="tabpanel" id="panel-deployment" aria-labelledby="tab-deployment">
                <div class="detail-grid page-grid">
                  <section class="panel" aria-labelledby="deploy-title">
                    <h3 id="deploy-title" class="section-title">Deployment</h3>
                    @if (page.detail.revisions.length === 0) {
                      <p class="detail-msg">No revision is deployed on a gateway.</p>
                    }
                    @for (revision of page.detail.revisions; track revision.id) {
                      <p class="revision">
                        <strong>{{ revision.name }}</strong>
                        <span class="muted">created {{ date(revision.createdTime) }}</span>
                      </p>
                      <ul class="gateways">
                        @for (gateway of revision.gateways; track gateway.name) {
                          <li>
                            <span class="gw-name">{{ gateway.name }}</span>
                            <span class="mono muted">{{ gateway.vhost }}</span>
                            <span class="muted">{{ gateway.status }} · {{ date(gateway.deployedTime) }}</span>
                          </li>
                        }
                      </ul>
                    }
                  </section>

                  <section class="panel" aria-labelledby="across-title">
                    <h3 id="across-title" class="section-title">Across environments</h3>
                    <ul class="presence-list">
                      @for (env of page.detail.environments; track env.environment) {
                        <li [class.current]="env.environment === routeEnv()" [class.absent]="env.versions.length === 0">
                          <span class="env-tag">{{ env.label }}</span>
                          @if (env.versions.length === 0) {
                            <span class="muted"><span aria-hidden="true">—</span><span class="sr-only">not present</span></span>
                          }
                          @for (v of env.versions; track v.apiId) {
                            <a class="mono" [routerLink]="['/apis', env.environment, v.apiId]" [attr.aria-current]="v.apiId === apiId() ? 'page' : null">{{ v.version }}</a>
                          }
                          @if (env.stale) {
                            <span class="stale" title="Environment in error: showing its last successful synchronization, if any">{{ env.versions.length ? 'outdated' : 'unavailable' }}</span>
                          }
                        </li>
                      }
                    </ul>
                  </section>
                </div>
              </section>
            }
          }
        }
      }
    }
  `,
})
export class ApiPageComponent {
  private readonly catalog = inject(CatalogService);
  private readonly route = inject(ActivatedRoute);
  readonly store = inject(EnvironmentStore);

  readonly tabs = TABS;
  readonly tab = signal<Tab>('traffic');
  readonly routeEnv = signal('');
  readonly apiId = signal('');
  readonly data = signal<ApiPageData | null>(null);
  readonly metrics = signal<ApiMetrics | null>(null);
  readonly state = signal<PageState>('loading');
  readonly linkCopied = signal(false);
  readonly contactsCopied = signal(false);

  readonly environment = computed<Environment | undefined>(() => this.store.environments().find((env) => env.key === this.routeEnv()));
  readonly envLabel = computed(() => this.environment()?.label ?? this.routeEnv().toUpperCase());
  readonly active = computed(() => this.data()?.subscriptions.filter((s) => s.status === 'UNBLOCKED').length ?? 0);
  readonly notActive = computed(() => (this.data()?.subscriptions.length ?? 0) - this.active());

  /** Des chiffres à montrer : lecture réussie, ou dernière lecture réussie conservée pendant une panne. */
  readonly hasMetrics = computed(() => {
    const status = this.metrics()?.status;
    return status?.state === 'OK' || (status?.state === 'ERROR' && !!status.lastSuccessAt);
  });

  /** Totaux de l'API sur la période ; nuls sans métriques ou sans appel. */
  readonly traffic = computed(() => (this.hasMetrics() ? this.metrics()?.metrics ?? null : null));

  readonly consumerBars = computed<BarItem[]>(() =>
    (this.metrics()?.consumers ?? []).slice(0, 10).map((c) => ({
      key: c.applicationId ?? c.applicationName,
      label: c.applicationName,
      value: c.calls,
      link: c.applicationId ? ['/applications'] : undefined,
      queryParams: c.applicationId ? { q: c.applicationName } : undefined,
    })),
  );

  readonly errorBars = computed<BarItem[]>(() => {
    const m = this.metrics()?.metrics;
    return m
      ? [
          { key: '4xx', label: 'Client errors (4xx)', value: m.errors4xx, tone: 'warn' as const },
          { key: '5xx', label: 'Server errors (5xx)', value: m.errors5xx, tone: 'err' as const },
        ].filter((bar) => bar.value > 0)
      : [];
  });

  /** Propriétaires distincts (données personnelles : déjà filtrées par le BFF), dans l'ordre alphabétique. */
  readonly owners = computed(() =>
    [...new Set((this.data()?.subscriptions ?? []).map((s) => s.applicationOwner).filter((o): o is string => !!o))].sort((a, b) =>
      a.localeCompare(b, 'en', { sensitivity: 'base' }),
    ),
  );

  readonly publisherLink = computed(() => this.uiLink(this.environment()?.publisherUrl));
  readonly devportalLink = computed(() => this.uiLink(this.environment()?.devportalUrl));

  readonly compact = compactNumber;
  readonly percent = formatPercent;
  readonly ms = formatMs;
  readonly int = formatInt;

  private loadedKey = '';

  constructor() {
    combineLatest([this.route.paramMap, toObservable(this.store.refreshTick)])
      .pipe(
        map(([params]) => ({ env: params.get('env') ?? '', apiId: params.get('apiId') ?? '' })),
        tap(({ env, apiId }) => {
          this.routeEnv.set(env);
          this.apiId.set(apiId);
          // La fiche fait foi de l'environnement : l'en-tête suit le lien.
          if (this.store.selectedKey() !== env) {
            this.store.select(env);
          }
          if (this.loadedKey !== env + '/' + apiId) {
            this.loadedKey = env + '/' + apiId;
            this.data.set(null);
            this.metrics.set(null);
            this.state.set('loading');
          }
        }),
        switchMap(({ env, apiId }) =>
          forkJoin({
            detail: this.catalog.apiDetail(env, apiId),
            subscriptions: this.catalog.subscriptionsOfApi(env, apiId),
          }).pipe(
            catchError((error: unknown) => {
              this.state.set(error instanceof HttpErrorResponse && error.status === 404 ? 'notfound' : 'error');
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((page) => {
        this.data.set(page);
        this.state.set('ready');
      });

    // Les métriques dépendent aussi de la période, et leur absence n'empêche jamais d'afficher la fiche.
    combineLatest([this.route.paramMap, toObservable(this.store.period), toObservable(this.store.refreshTick)])
      .pipe(
        switchMap(([params, period]) =>
          this.catalog.apiMetrics(params.get('env') ?? '', params.get('apiId') ?? '', period).pipe(catchError(() => EMPTY)),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((metrics) => this.metrics.set(metrics));
  }

  life(status: string): string {
    return lifeCycleLabel(status);
  }

  subscriptionStatus(status: string): string {
    return subscriptionStatusLabel(status);
  }

  date(iso: string): string {
    return formatDateTime(iso);
  }

  /** Usage de l'API par l'application d'une souscription : par identifiant, sinon par nom (un nom ambigu n'est pas rapproché côté BFF). */
  usageOf(sub: Subscription): Usage | undefined {
    const consumers = this.metrics()?.consumers ?? [];
    return consumers.find((c) => (c.applicationId && c.applicationId === sub.applicationId) || (!c.applicationId && c.applicationName === sub.applicationName));
  }

  copyLink(): void {
    this.copy(window.location.href, this.linkCopied);
  }

  copyContacts(): void {
    const page = this.data();
    if (page) {
      this.copy(this.contactsText(page), this.contactsCopied);
    }
  }

  /** Une ligne par propriétaire, avec ses applications : prêt à coller dans un mail ou un ticket. */
  contactsText(page: ApiPageData): string {
    const byOwner = new Map<string, Set<string>>();
    for (const sub of page.subscriptions) {
      const owner = sub.applicationOwner ?? '(owner unknown)';
      byOwner.set(owner, (byOwner.get(owner) ?? new Set()).add(sub.applicationName ?? '(unnamed application)'));
    }
    const lines = [...byOwner.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
      .map(([owner, apps]) => `${owner}: ${[...apps].join(', ')}`);
    const api = page.detail.api;
    return [`Applications subscribed to ${api.name} ${api.version} in ${this.envLabel()}`, ...lines].join('\n');
  }

  private copy(text: string, flag: { set(value: boolean): void }): void {
    const done = () => {
      flag.set(true);
      setTimeout(() => flag.set(false), 2000);
    };
    try {
      navigator.clipboard.writeText(text).then(done, () => undefined);
    } catch {
      // Presse-papiers indisponible (contexte non sécurisé) : aucun retour, la table reste sélectionnable.
    }
  }

  /** Lien vers l'interface WSO2 de l'API ; jamais construit à partir d'une entrée du navigateur autre que l'id. */
  private uiLink(base: string | null | undefined): string | null {
    return base ? `${base.replace(/\/+$/, '')}/apis/${encodeURIComponent(this.apiId())}/overview` : null;
  }
}
