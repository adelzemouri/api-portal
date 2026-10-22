import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EMPTY, catchError, combineLatest, forkJoin, map, switchMap, tap } from 'rxjs';
import { ApiDetail, ApiMetrics, Environment, Subscription, Usage } from './api.models';
import { BarItem, BarListComponent } from './bar-list.component';
import { CatalogService } from './catalog.service';
import { CopyButtonComponent } from './copy-button.component';
import { DetailPanel } from './detail-panel.service';
import { EnvPathComponent } from './env-path.component';
import { EnvironmentStore } from './environment.store';
import { compactNumber, formatDateTime, formatInt, formatMs, formatPercent, lifeCycleLabel, subscriptionStatusLabel } from './format';
import { I18nService, TranslatePipe } from './i18n';
import { MetricsNoticeComponent } from './metrics-notice.component';
import { PeriodSwitchComponent } from './period-switch.component';
import { TimeSeriesChartComponent } from './time-series-chart.component';

type PageState = 'loading' | 'ready' | 'error' | 'notfound';

interface ApiPageData {
  detail: ApiDetail;
  subscriptions: Subscription[];
}

/**
 * Fiche d'une API, accessible par lien direct (/apis/{environnement}/{id}) : parcours jusqu'à la production, trafic,
 * URL d'appel, impact d'un changement (qui prévenir) et déploiement, d'un seul tenant (sans onglets).
 * Elle suit le sélecteur d'environnement de l'en-tête : la même API (par son nom) est ouverte dans l'autre environnement.
 */
@Component({
  selector: 'app-api-page',
  standalone: true,
  imports: [BarListComponent, CopyButtonComponent, EnvPathComponent, MetricsNoticeComponent, PeriodSwitchComponent, RouterLink, TimeSeriesChartComponent, TranslatePipe],
  template: `
    <nav class="breadcrumb" [attr.aria-label]="'Breadcrumb' | t">
      <a routerLink="/apis">{{ 'APIs' | t }}</a>
      <span aria-hidden="true">›</span>
      <span aria-current="page">{{ data() ? data()!.detail.api.name + ' ' + data()!.detail.api.version : 'API' }}</span>
    </nav>

    @switch (state()) {
      @case ('loading') {
        <p class="state-msg">{{ 'Loading the API…' | t }}</p>
      }
      @case ('notfound') {
        <p class="state-msg banner" role="alert">
          {{ 'This API does not exist in {env} (it may have been removed since the last synchronization).' | t: { env: envLabel() } }}
          <a routerLink="/apis">{{ 'Back to the APIs' | t }}</a>
        </p>
      }
      @case ('error') {
        <p class="state-msg banner banner-error" role="alert">{{ 'Unable to load this API.' | t }}</p>
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
                <a class="btn" [href]="href" target="_blank" rel="noopener noreferrer">{{ 'Open in Publisher' | t }} <span class="sr-only">{{ '(new tab)' | t }}</span><span aria-hidden="true">↗</span></a>
              }
              @if (devportalLink(); as href) {
                <a class="btn" [href]="href" target="_blank" rel="noopener noreferrer">{{ 'Open in Devportal' | t }} <span class="sr-only">{{ '(new tab)' | t }}</span><span aria-hidden="true">↗</span></a>
              }
              <button type="button" class="btn" (click)="copyLink()">{{ (linkCopied() ? 'Link copied' : 'Copy link') | t }}</button>
            </div>
          </header>

          <section class="kpis kpis-compact" [attr.aria-label]="'Summary' | t">
            <div class="kpi">
              <span class="kpi-label">{{ 'Calls' | t }}</span>
              <span class="kpi-value">{{ traffic() ? compact(traffic()!.calls) : '—' }}</span>
              <span class="kpi-note">{{ (store.period() === '24h' ? 'last 24 hours' : 'last 7 days') | t }}</span>
            </div>
            <div class="kpi">
              <span class="kpi-label">{{ 'Error rate' | t }}</span>
              <span class="kpi-value">{{ traffic() ? percent(traffic()!.errorRate) : '—' }}</span>
              <span class="kpi-note">{{ traffic() ? int(traffic()!.errors4xx) + ' 4xx · ' + int(traffic()!.errors5xx) + ' 5xx' : '' }}</span>
            </div>
            <div class="kpi">
              <span class="kpi-label">{{ 'Latency p95' | t }}</span>
              <span class="kpi-value">{{ traffic() ? ms(traffic()!.p95LatencyMs) : '—' }}</span>
              <span class="kpi-note">{{ traffic() ? ('average {value}' | t: { value: ms(traffic()!.avgLatencyMs) }) : '' }}</span>
            </div>
            <div class="kpi" [attr.data-state]="notActive() ? 'ERROR' : 'OK'">
              <span class="kpi-label">{{ 'Subscribers' | t }}</span>
              <span class="kpi-value">{{ page.subscriptions.length }}</span>
              <span class="kpi-note">{{ '{n} active' | t: { n: active() } }}{{ notActive() ? ' · ' + ('{n} blocked or waiting' | t: { n: notActive() }) : '' }}</span>
            </div>
          </section>

          @if (absentIn(); as other) {
            <p class="banner" role="status">
              {{ 'This API is not deployed in {env}. Showing {current}.' | t: { env: store.labelOf(other), current: envLabel() } }}
            </p>
          }

          <section class="panel" id="panel-path" aria-labelledby="path-title">
            <h3 id="path-title" class="section-title">{{ 'Path to production' | t }}</h3>
            <app-env-path [presence]="page.detail.environments" [current]="routeEnv()" (pick)="store.select($event)" />
          </section>

          <section class="page-section" id="panel-traffic" aria-labelledby="traffic-title">
            <div class="section-head">
              <h3 id="traffic-title" class="section-title">{{ 'Traffic' | t }}</h3>
              <app-period-switch />
            </div>
                                <app-metrics-notice [status]="metrics()?.status" />
                @if (hasMetrics()) {
                  @if (!metrics()?.metrics) {
                    <p class="state-msg">{{ 'No call recorded on this API in the period.' | t }}</p>
                  } @else {
                    <div class="chart-pair">
                      <article class="chart">
                        <h4>{{ 'Calls' | t }}</h4>
                        <app-time-series [points]="metrics()!.timeline" metric="calls" [title]="'Calls' | t" [period]="store.period()" />
                      </article>
                      <article class="chart">
                        <h4>{{ 'Errors' | t }} <span class="muted">{{ '(status 400 and above)' | t }}</span></h4>
                        <app-time-series [points]="metrics()!.timeline" metric="errors" [title]="'Errors' | t" tone="err" [period]="store.period()" />
                      </article>
                    </div>
                    <div class="chart-pair">
                      <article class="chart">
                        <h4>{{ 'Top consumers' | t }}</h4>
                        <app-bar-list [label]="'Applications calling this API' | t" [empty]="'No consumer' | t" [items]="consumerBars()" [selected]="panel.origin()" [format]="compact" />
                      </article>
                      <article class="chart">
                        <h4>{{ 'Errors by kind' | t }}</h4>
                        <app-bar-list [label]="'Errors by kind' | t" [empty]="'No error' | t" [items]="errorBars()" [format]="compact" />
                      </article>
                    </div>
                  }
                }
          </section>

          <section class="page-section" id="panel-endpoints" aria-labelledby="endpoints-title">
                <div class="panel">
                  <h3 id="endpoints-title" class="section-title">{{ 'Call this API' | t }}</h3>
                  @if (page.detail.gatewayUrls.length === 0) {
                    <p class="detail-msg">{{ 'No gateway serves this API yet: deploy a revision to get its URL.' | t }}</p>
                  } @else {
                    <ul class="url-list">
                      @for (u of page.detail.gatewayUrls; track u.gateway + u.url) {
                        <li>
                          <span class="gw-name">{{ u.gateway }}</span>
                          <span class="url mono">{{ u.url }}</span>
                          <app-copy-button [text]="u.url" [label]="'{gateway} URL' | t: { gateway: u.gateway }" />
                        </li>
                      }
                    </ul>
                  }
                  @if (environment()?.identityServerUrl; as identityServer) {
                    <p class="conn-hint">
                      {{ 'Get an access token from the {env} Identity Server:' | t: { env: envLabel() } }}
                      <span class="url mono">{{ identityServer }}</span>
                      <app-copy-button [text]="identityServer" [label]="'Identity Server URL' | t" />
                    </p>
                  }
                </div>
          </section>

          <section class="page-section" id="panel-consumers" aria-labelledby="impact-title">
                <div class="panel">
                  <div class="section-head">
                    <h3 id="impact-title" class="section-title">{{ 'Impact of a change' | t }}</h3>
                    @if (page.subscriptions.length > 0) {
                      <button type="button" class="btn" (click)="copyContacts()">{{ (contactsCopied() ? 'Contacts copied' : 'Copy contacts') | t }}</button>
                    }
                  </div>
                  <p class="lede">
                    {{ impactText() }}
                  </p>
                  @if (page.subscriptions.length === 0) {
                    <p class="detail-msg">{{ 'No application is subscribed to this API: changing it affects nobody in {env}.' | t: { env: envLabel() } }}</p>
                  } @else {
                    <div class="table-wrap" tabindex="0" role="region" [attr.aria-label]="'Subscribed applications' | t">
                      <table class="list">
                        <thead>
                          <tr>
                            <th scope="col">{{ 'Application' | t }}</th>
                            <th scope="col">{{ 'Owner' | t }}</th>
                            <th scope="col">{{ 'Subscriber' | t }}</th>
                            <th scope="col">{{ 'Policy' | t }}</th>
                            <th scope="col">{{ 'Status' | t }}</th>
                            @if (hasMetrics()) {
                              <th scope="col" class="num">{{ 'Calls' | t }}</th>
                              <th scope="col" class="num">{{ 'Error rate' | t }}</th>
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

          <section class="page-section" id="panel-deployment" aria-labelledby="deploy-title">
                <div>
                  <section class="panel">
                    <h3 id="deploy-title" class="section-title">{{ 'Deployment' | t }}</h3>
                    @if (page.detail.revisions.length === 0) {
                      <p class="detail-msg">{{ 'No revision is deployed on a gateway.' | t }}</p>
                    }
                    @for (revision of page.detail.revisions; track revision.id) {
                      <p class="revision">
                        <strong>{{ revision.name }}</strong>
                        <span class="muted">{{ 'created {date}' | t: { date: date(revision.createdTime) } }}</span>
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

                </div>
          </section>
        }
      }
    }
  `,
})
export class ApiPageComponent {
  private readonly catalog = inject(CatalogService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly store = inject(EnvironmentStore);
  readonly panel = inject(DetailPanel);
  private readonly i18n = inject(I18nService);

  readonly routeEnv = signal('');
  readonly apiId = signal('');
  readonly data = signal<ApiPageData | null>(null);
  readonly metrics = signal<ApiMetrics | null>(null);
  readonly state = signal<PageState>('loading');
  readonly linkCopied = signal(false);
  /** Environnement choisi dans l'en-tête où l'API n'existe pas ; la fiche reste sur celui du lien. */
  readonly absentIn = signal<string | null>(null);
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
      from: c.applicationId ? 'consumer-' + c.applicationId : undefined,
      action: c.applicationId
        ? () => this.panel.open({ kind: 'app', env: this.routeEnv(), id: c.applicationId, name: c.applicationName, from: 'consumer-' + c.applicationId })
        : undefined,
    })),
  );

  readonly errorBars = computed<BarItem[]>(() => {
    const m = this.metrics()?.metrics;
    return m
      ? [
          { key: '4xx', label: this.i18n.t('Client errors (4xx)'), value: m.errors4xx, tone: 'warn' as const },
          { key: '5xx', label: this.i18n.t('Server errors (5xx)'), value: m.errors5xx, tone: 'err' as const },
        ].filter((bar) => bar.value > 0)
      : [];
  });

  /** Propriétaires distincts (données personnelles : déjà filtrées par le BFF), dans l'ordre alphabétique. */
  readonly owners = computed(() =>
    [...new Set((this.data()?.subscriptions ?? []).map((s) => s.applicationOwner).filter((o): o is string => !!o))].sort((a, b) =>
      a.localeCompare(b, 'en', { sensitivity: 'base' }),
    ),
  );

  /** Phrase d'impact : accords au singulier et au pluriel, dans la langue choisie. */
  readonly impactText = computed(() => {
    const subscriptions = this.data()?.subscriptions.length ?? 0;
    const owners = this.owners().length;
    return this.i18n.t(
      subscriptions === 1 ? '{n} subscribed application' : '{n} subscribed applications',
      { n: subscriptions },
    ) + ', ' + this.i18n.t(
      owners === 1
        ? '{n} owner to contact before deprecating, blocking or retiring this version in {env}.'
        : '{n} owners to contact before deprecating, blocking or retiring this version in {env}.',
      { n: owners, env: this.envLabel() },
    );
  });

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
          this.absentIn.set(null);
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

    toObservable(this.store.selectedKey)
      .pipe(takeUntilDestroyed())
      .subscribe((key) => this.follow(key));
  }

  /** L'en-tête a changé d'environnement : on ouvre la même API (même nom, même version si possible) dans celui-ci. */
  follow(key: string): void {
    const page = this.data();
    if (!key || !page || key === this.routeEnv()) {
      this.absentIn.set(null);
      return;
    }
    const versions = page.detail.environments.find((env) => env.environment === key)?.versions ?? [];
    const target = versions.find((v) => v.version === page.detail.api.version) ?? versions[0];
    if (target) {
      void this.router.navigate(['/apis', key, target.apiId], { replaceUrl: true });
    } else {
      this.absentIn.set(key);
    }
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
      const owner = sub.applicationOwner ?? this.i18n.t('(owner unknown)');
      byOwner.set(owner, (byOwner.get(owner) ?? new Set()).add(sub.applicationName ?? this.i18n.t('(unnamed application)')));
    }
    const lines = [...byOwner.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
      .map(([owner, apps]) => `${owner}: ${[...apps].join(', ')}`);
    const api = page.detail.api;
    return [this.i18n.t('Applications subscribed to {api} in {env}', { api: `${api.name} ${api.version}`, env: this.envLabel() }), ...lines].join('\n');
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
