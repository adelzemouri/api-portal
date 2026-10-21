import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { ApiMetrics } from './api.models';
import { ApiPageComponent } from './api-page.component';
import { CatalogService } from './catalog.service';
import { EnvironmentStore } from './environment.store';
import { compactNumber } from './format';
import { API_DETAIL, API_METRICS, DISABLED, SUBSCRIPTIONS, fakeStore } from './testing';

// La copie se confirme dans une promesse : on laisse ses continuations s'exécuter avant de relire la page.
const flushPromises = async () => {
  for (let i = 0; i < 3; i++) {
    await Promise.resolve();
  }
};

describe('ApiPageComponent', () => {
  function setup(env = 'dev', apiId = 'p-14', metrics: Observable<ApiMetrics> = of(API_METRICS)) {
    const apiDetail = jasmine.createSpy('apiDetail').and.returnValue(of(API_DETAIL));
    const subscriptionsOfApi = jasmine.createSpy('subscriptionsOfApi').and.returnValue(of(SUBSCRIPTIONS));
    const apiMetrics = jasmine.createSpy('apiMetrics').and.returnValue(metrics);
    const paramMap = new BehaviorSubject(convertToParamMap({ env, apiId }));
    const store = fakeStore({ selected: 'sim' });
    TestBed.configureTestingModule({
      imports: [ApiPageComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap } },
        { provide: CatalogService, useValue: { apiDetail, subscriptionsOfApi, apiMetrics } },
        { provide: EnvironmentStore, useValue: store },
      ],
    });
    const fixture = TestBed.createComponent(ApiPageComponent);
    const el = fixture.nativeElement as HTMLElement;
    const settle = () => {
      fixture.detectChanges();
      TestBed.flushEffects();
      fixture.detectChanges();
    };
    const openTab = (label: string) => {
      Array.from(el.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((t) => t.textContent?.trim() === label)!.click();
      fixture.detectChanges();
    };
    return { fixture, el, apiDetail, subscriptionsOfApi, apiMetrics, paramMap, store, settle, openTab };
  }

  const childrenText = (el: Element) => Array.from(el.children).map((c) => c.textContent?.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ');
  const clipboard = () => {
    const writeText = jasmine.createSpy('writeText').and.resolveTo();
    spyOnProperty(navigator, 'clipboard', 'get').and.returnValue({ writeText } as unknown as Clipboard);
    return writeText;
  };

  it('loads the API named in the URL and makes the header follow its environment', () => {
    const { el, apiDetail, subscriptionsOfApi, apiMetrics, store, settle } = setup();

    settle();

    expect(apiDetail).toHaveBeenCalledWith('dev', 'p-14');
    expect(subscriptionsOfApi).toHaveBeenCalledWith('dev', 'p-14');
    expect(apiMetrics).toHaveBeenCalledWith('dev', 'p-14', '24h');
    expect(store.select).toHaveBeenCalledWith('dev');
    expect(el.querySelector('h2')?.textContent).toContain('Payments');
    expect(el.querySelector('.breadcrumb')?.textContent).toContain('Payments 1.4');
    expect(el.querySelector('.api-meta')?.textContent).toContain('DEV');
    expect(el.querySelector('.api-meta')?.textContent).toContain('/payments/1.4');
  });

  it('leads with the traffic of the API on the period, and its subscribers', () => {
    const { el, settle } = setup();
    settle();

    expect(Array.from(el.querySelectorAll('.kpi')).map(childrenText)).toEqual([
      `Calls ${compactNumber(8000)} last 24 hours`,
      'Error rate 3.0% 200 4xx · 40 5xx',
      'Latency p95 300 ms average 100 ms',
      'Subscribers 2 1 active · 1 blocked or waiting',
    ]);
  });

  it('shows dashes instead of figures when there are no metrics, and says why', () => {
    const { el, settle } = setup('dev', 'p-14', of({ ...API_METRICS, status: DISABLED, metrics: null, timeline: [], consumers: [] }));
    settle();

    expect(Array.from(el.querySelectorAll('.kpi')).slice(0, 3).map((k) => k.querySelector('.kpi-value')?.textContent)).toEqual(['—', '—', '—']);
    expect(el.textContent).toContain('Traffic metrics are not configured for this environment.');
    expect(el.querySelector('app-time-series')).toBeNull();
  });

  it('opens on the traffic: calls and errors over time, top consumers, errors by kind', () => {
    const { el, settle } = setup();
    settle();

    expect(el.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim()).toBe('Traffic');
    const charts = el.querySelectorAll('app-time-series');
    expect(charts.length).toBe(2);
    expect(charts[1].querySelector('.ts')?.getAttribute('data-tone')).toBe('err');
    const bars = (title: string) =>
      Array.from(Array.from(el.querySelectorAll('.chart')).find((c) => c.querySelector('h4')?.textContent?.startsWith(title))!.querySelectorAll('.bar-row')).map(childrenText);
    expect(bars('Top consumers')).toEqual([`Mobile Banking ${compactNumber(6000)}`, `Legacy Batch ${compactNumber(2000)}`]);
    expect(bars('Errors by kind')).toEqual(['Client errors (4xx) 200', 'Server errors (5xx) 40']);
    expect(el.querySelector('.chart .bar-row a')?.getAttribute('href')).toBe('/applications?q=Mobile%20Banking');
    expect(el.querySelector('app-period-switch')).not.toBeNull();
  });

  it('says so when the API received no call on the period', () => {
    const { el, settle } = setup('dev', 'p-14', of({ ...API_METRICS, metrics: null, timeline: [], consumers: [] }));
    settle();

    expect(el.textContent).toContain('No call recorded on this API in the period.');
    expect(el.querySelector('app-time-series')).toBeNull();
  });

  it('keeps the last figures during a Splunk outage and says so; the page itself never depends on the metrics', () => {
    const outage = setup('dev', 'p-14', of({ ...API_METRICS, status: { state: 'ERROR', lastSuccessAt: '2026-01-01T09:50:00Z', error: 'Splunk unreachable' } }));
    outage.settle();
    expect(outage.el.querySelector('.banner-error')?.textContent).toContain('Splunk unreachable');
    expect(outage.el.querySelectorAll('app-time-series').length).toBe(2);
    TestBed.resetTestingModule();

    const down = setup('dev', 'p-14', throwError(() => new Error('down')));
    down.settle();
    expect(down.el.querySelector('h2')?.textContent).toContain('Payments');
    expect(down.el.querySelector('.kpi-value')?.textContent).toBe('—');
  });

  it('reads the metrics again when the period changes', () => {
    const { apiMetrics, store, settle } = setup();
    settle();
    apiMetrics.calls.reset();

    store.setPeriod('7d');
    settle();

    expect(apiMetrics).toHaveBeenCalledOnceWith('dev', 'p-14', '7d');
  });

  it('has four sections, each in its own tab', () => {
    const { el, settle, openTab } = setup();
    settle();

    expect(Array.from(el.querySelectorAll('[role="tab"]')).map((t) => t.textContent?.trim())).toEqual(['Traffic', 'Endpoints', 'Consumers', 'Deployment']);
    openTab('Deployment');
    expect(el.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim()).toBe('Deployment');
    expect(el.querySelector('[role="tabpanel"]')?.id).toBe('panel-deployment');
    expect(el.querySelector('app-time-series')).toBeNull();
  });

  it('gives the full URL of the API on each gateway, ready to copy, and where to get a token', () => {
    const { el, settle, openTab } = setup();
    settle();

    openTab('Endpoints');

    const panel = el.querySelector('#panel-endpoints')!;
    expect(Array.from(panel.querySelectorAll('.url-list li')).map((li) => Array.from(li.children).map((c) => c.textContent?.trim()).slice(0, 2))).toEqual([
      ['Default', 'https://gw-dev.bank.internal:8243/payments/1.4'],
      ['Internal', 'https://gw-int-dev.bank.internal:8243/payments/1.4'],
    ]);
    expect(panel.querySelectorAll('.url-list app-copy-button').length).toBe(2);
    expect(panel.querySelector('.conn-hint')?.textContent).toContain('DEV Identity Server');
    expect(panel.querySelector('.conn-hint .url')?.textContent).toBe('https://is-dev.bank.internal');
  });

  it('says so when no gateway serves the API', () => {
    const { el, apiDetail, settle, openTab } = setup();
    apiDetail.and.returnValue(of({ ...API_DETAIL, gatewayUrls: [] }));
    settle();

    openTab('Endpoints');

    expect(el.querySelector('#panel-endpoints')?.textContent).toContain('No gateway serves this API yet');
  });

  it('lists who is impacted by a change, with the calls each application makes', () => {
    const { el, settle, openTab } = setup();
    settle();

    openTab('Consumers');

    expect(el.querySelector('#panel-consumers .lede')?.textContent?.replace(/\s+/g, ' ')).toContain('2 subscribed applications, 2 owners to contact');
    const rows = Array.from(el.querySelectorAll('#panel-consumers tbody tr')).map((r) => Array.from(r.children).map((c) => c.textContent?.trim()));
    expect(rows).toEqual([
      ['Mobile Banking', 'a.martin', 'a.martin', 'Gold', 'Active', compactNumber(6000), '3.0%'],
      ['Web Banking', 'b.durand', '—', 'Silver', 'Blocked', '—', '—'],
    ]);
  });

  it('leaves out the call columns of the impact table when there are no metrics', () => {
    const { el, settle, openTab } = setup('dev', 'p-14', of({ ...API_METRICS, status: DISABLED, metrics: null, timeline: [], consumers: [] }));
    settle();

    openTab('Consumers');

    expect(Array.from(el.querySelectorAll('#panel-consumers thead th')).map((th) => th.textContent?.trim())).toEqual(['Application', 'Owner', 'Subscriber', 'Policy', 'Status']);
  });

  it('says so when nobody subscribes: changing the API affects nobody', () => {
    const { el, subscriptionsOfApi, settle, openTab } = setup();
    subscriptionsOfApi.and.returnValue(of([]));
    settle();

    openTab('Consumers');

    expect(el.textContent).toContain('changing it affects nobody in DEV');
    expect(Array.from(el.querySelectorAll('button')).some((b) => b.textContent === 'Copy contacts')).toBeFalse();
  });

  it('shows the deployment and links every version to its own page in the other environments', () => {
    const { el, settle, openTab } = setup();
    settle();

    openTab('Deployment');

    expect(el.querySelector('#deploy-title')?.parentElement?.textContent).toContain('gw-int-dev.bank.internal');
    const links = Array.from(el.querySelectorAll('.presence-list a')).map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/apis/dev/p-14', '/apis/sim/s-13', '/apis/sim/s-110', '/apis/uat/u-13']);
    expect(el.querySelector('.presence-list a[aria-current="page"]')?.textContent).toBe('1.4');
    expect(el.querySelector('.presence-list li.current')?.textContent).toContain('DEV');
    expect(el.querySelector('.presence-list .stale')?.textContent).toBe('outdated');
  });

  it('opens Publisher and Devportal only when the environment has configured them, in a new tab without opener', () => {
    const { el, settle } = setup();
    settle();

    const actions = Array.from(el.querySelectorAll<HTMLAnchorElement>('.api-actions a'));
    expect(actions.map((a) => a.getAttribute('href'))).toEqual([
      'https://apim-dev.bank.internal/publisher/apis/p-14/overview',
      'https://apim-dev.bank.internal/devportal/apis/p-14/overview',
    ]);
    expect(actions.every((a) => a.target === '_blank' && a.rel === 'noopener noreferrer')).toBeTrue();

    TestBed.resetTestingModule();
    const other = setup('sim', 's-13');
    other.settle();
    expect(other.el.querySelectorAll('.api-actions a').length).toBe(0);
  });

  it('copies the contacts, one line per owner with their applications', async () => {
    const { fixture, el, settle, openTab } = setup();
    settle();
    const writeText = clipboard();
    openTab('Consumers');

    Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent === 'Copy contacts')!.click();
    await flushPromises();
    fixture.detectChanges();

    expect(writeText).toHaveBeenCalledOnceWith('Applications subscribed to Payments 1.4 in DEV\na.martin: Mobile Banking\nb.durand: Web Banking');
    expect(Array.from(el.querySelectorAll('button')).some((b) => b.textContent === 'Contacts copied')).toBeTrue();
  });

  it('copies the link to the page', async () => {
    const { fixture, el, settle } = setup();
    settle();
    const writeText = clipboard();

    Array.from(el.querySelectorAll<HTMLButtonElement>('.api-actions button')).find((b) => b.textContent === 'Copy link')!.click();
    await flushPromises();

    expect(writeText).toHaveBeenCalledOnceWith(window.location.href);
    fixture.detectChanges();
    expect(el.querySelector('.api-actions button')?.textContent).toBe('Link copied');
  });

  it('reloads when the URL points to another API (link from the environments chips)', () => {
    const { fixture, apiDetail, apiMetrics, paramMap, settle } = setup();
    settle();

    paramMap.next(convertToParamMap({ env: 'sim', apiId: 's-13' }));
    fixture.detectChanges();

    expect(apiDetail).toHaveBeenCalledWith('sim', 's-13');
    expect(apiMetrics).toHaveBeenCalledWith('sim', 's-13', '24h');
  });

  it('distinguishes an API that no longer exists from a server error', () => {
    const missing = setup();
    missing.apiDetail.and.returnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    missing.settle();
    expect(missing.el.textContent).toContain('This API does not exist in DEV');

    TestBed.resetTestingModule();
    const failing = setup();
    failing.apiDetail.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    failing.settle();
    expect(failing.el.querySelector('[role="alert"]')?.textContent).toContain('Unable to load this API');
  });
});
