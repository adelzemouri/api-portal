import { Injectable, signal } from '@angular/core';
import { ApiRow, ApplicationRow } from './api.models';
import { TableView, natural } from './table-view';

export type Presence = 'all' | 'with' | 'without';

const asPresence = (value: string): Presence => (value === 'with' || value === 'without' ? value : 'all');

/**
 * État des filtres et du tri des listes. Vit dans un service racine : on retrouve sa recherche et sa page en
 * revenant d'une fiche d'API. Remis à zéro quand on change d'environnement (les valeurs proposées diffèrent).
 */
abstract class ListView<T> {
  readonly query = signal('');
  readonly status = signal('');
  readonly subscribers = signal<Presence>('all');
  /** Avec ou sans appel sur la période (sans effet quand les métriques ne sont pas disponibles). */
  readonly traffic = signal<Presence>('all');
  abstract readonly table: TableView<T>;
  environment = '';

  setQuery(value: string): void {
    this.query.set(value);
    this.table.page.set(0);
  }

  setStatus(value: string): void {
    this.status.set(value);
    this.table.page.set(0);
  }

  setSubscribers(value: string): void {
    this.subscribers.set(asPresence(value));
    this.table.page.set(0);
  }

  setTraffic(value: string): void {
    this.traffic.set(asPresence(value));
    this.table.page.set(0);
  }

  active(): boolean {
    return !!this.query().trim() || !!this.status() || this.subscribers() !== 'all' || this.traffic() !== 'all';
  }

  reset(): void {
    this.query.set('');
    this.status.set('');
    this.subscribers.set('all');
    this.traffic.set('all');
    this.table.page.set(0);
  }

  /** À appeler à chaque chargement : repart de zéro si l'environnement a changé. */
  enter(environment: string): void {
    if (this.environment !== environment) {
      this.environment = environment;
      this.reset();
    }
  }

  protected matchesSubscribers(count: number): boolean {
    return this.subscribers() === 'all' || (this.subscribers() === 'with' ? count > 0 : count === 0);
  }

  protected matchesTraffic(calls: number): boolean {
    return this.traffic() === 'all' || (this.traffic() === 'with' ? calls > 0 : calls === 0);
  }
}

@Injectable({ providedIn: 'root' })
export class ApisView extends ListView<ApiRow> {
  readonly type = signal('');
  readonly table = new TableView<ApiRow>(
    {
      name: (a, b) => natural(a.name, b.name) || natural(a.version, b.version),
      version: (a, b) => natural(a.version, b.version) || natural(a.name, b.name),
      context: (a, b) => natural(a.context, b.context),
      calls: (a, b) => a.calls - b.calls || natural(a.name, b.name),
      errorRate: (a, b) => a.errorRate - b.errorRate || natural(a.name, b.name),
      p95: (a, b) => a.p95 - b.p95 || natural(a.name, b.name),
      subscribers: (a, b) => a.subscriptionCount - b.subscriptionCount || natural(a.name, b.name),
    },
    'name',
  );

  setType(value: string): void {
    this.type.set(value);
    this.table.page.set(0);
  }

  override active(): boolean {
    return super.active() || !!this.type();
  }

  override reset(): void {
    super.reset();
    this.type.set('');
  }

  filter(rows: readonly ApiRow[]): ApiRow[] {
    const needle = this.query().trim().toLowerCase();
    return rows.filter(
      (api) =>
        (!needle || `${api.name} ${api.context}`.toLowerCase().includes(needle)) &&
        (!this.status() || api.lifeCycleStatus === this.status()) &&
        (!this.type() || api.type === this.type()) &&
        this.matchesSubscribers(api.subscriptionCount) &&
        this.matchesTraffic(api.calls),
    );
  }
}

@Injectable({ providedIn: 'root' })
export class ApplicationsView extends ListView<ApplicationRow> {
  readonly table = new TableView<ApplicationRow>(
    {
      name: (a, b) => natural(a.name, b.name),
      owner: (a, b) => natural(a.owner, b.owner) || natural(a.name, b.name),
      status: (a, b) => natural(a.status, b.status) || natural(a.name, b.name),
      calls: (a, b) => a.calls - b.calls || natural(a.name, b.name),
      errorRate: (a, b) => a.errorRate - b.errorRate || natural(a.name, b.name),
      subscribers: (a, b) => a.subscriptionCount - b.subscriptionCount || natural(a.name, b.name),
    },
    'name',
  );

  filter(rows: readonly ApplicationRow[]): ApplicationRow[] {
    const needle = this.query().trim().toLowerCase();
    return rows.filter(
      (app) =>
        (!needle || `${app.name} ${app.owner ?? ''}`.toLowerCase().includes(needle)) &&
        (!this.status() || app.status === this.status()) &&
        this.matchesSubscribers(app.subscriptionCount) &&
        this.matchesTraffic(app.calls),
    );
  }
}
