import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EMPTY, catchError, combineLatest, filter, forkJoin, of, switchMap, tap } from 'rxjs';
import { AppMetric, AppMetricsList, Application, ApplicationRow, Subscription, Usage } from './api.models';
import { CatalogService } from './catalog.service';
import { EnvironmentStore, LoadState } from './environment.store';
import { Expansion } from './expansion';
import { applicationStatusLabel, compactNumber, formatInt, formatPercent, subscriptionStatusLabel } from './format';
import { ApplicationsView } from './list-views';
import { MetricsNoticeComponent } from './metrics-notice.component';
import { PagerComponent } from './pager.component';
import { PeriodSwitchComponent } from './period-switch.component';

interface ApplicationExpansion {
  subscriptions: Subscription[];
  /** Appels par API sur la période ; nul si les métriques ne sont pas disponibles. */
  usage: Usage[] | null;
}

/**
 * Applications de l'environnement sélectionné, tous propriétaires (Admin API WSO2, via le BFF), avec leur trafic :
 * recherche, filtres, tri, pagination ; chaque application se déplie sur les API auxquelles elle est souscrite.
 */
@Component({
  selector: 'app-applications-page',
  standalone: true,
  imports: [MetricsNoticeComponent, PagerComponent, PeriodSwitchComponent, RouterLink],
  template: `
    <div class="page-head page-head-row">
      <div>
        <h2>Applications <span class="page-env">{{ store.selected()?.label }}</span></h2>
        <p class="lede">Every application registered in this environment, whoever owns it. Select a row to see the APIs it consumes.</p>
      </div>
      <app-period-switch />
    </div>

    <app-metrics-notice [status]="metrics()?.status" />

    <div class="panel">
      <div class="toolbar">
        <label class="search">
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
          <input type="search" aria-label="Filter applications" placeholder="Filter by application or owner" [value]="view.query()" (input)="view.setQuery(valueOf($event))" />
        </label>
        <label class="filter">
          <span>Status</span>
          <select [value]="view.status()" (change)="view.setStatus(valueOf($event))">
            <option value="">All</option>
            @for (status of statuses(); track status) {
              <option [value]="status" [selected]="status === view.status()">{{ applicationStatus(status) }}</option>
            }
          </select>
        </label>
        <label class="filter">
          <span>Subscriptions</span>
          <select [value]="view.subscribers()" (change)="view.setSubscribers(valueOf($event))">
            <option value="all">Any</option>
            <option value="with">With subscriptions</option>
            <option value="without">No subscriptions</option>
          </select>
        </label>
        @if (hasMetrics()) {
          <label class="filter">
            <span>Traffic</span>
            <select [value]="view.traffic()" (change)="view.setTraffic(valueOf($event))">
              <option value="all">Any</option>
              <option value="with">Active</option>
              <option value="without">No call</option>
            </select>
          </label>
        }
        @if (view.active()) {
          <button type="button" class="link-btn" (click)="view.reset()">Clear filters</button>
        }
      </div>

      @switch (state()) {
        @case ('loading') {
          <p class="state-msg">Loading applications…</p>
        }
        @case ('error') {
          <p class="state-msg banner banner-error" role="alert">Unable to load the applications.</p>
        }
        @default {
          @if (window().total === 0) {
            <p class="state-msg">{{ view.active() ? 'No application matches these filters.' : 'No application in this environment.' }}</p>
          } @else {
            <div class="table-wrap" tabindex="0" role="region" aria-label="Applications">
              <table class="list">
                <thead>
                  <tr>
                    <th scope="col" [attr.aria-sort]="view.table.ariaSort('name')"><button type="button" class="sort" (click)="view.table.toggleSort('name')">Name <span aria-hidden="true">{{ view.table.arrow('name') }}</span></button></th>
                    <th scope="col" [attr.aria-sort]="view.table.ariaSort('owner')"><button type="button" class="sort" (click)="view.table.toggleSort('owner')">Owner <span aria-hidden="true">{{ view.table.arrow('owner') }}</span></button></th>
                    <th scope="col" [attr.aria-sort]="view.table.ariaSort('status')"><button type="button" class="sort" (click)="view.table.toggleSort('status')">Status <span aria-hidden="true">{{ view.table.arrow('status') }}</span></button></th>
                    @if (hasMetrics()) {
                      <th scope="col" class="num" [attr.aria-sort]="view.table.ariaSort('calls')"><button type="button" class="sort" (click)="view.table.toggleSort('calls')">Calls <span aria-hidden="true">{{ view.table.arrow('calls') }}</span></button></th>
                      <th scope="col" class="num" [attr.aria-sort]="view.table.ariaSort('errorRate')"><button type="button" class="sort" (click)="view.table.toggleSort('errorRate')">Error rate <span aria-hidden="true">{{ view.table.arrow('errorRate') }}</span></button></th>
                    }
                    <th scope="col" class="num" [attr.aria-sort]="view.table.ariaSort('subscribers')"><button type="button" class="sort" (click)="view.table.toggleSort('subscribers')">Subscribed APIs <span aria-hidden="true">{{ view.table.arrow('subscribers') }}</span></button></th>
                    <th scope="col" class="actions"><span class="sr-only">Show details</span></th>
                  </tr>
                </thead>
                @for (app of window().rows; track app.applicationId) {
                  <tbody [class.open]="expansion.isOpen(app.applicationId)">
                    <tr class="row" (click)="expansion.toggle(app.applicationId)">
                      <th scope="row">{{ app.name }}</th>
                      <td>{{ app.owner ?? '—' }}</td>
                      <td><span class="pill" [attr.data-status]="app.status">{{ applicationStatus(app.status) }}</span></td>
                      @if (hasMetrics()) {
                        <td class="num" [attr.title]="app.calls ? int(app.calls) + ' calls' : null">{{ app.calls ? compact(app.calls) : '—' }}</td>
                        <td class="num">{{ app.calls ? percent(app.errorRate) : '—' }}</td>
                      }
                      <td class="num">{{ app.subscriptionCount }}</td>
                      <td class="actions">
                        <button
                          type="button"
                          class="chevron"
                          [attr.aria-expanded]="expansion.isOpen(app.applicationId)"
                          [attr.aria-controls]="'app-' + app.applicationId"
                          [attr.aria-label]="'Subscriptions of ' + app.name"
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
                        </button>
                      </td>
                    </tr>
                    @if (expansion.isOpen(app.applicationId)) {
                      <tr class="detail" [id]="'app-' + app.applicationId">
                        <td [attr.colspan]="hasMetrics() ? 7 : 5">
                          @switch (expansion.detail(app.applicationId)?.status) {
                            @case ('ready') {
                              @if (dataOf(app.applicationId); as data) {
                                @if (data.subscriptions.length === 0) {
                                  <p class="detail-msg">This application is not subscribed to any API.</p>
                                } @else {
                                  <h3>Subscribed APIs ({{ data.subscriptions.length }})</h3>
                                  <table class="sub-list">
                                    <thead>
                                      <tr>
                                        <th scope="col">API</th>
                                        <th scope="col">Version</th>
                                        <th scope="col">Policy</th>
                                        <th scope="col">Status</th>
                                        @if (data.usage) {
                                          <th scope="col" class="num">Calls</th>
                                          <th scope="col" class="num">Error rate</th>
                                        }
                                      </tr>
                                    </thead>
                                    <tbody>
                                      @for (sub of data.subscriptions; track sub.subscriptionId) {
                                        <tr>
                                          <th scope="row"><a [routerLink]="['/apis', store.selectedKey(), sub.apiId]">{{ sub.apiName }}</a></th>
                                          <td class="mono">{{ sub.apiVersion }}</td>
                                          <td>{{ sub.throttlingPolicy }}</td>
                                          <td><span class="pill" [attr.data-status]="sub.status">{{ subscriptionStatus(sub.status) }}</span></td>
                                          @if (data.usage) {
                                            <td class="num">{{ usageOf(data, sub) ? compact(usageOf(data, sub)!.calls) : '—' }}</td>
                                            <td class="num">{{ usageOf(data, sub) ? percent(usageOf(data, sub)!.errorRate) : '—' }}</td>
                                          }
                                        </tr>
                                      }
                                    </tbody>
                                  </table>
                                }
                              }
                            }
                            @case ('error') {
                              <p class="detail-msg banner-error" role="alert">Unable to load the subscriptions.</p>
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
            <app-pager [view]="view.table" [window]="window()" noun="applications" />
          }
        }
      }
    </div>
  `,
})
export class ApplicationsPageComponent {
  private readonly catalog = inject(CatalogService);
  readonly store = inject(EnvironmentStore);
  readonly view = inject(ApplicationsView);

  readonly all = signal<Application[]>([]);
  readonly metrics = signal<AppMetricsList | null>(null);
  readonly state = signal<LoadState>('loading');

  readonly hasMetrics = computed(() => {
    const status = this.metrics()?.status;
    return status?.state === 'OK' || (status?.state === 'ERROR' && !!status.lastSuccessAt);
  });

  private readonly byApplicationId = computed(() => {
    const map = new Map<string, AppMetric>();
    this.metrics()?.items.forEach((m) => m.applicationId && map.set(m.applicationId, m));
    return map;
  });

  readonly rows = computed<ApplicationRow[]>(() =>
    this.all().map((app) => {
      const m = this.byApplicationId().get(app.applicationId);
      return { ...app, calls: m?.calls ?? 0, errorRate: m?.errorRate ?? 0 };
    }),
  );

  readonly statuses = computed(() => [...new Set(this.all().map((app) => app.status))].sort());
  readonly window = computed(() => this.view.table.slice(this.view.table.sort(this.view.filter(this.rows()))));

  readonly expansion = new Expansion<ApplicationExpansion>((applicationId) => {
    const environment = this.store.selectedKey();
    return forkJoin({
      subscriptions: this.catalog.subscriptionsOfApplication(environment, applicationId),
      // Les métriques complètent le détail : sans elles (ou en panne), on montre les souscriptions seules.
      usage: this.catalog.applicationMetrics(environment, applicationId, this.store.period()).pipe(
        switchMap((m) => of(m.status.state === 'OK' || (m.status.state === 'ERROR' && m.status.lastSuccessAt) ? m.apis : null)),
        catchError(() => of(null)),
      ),
    });
  }, inject(DestroyRef));

  readonly compact = compactNumber;
  readonly percent = formatPercent;
  readonly int = formatInt;

  private loadedEnvironment = '';
  /** Filtre demandé par un lien (« ?q=nom ») ; appliqué après l'éventuelle remise à zéro du changement d'environnement. */
  private linkQuery: string | null = null;

  constructor() {
    inject(ActivatedRoute)
      .queryParamMap.pipe(takeUntilDestroyed())
      .subscribe((params) => {
        this.linkQuery = params.get('q');
        this.applyLinkQuery();
      });

    combineLatest([toObservable(this.store.selectedKey), toObservable(this.store.refreshTick)])
      .pipe(
        filter(([environment]) => environment !== ''),
        tap(([environment]) => {
          if (environment !== this.loadedEnvironment) {
            this.loadedEnvironment = environment;
            this.view.enter(environment);
            this.applyLinkQuery();
            this.expansion.clear();
            this.all.set([]);
            this.metrics.set(null);
            this.state.set('loading');
          }
        }),
        switchMap(([environment]) =>
          this.catalog.applications(environment).pipe(
            catchError(() => {
              this.state.set('error');
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((applications) => {
        this.all.set(applications);
        this.state.set('ready');
        this.expansion.reload();
      });

    combineLatest([toObservable(this.store.selectedKey), toObservable(this.store.period), toObservable(this.store.refreshTick)])
      .pipe(
        filter(([environment]) => environment !== ''),
        switchMap(([environment, period]) => this.catalog.applicationMetricsList(environment, period).pipe(catchError(() => EMPTY))),
        takeUntilDestroyed(),
      )
      .subscribe((list) => {
        this.metrics.set(list);
        this.expansion.reload();
      });
  }

  private applyLinkQuery(): void {
    if (this.linkQuery !== null) {
      this.view.reset();
      this.view.setQuery(this.linkQuery);
    }
  }

  dataOf(applicationId: string): ApplicationExpansion | null {
    const detail = this.expansion.detail(applicationId);
    return detail?.status === 'ready' ? detail.data : null;
  }

  usageOf(data: ApplicationExpansion, sub: Subscription): Usage | undefined {
    return data.usage?.find((u) => u.apiId === sub.apiId);
  }

  applicationStatus(status: string): string {
    return applicationStatusLabel(status);
  }

  subscriptionStatus(status: string): string {
    return subscriptionStatusLabel(status);
  }

  valueOf(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }
}
