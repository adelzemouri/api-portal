import { Signal, WritableSignal, signal } from '@angular/core';

export type SortDirection = 'asc' | 'desc';
export const PAGE_SIZES = [10, 25, 50, 100];

export interface PageWindow<T> {
  rows: T[];
  /** 1-based, 0 quand la liste est vide. */
  from: number;
  to: number;
  total: number;
  /** Page effective (bornée) et nombre de pages. */
  page: number;
  pageCount: number;
}

/** Ce dont le pied de liste a besoin : indépendant du type des lignes. */
export interface Pageable {
  readonly page: WritableSignal<number>;
  readonly pageSize: Signal<number>;
  setPageSize(size: number): void;
}

/** Tri par colonne et pagination d'une liste déjà filtrée. Ne connaît ni les données ni le réseau. */
export class TableView<T> {
  readonly sortKey;
  readonly direction = signal<SortDirection>('asc');
  readonly page = signal(0);
  readonly pageSize = signal(25);

  constructor(
    private readonly comparators: Record<string, (a: T, b: T) => number>,
    defaultKey: string,
  ) {
    this.sortKey = signal(defaultKey);
  }

  sort(rows: readonly T[]): T[] {
    const compare = this.comparators[this.sortKey()];
    const factor = this.direction() === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => factor * compare(a, b));
  }

  slice(sorted: readonly T[]): PageWindow<T> {
    const size = this.pageSize();
    const pageCount = Math.max(1, Math.ceil(sorted.length / size));
    const page = Math.min(this.page(), pageCount - 1);
    const start = page * size;
    const rows = sorted.slice(start, start + size);
    return { rows, from: rows.length ? start + 1 : 0, to: start + rows.length, total: sorted.length, page, pageCount };
  }

  toggleSort(key: string): void {
    if (this.sortKey() === key) {
      this.direction.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortKey.set(key);
      this.direction.set('asc');
    }
    this.page.set(0);
  }

  ariaSort(key: string): 'ascending' | 'descending' | 'none' {
    if (this.sortKey() !== key) {
      return 'none';
    }
    return this.direction() === 'asc' ? 'ascending' : 'descending';
  }

  arrow(key: string): string {
    return this.sortKey() !== key ? '' : this.direction() === 'asc' ? '↑' : '↓';
  }

  setPageSize(size: number): void {
    this.pageSize.set(size);
    this.page.set(0);
  }
}

/** Comparaison naturelle : « 1.3 » avant « 1.10 », insensible à la casse. */
export const natural = (a: string | null | undefined, b: string | null | undefined): number =>
  (a ?? '').localeCompare(b ?? '', 'en', { numeric: true, sensitivity: 'base' });
