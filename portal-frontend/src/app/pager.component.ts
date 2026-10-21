import { Component, Input } from '@angular/core';
import { TranslatePipe } from './i18n';
import { PAGE_SIZES, PageWindow, Pageable } from './table-view';

/** Pied de liste : plage affichée, page précédente / suivante, taille de page. */
@Component({
  selector: 'app-pager',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <nav class="pager" [attr.aria-label]="'{noun} pagination' | t: { noun: noun }">
      <p class="pager-range" aria-live="polite">
        @if (window.total === 0) {
          {{ 'No {noun}' | t: { noun: noun } }}
        } @else {
          {{ '{from}–{to} of {total} {noun}' | t: { from: window.from, to: window.to, total: window.total, noun: noun } }}
        }
      </p>
      <label class="pager-size">
        <span>{{ 'Rows per page' | t }}</span>
        <select [value]="view.pageSize()" (change)="view.setPageSize(+valueOf($event))">
          @for (size of sizes; track size) {
            <option [value]="size" [selected]="size === view.pageSize()">{{ size }}</option>
          }
        </select>
      </label>
      <div class="pager-buttons">
        <button type="button" [disabled]="window.page === 0" (click)="view.page.set(window.page - 1)">{{ 'Previous' | t }}</button>
        <span class="pager-page">{{ 'Page {page} of {count}' | t: { page: window.page + 1, count: window.pageCount } }}</span>
        <button type="button" [disabled]="window.page >= window.pageCount - 1" (click)="view.page.set(window.page + 1)">{{ 'Next' | t }}</button>
      </div>
    </nav>
  `,
})
export class PagerComponent {
  @Input({ required: true }) view!: Pageable;
  @Input({ required: true }) window!: PageWindow<unknown>;
  @Input() noun = 'items';
  readonly sizes = PAGE_SIZES;

  valueOf(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }
}
