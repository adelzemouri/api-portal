import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MetricsStatus } from './api.models';
import { BarItem, BarListComponent } from './bar-list.component';
import { EnvironmentStore } from './environment.store';
import { compactNumber, formatPercent } from './format';
import { MetricsNoticeComponent } from './metrics-notice.component';
import { PeriodSwitchComponent } from './period-switch.component';
import { fakeStore } from './testing';

describe('PeriodSwitchComponent', () => {
  function render() {
    const store = fakeStore();
    TestBed.configureTestingModule({ imports: [PeriodSwitchComponent], providers: [{ provide: EnvironmentStore, useValue: store }] });
    const fixture = TestBed.createComponent(PeriodSwitchComponent);
    fixture.detectChanges();
    const buttons = () => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));
    return { fixture, store, buttons };
  }

  it('offers the two periods, the current one pressed', () => {
    const { buttons } = render();

    expect(buttons().map((b) => b.textContent?.trim())).toEqual(['Last 24 hours', 'Last 7 days']);
    expect(buttons().map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
  });

  it('changes the period of the whole portal', () => {
    const { fixture, store, buttons } = render();

    buttons()[1].click();
    fixture.detectChanges();

    expect(store.setPeriod).toHaveBeenCalledOnceWith('7d');
    expect(buttons().map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
  });
});

describe('MetricsNoticeComponent', () => {
  @Component({ standalone: true, imports: [MetricsNoticeComponent], template: `<app-metrics-notice [status]="status" />` })
  class Host {
    status: MetricsStatus | null = null;
  }

  function render(status: MetricsStatus | null) {
    TestBed.configureTestingModule({ imports: [Host], providers: [{ provide: EnvironmentStore, useValue: fakeStore() }] });
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.status = status;
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('.banner');
  }

  it('says nothing when the metrics are fine, or not loaded yet', () => {
    expect(render({ state: 'OK', lastSuccessAt: '2026-01-01T10:00:00Z', error: null })).toBeNull();
    TestBed.resetTestingModule();
    expect(render(null)).toBeNull();
  });

  it('says when no source is configured, and when nothing has been read yet', () => {
    expect(render({ state: 'DISABLED', lastSuccessAt: null, error: null })?.textContent).toContain('not configured for this environment');
    TestBed.resetTestingModule();
    expect(render({ state: 'NEVER', lastSuccessAt: null, error: null })?.textContent).toContain('have not been read yet');
  });

  it('reports a failed read as data, with the cause and the age of the figures still shown', () => {
    const banner = render({ state: 'ERROR', lastSuccessAt: '2026-01-01T10:00:00Z', error: 'Splunk unreachable' });

    expect(banner?.classList).toContain('banner-error');
    expect(banner?.textContent).toContain('Splunk unreachable');
    expect(banner?.textContent).toContain('Showing the last successful read (10 minutes ago)');
  });

  it('says there is nothing to show when the very first read failed', () => {
    expect(render({ state: 'ERROR', lastSuccessAt: null, error: 'Splunk answered HTTP 401' })?.textContent).toContain('No data available');
  });
});

describe('BarListComponent', () => {
  @Component({
    standalone: true,
    imports: [BarListComponent],
    template: `<app-bar-list label="Calls" [items]="items" [format]="format" [total]="total" empty="Nothing" />`,
  })
  class Host {
    items: BarItem[] = [];
    format: (n: number) => string = (n) => String(n);
    total: number | null = null;
  }

  function render(setup: (host: Host) => void) {
    TestBed.configureTestingModule({ imports: [Host], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(Host);
    setup(fixture.componentInstance);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the value formatted by the caller, and the exact value in the tooltip', () => {
    const el = render((host) => {
      host.items = [{ key: 'a', label: 'Payments 1.4', value: 12_345 }, { key: 'b', label: 'Cards 2.2', value: 900 }];
      host.format = compactNumber;
    });

    const rows = Array.from(el.querySelectorAll('.bar-row'));
    expect(rows.map((r) => r.querySelector('.bar-value')?.textContent)).toEqual([compactNumber(12_345), '900']);
    expect(rows[0].getAttribute('title')).toBe(`Payments 1.4: ${compactNumber(12_345)}`);
  });

  it('scales the bars to the largest value and keeps tiny values visible', () => {
    const el = render((host) => (host.items = [{ key: 'a', label: 'A', value: 1000 }, { key: 'b', label: 'B', value: 1 }, { key: 'c', label: 'C', value: 0 }]));

    const widths = Array.from(el.querySelectorAll<HTMLElement>('.bar')).map((b) => b.style.width);
    expect(widths).toEqual(['100%', '2%', '0%']);
  });

  it('scales fractions too: the largest rate fills the track, not a tiny sliver of it', () => {
    const el = render((host) => (host.items = [{ key: 'a', label: 'A', value: 0.056 }, { key: 'b', label: 'B', value: 0.028 }]));

    expect(Array.from(el.querySelectorAll<HTMLElement>('.bar')).map((b) => b.style.width)).toEqual(['100%', '50%']);
  });

  it('supports rates: values formatted as percentages with their share', () => {
    const el = render((host) => {
      host.items = [{ key: 'a', label: 'KYC', value: 0.05, tone: 'err' }];
      host.format = formatPercent;
      host.total = 0.1;
    });

    expect(el.querySelector('.bar-value')?.textContent).toBe('5.0%');
    expect(el.querySelector('.bar')?.getAttribute('data-tone')).toBe('err');
    expect(el.querySelector('.bar-row')?.getAttribute('title')).toBe('KYC: 5.0% (50%)');
  });

  it('links a label, with query parameters, only when asked to', () => {
    const el = render((host) => {
      host.items = [
        { key: 'a', label: 'Mobile', value: 5, link: ['/applications'], queryParams: { q: 'Mobile' } },
        { key: 'b', label: 'Legacy', value: 3 },
      ];
    });

    const rows = el.querySelectorAll('.bar-row');
    expect(rows[0].querySelector('a')?.getAttribute('href')).toBe('/applications?q=Mobile');
    expect(rows[1].querySelector('a')).toBeNull();
  });

  it('turns a label into a button when an action is given (side panel), before any link', () => {
    const action = jasmine.createSpy('action');
    const el = render((host) => {
      host.items = [{ key: 'a', label: 'Payments', value: 5, action, link: ['/apis'], from: 'calls-p' }];
    });

    const button = el.querySelector<HTMLButtonElement>('.bar-row .linkbtn')!;
    expect(el.querySelector('.bar-row a')).toBeNull();
    expect(button.getAttribute('data-panel-from')).toBe('calls-p');
    button.click();
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('says so when there is nothing to draw', () => {
    const el = render(() => undefined);

    expect(el.querySelector('.bar-empty')?.textContent).toBe('Nothing');
  });
});
