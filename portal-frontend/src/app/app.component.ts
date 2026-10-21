import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Environment } from './api.models';
import { EnvironmentStore } from './environment.store';
import { formatRelative } from './format';
import { I18nService, Lang, TranslatePipe } from './i18n';
import { SearchPaletteComponent } from './search-palette.component';
import { WorldClocksComponent } from './world-clocks.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, SearchPaletteComponent, TranslatePipe, WorldClocksComponent],
  template: `
    <div class="shell">
      <aside class="sidebar">
        <a class="wordmark" routerLink="/" [attr.aria-label]="'API Hub, home' | t"><span class="wm-accent">API</span> Hub</a>
        <nav [attr.aria-label]="'Main' | t">
          <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
            <span>{{ 'Overview' | t }}</span>
          </a>
          <a routerLink="/apis" routerLinkActive="active">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" /></svg>
            <span>{{ 'APIs' | t }}</span>
          </a>
          <a routerLink="/applications" routerLinkActive="active">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5ZM3 13l9 5 9-5M3 17.5l9 5 9-5" /></svg>
            <span>{{ 'Applications' | t }}</span>
          </a>
          <a routerLink="/help" routerLinkActive="active">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01" /></svg>
            <span>{{ 'Help' | t }}</span>
          </a>
        </nav>
        <section class="side-sync" aria-labelledby="side-sync-title">
          <h2 id="side-sync-title">{{ 'Last synchronization' | t }}</h2>
          <ul>
            @for (env of store.environments(); track env.key) {
              <li [attr.data-state]="env.sync.state">
                <span class="dot" aria-hidden="true">{{ symbol(env) }}</span>
                <span class="side-env">{{ env.label }}</span>
                <span class="side-when">{{ syncLine(env) }}</span>
              </li>
            }
          </ul>
        </section>
        <p class="sidebar-foot">{{ 'Read-only view of WSO2 API Manager' | t }}</p>
      </aside>

      <div class="content">
        @if (store.demoMode()) {
          <div class="demo-banner" role="status">
            <strong>{{ 'Demo mode' | t }}</strong> — {{ 'mock data, no call to WSO2 or Splunk.' | t }}
          </div>
        }
        <header class="topbar">
          <div class="env-switch" role="group" [attr.aria-label]="'Environment' | t">
            @for (env of store.environments(); track env.key) {
              <button
                type="button"
                [attr.aria-pressed]="env.key === store.selectedKey()"
                [attr.data-state]="env.sync.state"
                [attr.data-prod]="env.key === 'exp' ? '' : null"
                [attr.aria-label]="env.label + (env.key === 'exp' ? ' ' + ('(production)' | t) : '') + ', ' + stateLabel(env)"
                (click)="choose(env.key)"
              >
                <span class="dot" aria-hidden="true">{{ symbol(env) }}</span>
                {{ env.label }}
                @if (env.key === 'exp') {
                  <span class="prod-tag" aria-hidden="true">PROD</span>
                }
              </button>
            }
          </div>
          <button type="button" id="search-trigger" class="search-trigger" aria-haspopup="dialog" (click)="searchOpen.set(true)">
            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
            <span>{{ 'Search APIs and applications' | t }}</span>
            <kbd>{{ shortcut }}</kbd>
          </button>
          <app-world-clocks [now]="store.now()" />
          <div class="lang-switch" role="group" [attr.aria-label]="'Language' | t">
            @for (option of languages; track option.key) {
              <button type="button" [attr.lang]="option.key" [attr.aria-pressed]="i18n.lang() === option.key" [attr.title]="option.name" (click)="i18n.set(option.key)">
                {{ option.label }}
              </button>
            }
          </div>
        </header>
        <main id="content">
          @if (store.state() === 'error') {
            <p class="banner banner-error" role="alert">
              {{ 'The portal cannot reach its server. The information displayed may be outdated.' | t }}
            </p>
          }
          @if (notice(); as message) {
            <p class="banner" [class.banner-error]="store.selected()?.sync?.state === 'ERROR'" role="status">{{ message }}</p>
          }
          <router-outlet />
        </main>
        <footer class="app-footer">
          {{ 'Catalog data comes from periodic synchronizations of the WSO2 API Manager control planes, traffic figures from periodic reads of Splunk: neither is real time.' | t }}
        </footer>
      </div>
    </div>
    <app-search-palette [open]="searchOpen()" (closed)="closeSearch()" />
  `,
})
export class AppComponent {
  readonly store = inject(EnvironmentStore);
  readonly i18n = inject(I18nService);
  private readonly router = inject(Router);

  /** Libellé court dans sa propre langue : on reconnaît la sienne même sans lire l'autre. */
  readonly languages: { key: Lang; label: string; name: string }[] = [
    { key: 'fr', label: 'FR', name: 'Français' },
    { key: 'en', label: 'EN', name: 'English' },
  ];

  readonly searchOpen = signal(false);
  readonly shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K';

  /** Un environnement indisponible est une donnée métier : on le dit, sans jamais bloquer l'affichage. */
  readonly notice = computed(() => {
    const env = this.store.selected();
    if (!env) {
      return null;
    }
    if (env.sync.state === 'ERROR') {
      const since = env.sync.lastSuccessAt
        ? this.i18n.t('Showing data from the last successful synchronization ({ago}).', { ago: formatRelative(env.sync.lastSuccessAt, this.store.now()) })
        : this.i18n.t('No data available.');
      return this.i18n.t('{env} could not be synchronized: {error}.', { env: env.label, error: env.sync.error ?? this.i18n.t('unknown error') }) + ' ' + since;
    }
    if (env.sync.state === 'NEVER') {
      return this.i18n.t('{env} has not been synchronized yet.', { env: env.label });
    }
    return null;
  });

  @HostListener('document:keydown', ['$event'])
  onShortcut(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.searchOpen.update((open) => !open);
    }
  }

  closeSearch(): void {
    this.searchOpen.set(false);
    // Rend le focus au déclencheur : le clavier ne se perd pas derrière la fenêtre fermée.
    document.getElementById('search-trigger')?.focus();
  }

  choose(key: string): void {
    this.store.select(key);
    // La fiche d'une API appartient à un environnement : on revient à la liste plutôt que de la laisser incohérente.
    if (/^\/apis\/[^/?]+\/[^/?]+/.test(this.router.url)) {
      void this.router.navigate(['/apis']);
    }
  }

  stateLabel(env: Environment): string {
    switch (env.sync.state) {
      case 'OK':
        return this.i18n.t('synchronized');
      case 'ERROR':
        return this.i18n.t('last synchronization failed');
      default:
        return this.i18n.t('never synchronized');
    }
  }

  /** Ligne du menu latéral : ancienneté de la dernière synchro réussie, ou l'échec en clair. */
  syncLine(env: Environment): string {
    switch (env.sync.state) {
      case 'OK':
        return formatRelative(env.sync.lastSuccessAt, this.store.now());
      case 'ERROR':
        return env.sync.lastSuccessAt
          ? this.i18n.t('failed · data from {ago}', { ago: formatRelative(env.sync.lastSuccessAt, this.store.now()) })
          : this.i18n.t('failed');
      default:
        return this.i18n.t('never');
    }
  }

  // Le symbole double la couleur : l'état ne repose jamais sur la seule teinte.
  symbol(env: Environment): string {
    return env.sync.state === 'OK' ? '●' : env.sync.state === 'ERROR' ? '▲' : '○';
  }
}
