import { Component, Input, computed, inject, signal } from '@angular/core';
import { I18nService, TranslatePipe, currentLocale } from './i18n';

/** Villes des équipes : le fuseau IANA gère seul les heures d'été et d'hiver. */
export const TEAM_CITIES: { name: string; timeZone: string }[] = [
  { name: 'Lisbon', timeZone: 'Europe/Lisbon' },
  { name: 'Lausanne', timeZone: 'Europe/Zurich' },
  { name: 'Singapore', timeZone: 'Asia/Singapore' },
];

/** Jour civil d'un instant dans un fuseau (AAAA-MM-JJ), pour comparer les dates entre villes. */
function dayIn(timeZone: string, instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

/** Heure locale des sites des équipes ; « +1 » / « −1 » quand une ville n'est pas au même jour que Lausanne. */
@Component({
  selector: 'app-world-clocks',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <ul class="clocks" [attr.aria-label]="'Local time of the teams' | t">
      @for (clock of clocks(); track clock.name) {
        <li [attr.title]="clock.name | t">
          <span class="clock-city">{{ clock.name | t }}</span>
          <span class="clock-time">
            <time [attr.datetime]="clock.iso">{{ clock.time }}</time>
            @if (clock.dayShift) {
              <span class="clock-day" [attr.aria-label]="(clock.dayShift > 0 ? 'next day' : 'previous day') | t">{{ clock.dayShift > 0 ? '+1' : '−1' }}</span>
            }
          </span>
        </li>
      }
    </ul>
  `,
})
export class WorldClocksComponent {
  private readonly i18n = inject(I18nService);
  private readonly instant = signal(Date.now());

  /** Instant affiché (ms) : fourni par l'appelant, qui tient l'horloge. */
  @Input({ required: true }) set now(value: number) {
    this.instant.set(value);
  }

  readonly clocks = computed(() => {
    this.i18n.lang();
    const instant = new Date(this.instant());
    const reference = dayIn('Europe/Zurich', instant);
    return TEAM_CITIES.map((city) => {
      const day = dayIn(city.timeZone, instant);
      return {
        name: city.name,
        iso: instant.toISOString(),
        time: new Intl.DateTimeFormat(currentLocale(), { timeZone: city.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(instant),
        dayShift: day === reference ? 0 : day > reference ? 1 : -1,
      };
    });
  });
}
