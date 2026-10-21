import { Component, ElementRef, EventEmitter, Input, OnChanges, Output, ViewChild, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { EMPTY, catchError, debounceTime, distinctUntilChanged, filter, of, switchMap } from 'rxjs';
import { Api, Application, SearchResult } from './api.models';
import { CatalogService } from './catalog.service';
import { EnvironmentStore } from './environment.store';
import { lifeCycleLabel } from './format';
import { I18nService, TranslatePipe } from './i18n';

interface Option {
  id: string;
  kind: 'API' | 'Application';
  title: string;
  detail: string;
  link: unknown[];
  query?: Record<string, string>;
}

/** Recherche globale (Ctrl/⌘ + K) : les premières API et applications de l'environnement affiché. */
@Component({
  selector: 'app-search-palette',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    @if (open) {
      <div class="palette-backdrop" (click)="close()">
        <div
          class="palette"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="'Search APIs and applications' | t"
          (click)="$event.stopPropagation()"
          (keydown)="onKey($event)"
        >
          <div class="palette-input">
            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
            <input
              #input
              type="search"
              role="combobox"
              [attr.aria-label]="'Search' | t"
              aria-autocomplete="list"
              aria-controls="palette-results"
              [attr.aria-expanded]="options().length > 0"
              [attr.aria-activedescendant]="options().length ? 'palette-option-' + active() : null"
              [placeholder]="'Search APIs and applications in {env}' | t: { env: store.selected()?.label ?? '' }"
              [value]="query()"
              (input)="query.set(valueOf($event))"
            />
            <kbd>Esc</kbd>
          </div>
          <ul id="palette-results" role="listbox" [attr.aria-label]="'Results' | t">
            @for (option of options(); track option.id; let i = $index) {
              <li
                role="option"
                [id]="'palette-option-' + i"
                [attr.aria-selected]="i === active()"
                [class.active]="i === active()"
                (click)="choose(option)"
                (mousemove)="active.set(i)"
              >
                <span class="palette-kind">{{ option.kind | t }}</span>
                <span class="palette-title">{{ option.title }}</span>
                <span class="palette-detail muted">{{ option.detail }}</span>
              </li>
            }
          </ul>
          <p class="palette-status" role="status">{{ status() }}</p>
        </div>
      </div>
    }
  `,
})
export class SearchPaletteComponent implements OnChanges {
  private readonly catalog = inject(CatalogService);
  private readonly router = inject(Router);
  readonly store = inject(EnvironmentStore);
  private readonly i18n = inject(I18nService);

  @Input() open = false;
  @Output() closed = new EventEmitter<void>();
  @ViewChild('input') set input(element: ElementRef<HTMLInputElement> | undefined) {
    // L'entrée n'existe que palette ouverte : on lui donne le focus dès qu'elle apparaît.
    element?.nativeElement.focus();
  }

  readonly query = signal('');
  readonly result = signal<SearchResult>({ apis: [], applications: [] });
  readonly searched = signal(false);
  readonly active = signal(0);

  readonly options = computed<Option[]>(() => [
    ...this.result().apis.map((api) => this.apiOption(api)),
    ...this.result().applications.map((app) => this.applicationOption(app)),
  ]);

  readonly status = computed(() => {
    if (!this.query().trim()) {
      return this.i18n.t('Type to search.');
    }
    if (!this.searched()) {
      return this.i18n.t('Searching…');
    }
    const count = this.options().length;
    return count === 0 ? this.i18n.t('No result.') : this.i18n.t(count === 1 ? '{n} result.' : '{n} results.', { n: count });
  });

  constructor() {
    toObservable(this.query)
      .pipe(
        debounceTime(200),
        distinctUntilChanged(),
        switchMap((query) => {
          const environment = this.store.selectedKey();
          if (!query.trim() || !environment) {
            return of<SearchResult>({ apis: [], applications: [] });
          }
          return this.catalog.search(environment, query).pipe(catchError(() => EMPTY));
        }),
        takeUntilDestroyed(),
      )
      .subscribe((result) => {
        this.result.set(result);
        this.searched.set(true);
        this.active.set(0);
      });
  }

  ngOnChanges(): void {
    if (this.open) {
      this.query.set('');
      this.result.set({ apis: [], applications: [] });
      this.searched.set(false);
      this.active.set(0);
    }
  }

  onKey(event: KeyboardEvent): void {
    const count = this.options().length;
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.close();
        break;
      case 'ArrowDown':
        event.preventDefault();
        if (count) {
          this.active.set((this.active() + 1) % count);
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (count) {
          this.active.set((this.active() - 1 + count) % count);
        }
        break;
      case 'Enter': {
        const option = this.options()[this.active()];
        if (option) {
          event.preventDefault();
          this.choose(option);
        }
        break;
      }
    }
  }

  choose(option: Option): void {
    this.close();
    void this.router.navigate(option.link, option.query ? { queryParams: option.query } : undefined);
  }

  close(): void {
    this.closed.emit();
  }

  valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  private apiOption(api: Api): Option {
    return {
      id: 'api-' + api.apiId,
      kind: 'API',
      title: `${api.name} ${api.version}`,
      detail: `${lifeCycleLabel(api.lifeCycleStatus)} · ${api.context}`,
      link: ['/apis', this.store.selectedKey(), api.apiId],
    };
  }

  private applicationOption(app: Application): Option {
    return {
      id: 'app-' + app.applicationId,
      kind: 'Application',
      title: app.name,
      detail: app.owner ?? '',
      link: ['/applications'],
      query: { q: app.name },
    };
  }
}
