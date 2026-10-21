import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Tone } from './format';
import { TranslatePipe } from './i18n';

export interface BarItem {
  key: string;
  label: string;
  value: number;
  /** Teinte d'état (ok / warn / err / neutral) ; absente : couleur d'accent, pour une simple magnitude. */
  tone?: Tone;
  /** Lien de navigation du libellé, le cas échéant. */
  link?: string[];
  queryParams?: Record<string, string>;
}

/**
 * Barres horizontales : une magnitude par ligne, valeur au bout de la barre. Chaque ligne est du texte lisible
 * (libellé + valeur) : la couleur ne porte jamais seule l'information.
 */
@Component({
  selector: 'app-bar-list',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  template: `
    <ul class="bars" [attr.aria-label]="label">
      @for (item of items; track item.key) {
        <li class="bar-row" [attr.title]="tooltip(item)">
          <span class="bar-label">
            @if (item.link) {
              <a [routerLink]="item.link" [queryParams]="item.queryParams">{{ item.label }}</a>
            } @else {
              {{ item.label }}
            }
          </span>
          <span class="bar-track" aria-hidden="true">
            <span class="bar" [attr.data-tone]="item.tone ?? 'accent'" [style.width.%]="width(item)"></span>
          </span>
          <span class="bar-value">{{ format(item.value) }}</span>
        </li>
      } @empty {
        <li class="bar-empty">{{ empty | t }}</li>
      }
    </ul>
  `,
})
export class BarListComponent {
  @Input({ required: true }) items: BarItem[] = [];
  @Input({ required: true }) label = '';
  @Input() empty = 'No data';
  /** Si renseigné, l'infobulle indique la part du total. */
  @Input() total: number | null = null;
  /** Mise en forme de la valeur affichée (compacte pour des appels, en % ou en ms pour d'autres mesures). */
  @Input() format: (value: number) => string = (value) => String(value);

  width(item: BarItem): number {
    const max = Math.max(0, ...this.items.map((i) => i.value)) || 1;
    // Une valeur non nulle reste visible même écrasée par un maximum très grand.
    return item.value > 0 ? Math.max(2, (item.value / max) * 100) : 0;
  }

  tooltip(item: BarItem): string {
    const share = this.total ? ` (${Math.round((item.value / this.total) * 100)}%)` : '';
    return `${item.label}: ${this.format(item.value)}${share}`;
  }
}
