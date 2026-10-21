import { Component, Input, inject } from '@angular/core';
import { MetricsStatus } from './api.models';
import { EnvironmentStore } from './environment.store';
import { formatRelative } from './format';

/**
 * État de la lecture des métriques. Comme pour la synchro du catalogue, l'indisponibilité de Splunk est une donnée
 * affichée, jamais un blocage : on dit ce qu'on montre et d'où ça vient.
 */
@Component({
  selector: 'app-metrics-notice',
  standalone: true,
  template: `
    @switch (status?.state) {
      @case ('DISABLED') {
        <p class="banner" role="status">Traffic metrics are not configured for this environment.</p>
      }
      @case ('NEVER') {
        <p class="banner" role="status">Traffic metrics have not been read yet. They appear after the first read.</p>
      }
      @case ('ERROR') {
        <p class="banner banner-error" role="status">
          Traffic metrics could not be read: {{ status?.error ?? 'unknown error' }}.
          @if (status?.lastSuccessAt) {
            Showing the last successful read ({{ ago(status?.lastSuccessAt) }}).
          } @else {
            No data available.
          }
        </p>
      }
    }
  `,
})
export class MetricsNoticeComponent {
  private readonly store = inject(EnvironmentStore);

  @Input() status: MetricsStatus | null | undefined = null;

  ago(iso: string | null | undefined): string {
    return formatRelative(iso, this.store.now());
  }
}
