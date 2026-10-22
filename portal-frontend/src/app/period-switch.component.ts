import { Component, inject } from '@angular/core';
import { PERIODS } from './api.models';
import { EnvironmentStore } from './environment.store';
import { TranslatePipe } from './i18n';

/** Choix de la période des métriques (24 heures / 7 jours), partagé par toutes les pages. */
@Component({
  selector: 'app-period-switch',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <div class="period" role="group" [attr.aria-label]="'Period' | t">
      @for (period of periods; track period.key) {
        <button type="button" [attr.aria-pressed]="period.key === store.period()" (click)="store.setPeriod(period.key)">
          {{ period.label | t }}
        </button>
      }
    </div>
  `,
})
export class PeriodSwitchComponent {
  readonly store = inject(EnvironmentStore);
  readonly periods = PERIODS;
}
