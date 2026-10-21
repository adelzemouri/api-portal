import { Component, ElementRef, Input, OnChanges, computed, inject, signal } from '@angular/core';
import { Period, TimePoint } from './api.models';
import { compactNumber, formatInt } from './format';
import { I18nService, TranslatePipe, currentLocale, translate } from './i18n';

const W = 720;
const H = 200;
const LEFT = 48;
const RIGHT = 12;
const TOP = 12;
const BOTTOM = 26;

interface Tick {
  value: number;
  label: string;
  y: number;
}

/** Plus petit « beau » maximum (1, 2, 5 × 10^k) qui couvre la valeur : des repères d'axe lisibles. */
export function niceMax(value: number): number {
  if (value <= 0) {
    return 1;
  }
  const power = Math.pow(10, Math.floor(Math.log10(value)));
  const fraction = value / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * power;
}

/**
 * Courbe de trafic : trait de 2 px, aire à 10 %, une seule échelle. Survol (repère + infobulle) et clavier
 * (flèches) ; le tableau de données donne les mêmes valeurs en texte.
 */
@Component({
  selector: 'app-time-series',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    @if (points.length === 0) {
      <p class="ts-empty">{{ 'No traffic recorded in this period.' | t }}</p>
    } @else {
      <figure class="ts" [attr.data-tone]="tone">
        <div
          class="ts-frame"
          tabindex="0"
          role="group"
          [attr.aria-label]="'{title}: use the left and right arrow keys to read each point' | t: { title: title }"
          (pointermove)="onPointer($event)"
          (pointerleave)="hover.set(null)"
          (keydown)="onKey($event)"
          (blur)="hover.set(null)"
        >
          <svg [attr.viewBox]="'0 0 ' + width + ' ' + height" role="img" [attr.aria-label]="summary()">
            @for (tick of ticks(); track tick.value) {
              <line class="ts-grid" [attr.x1]="left" [attr.x2]="width - right" [attr.y1]="tick.y" [attr.y2]="tick.y" />
              <text class="ts-tick" [attr.x]="left - 8" [attr.y]="tick.y + 4" text-anchor="end">{{ tick.label }}</text>
            }
            <path class="ts-area" [attr.d]="areaPath()" />
            <path class="ts-line" [attr.d]="linePath()" />
            @for (label of xLabels(); track label.x) {
              <text class="ts-tick" [attr.x]="label.x" [attr.y]="height - 6" [attr.text-anchor]="label.anchor">{{ label.text }}</text>
            }
            @if (active(); as point) {
              <line class="ts-cross" [attr.x1]="point.x" [attr.x2]="point.x" [attr.y1]="top" [attr.y2]="height - bottom" />
              <circle class="ts-ring" [attr.cx]="point.x" [attr.cy]="point.y" r="6" />
              <circle class="ts-dot" [attr.cx]="point.x" [attr.cy]="point.y" r="4" />
            }
          </svg>
          @if (active(); as point) {
            <div class="ts-tip" role="status" [style.left.%]="(point.x / width) * 100" [class.ts-tip-right]="point.x > width * 0.7">
              <strong>{{ point.valueLabel }}</strong>
              <span>{{ point.timeLabel }}</span>
            </div>
          }
        </div>
        <details class="ts-table">
          <summary>{{ 'View data as a table' | t }}</summary>
          <table>
            <thead>
              <tr>
                <th scope="col">{{ 'Time' | t }}</th>
                <th scope="col" class="num">{{ title }}</th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.timeLabel) {
                <tr>
                  <th scope="row">{{ row.timeLabel }}</th>
                  <td class="num">{{ row.valueLabel }}</td>
                </tr>
              }
            </tbody>
          </table>
        </details>
      </figure>
    }
  `,
})
export class TimeSeriesChartComponent implements OnChanges {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly i18n = inject(I18nService);

  @Input({ required: true }) points: TimePoint[] = [];
  @Input() metric: 'calls' | 'errors' = 'calls';
  /** Nom de la série, repris par le tableau et les lecteurs d'écran. */
  @Input() title = 'Calls';
  /** « accent » : magnitude ; « err » : erreurs (teinte d'état, jamais seule : libellé et valeur restent affichés). */
  @Input() tone: 'accent' | 'err' = 'accent';
  @Input() period: Period = '24h';

  readonly width = W;
  readonly height = H;
  readonly left = LEFT;
  readonly right = RIGHT;
  readonly top = TOP;
  readonly bottom = BOTTOM;

  private readonly source = signal<TimePoint[]>([]);
  private readonly kind = signal<'calls' | 'errors'>('calls');
  private readonly span = signal<Period>('24h');
  readonly hover = signal<number | null>(null);

  ngOnChanges(): void {
    this.source.set(this.points);
    this.kind.set(this.metric);
    this.span.set(this.period);
    if ((this.hover() ?? 0) >= this.points.length) {
      this.hover.set(null);
    }
  }

  private readonly values = computed(() => this.source().map((p) => (this.kind() === 'calls' ? p.calls : p.errors)));
  private readonly max = computed(() => niceMax(Math.max(0, ...this.values())));

  private x(index: number): number {
    const n = this.source().length;
    return n <= 1 ? LEFT + (W - LEFT - RIGHT) / 2 : LEFT + (index / (n - 1)) * (W - LEFT - RIGHT);
  }

  private y(value: number): number {
    return TOP + (1 - value / this.max()) * (H - TOP - BOTTOM);
  }

  readonly ticks = computed<Tick[]>(() =>
    (this.i18n.lang(), [0, this.max() / 2, this.max()]).map((value) => ({ value, label: compactNumber(value), y: this.y(value) })),
  );

  readonly linePath = computed(() =>
    this.values().map((v, i) => `${i === 0 ? 'M' : 'L'}${this.x(i).toFixed(1)},${this.y(v).toFixed(1)}`).join(' '),
  );

  readonly areaPath = computed(() => {
    const n = this.values().length;
    if (n === 0) {
      return '';
    }
    const base = this.y(0).toFixed(1);
    return `${this.linePath()} L${this.x(n - 1).toFixed(1)},${base} L${this.x(0).toFixed(1)},${base} Z`;
  });

  readonly xLabels = computed(() => {
    this.i18n.lang();
    const n = this.source().length;
    if (n === 0) {
      return [];
    }
    const picks = n === 1 ? [0] : n === 2 ? [0, 1] : [0, Math.floor((n - 1) / 2), n - 1];
    return picks.map((i, position) => ({
      x: this.x(i),
      text: this.axisTime(this.source()[i].time),
      anchor: position === 0 && picks.length > 1 ? 'start' : position === picks.length - 1 && picks.length > 1 ? 'end' : 'middle',
    }));
  });

  readonly active = computed(() => {
    this.i18n.lang();
    const index = this.hover();
    const point = index === null ? undefined : this.source()[index];
    if (index === null || !point) {
      return null;
    }
    const value = this.values()[index];
    return { x: this.x(index), y: this.y(value), valueLabel: `${formatInt(value)} ${this.unit()}`, timeLabel: this.fullTime(point.time) };
  });

  readonly rows = computed(() =>
    (this.i18n.lang(), this.source()).map((p, i) => ({ timeLabel: this.fullTime(p.time), valueLabel: formatInt(this.values()[i]) })),
  );

  readonly summary = computed(() => {
    this.i18n.lang();
    const values = this.values();
    if (values.length === 0) {
      return this.title;
    }
    const total = values.reduce((a, b) => a + b, 0);
    const peak = Math.max(...values);
    const peakAt = this.fullTime(this.source()[values.indexOf(peak)].time);
    return translate('{title} over the period: {total} in total, peak {peak} at {at}', { title: this.title, total: formatInt(total), peak: formatInt(peak), at: peakAt });
  });

  private unit(): string {
    return translate(this.kind() === 'calls' ? 'calls' : 'errors');
  }

  onPointer(event: PointerEvent): void {
    const n = this.source().length;
    if (n === 0) {
      return;
    }
    const frame = (this.host.nativeElement as HTMLElement).querySelector('.ts-frame');
    if (!frame) {
      return;
    }
    const rect = frame.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * W;
    const index = Math.round(((x - LEFT) / (W - LEFT - RIGHT)) * (n - 1));
    this.hover.set(Math.max(0, Math.min(n - 1, index)));
  }

  onKey(event: KeyboardEvent): void {
    const n = this.source().length;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const current = this.hover() ?? (event.key === 'ArrowRight' ? -1 : n);
      this.hover.set(Math.max(0, Math.min(n - 1, current + (event.key === 'ArrowRight' ? 1 : -1))));
    } else if (event.key === 'Escape') {
      this.hover.set(null);
    }
  }

  private axisTime(iso: string): string {
    const date = new Date(iso);
    return this.span() === '24h'
      ? new Intl.DateTimeFormat(currentLocale(), { hour: '2-digit', minute: '2-digit' }).format(date)
      : new Intl.DateTimeFormat(currentLocale(), { day: 'numeric', month: 'short' }).format(date);
  }

  private fullTime(iso: string): string {
    const date = new Date(iso);
    return this.span() === '24h'
      ? new Intl.DateTimeFormat(currentLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date)
      : new Intl.DateTimeFormat(currentLocale(), { weekday: 'short', day: 'numeric', month: 'short' }).format(date);
  }
}
