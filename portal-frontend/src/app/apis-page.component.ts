import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, combineLatest, filter, switchMap, tap } from 'rxjs';
import { Api, ApiMetric, ApiMetricsList, ApiRow } from './api.models';
import { CatalogService } from './catalog.service';
import { CopyButtonComponent } from './copy-button.component';
import { CrossEnvIndex, internalUrl, productionKey } from './cross-env';
import { DetailPanel } from './detail-panel.service';
import { EnvDotsComponent } from './env-path.component';
import { EnvironmentStore, LoadState } from './environment.store';
import { compactNumber, formatInt, formatMs, formatPercent } from './format';
import { I18nService, TranslatePipe } from './i18n';
import { ApisView } from './list-views';
import { MetricsNoticeComponent } from './metrics-notice.component';
import { PagerComponent } from './pager.component';
import { PeriodSwitchComponent } from './period-switch.component';

type Quick = 'all' | 'subs' | 'nosubs' | 'quiet' | 'notprod';

/**
 * APIs de l'environnement sélectionné, avec leur trafic et leur parcours jusqu'à la production. Un clic ouvre le
 * volet de détail à côté de la liste ; l'URL de la gateway interne se copie depuis la ligne.
 */
@Component({
  selector: 'app-apis-page',
  standalone: true,
  imports: [CopyButtonComponent, EnvDotsComponent, MetricsNoticeComponent, PagerComponent, PeriodSwitchComponent, TranslatePipe],
  template: `
    <div class="page-head page-head-row">
      <div>
        <p class="eyebrow">{{ 'Catalog · {n} APIs in {env}' | t: { n: all().length, env: store.selected()?.label ?? '' } }}</p>
        <h1 class="page-title">{{ 'APIs' | t }}</h1>
        <p class="lede">{{ 'Every API in this environment, its traffic and its path to production. Select an API to see its details next to the list; the internal gateway URL can be copied straight from the row.' | t }}</p>
      </div>
      <app-period-switch />
    </div>

    <app-metrics-notice [status]="metrics()?.status" />

    <div class="panel">
      <div class="toolbar">
        <div class="chips" role="group" [attr.aria-label]="'Quick filters' | t">
          @for (chip of chips(); track chip.key) {
            <button type="button" class="chip" [attr.aria-pressed]="quick() === chip.key" (click)="setQuick(chip.key)">
              {{ chip.label | t }} <span class="chip-n">{{ chip.n }}</span>
            </button>
          }
        </div>
        <label class="search">
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
          <input type="search" [attr.aria-label]="'Filter APIs' | t" [placeholder]="'Filter by name or context' | t" [value]="view.query()" (input)="view.setQuery(valueOf($event))" />
        </label>
      </div>

      @switch (state()) {
        @case ('loading') {
          <p class="state-msg">{{ 'Loading APIs…' | t }}</p>
        }
        @case ('error') {
          <p class="state-msg banner banner-error" role="alert">{{ 'Unable to load the APIs.' | t }}</p>
        }
        @default {
          @if (window().total === 0) {
            <p class="state-msg">
              {{ (filtered() ? 'No API matches these filters.' : 'No API in this environment.') | t }}
              @if (filtered()) {
                <button type="button" class="link-btn" (click)="clear()">{{ 'Clear filters' | t }}</button>
              }
            </p>
          } @else {
            <div class="table-wrap" tabindex="0" role="region" [attr.aria-label]="'APIs' | t">
              <table class="list">
                <thead>
                  <tr>
                    <th scope="col" [attr.aria-sort]="view.table.ariaSort('name')"><button type="button" class="sort" (click)="view.table.toggleSort('name')">API <span aria-hidden="true">{{ view.table.arrow('name') }}</span></button></th>
                    <th scope="col">{{ 'Path' | t }}</th>
                    <th scope="col" class="col-ctx" [attr.aria-sort]="view.table.ariaSort('context')"><button type="button" class="sort" (click)="view.table.toggleSort('context')">{{ 'Context' | t }} <span aria-hidden="true">{{ view.table.arrow('context') }}</span></button></th>
                    @if (hasMetrics()) {
                      <th scope="col" class="num" [attr.aria-sort]="view.table.ariaSort('calls')"><button type="button" class="sort" (click)="view.table.toggleSort('calls')">{{ 'Calls' | t }} <span aria-hidden="true">{{ view.table.arrow('calls') }}</span></button></th>
                      <th scope="col" class="num" [attr.aria-sort]="view.table.ariaSort('errorRate')"><button type="button" class="sort" (click)="view.table.toggleSort('errorRate')">{{ 'Errors' | t }} <span aria-hidden="true">{{ view.table.arrow('errorRate') }}</span></button></th>
                      <th scope="col" class="num" [attr.aria-sort]="view.table.ariaSort('p95')"><button type="button" class="sort" (click)="view.table.toggleSort('p95')">{{ 'Latency p95' | t }} <span aria-hidden="true">{{ view.table.arrow('p95') }}</span></button></th>
                    }
                    <th scope="col" class="num" [attr.aria-sort]="view.table.ariaSort('subscribers')"><button type="button" class="sort" (click)="view.table.toggleSort('subscribers')">{{ 'Subscribers' | t }} <span aria-hidden="true">{{ view.table.arrow('subscribers') }}</span></button></th>
                    <th scope="col" class="actions"><span class="sr-only">{{ 'Copy internal URL' | t }}</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (api of window().rows; track api.apiId) {
                    <tr class="row" [class.is-sel]="panel.isSelected(from(api))" (click)="open(api)">
                      <th scope="row">
                        <button type="button" class="linkbtn" [attr.data-panel-from]="from(api)" [attr.aria-expanded]="panel.isSelected(from(api))" (click)="open(api); $event.stopPropagation()">{{ api.name }}</button>
                        <span class="row-sub mono">{{ api.version }}</span>
                      </th>
                      <td><app-env-dots [envs]="store.environments()" [present]="presence(api)" /></td>
                      <td class="mono muted col-ctx">{{ api.context }}</td>
                      @if (hasMetrics()) {
                        <td class="num" [attr.title]="api.calls ? ('{n} calls' | t: { n: int(api.calls) }) : null">{{ api.calls ? compact(api.calls) : '—' }}</td>
                        <td class="num"><span [class.err-hi]="api.calls && api.errorRate >= 0.02">{{ api.calls ? percent(api.errorRate) : '—' }}</span></td>
                        <td class="num">{{ api.calls ? ms(api.p95) : '—' }}</td>
                      }
                      <td class="num">{{ api.subscriptionCount }}</td>
                      <td class="actions">
                        @if (urlOf(api); as url) {
                          <app-copy-button class="rowcopy" [text]="url" caption="Copy internal URL" [hint]="('Internal gateway {env}' | t: { env: store.selected()?.label ?? '' }) + ' : ' + url" [label]="'internal URL of {name}' | t: { name: api.name }" />
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <app-pager [view]="view.table" [window]="window()" [noun]="'APIs' | t" />
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
  readonly panel = inject(DetailPanel);
  private readonly index = inject(CrossEnvIndex);
  private readonly i18n = inject(I18nService);

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

  /** Filtre rapide, en plus de la recherche ; remis à « toutes » au changement d'environnement. */
  readonly quick = signal<Quick>('all');

  private readonly matched = computed(() => this.view.filter(this.rows()));

  readonly chips = computed(() => {
    const rows = this.matched();
    const chips: { key: Quick; label: string; n: number }[] = [
      { key: 'all', label: 'All', n: rows.length },
      { key: 'subs', label: 'With subscribers', n: rows.filter((r) => this.test('subs', r)).length },
      { key: 'nosubs', label: 'No subscribers', n: rows.filter((r) => this.test('nosubs', r)).length },
    ];
    if (this.hasMetrics()) {
      chips.push({ key: 'quiet', label: 'Not called', n: rows.filter((r) => this.test('quiet', r)).length });
    }
    const prod = productionKey(this.store.environments());
    if (this.index.ready() && prod && prod !== this.store.selectedKey()) {
      chips.push({ key: 'notprod', label: 'Not yet in {env}', n: rows.filter((r) => this.test('notprod', r)).length });
    }
    return chips.map((chip) => ({ ...chip, label: chip.key === 'notprod' ? this.i18n.t(chip.label, { env: this.store.labelOf(prod!) }) : chip.label }));
  });

  readonly window = computed(() => this.view.table.slice(this.view.table.sort(this.matched().filter((r) => this.test(this.quick(), r)))));
  readonly filtered = computed(() => this.view.active() || this.quick() !== 'all');

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
            this.quick.set('all');
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

  from(api: Api): string {
    return 'api-' + api.apiId;
  }

  open(api: Api): void {
    this.panel.open({ kind: 'api', env: this.store.selectedKey(), id: api.apiId, name: api.name, version: api.version, from: this.from(api) });
  }

  presence(api: Api): string[] {
    return this.index.presence(api.name);
  }

  urlOf(api: Api): string | null {
    return internalUrl(this.store.selected(), api.context);
  }

  setQuick(key: Quick): void {
    this.quick.set(key);
    this.view.table.page.set(0);
  }

  clear(): void {
    this.view.reset();
    this.quick.set('all');
  }

  private test(key: Quick, row: ApiRow): boolean {
    switch (key) {
      case 'subs':
        return row.subscriptionCount > 0;
      case 'nosubs':
        return row.subscriptionCount === 0;
      case 'quiet':
        return row.calls === 0;
      case 'notprod': {
        const prod = productionKey(this.store.environments());
        return !!prod && !this.index.presence(row.name).includes(prod);
      }
      default:
        return true;
    }
  }

  valueOf(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }
}
