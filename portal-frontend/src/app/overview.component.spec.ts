import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { MetricsOverview, PortalInfo } from './api.models';
import { CatalogService } from './catalog.service';
import { EnvironmentStore } from './environment.store';
import { compactNumber } from './format';
import { OverviewComponent } from './overview.component';
import { CrossEnvIndex } from './cross-env';
import { DetailPanel } from './detail-panel.service';
import { DEPLOYMENTS, DISABLED, METRICS_OVERVIEW, OVERVIEW, fakeIndex, fakeStore } from './testing';

describe('OverviewComponent', () => {
  function render(
    options: { selected?: string; overview?: Observable<unknown>; metrics?: Observable<MetricsOverview>; portal?: PortalInfo } = {},
  ) {
    const overviewSpy = jasmine.createSpy('overview').and.returnValue(options.overview ?? of(OVERVIEW));
    const metricsSpy = jasmine.createSpy('metrics').and.returnValue(options.metrics ?? of(METRICS_OVERVIEW));
    const deploymentsSpy = jasmine.createSpy('deployments').and.returnValue(of(DEPLOYMENTS));
    const store = fakeStore({ selected: options.selected ?? 'dev', portal: options.portal });
    TestBed.configureTestingModule({
      imports: [OverviewComponent],
      providers: [
        provideRouter([]),
        { provide: CatalogService, useValue: { overview: overviewSpy, metrics: metricsSpy, deployments: deploymentsSpy } },
        { provide: EnvironmentStore, useValue: store },
        { provide: CrossEnvIndex, useValue: fakeIndex() },
      ],
    });
    const fixture = TestBed.createComponent(OverviewComponent);
    const flush = () => {
      fixture.detectChanges();
      TestBed.flushEffects();
      fixture.detectChanges();
    };
    flush();
    return { fixture, el: fixture.nativeElement as HTMLElement, overviewSpy, metricsSpy, deploymentsSpy, store, flush };
  }

  // Un texte par élément enfant : les espaces visibles viennent du CSS, absent des tests.
  const childrenText = (el: Element) =>
    Array.from(el.children).map((c) => c.textContent?.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ');
  const kpis = (el: HTMLElement) => Array.from(el.querySelectorAll('.kpi')).map(childrenText);
  const bars = (el: HTMLElement, title: string) =>
    Array.from(Array.from(el.querySelectorAll('.chart')).find((c) => c.querySelector('h4')?.textContent?.startsWith(title))!.querySelectorAll('.bar-row')).map(childrenText);
  const chart = (el: HTMLElement, title: string) =>
    Array.from(el.querySelectorAll('.chart')).find((c) => c.querySelector('h4')?.textContent?.startsWith(title))!;

  it('summarizes the catalog in one line, with its synchronization state', () => {
    const { el } = render();

    const strip = el.querySelector('.catalog-strip')!.textContent!.replace(/\s+/g, ' ');
    expect(strip).toContain('15 APIs');
    expect(strip).toContain('22 applications');
    expect(strip).toContain('26 subscriptions');
    expect(strip).toContain('Catalog synchronized 5 minutes ago');
    expect(Array.from(el.querySelectorAll('.catalog-strip a')).map((a) => a.getAttribute('href'))).toEqual(['/apis', '/applications']);
  });

  it('flags a failed or missing catalog synchronization', () => {
    expect(render({ selected: 'uat' }).el.querySelector('.strip-sync')?.textContent).toContain('synchronization failed');
    TestBed.resetTestingModule();
    expect(render({ selected: 'exp' }).el.querySelector('.strip-sync')?.textContent).toContain('not synchronized yet');
  });

  it('leads with the traffic figures: calls, error rate, latency, active applications', () => {
    const { el } = render();

    expect(kpis(el)).toEqual([
      `Calls ${compactNumber(12_345)} 2 of 15 APIs called`,
      'Error rate 2.9% 300 client (4xx) · 60 server (5xx)',
      'Latency p95 480 ms average 120 ms',
      'Active applications 2 of 22 applications',
    ]);
    expect(el.querySelector('#traffic-title')?.textContent).toBe('Traffic');
    expect(el.textContent).toContain('Read from Splunk 10 minutes ago');
  });

  it('draws calls and errors as two charts on their own scales, the errors in the error tone', () => {
    const { el } = render();

    const charts = el.querySelectorAll('.chart-pair')[0].querySelectorAll('app-time-series');
    expect(charts.length).toBe(2);
    expect(charts[0].querySelector('.ts')?.getAttribute('data-tone')).toBe('accent');
    expect(charts[1].querySelector('.ts')?.getAttribute('data-tone')).toBe('err');
    expect(charts[0].querySelectorAll('.ts-table tbody tr').length).toBe(24);
  });

  it('ranks the APIs by calls, error rate and latency, and the applications by calls', () => {
    const { el } = render();

    expect(bars(el, 'Most called APIs')).toEqual([`Payments 1.4 ${compactNumber(8000)}`, `KYC Checks 1.0 ${compactNumber(3000)}`]);
    expect(bars(el, 'Highest error rate')).toEqual(['KYC Checks 1.0 3.5%']);
    expect(bars(el, 'Slowest APIs')).toEqual(['KYC Checks 1.0 900 ms', 'Payments 1.4 300 ms']);
    expect(bars(el, 'Top consumers')).toEqual([`Mobile Banking ${compactNumber(7000)}`, 'Legacy Batch 500']);
  });

  it('opens a ranked API or application in the side panel, and leaves an unknown application as plain text', () => {
    const { fixture, el } = render();
    const panel = TestBed.inject(DetailPanel);

    chart(el, 'Most called').querySelector<HTMLButtonElement>('.linkbtn')!.click();
    fixture.detectChanges();
    expect(panel.current()).toEqual(jasmine.objectContaining({ kind: 'api', env: 'dev', id: 'p-14', name: 'Payments' }));
    expect(chart(el, 'Most called').querySelector('.bar-row')?.classList).toContain('is-sel');

    const consumers = chart(el, 'Top consumers').querySelectorAll('.bar-row');
    consumers[0].querySelector<HTMLButtonElement>('.linkbtn')!.click();
    expect(panel.current()).toEqual(jasmine.objectContaining({ kind: 'app', id: 'a1', name: 'Mobile Banking' }));
    expect(consumers[1].querySelector('.linkbtn, a')).toBeNull();
  });

  it('lists the latest deployments of every environment, a failed synchronization first, and filters them', () => {
    const { fixture, el, deploymentsSpy } = render();
    const items = () => Array.from(el.querySelectorAll('.feed-item')).map(childrenText);

    expect(deploymentsSpy).toHaveBeenCalledWith(20);
    expect(items()).toEqual([
      'UAT UAT could not be synchronized: [uat] control plane unreachable. 2 minutes ago',
      'EXP KYC Checks 1.0 Revision 3 deployed on Default, Internal 1 hour ago',
      'DEV Payments 1.4 Revision 7 deployed on Default 2 hours ago',
    ]);

    Array.from(el.querySelectorAll<HTMLButtonElement>('.feed-grid .chip')).find((c) => c.textContent?.trim() === 'DEV')!.click();
    fixture.detectChanges();
    expect(items()).toEqual(['DEV Payments 1.4 Revision 7 deployed on Default 2 hours ago']);
  });

  it('opens a deployment in the side panel, in the environment where it happened', () => {
    const { fixture, el } = render();
    const panel = TestBed.inject(DetailPanel);

    el.querySelector<HTMLButtonElement>('.feed .linkbtn')!.click();
    fixture.detectChanges();

    expect(panel.current()).toEqual(jasmine.objectContaining({ kind: 'api', env: 'exp', id: 'k-10', name: 'KYC Checks' }));
    expect(el.querySelector('.feed-item.is-sel')?.textContent).toContain('KYC Checks');
  });

  it('lists the APIs not yet in production with their path, and opens one where it went furthest', () => {
    const { fixture, el } = render();
    const panel = TestBed.inject(DetailPanel);

    expect(el.querySelector('#notprod-title')?.textContent).toBe('Not yet in EXP');
    const rows = Array.from(el.querySelectorAll('.notprod li'));
    expect(rows.map((r) => r.querySelector('.linkbtn')?.textContent)).toEqual(['Payments']);
    expect(rows[0].querySelector('.dots')?.getAttribute('aria-label')).toBe('Deployed in DEV, SIM, UAT');

    rows[0].querySelector<HTMLButtonElement>('.linkbtn')!.click();
    fixture.detectChanges();
    expect(panel.current()).toEqual(jasmine.objectContaining({ kind: 'api', env: 'dev', id: 'dev-p-14' }));
  });

  it('does not invent traffic when no source is configured: only the notice speaks, the catalog stays', () => {
    const { el } = render({ metrics: of({ ...METRICS_OVERVIEW, status: DISABLED }) });

    expect(el.textContent).toContain('Traffic metrics are not configured for this environment.');
    expect(el.querySelector('#traffic-title')).toBeNull();
    expect(el.querySelector('.catalog-strip')).not.toBeNull();
    expect(el.querySelector('.chart-pair app-bar-list')).not.toBeNull();
  });

  it('says when nothing has been read yet, or when the very first read failed', () => {
    const never = render({ metrics: of({ ...METRICS_OVERVIEW, status: { state: 'NEVER', lastSuccessAt: null, error: null } }) });
    expect(never.el.textContent).toContain('have not been read yet');
    expect(never.el.querySelector('#traffic-title')).toBeNull();
    TestBed.resetTestingModule();

    const failed = render({ metrics: of({ ...METRICS_OVERVIEW, status: { state: 'ERROR', lastSuccessAt: null, error: 'Splunk unreachable' } }) });
    expect(failed.el.querySelector('.banner-error')?.textContent).toContain('Splunk unreachable');
    expect(failed.el.querySelector('#traffic-title')).toBeNull();
  });

  it('keeps showing the last successful figures during a Splunk outage, and says so', () => {
    const { el } = render({
      metrics: of({ ...METRICS_OVERVIEW, status: { state: 'ERROR', lastSuccessAt: '2026-01-01T09:00:00Z', error: 'Splunk answered HTTP 503' } }),
    });

    expect(el.querySelector('.banner-error')?.textContent).toContain('Showing the last successful read (1 hour ago)');
    expect(kpis(el)[0]).toContain(compactNumber(12_345));
  });

  it('keeps the catalog when the traffic request itself fails', () => {
    const { el } = render({ metrics: throwError(() => new Error('down')) });

    expect(el.querySelector('#traffic-title')).toBeNull();
    expect(el.querySelector('.catalog-strip')).not.toBeNull();
  });

  it('reads the metrics again for the chosen period and environment', () => {
    const { metricsSpy, store, flush } = render();
    expect(metricsSpy).toHaveBeenCalledOnceWith('dev', '24h');

    store.setPeriod('7d');
    flush();
    expect(metricsSpy).toHaveBeenCalledWith('dev', '7d');

    store.select('sim');
    flush();
    expect(metricsSpy).toHaveBeenCalledWith('sim', '7d');
  });

  it('shows the subscriptions by status and by policy, but nothing on the API lifecycle (not governed yet)', () => {
    const { el } = render();

    expect(el.querySelector('#subs-title')?.textContent).toBe('Subscriptions');
    expect(bars(el, 'By status')).toEqual(['Active 20', 'Blocked 4']);
    expect(bars(el, 'By throttling policy')).toEqual(['Gold 14', 'Silver 10']);
    expect(el.textContent).not.toContain('APIs by status');
    expect(el.textContent).not.toContain('Needs attention');
    expect(el.textContent).not.toContain('Most subscribed');
  });

  it('points to the swagger-deploy GitLab component and to the deployment help', () => {
    const { el } = render();

    const links = Array.from(el.querySelectorAll<HTMLAnchorElement>('.callout a'));
    expect(el.querySelector('.callout h3')?.textContent).toBe('Deploying an API?');
    expect(links[0].getAttribute('href')).toBe('https://gitlab.bank.internal/platform/ci-components/swagger-deploy');
    expect(links[0].target).toBe('_blank');
    expect(links[0].rel).toBe('noopener noreferrer');
    expect(links[1].getAttribute('href')).toBe('/help');
  });

  it('still points to the help when the component address is not configured', () => {
    const { el } = render({ portal: { deployComponentUrl: null } });

    expect(Array.from(el.querySelectorAll<HTMLAnchorElement>('.callout a')).map((a) => a.getAttribute('href'))).toEqual(['/help']);
  });

  it('gives the connection details of the selected environment: Identity Server, gateways, consoles', () => {
    const { el } = render();

    const conn = el.querySelector('.conn')!;
    expect(conn.querySelector('.url')?.textContent).toBe('https://is-dev.bank.internal');
    const gateway = conn.querySelectorAll('.conn-line')[0];
    expect(gateway.textContent).toContain('Default');
    expect(gateway.textContent).toContain('https://gw-dev.bank.internal:8243');
    expect(conn.querySelectorAll('app-copy-button').length).toBe(3);
    expect(Array.from(conn.querySelectorAll('a')).map((a) => a.getAttribute('href'))).toEqual([
      'https://apim-dev.bank.internal/publisher',
      'https://apim-dev.bank.internal/devportal',
    ]);
    expect(conn.textContent).toContain('followed by its context');
  });

  it('says what is not configured or not seen yet', () => {
    const { el } = render({ selected: 'sim' });

    const conn = el.querySelector('.conn')!.textContent!;
    expect(conn).toContain('Not configured');
    expect(conn).toContain('No gateway seen yet');
    expect(el.querySelectorAll('.conn app-copy-button').length).toBe(0);
  });

  it('compares the four environments, with the failing one flagged in text', () => {
    const { el } = render();

    const rows = Array.from(el.querySelectorAll('.compare tbody tr')).map((r) => r.textContent?.replace(/\s+/g, ' ').trim());
    expect(rows.length).toBe(4);
    expect(rows[0]).toContain('DEV 15 22 26');
    expect(rows[2]).toContain('Failed (last success 20 minutes ago)');
    expect(rows[3]).toContain('Never synchronized');
    expect(el.querySelector('.compare tr.current th')?.textContent).toContain('DEV');
  });

  it('shows an error message when the subscriptions cannot be loaded', () => {
    const { el } = render({ overview: throwError(() => new Error('down')) });

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Unable to load the overview');
  });
});
