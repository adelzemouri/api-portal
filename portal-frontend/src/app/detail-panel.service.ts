import { Injectable, computed, inject, signal } from '@angular/core';
import { toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, skip } from 'rxjs';
import { EnvironmentStore } from './environment.store';

/**
 * Élément affiché dans le volet. id : identifiant dans l'environnement env ; null quand il reste à retrouver
 * par son nom (après un changement d'environnement). from : ligne d'origine, mise en surbrillance.
 */
export interface PanelApi {
  kind: 'api';
  env: string;
  id: string | null;
  name: string;
  version: string;
  from?: string;
}

export interface PanelApp {
  kind: 'app';
  env: string;
  id: string | null;
  name: string;
  owner?: string | null;
  status?: string;
  from?: string;
}

export type PanelItem = PanelApi | PanelApp;

/**
 * Volet de détail non bloquant : une pile (API → application → API…) avec retour arrière. Il suit le sélecteur
 * d'environnement de l'en-tête : au changement, chaque élément est recherché par son nom dans le nouvel environnement.
 */
@Injectable({ providedIn: 'root' })
export class DetailPanel {
  private readonly store = inject(EnvironmentStore);

  readonly stack = signal<PanelItem[]>([]);
  readonly current = computed(() => this.stack().at(-1) ?? null);
  readonly isOpen = computed(() => this.stack().length > 0);
  /** Ligne d'origine du volet : elle reste en surbrillance tant qu'il est ouvert. */
  readonly origin = computed(() => this.stack()[0]?.from ?? null);

  constructor() {
    toObservable(this.store.selectedKey)
      .pipe(distinctUntilChanged(), skip(1), takeUntilDestroyed())
      .subscribe((env) => this.retarget(env));
  }

  /** Ouvre le volet sur un élément ; un clic sur la même ligne le referme. */
  open(item: PanelItem): void {
    const first = this.stack()[0];
    if (this.stack().length === 1 && first?.from && first.from === item.from) {
      this.close();
      return;
    }
    this.stack.set([item]);
  }

  /** Empile un élément lié (application d'une souscription, API d'une application). */
  push(item: PanelItem): void {
    this.stack.update((stack) => [...stack, { ...item, from: undefined }]);
  }

  back(): void {
    this.stack.update((stack) => stack.slice(0, -1));
  }

  close(): void {
    this.stack.set([]);
  }

  isSelected(from: string): boolean {
    return this.origin() === from;
  }

  /** Remplace l'élément courant une fois retrouvé dans l'environnement (identifiant connu). */
  resolve(item: PanelItem): void {
    this.stack.update((stack) => (stack.length ? [...stack.slice(0, -1), item] : stack));
  }

  private retarget(env: string): void {
    if (this.stack().length) {
      this.stack.update((stack) => stack.map((item) => (item.env === env ? item : { ...item, env, id: null })));
    }
  }
}
