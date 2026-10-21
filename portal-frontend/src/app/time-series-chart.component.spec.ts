import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Period, TimePoint } from './api.models';
import { TIMELINE } from './testing';
import { TimeSeriesChartComponent, niceMax } from './time-series-chart.component';

@Component({
  standalone: true,
  imports: [TimeSeriesChartComponent],
  template: `<app-time-series [points]="points" [metric]="metric" [title]="title" [tone]="tone" [period]="period" />`,
})
class HostComponent {
  points: TimePoint[] = TIMELINE;
  metric: 'calls' | 'errors' = 'calls';
  title = 'Calls';
  tone: 'accent' | 'err' = 'accent';
  period: Period = '24h';
}

describe('niceMax', () => {
  it('rounds up to 1, 2 or 5 times a power of ten', () => {
    expect([0, -3, 1, 1.5, 7, 45, 120, 900, 2000, 3400].map(niceMax)).toEqual([1, 1, 1, 2, 10, 50, 200, 1000, 2000, 5000]);
  });
});

describe('TimeSeriesChartComponent', () => {
  function render(setup: (host: HostComponent) => void = () => undefined) {
    const fixture = TestBed.createComponent(HostComponent);
    setup(fixture.componentInstance);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const frame = () => el.querySelector<HTMLElement>('.ts-frame')!;
    const pointer = (fraction: number) => {
      const rect = frame().getBoundingClientRect();
      frame().dispatchEvent(new PointerEvent('pointermove', { clientX: rect.left + rect.width * fraction, clientY: rect.top + 10, bubbles: true }));
      fixture.detectChanges();
    };
    const key = (name: string) => {
      frame().dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
      fixture.detectChanges();
    };
    return { fixture, el, frame, pointer, key };
  }

  it('draws one line and one area over the whole period, on a single axis with round tick values', () => {
    const { el } = render();

    const line = el.querySelector('.ts-line')!.getAttribute('d')!;
    expect(line.startsWith('M')).toBeTrue();
    expect(line.split('L').length).toBe(24);
    expect(el.querySelector('.ts-area')!.getAttribute('d')).toMatch(/Z$/);
    expect(Array.from(el.querySelectorAll('svg text')).map((t) => t.textContent)).toEqual(
      jasmine.arrayContaining(['0', '500', '1K']),
    );
  });

  it('labels the start, the middle and the end of the time axis', () => {
    const { el } = render();

    const labels = Array.from(el.querySelectorAll('svg text.ts-tick')).slice(3).map((t) => t.textContent);
    expect(labels.length).toBe(3);
    expect(labels.every((l) => /^\d{2}:\d{2}$/.test(l ?? ''))).toBeTrue();
  });

  it('uses dates instead of hours on a seven-day period', () => {
    const { el } = render((host) => {
      host.period = '7d';
      host.points = TIMELINE.slice(0, 7);
    });

    const labels = Array.from(el.querySelectorAll('svg text.ts-tick')).slice(3).map((t) => t.textContent);
    expect(labels.every((l) => /[A-Z][a-z]{2}/.test(l ?? '') && !(l ?? '').includes(':'))).toBeTrue();
  });

  it('describes the series in words for assistive technology: total, peak and when', () => {
    const { el } = render();

    const label = el.querySelector('svg')!.getAttribute('aria-label')!;
    expect(label).toContain('Calls over the period');
    expect(label).toContain('peak 900');
    expect(label).toMatch(/in total/);
  });

  it('shows a cursor, a dot and a tooltip with the exact value under the pointer, and hides them when it leaves', () => {
    const { el, frame, pointer, fixture } = render();
    expect(el.querySelector('.ts-tip')).toBeNull();

    pointer(0.5);

    expect(el.querySelector('.ts-cross')).not.toBeNull();
    expect(el.querySelectorAll('.ts-dot').length).toBe(1);
    expect(el.querySelector('.ts-ring')).not.toBeNull();
    expect(el.querySelector('.ts-tip strong')?.textContent).toBe('210 calls');

    frame().dispatchEvent(new PointerEvent('pointerleave'));
    fixture.detectChanges();
    expect(el.querySelector('.ts-tip')).toBeNull();
  });

  it('keeps the tooltip inside the chart near the right edge', () => {
    const { el, pointer } = render();

    pointer(0.98);

    expect(el.querySelector('.ts-tip')?.classList).toContain('ts-tip-right');
  });

  it('can be explored with the keyboard: arrows move from point to point, Escape clears', () => {
    const { el, key } = render();

    key('ArrowRight');
    expect(el.querySelector('.ts-tip strong')?.textContent).toBe('100 calls');
    key('ArrowRight');
    expect(el.querySelector('.ts-tip strong')?.textContent).toBe('110 calls');
    key('ArrowLeft');
    expect(el.querySelector('.ts-tip strong')?.textContent).toBe('100 calls');
    key('Escape');
    expect(el.querySelector('.ts-tip')).toBeNull();
    key('ArrowLeft');
    expect(el.querySelector('.ts-tip strong')?.textContent).toBe('330 calls');
  });

  it('stays inside the bounds with the keyboard', () => {
    const { el, key } = render();

    key('ArrowLeft');
    key('ArrowLeft');
    key('ArrowLeft');
    expect(el.querySelector('.ts-tip')).not.toBeNull();
    for (let i = 0; i < 40; i++) {
      key('ArrowRight');
    }
    expect(el.querySelector('.ts-tip strong')?.textContent).toBe('330 calls');
  });

  it('plots errors in the error tone, with its own scale and unit', () => {
    const { el, key } = render((host) => {
      host.metric = 'errors';
      host.title = 'Errors';
      host.tone = 'err';
    });

    expect(el.querySelector('.ts')?.getAttribute('data-tone')).toBe('err');
    key('ArrowRight');
    expect(el.querySelector('.ts-tip strong')?.textContent).toBe('0 errors');
    expect(Array.from(el.querySelectorAll('svg text')).map((t) => t.textContent)).toContain('50');
  });

  it('gives the same values as a table', () => {
    const { el } = render();

    const rows = el.querySelectorAll('.ts-table tbody tr');
    expect(rows.length).toBe(24);
    expect(rows[22].querySelector('td')?.textContent).toBe('900');
    expect(el.querySelector('.ts-table summary')?.textContent).toBe('View data as a table');
  });

  it('says so when there is nothing to draw', () => {
    const { el } = render((host) => (host.points = []));

    expect(el.querySelector('svg')).toBeNull();
    expect(el.textContent).toContain('No traffic recorded in this period.');
  });

  it('follows its inputs when the data changes', () => {
    const { fixture, el } = render();

    fixture.componentInstance.points = TIMELINE.slice(0, 3);
    fixture.detectChanges();

    expect(el.querySelector('.ts-line')!.getAttribute('d')!.split('L').length).toBe(3);
  });
});
