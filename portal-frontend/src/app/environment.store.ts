import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { CatalogService } from './catalog.service';
import { Environment, Period, PortalInfo } from './api.models';

export type LoadState = 'loading' | 'ready' | 'error';

/**
 * État partagé : environnement sélectionné, statut de synchro de chaque environnement, horloge d'affichage
 * et signal d'actualisation auquel les cartes se rattachent.
 */
@Injectable({ providedIn: 'root' })
export class EnvironmentStore {
  private readonly catalog = inject(CatalogService);

  readonly environments = signal<Environment[]>([]);
  readonly state = signal<LoadState>('loading');
  /** Clé de l'environnement affiché ; vide tant que la liste n'est pas chargée. */
  readonly selectedKey = signal('');
  readonly selected = computed(() => this.environments().find((env) => env.key === this.selectedKey()));
  /** Incrémenté à chaque actualisation : les pages rechargent leurs données. */
  readonly refreshTick = signal(0);
  readonly now = signal(Date.now());
  /** Informations communes aux environnements (composant de déploiement) ; vides tant que non chargées. */
  readonly portal = signal<PortalInfo>({ deployComponentUrl: null });
  /** Période des métriques, commune à toutes les pages. */
  readonly period = signal<Period>('24h');
  /** Vrai quand le BFF tourne en profil « mock » (données factices). */
  readonly demoMode = signal(false);

  constructor() {
    this.load();
    this.catalog.portal().subscribe({
      next: (portal) => this.portal.set(portal),
      error: () => this.portal.set({ deployComponentUrl: null }),
    });
    this.catalog.info().subscribe({
      next: (info) => this.demoMode.set(info.portal?.mode === 'mock'),
      error: () => this.demoMode.set(false),
    });

    // Lecture du store du BFF uniquement : aucun appel WSO2 n'est déclenché par ces actualisations.
    const clock = setInterval(() => this.now.set(Date.now()), 30_000);
    const poll = setInterval(() => this.refresh(), 60_000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(clock);
      clearInterval(poll);
    });
  }

  refresh(): void {
    this.now.set(Date.now());
    this.refreshTick.update((tick) => tick + 1);
    this.load();
  }

  setPeriod(period: Period): void {
    this.period.set(period);
  }

  select(key: string): void {
    this.selectedKey.set(key);
  }

  labelOf(key: string): string {
    return this.environments().find((env) => env.key === key)?.label ?? key.toUpperCase();
  }

  private load(): void {
    this.catalog.environments().subscribe({
      next: (environments) => {
        this.environments.set(environments);
        if (!environments.some((env) => env.key === this.selectedKey())) {
          this.selectedKey.set(environments[0]?.key ?? '');
        }
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
