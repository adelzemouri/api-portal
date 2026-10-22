import { HttpErrorResponse } from '@angular/common/http';
import { Component, HostListener, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { EMPTY, Observable, catchError, distinctUntilChanged, forkJoin, map, of, switchMap, tap } from 'rxjs';
import { ApiDetail, ApiMetrics, ApplicationMetrics, MetricsStatus, Subscription, Usage } from './api.models';
import { CatalogService } from './catalog.service';
import { CopyButtonComponent } from './copy-button.component';
import { internalUrl } from './cross-env';
import { DetailPanel, PanelApi, PanelApp, PanelItem } from './detail-panel.service';
import { EnvPathComponent } from './env-path.component';
import { EnvironmentStore } from './environment.store';
import {
  applicationStatusLabel,
  compactNumber,
  formatDateTime,
  formatMs,
  formatPercent,
  subscriptionStatusLabel,
} from './format';
import { I18nService, TranslatePipe } from './i18n';

type PanelState = 'loading' | 'ready' | 'absent' | 'error';

interface ApiData {
  kind: 'api';
  detail: ApiDetail;
  subscriptions: Subscription[];
  metrics: ApiMetrics | null;
}

interface AppData {
  kind: 'app';
  subscriptions: Subscription[];
  metrics: ApplicationMetrics | null;
}

/** Des chiffres à montrer : lecture réussie, ou dernière lecture réussie conservée pendant une panne. */
const usable = (status: MetricsStatus | undefined): boolean =>
  status?.state === 'OK' || (status?.state === 'ERROR' && !!status.lastSuccessAt);

/**
 * Volet de détail, à droite de la page : la liste reste visible (et la ligne d'origine en surbrillance), un clic sur
 * une autre ligne remplace le contenu. Toutes les sections sont affichées d'un bloc, sans onglets.
 */
@Component({
  selector: 'app-detail-panel',
  standalone: true,
  imports: [CopyButtonComponent, EnvPathComponent, RouterLink, TranslatePipe],
  template: `
    @if (item(); as it) {
      <aside class="drawer" [attr.aria-labelledby]="'drawer-title'" [attr.data-kind]="it.kind">
        <header class="drawer-head">
          @if (panel.stack().length > 1) {
            <button type="button" class="icon-btn" (click)="panel.back()" [attr.aria-label]="'Back' | t" [attr.title]="'Back' | t">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
            </button>
          }
          <div class="drawer-titles">
            <p class="eyebrow">{{ (it.kind === 'api' ? 'API' : 'Application') | t }} · {{ store.labelOf(it.env) }}</p>
            <h2 id="drawer-title" tabindex="-1">{{ it.name }}</h2>
            @if (it.kind === 'api') {
              <p class="mono muted drawer-sub">{{ it.version }}{{ apiData()?.detail?.api?.context ? ' · ' + apiData()!.detail.api.context : '' }}</p>
            } @else if (it.owner) {
              <p class="muted drawer-sub">{{ 'Owner: {name}' | t: { name: it.owner } }}</p>
            }
          </div>
          <button type="button" class="icon-btn" (click)="close()" [attr.aria-label]="'Close the panel' | t" [attr.title]="'Close the panel' | t">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </header>

        <div class="drawer-body" role="region" [attr.aria-label]="it.name">
          @switch (state()) {
            @case ('loading') {
              <p class="state-msg">{{ 'Loading…' | t }}</p>
            }
            @case ('absent') {
              <p class="drawer-absent" role="status">
                {{ (it.kind === 'api' ? '{name} is not deployed in {env}.' : '{name} does not exist in {env}.') | t: { name: it.name, env: store.labelOf(it.env) } }}
              </p>
              <p class="muted">{{ 'Choose another environment in the header.' | t }}</p>
            }
            @case ('error') {
              <p class="banner banner-error" role="alert">{{ 'Unable to load the details.' | t }}</p>
            }
            @default {
              @if (apiData(); as data) {
                <div class="drawer-actions">
                  <a class="btn btn-primary" [routerLink]="['/apis', it.env, it.id]">{{ 'Open the full page' | t }}</a>
                  @if (apiUrl(); as url) {
                    <app-copy-button [text]="url" caption="Copy internal URL" [hint]="url" [label]="'internal gateway URL' | t" />
                  }
                </div>

                <section class="drawer-section" aria-labelledby="dp-path">
                  <h3 id="dp-path" class="eyebrow">{{ 'Path to production' | t }}</h3>
                  <app-env-path [presence]="data.detail.environments" [current]="it.env" (pick)="store.select($event)" />
                </section>

                <section class="drawer-section" aria-labelledby="dp-traffic">
                  <h3 id="dp-traffic" class="eyebrow">{{ 'Traffic' | t }} · {{ (store.period() === '24h' ? 'last 24 hours' : 'last 7 days') | t }}</h3>
                  @if (!usable(data.metrics?.status)) {
                    <p class="muted">{{ 'No traffic figures for this environment.' | t }}</p>
                  } @else if (!data.metrics?.metrics) {
                    <p class="muted">{{ 'No call recorded on this API in the period.' | t }}</p>
                  } @else {
                    <div class="mini-kpis">
                      <div><span>{{ 'Calls' | t }}</span><strong>{{ compact(data.metrics!.metrics!.calls) }}</strong></div>
                      <div [class.bad]="data.metrics!.metrics!.errorRate >= 0.02"><span>{{ 'Error rate' | t }}</span><strong>{{ percent(data.metrics!.metrics!.errorRate) }}</strong></div>
                      <div><span>{{ 'Latency p95' | t }}</span><strong>{{ ms(data.metrics!.metrics!.p95LatencyMs) }}</strong></div>
                    </div>
                  }
                </section>

                <section class="drawer-section" aria-labelledby="dp-endpoints">
                  <h3 id="dp-endpoints" class="eyebrow">{{ 'Endpoints' | t }}</h3>
                  @if (data.detail.gatewayUrls.length === 0) {
                    <p class="muted">{{ 'No gateway serves this API yet: deploy a revision to get its URL.' | t }}</p>
                  } @else {
                    <ul class="url-list">
                      @for (u of data.detail.gatewayUrls; track u.gateway + u.url) {
                        <li>
                          <span class="gw-name">{{ u.gateway }}</span>
                          <span class="url mono">{{ u.url }}</span>
                          <app-copy-button [text]="u.url" [label]="'{gateway} URL' | t: { gateway: u.gateway }" />
                        </li>
                      }
                    </ul>
                  }
                </section>

                <section class="drawer-section" aria-labelledby="dp-consumers">
                  <h3 id="dp-consumers" class="eyebrow">{{ 'Consumers ({n})' | t: { n: data.subscriptions.length } }}</h3>
                  @if (data.subscriptions.length === 0) {
                    <p class="muted">{{ 'No application is subscribed to this API.' | t }}</p>
                  } @else {
                    <ul class="drawer-list">
                      @for (sub of data.subscriptions; track sub.subscriptionId) {
                        <li>
                          @if (sub.applicationId) {
                            <button type="button" class="linkbtn" (click)="openApp(sub)">{{ sub.applicationName ?? '—' }}</button>
                          } @else {
                            <span>{{ sub.applicationName ?? '—' }}</span>
                          }
                          <span class="muted">{{ sub.applicationOwner ?? '—' }} · {{ sub.throttlingPolicy }}</span>
                          <span class="pill" [attr.data-status]="sub.status">{{ subStatus(sub.status) }}</span>
                          @if (consumerCalls(data, sub); as calls) {
                            <span class="num">{{ compact(calls) }}</span>
                          }
                        </li>
                      }
                    </ul>
                  }
                </section>

                <section class="drawer-section" aria-labelledby="dp-deploy">
                  <h3 id="dp-deploy" class="eyebrow">{{ 'Deployment' | t }}</h3>
                  @if (data.detail.revisions.length === 0) {
                    <p class="muted">{{ 'No revision is deployed on a gateway.' | t }}</p>
                  }
                  @for (revision of data.detail.revisions; track revision.id) {
                    <p class="revision">
                      <strong>{{ revision.name }}</strong>
                      <span class="muted">{{ 'created {date}' | t: { date: date(revision.createdTime) } }}</span>
                    </p>
                    <ul class="gateways">
                      @for (gateway of revision.gateways; track gateway.name) {
                        <li>
                          <span class="gw-name">{{ gateway.name }}</span>
                          <span class="mono muted">{{ gateway.vhost }}</span>
                          <span class="muted">{{ date(gateway.deployedTime) }}</span>
                        </li>
                      }
                    </ul>
                  }
                </section>
              }

              @if (appData(); as data) {
                @if (appInfo()?.status; as status) {
                  <div class="drawer-actions">
                    <span class="pill" [attr.data-status]="status">{{ appStatus(status) }}</span>
                  </div>
                }

                <section class="drawer-section" aria-labelledby="dp-app-traffic">
                  <h3 id="dp-app-traffic" class="eyebrow">{{ 'Traffic' | t }} · {{ (store.period() === '24h' ? 'last 24 hours' : 'last 7 days') | t }}</h3>
                  @if (!usable(data.metrics?.status)) {
                    <p class="muted">{{ 'No traffic figures for this environment.' | t }}</p>
                  } @else if (!data.metrics?.metrics) {
                    <p class="muted">{{ 'No call from this application in the period.' | t }}</p>
                  } @else {
                    <div class="mini-kpis">
                      <div><span>{{ 'Calls' | t }}</span><strong>{{ compact(data.metrics!.metrics!.calls) }}</strong></div>
                      <div [class.bad]="data.metrics!.metrics!.errorRate >= 0.02"><span>{{ 'Error rate' | t }}</span><strong>{{ percent(data.metrics!.metrics!.errorRate) }}</strong></div>
                    </div>
                  }
                </section>

                <section class="drawer-section" aria-labelledby="dp-subs">
                  <h3 id="dp-subs" class="eyebrow">{{ 'Subscribed APIs ({n})' | t: { n: data.subscriptions.length } }}</h3>
                  @if (data.subscriptions.length === 0) {
                    <p class="muted">{{ 'This application is not subscribed to any API.' | t }}</p>
                  } @else {
                    <ul class="drawer-list">
                      @for (sub of data.subscriptions; track sub.subscriptionId) {
                        <li>
                          <button type="button" class="linkbtn" (click)="openApi(sub)">{{ sub.apiName }}</button>
                          <span class="mono muted">{{ sub.apiVersion }} · {{ sub.throttlingPolicy }}</span>
                          <span class="pill" [attr.data-status]="sub.status">{{ subStatus(sub.status) }}</span>
                          @if (apiCalls(data, sub); as calls) {
                            <span class="num">{{ compact(calls) }}</span>
                          }
                        </li>
                      }
                    </ul>
                  }
                </section>
              }
            }
          }
        </div>
      </aside>
    }
  `,
})
export class DetailPanelComponent {
  readonly panel = inject(DetailPanel);
  readonly store = inject(EnvironmentStore);
  private readonly catalog = inject(CatalogService);
  private readonly i18n = inject(I18nService);

  readonly item = this.panel.current;
  readonly state = signal<PanelState>('loading');
  readonly apiData = signal<ApiData | null>(null);
  readonly appData = signal<AppData | null>(null);

  /** Propriétaire et statut de l'application affichée ; complétés quand on la retrouve par son nom. */
  readonly appInfo = computed(() => {
    const it = this.item();
    return it?.kind === 'app' ? { owner: it.owner ?? null, status: it.status ?? '' } : null;
  });

  readonly apiUrl = computed(() => {
    const it = this.item();
    const data = this.apiData();
    if (it?.kind !== 'api' || !data) {
      return null;
    }
    return internalUrl(this.store.environments().find((env) => env.key === it.env), data.detail.api.context);
  });

  readonly compact = compactNumber;
  readonly percent = formatPercent;
  readonly ms = formatMs;
  readonly usable = usable;

  private loadedKey = '';
  private lastOrigin: string | null = null;

  constructor() {
    const request = computed(() => ({ item: this.item(), period: this.store.period(), tick: this.store.refreshTick() }));
    toObservable(request)
      .pipe(
        distinctUntilChanged((a, b) => a.item === b.item && a.period === b.period && a.tick === b.tick),
        tap(({ item }) => {
          const key = item ? `${item.kind}/${item.env}/${item.id ?? item.name}` : '';
          if (key !== this.loadedKey) {
            this.loadedKey = key;
            this.apiData.set(null);
            this.appData.set(null);
            this.state.set('loading');
          }
        }),
        switchMap(({ item, period }) => (item ? this.load(item, period) : EMPTY)),
        takeUntilDestroyed(),
      )
      .subscribe((data) => {
        if (data.kind === 'api') {
          this.apiData.set(data);
          this.appData.set(null);
        } else {
          this.appData.set(data);
          this.apiData.set(null);
        }
        this.state.set('ready');
      });

    // Focus sur le titre à l'ouverture (clavier, lecteur d'écran) ; retour à la ligne d'origine à la fermeture.
    effect(() => {
      const open = this.panel.isOpen();
      const origin = this.panel.origin();
      untracked(() => {
        if (open) {
          setTimeout(() => document.getElementById('drawer-title')?.focus({ preventScroll: true }));
          this.lastOrigin = origin;
        } else if (this.lastOrigin) {
          const from = this.lastOrigin;
          this.lastOrigin = null;
          setTimeout(() => (document.querySelector(`[data-panel-from="${CSS.escape(from)}"]`) as HTMLElement | null)?.focus());
        }
      });
    });
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    // La recherche (fenêtre modale) traite Échap en premier.
    if (this.panel.isOpen() && !event.defaultPrevented && !document.querySelector('.palette')) {
      this.close();
    }
  }

  close(): void {
    this.panel.close();
  }

  openApp(sub: Subscription): void {
    this.panel.push({ kind: 'app', env: sub.environment, id: sub.applicationId, name: sub.applicationName ?? '—', owner: sub.applicationOwner });
  }

  openApi(sub: Subscription): void {
    this.panel.push({ kind: 'api', env: sub.environment, id: sub.apiId, name: sub.apiName, version: sub.apiVersion });
  }

  consumerCalls(data: ApiData, sub: Subscription): number {
    if (!usable(data.metrics?.status)) {
      return 0;
    }
    const usage = data.metrics?.consumers.find(
      (c) => (c.applicationId && c.applicationId === sub.applicationId) || (!c.applicationId && c.applicationName === sub.applicationName),
    );
    return usage?.calls ?? 0;
  }

  apiCalls(data: AppData, sub: Subscription): number {
    if (!usable(data.metrics?.status)) {
      return 0;
    }
    return data.metrics?.apis.find((u: Usage) => u.apiId === sub.apiId)?.calls ?? 0;
  }

  subStatus(status: string): string {
    return subscriptionStatusLabel(status);
  }

  appStatus(status: string): string {
    return applicationStatusLabel(status);
  }

  date(iso: string): string {
    return formatDateTime(iso);
  }

  private load(item: PanelItem, period: '24h' | '7d'): Observable<ApiData | AppData> {
    if (item.id === null) {
      // Changement d'environnement : on retrouve l'élément par son nom, puis le volet se recharge avec son identifiant.
      return this.find(item).pipe(
        tap((found) => (found ? this.panel.resolve(found) : this.state.set('absent'))),
        switchMap(() => EMPTY),
        catchError(() => {
          this.state.set('error');
          return EMPTY;
        }),
      );
    }
    const failed = (error: unknown) => {
      this.state.set(error instanceof HttpErrorResponse && error.status === 404 ? 'absent' : 'error');
      return EMPTY;
    };
    if (item.kind === 'api') {
      return forkJoin({
        detail: this.catalog.apiDetail(item.env, item.id),
        subscriptions: this.catalog.subscriptionsOfApi(item.env, item.id),
        metrics: this.catalog.apiMetrics(item.env, item.id, period).pipe(catchError(() => of(null))),
      }).pipe(
        map((data) => ({ kind: 'api' as const, ...data })),
        catchError(failed),
      );
    }
    return forkJoin({
      subscriptions: this.catalog.subscriptionsOfApplication(item.env, item.id),
      metrics: this.catalog.applicationMetrics(item.env, item.id, period).pipe(catchError(() => of(null))),
    }).pipe(
      map((data) => ({ kind: 'app' as const, ...data })),
      catchError(failed),
    );
  }

  private find(item: PanelItem): Observable<PanelItem | null> {
    if (item.kind === 'api') {
      return this.catalog.apis(item.env).pipe(
        map((apis) => {
          const same = apis.filter((api) => api.name === item.name);
          const match = same.find((api) => api.version === item.version) ?? same[0];
          return match ? ({ ...item, id: match.apiId, version: match.version } satisfies PanelApi) : null;
        }),
      );
    }
    return this.catalog.applications(item.env).pipe(
      map((apps) => {
        const match = apps.find((app) => app.name === item.name);
        return match ? ({ ...item, id: match.applicationId, owner: match.owner, status: match.status } satisfies PanelApp) : null;
      }),
    );
  }
}
