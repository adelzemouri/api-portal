import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { EMPTY, catchError, combineLatest, filter, switchMap, tap } from 'rxjs';
import { AppMetric, AppMetricsList, Application, ApplicationRow } from './api.models';
import { CatalogService } from './catalog.service';
import { DetailPanel } from './detail-panel.service';
import { EnvironmentStore, LoadState } from './environment.store';
import { applicationStatusLabel, compactNumber, formatInt, formatPercent } from './format';
import { TranslatePipe } from './i18n';
import { ApplicationsView } from './list-views';
import { MetricsNoticeComponent } from './metrics-notice.component';
import { PagerComponent } from './pager.component';
import { PeriodSwitchComponent } from './period-switch.component';

/**
 * Applications de l'environnement sélectionné, tous propriétaires (Admin API WSO2, via le BFF), avec leur trafic :
 * recherche, filtres, tri, pagination. Un clic ouvre le volet de détail (API souscrites) à côté de la liste.
 */
@Component({
  selector: 'app-applications-page',
  standalone: true,
  imports: [MetricsNoticeComponent, PagerComponent, PeriodSwitchComponent, TranslatePipe],
  template: `
    <div class="page-head page-head-row">
      <div>
        <p class="eyebrow">{{ '{n} applications in {env}' | t: { n: all().length, env: store.selected()?.label ?? '' } }}</p>
        <h1 class="page-title">{{ 'Applications' | t }}</h1>
        <p class="lede">{{ 'Every application registered in this environment, whoever owns it. Select one to see the APIs it consumes next to the list.' | t }}</p>
      </div>
      <app-period-switch />
    </div>

    <app-metrics-notice [status]="metrics()?.status" />

    <div class="panel">
      <div class="toolbar">
        <div class="chips" role="group" [attr.aria-label]="'Quick filters' | t">
          <button type="button" class="chip" [attr.aria-pressed]="view.subscribers() === 'all' && view.traffic() === 'all' && !view.status()" (click)="quick('all')">{{ 'All' | t }} <span class="chip-n">{{ all().length }}</span></button>
          <button type="button" class="chip" [attr.aria-pressed]="view.subscribers() === 'with'" (click)="quick('with')">{{ 'With subscriptions' | t }}</button>
          <button type="button" class="chip" [attr.aria-pressed]="view.subscribers() === 'without'" (click)="quick('without')">{{ 'No subscriptions' | t }}</button>
          @if (hasMetrics()) {
            <button type="button" class="chip" [attr.aria-pressed]="view.traffic() === 'without'" (click)="quick('quiet')">{{ 'No call' | t }}</button>
          }
        </div>
        <div class="toolbar-end">
          <label class="filter">
            <span>{{ 'Status' | t }}</span>
            <select [value]="view.status()" (change)="view.setStatus(valueOf($event))">
              <option value="">{{ 'All' | t }}</option>
              @for (status of statuses(); track status) {
                <option [value]="status" [selected]="status === view.status()">{{ applicationStatus(status) }}</option>
              }
            </select>
          </label>
          <label class="search">
            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
            <input type="search" [attr.aria-label]="'Filter applications' | t" [placeholder]="'Filter by application or owner' | t" [value]="view.query()" (input)="view.setQuery(valueOf($event))" />
          </label>
        </div>
      </div>

      @switch (state()) {
        @case ('loading') {
          <p class="state-msg">{{ 'Loading applications…' | t }}</p>
        }
        @case ('error') {
          <p class="state-msg banner banner-error" role="alert">{{ 'Unable to load the applications.' | t }}</p>
        }
        @default {
          @if (window().total === 0) {
            <p class="state-msg">
              {{ (view.active() ? 'No application matches these filters.' : 'No application in this environment.') | t }}
              @if (view.active()) {
                <button type="button" class="link-btn" (click)="view.reset()">{{ 'Clear filters' | t }}</button>
              }
            </p>
          } @else {
            <div class="table-wrap" tabindex="0" role="region" [attr.aria-label]="'Applications' | t">
              <table class="list">
                <thead>
                  <tr>
                    <th scope="col" [attr.aria-sort]="view.table.ariaSort('name')"><button type="button" class="sort" (click)="view.table.toggleSort('name')">{{ 'Name' | t }} <span aria-hidden="true">{{ view.table.arrow('name') }}</span></button></th>
                    <th scope="col" [attr.aria-sort]="view.table.ariaSort('owner')"><button type="button" class="sort" (click)="view.table.toggleSort('owner')">{{ 'Owner' | t }} <span aria-hidden="true">{{ view.table.arrow('owner') }}</span></button></th>
                    <th scope="col" [attr.aria-sort]="view.table.ariaSort('status')"><button type="button" class="sort" (click)="view.table.toggleSort('status')">{{ 'Status' | t }} <span aria-hidden="true">{{ view.table.arrow('status') }}</span></button></th>
                    @if (hasMetrics()) {
                      <th scope="col" class="num" [attr.aria-sort]="view.table.ariaSort('calls')"><button type="button" class="sort" (click)="view.table.toggleSort('calls')">{{ 'Calls' | t }} <span aria-hidden="true">{{ view.table.arrow('calls') }}</span></button></th>
                      <th scope="col" class="num" [attr.aria-sort]="view.table.ariaSort('errorRate')"><button type="button" class="sort" (click)="view.table.toggleSort('errorRate')">{{ 'Errors' | t }} <span aria-hidden="true">{{ view.table.arrow('errorRate') }}</span></button></th>
                    }
                    <th scope="col" class="num" [attr.aria-sort]="view.table.ariaSort('subscribers')"><button type="button" class="sort" (click)="view.table.toggleSort('subscribers')">{{ 'Subscribed APIs' | t }} <span aria-hidden="true">{{ view.table.arrow('subscribers') }}</span></button></th>
                  </tr>
                </thead>
                <tbody>
                  @for (app of window().rows; track app.applicationId) {
                    <tr class="row" [class.is-sel]="panel.isSelected(from(app))" (click)="open(app)">
                      <th scope="row">
                        <button type="button" class="linkbtn" [attr.data-panel-from]="from(app)" [attr.aria-expanded]="panel.isSelected(from(app))" (click)="open(app); $event.stopPropagation()">{{ app.name }}</button>
                      </th>
                      <td>{{ app.owner ?? '—' }}</td>
                      <td><span class="pill" [attr.data-status]="app.status">{{ applicationStatus(app.status) }}</span></td>
                      @if (hasMetrics()) {
                        <td class="num" [attr.title]="app.calls ? ('{n} calls' | t: { n: int(app.calls) }) : null">{{ app.calls ? compact(app.calls) : '—' }}</td>
                        <td class="num"><span [class.err-hi]="app.calls && app.errorRate >= 0.02">{{ app.calls ? percent(app.errorRate) : '—' }}</span></td>
                      }
                      <td class="num">{{ app.subscriptionCount }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <app-pager [view]="view.table" [window]="window()" [noun]="'applications' | t" />
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
  readonly panel = inject(DetailPanel);

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
      });

    combineLatest([toObservable(this.store.selectedKey), toObservable(this.store.period), toObservable(this.store.refreshTick)])
      .pipe(
        filter(([environment]) => environment !== ''),
        switchMap(([environment, period]) => this.catalog.applicationMetricsList(environment, period).pipe(catchError(() => EMPTY))),
        takeUntilDestroyed(),
      )
      .subscribe((list) => this.metrics.set(list));
  }

  private applyLinkQuery(): void {
    if (this.linkQuery !== null) {
      this.view.reset();
      this.view.setQuery(this.linkQuery);
    }
  }

  from(app: Application): string {
    return 'app-' + app.applicationId;
  }

  open(app: Application): void {
    this.panel.open({ kind: 'app', env: this.store.selectedKey(), id: app.applicationId, name: app.name, owner: app.owner, status: app.status, from: this.from(app) });
  }

  quick(kind: 'all' | 'with' | 'without' | 'quiet'): void {
    this.view.setStatus('');
    this.view.setSubscribers(kind === 'with' || kind === 'without' ? kind : 'all');
    this.view.setTraffic(kind === 'quiet' ? 'without' : 'all');
  }

  applicationStatus(status: string): string {
    return applicationStatusLabel(status);
  }

  valueOf(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }
}
