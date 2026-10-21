import { DestroyRef, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';

export type DetailState<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

/**
 * Lignes dépliées d'une liste et leur détail, chargé à l'ouverture. Le rechargement périodique
 * relit les lignes ouvertes sans les vider : pas de clignotement pendant la lecture.
 */
export class Expansion<T> {
  readonly open = signal<ReadonlySet<string>>(new Set());
  readonly details = signal<Readonly<Record<string, DetailState<T>>>>({});

  constructor(
    private readonly load: (id: string) => Observable<T>,
    private readonly destroyRef: DestroyRef,
  ) {}

  isOpen(id: string): boolean {
    return this.open().has(id);
  }

  detail(id: string): DetailState<T> | undefined {
    return this.details()[id];
  }

  toggle(id: string): void {
    const next = new Set(this.open());
    if (next.delete(id)) {
      this.open.set(next);
      return;
    }
    next.add(id);
    this.open.set(next);
    this.fetch(id);
  }

  reload(): void {
    this.open().forEach((id) => this.fetch(id));
  }

  clear(): void {
    this.open.set(new Set());
    this.details.set({});
  }

  private fetch(id: string): void {
    if (this.detail(id)?.status !== 'ready') {
      this.setDetail(id, { status: 'loading' });
    }
    this.load(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        // Réponse tardive d'une ligne refermée (ou d'un autre environnement) : ignorée.
        next: (data) => this.isOpen(id) && this.setDetail(id, { status: 'ready', data }),
        error: () => this.isOpen(id) && this.setDetail(id, { status: 'error' }),
      });
  }

  private setDetail(id: string, state: DetailState<T>): void {
    this.details.update((details) => ({ ...details, [id]: state }));
  }
}
