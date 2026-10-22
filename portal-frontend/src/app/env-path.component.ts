import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { Environment, Presence } from './api.models';
import { EnvironmentStore } from './environment.store';
import { formatDateTime, formatRelative } from './format';
import { I18nService, TranslatePipe } from './i18n';

/**
 * Parcours d'une API jusqu'à la production : une station par environnement (DEV → EXP) avec la version, la
 * dernière révision déployée et sa date. Une station se choisit : l'en-tête bascule sur cet environnement.
 */
@Component({
  selector: 'app-env-path',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <ol class="path" [attr.aria-label]="'Path to production' | t">
      @for (env of presence; track env.environment; let first = $first) {
        <li class="station" [class.on]="env.versions.length > 0" [class.current]="env.environment === current" [class.linked]="!first">
          <button
            type="button"
            [attr.aria-current]="env.environment === current ? 'true' : null"
            [attr.aria-label]="describe(env)"
            (click)="pick.emit(env.environment)"
          >
            <span class="station-dot" aria-hidden="true"></span>
            <span class="station-env">{{ env.label }}</span>
            @if (env.versions.length) {
              <span class="station-version mono">{{ versions(env) }}</span>
              @if (env.versions[0].revision) {
                <span class="station-rev">{{ env.versions[0].revision }}</span>
              }
              @if (env.versions[0].deployedTime; as when) {
                <span class="station-when" [attr.title]="date(when)">{{ ago(when) }}</span>
              }
            } @else {
              <span class="station-none">{{ 'not deployed' | t }}</span>
            }
            @if (env.stale) {
              <span class="stale">{{ (env.versions.length ? 'outdated' : 'unavailable') | t }}</span>
            }
          </button>
        </li>
      }
    </ol>
  `,
})
export class EnvPathComponent {
  @Input({ required: true }) presence: Presence[] = [];
  /** Environnement affiché. */
  @Input() current = '';
  @Output() pick = new EventEmitter<string>();

  private readonly store = inject(EnvironmentStore);
  private readonly i18n = inject(I18nService);

  versions(env: Presence): string {
    return env.versions.map((v) => v.version).join(', ');
  }

  ago(iso: string): string {
    return formatRelative(iso, this.store.now());
  }

  date(iso: string): string {
    return formatDateTime(iso);
  }

  describe(env: Presence): string {
    if (!env.versions.length) {
      return this.i18n.t('{env}: not deployed', { env: env.label });
    }
    const v = env.versions[0];
    const parts = [this.i18n.t('{env}: version {version}', { env: env.label, version: this.versions(env) })];
    if (v.revision) {
      parts.push(v.revision);
    }
    if (v.deployedTime) {
      parts.push(this.i18n.t('deployed {ago}', { ago: this.ago(v.deployedTime) }));
    }
    return parts.join(', ');
  }
}

/** Version compacte du parcours, pour une ligne de liste : un point par environnement. */
@Component({
  selector: 'app-env-dots',
  standalone: true,
  template: `
    <span class="dots" role="img" [attr.aria-label]="label()">
      @for (env of envs; track env.key; let first = $first) {
        @if (!first) {
          <b [class.on]="has(env.key)" aria-hidden="true"></b>
        }
        <i [class.on]="has(env.key)" [attr.title]="env.label" aria-hidden="true"></i>
      }
    </span>
  `,
})
export class EnvDotsComponent {
  @Input({ required: true }) envs: Environment[] = [];
  /** Clés des environnements où l'API est présente. */
  @Input({ required: true }) present: string[] = [];

  private readonly i18n = inject(I18nService);

  has(key: string): boolean {
    return this.present.includes(key);
  }

  label(): string {
    const labels = this.envs.filter((env) => this.has(env.key)).map((env) => env.label);
    return labels.length ? this.i18n.t('Deployed in {envs}', { envs: labels.join(', ') }) : this.i18n.t('Not deployed');
  }
}
