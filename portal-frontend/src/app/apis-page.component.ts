import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { EMPTY, catchError, combineLatest, filter, forkJoin, switchMap, tap } from 'rxjs';
import { Api, ApiDetail, ApiMetric, ApiMetricsList, ApiRow, Subscription } from './api.models';
import { CatalogService } from './catalog.service';
import { CopyButtonComponent } from './copy-button.component';
import { EnvironmentStore, LoadState } from './environment.store';
import { Expansion } from './expansion';
import { compactNumber, formatDateTime, formatInt, formatMs, formatPercent, subscriptionStatusLabel } from './format';
import { ApisView } from './list-views';
import { MetricsNoticeComponent } from './metrics-notice.component';
import { PagerComponent } from './pager.component';
import { PeriodSwitchComponent } from './period-switch.component';

interface ApiExpansion {
  detail: ApiDetail;
  subscriptions: Subscription[];
}

/**
 * APIs de l'environnement sélectionné, avec leur trafic sur la période : recherche, filtres, tri et pagination.
 * Chaque ligne se déplie sur son déploiement, ses URL, sa présence dans les autres environnements et ses abonnés ;
 * la fiche complète a une URL.
 */
@Component({
  selector: 'app-apis-page',
  standalone: true,
  imports: [CopyButtonComponent, MetricsNoticeComponent, PagerComponent, PeriodSwitchComponent, RouterLink],
  template: `
    <div class="page-head page-head-row">
      <div>
        <h2>APIs <span class="page-env">{{ store.selected()?.label }}</span></h2>
        <p class="lede">Every API in this environment and how much it is called. Select a row for its deployment, URLs and subscribers.</p>
      </div>
      <app-period-switch />
    </div>

    <app-metrics-notice [status]="metrics()?.status" />

    <div class="panel">
      <div class="toolbar">
        <label class="search">
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
          <input type="search" aria-label="Filter APIs" placeholder="Filter by name or context" [value]="view.query()" (input)="view.setQuery(valueOf($event))" />
        </label>
        <label class="filter">
          <span>Type</span>
          <select [value]="view.type()" (change)="view.setType(valueOf($event))">
            <option value="">All</option>
            @for (type of types(); track type) {
              <option [value]="type" [selected]="type === view.type()">{{ type }}</option>
            }
          </select>
        </label>
        <label class="filter">
          <span>Subscribers</span>
          <select [value]="view.subscribers()" (change)="view.setSubscribers(valueOf($event))">
            <option value="all">Any</option>
            <option value="with">With subscribers</option>
            <option value="without">No subscribers</option>
          </select>
        </label>
        @if (hasMetrics()) {
          <label class="filter">
            <span>Traffic</span>
            <select [value]="view.traffic()" (change)="view.setTraffic(valueOf($event))">
              <option value="all">Any</option>
              <option value="with">Called</option>
              <option value="without">Not called</option>
            </select>
          </label>
        }
        @if (view.active()) {
          <button type="button" class="link-btn" (click)="view.reset()">Clear filters</button>
        }
      </div>

      @switch (state()) {
        @case ('loading') {
          <p class="state-msg">Loading APIs…</p>
        }
        @case ('error') {
          <p class="state-msg banner banner-error" role="alert">Unable to load the APIs.</p>
        }
        @default {
          @if (window().total === 0) {
            <p class="state-msg">{{ view.active() ? 'No API matches these filters.' : 'No API in this environment.' }}</p>
          } @else {
            <div class="table-wrap" tabindex="0" role="region" aria-label="APIs">
              <table class="list">
                <thead>
                  <tr>
                    <th scope="col" [attr.aria-sort]="view.table.ariaSort('name')"><button type="button" class="sort" (click)="view.table.toggleSort('name')">Name <span aria-hidden="true">{{ view.table.arrow('name') }}</span></button></th>
                    <th scope="col" [attr.aria-sort]="view.table.ariaSort('version')"><button type="button" class="sort" (click)="view.table.toggleSort('version')">Version <span aria-hidden="true">{{ view.table.arrow('version') }}</span></button></th>
                    <th scope="col" [attr.aria-sort]="view.table.ariaSort('context')"><button type="button" class="sort" (click)="view.table.toggleSort('context')">Context <span aria-hidden="true">{{ view.table.arrow('context') }}</span></button></th>
                    @if (hasMetrics()) {
                      <th scope="col" class="num" [attr.aria-sort]="view.table.ariaSort('calls')"><button type="button" class="sort" (click)="view.table.toggleSort('calls')">Calls <span aria-hidden="true">{{ view.table.arrow('calls') }}</span></button></th>
                      <th scope="col" class="num" [attr.aria-sort]="view.table.ariaSort('errorRate')"><button type="button" class="sort" (click)="view.table.toggleSort('errorRate')">Error rate <span aria-hidden="true">{{ view.table.arrow('errorRate') }}</span></button></th>
                      <th scope="col" class="num" [attr.aria-sort]="view.table.ariaSort('p95')"><button type="button" class="sort" (click)="view.table.toggleSort('p95')">Latency p95 <span aria-hidden="true">{{ view.table.arrow('p95') }}</span></button></th>
                    }
                    <th scope="col" class="num" [attr.aria-sort]="view.table.ariaSort('subscribers')"><button type="button" class="sort" (click)="view.table.toggleSort('subscribers')">Subscribers <span aria-hidden="true">{{ view.table.arrow('subscribers') }}</span></button></th>
                    <th scope="col" class="actions"><span class="sr-only">Show details</span></th>
                  </tr>
                </thead>
                @for (api of window().rows; track api.apiId) {
                  <tbody [class.open]="expansion.isOpen(api.apiId)">
                    <tr class="row" (click)="expansion.toggle(api.apiId)">
                      <th scope="row">{{ api.name }}</th>
                      <td class="mono">{{ api.version }}</td>
                      <td class="mono muted">{{ api.context }}</td>
                      @if (hasMetrics()) {
                        <td class="num" [attr.title]="api.calls ? int(api.calls) + ' calls' : null">{{ api.calls ? compact(api.calls) : '—' }}</td>
                        <td class="num">{{ api.calls ? percent(api.errorRate) : '—' }}</td>
                        <td class="num">{{ api.calls ? ms(api.p95) : '—' }}</td>
                      }
                      <td class="num">{{ api.subscriptionCount }}</td>
                      <td class="actions">
                        <button
                          type="button"
                          class="chevron"
                          [attr.aria-expanded]="expansion.isOpen(api.apiId)"
                          [attr.aria-controls]="'api-' + api.apiId"
                          [attr.aria-label]="'Details of ' + api.name + ' ' + api.version"
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
                        </button>
                      </td>
                    </tr>
                    @if (expansion.isOpen(api.apiId)) {
                      <tr class="detail" [id]="'api-' + api.apiId">
                        <td [attr.colspan]="hasMetrics() ? 8 : 5">
                          @switch (expansion.detail(api.apiId)?.status) {
                            @case ('ready') {
                              @if (dataOf(api.apiId); as data) {
                                <p class="detail-link">
                                  <a [routerLink]="['/apis', store.selectedKey(), api.apiId]">Open the full page →</a>
                                </p>
                                <div class="detail-grid">
                                  <section aria-label="Deployment">
                                    <h3>Deployment</h3>
                                    @if (data.detail.revisions.length === 0) {
                                      <p class="detail-msg">No revision is deployed on a gateway.</p>
                                    }
                                    @for (revision of data.detail.revisions; track revision.id) {
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
                                    @if (data.detail.gatewayUrls.length) {
                                      <h3>Gateway URLs</h3>
                                      <ul class="url-list">
                                        @for (u of data.detail.gatewayUrls; track u.gateway + u.url) {
                                          <li>
                                            <span class="gw-name">{{ u.gateway }}</span>
                                            <span class="url mono">{{ u.url }}</span>
                                            <app-copy-button [text]="u.url" [label]="u.gateway + ' URL'" />
                                          </li>
                                        }
                                      </ul>
                                    }
                                  </section>
                                  <section aria-label="Environments">
                                    <h3>Across environments</h3>
                                    <ul class="presence-list">
                                      @for (env of data.detail.environments; track env.environment) {
                                        <li [class.current]="env.environment === store.selectedKey()" [class.absent]="env.versions.length === 0">
                                          <span class="env-tag">{{ env.label }}</span>
                                          @if (env.versions.length === 0) {
                                            <span class="muted"><span aria-hidden="true">—</span><span class="sr-only">not present</span></span>
                                          } @else {
                                            <span class="mono">{{ versionsOf(env) }}</span>
                                          }
                                          @if (env.stale) {
                                            <span class="stale" title="Environment in error: showing its last successful synchronization, if any">{{ env.versions.length ? 'outdated' : 'unavailable' }}</span>
                                          }
                                        </li>
                                      }
                                    </ul>
                                  </section>
                                </div>
                                <h3>Subscribers ({{ data.subscriptions.length }})</h3>
                                @if (data.subscriptions.length === 0) {
                                  <p class="detail-msg">No application is subscribed to this API.</p>
                                } @else {
                                  <table class="sub-list">
                                    <thead>
                                      <tr>
                                        <th scope="col">Application</th>
                                        <th scope="col">Subscriber</th>
                                        <th scope="col">Policy</th>
                                        <th scope="col">Status</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      @for (sub of data.subscriptions; track sub.subscriptionId) {
                                        <tr>
                                          <th scope="row">{{ sub.applicationName ?? '—' }}</th>
                                          <td>{{ sub.subscriber ?? '—' }}</td>
                                          <td>{{ sub.throttlingPolicy }}</td>
                                          <td><span class="pill" [attr.data-status]="sub.status">{{ subscriptionStatus(sub.status) }}</span></td>
                                        </tr>
                                      }
                                    </tbody>
                                  </table>
                                }
                              }
                            }
                            @case ('error') {
                              <p class="detail-msg banner-error" role="alert">Unable to load the details of this API.</p>
                            }
                            @default {
                              <p class="detail-msg">Loading…</p>
                            }
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                }
              </table>
            </div>
            <app-pager [view]="view.table" [window]="window()" noun="APIs" />
          }
        }
      }
    </div>
  `,
})
export class ApisPageComponent {
  private readonly catalog = inject(CatalogService);
  readonly store = inject(EnvironmentStore);
  readonly view = inject(ApisView);

  readonly all = signal<Api[]>([]);
  readonly metrics = signal<ApiMetricsList | null>(null);
  readonly state = signal<LoadState>('loading');

  /** Des chiffres à montrer : lecture réussie, ou dernière lecture réussie conservée pendant une panne. */
  readonly hasMetrics = computed(() => {
    const status = this.metrics()?.status;
    return status?.state === 'OK' || (status?.state === 'ERROR' && !!status.lastSuccessAt);
  });

  private readonly byApiId = computed(() => {
    const map = new Map<string, ApiMetric>();
    this.metrics()?.items.forEach((m) => m.apiId && map.set(m.apiId, m));
    return map;
  });

  readonly rows = computed<ApiRow[]>(() =>
    this.all().map((api) => {
      const m = this.byApiId().get(api.apiId);
      return { ...api, calls: m?.calls ?? 0, errorRate: m?.errorRate ?? 0, p95: m?.p95LatencyMs ?? 0 };
    }),
  );

  readonly types = computed(() => [...new Set(this.all().map((api) => api.type))].sort());
  readonly window = computed(() => this.view.table.slice(this.view.table.sort(this.view.filter(this.rows()))));

  readonly expansion = new Expansion<ApiExpansion>((apiId) => {
    const environment = this.store.selectedKey();
    return forkJoin({
      detail: this.catalog.apiDetail(environment, apiId),
      subscriptions: this.catalog.subscriptionsOfApi(environment, apiId),
    });
  }, inject(DestroyRef));

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
            this.view.enter(environment);
            this.expansion.clear();
            this.all.set([]);
            this.metrics.set(null);
            this.state.set('loading');
          }
        }),
        switchMap(([environment]) =>
          this.catalog.apis(environment).pipe(
            catchError(() => {
              this.state.set('error');
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((apis) => {
        this.all.set(apis);
        this.state.set('ready');
        this.expansion.reload();
      });

    // Les métriques sont un complément : leur absence ou leur panne n'empêche jamais d'afficher le catalogue.
    combineLatest([toObservable(this.store.selectedKey), toObservable(this.store.period), toObservable(this.store.refreshTick)])
      .pipe(
        filter(([environment]) => environment !== ''),
        switchMap(([environment, period]) => this.catalog.apiMetricsList(environment, period).pipe(catchError(() => EMPTY))),
        takeUntilDestroyed(),
      )
      .subscribe((list) => this.metrics.set(list));
  }

  dataOf(apiId: string): ApiExpansion | null {
    const detail = this.expansion.detail(apiId);
    return detail?.status === 'ready' ? detail.data : null;
  }

  versionsOf(env: ApiDetail['environments'][number]): string {
    return env.versions.map((v) => v.version).join(', ');
  }

  subscriptionStatus(status: string): string {
    return subscriptionStatusLabel(status);
  }

  date(iso: string): string {
    return formatDateTime(iso);
  }

  valueOf(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }
}
