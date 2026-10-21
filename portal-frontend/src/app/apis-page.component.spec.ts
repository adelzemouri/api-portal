import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { Api, ApiMetricsList } from './api.models';
import { ApisPageComponent } from './apis-page.component';
import { CatalogService } from './catalog.service';
import { EnvironmentStore } from './environment.store';
import { compactNumber } from './format';
import { API_DETAIL, API_METRICS_LIST, APIS, DISABLED, SUBSCRIPTIONS, fakeStore } from './testing';

describe('ApisPageComponent', () => {
  function setup(list: Api[] = APIS, metricsList: Observable<ApiMetricsList> = of(API_METRICS_LIST)) {
    const apis = jasmine.createSpy('apis').and.callFake(() => of(list));
    const apiDetail = jasmine.createSpy('apiDetail').and.returnValue(of(API_DETAIL));
    const subscriptionsOfApi = jasmine.createSpy('subscriptionsOfApi').and.returnValue(of(SUBSCRIPTIONS));
    const apiMetricsList = jasmine.createSpy('apiMetricsList').and.returnValue(metricsList);
    const store = fakeStore();
    TestBed.configureTestingModule({
      imports: [ApisPageComponent],
      providers: [
        provideRouter([]),
        { provide: CatalogService, useValue: { apis, apiDetail, subscriptionsOfApi, apiMetricsList } },
        { provide: EnvironmentStore, useValue: store },
      ],
    });
    const fixture = TestBed.createComponent(ApisPageComponent);
    const el = fixture.nativeElement as HTMLElement;
    // Le premier détectChanges arme les effets de toObservable : il faut les vider pour charger la liste.
    const settle = () => {
      fixture.detectChanges();
      TestBed.flushEffects();
      fixture.detectChanges();
    };
    const type = (selector: string, value: string, event = 'input') => {
      const field = el.querySelector<HTMLInputElement | HTMLSelectElement>(selector)!;
      field.value = value;
      field.dispatchEvent(new Event(event));
      fixture.detectChanges();
    };
    const filter = (label: string) =>
      Array.from(el.querySelectorAll<HTMLElement>('.filter')).find((f) => f.querySelector('span')?.textContent === label);
    const choose = (label: string, value: string) => {
      const select = filter(label)!.querySelector('select')!;
      select.value = value;
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    };
    const names = () => Array.from(el.querySelectorAll('tr.row th')).map((th) => th.textContent?.trim());
    const cells = (row: Element) =>
      Array.from(row.children).slice(0, -1).map((c) => c.textContent?.trim());
    const headers = () =>
      Array.from(el.querySelectorAll('thead th')).slice(0, -1).map((th) => th.textContent?.replace(/[↑↓]/, '').trim());
    return { fixture, el, apis, apiDetail, subscriptionsOfApi, apiMetricsList, store, settle, type, filter, choose, names, cells, headers };
  }

  it('lists the APIs of the selected environment with their traffic on the period', () => {
    const { el, apis, apiMetricsList, headers, cells, settle } = setup();

    settle();

    expect(apis).toHaveBeenCalledOnceWith('dev');
    expect(apiMetricsList).toHaveBeenCalledOnceWith('dev', '24h');
    expect(el.querySelector('.page-env')?.textContent).toContain('DEV');
    expect(headers()).toEqual(['Name', 'Version', 'Context', 'Calls', 'Error rate', 'Latency p95', 'Subscribers']);
    const rows = Array.from(el.querySelectorAll('tr.row'));
    expect(cells(rows[0])).toEqual(['KYC Checks', '1.0', '/kyc/1.0', '—', '—', '—', '0']);
    expect(cells(rows[1])).toEqual(['Payments', '1.4', '/payments/1.4', compactNumber(8000), '3.0%', '300 ms', '2']);
    expect(el.querySelector('tr.detail')).toBeNull();
  });

  it('no longer shows the API lifecycle: it is not governed yet', () => {
    const { el, settle, filter } = setup();
    settle();

    expect(el.textContent).not.toContain('Published');
    expect(el.textContent).not.toContain('Deprecated');
    expect(filter('Status')).toBeUndefined();
  });

  it('hides the traffic columns and filter when no metrics source exists, and says why', () => {
    const { el, headers, filter, settle, names } = setup(APIS, of({ ...API_METRICS_LIST, status: DISABLED, items: [] }));

    settle();

    expect(headers()).toEqual(['Name', 'Version', 'Context', 'Subscribers']);
    expect(filter('Traffic')).toBeUndefined();
    expect(el.textContent).toContain('Traffic metrics are not configured for this environment.');
    expect(names()).toEqual(['KYC Checks', 'Payments']);
  });

  it('keeps the last successful figures during a Splunk outage, with the notice', () => {
    const { el, headers, settle } = setup(APIS, of({ ...API_METRICS_LIST, status: { state: 'ERROR', lastSuccessAt: '2026-01-01T09:50:00Z', error: 'Splunk unreachable' } }));

    settle();

    expect(headers()).toContain('Calls');
    expect(el.querySelector('.banner-error')?.textContent).toContain('Splunk unreachable');
  });

  it('still lists the APIs when the metrics request itself fails', () => {
    const { headers, settle, names } = setup(APIS, throwError(() => new Error('down')));

    settle();

    expect(names()).toEqual(['KYC Checks', 'Payments']);
    expect(headers()).toEqual(['Name', 'Version', 'Context', 'Subscribers']);
  });

  it('filters instantly on the text, without any new request', () => {
    const { apis, settle, type, names } = setup();
    settle();
    apis.calls.reset();

    type('input[type="search"]', 'pay');

    expect(names()).toEqual(['Payments']);
    expect(apis).not.toHaveBeenCalled();
  });

  it('filters on type, subscribers and traffic, and clears all filters', () => {
    const { fixture, el, settle, choose, names, filter } = setup();
    settle();
    expect(Array.from(filter('Type')!.querySelectorAll('option')).map((o) => o.textContent?.trim())).toEqual(['All', 'HTTP']);

    choose('Subscribers', 'with');
    expect(names()).toEqual(['Payments']);
    choose('Traffic', 'without');
    expect(el.textContent).toContain('No API matches these filters.');

    el.querySelector<HTMLButtonElement>('.link-btn')!.click();
    fixture.detectChanges();
    expect(names()).toEqual(['KYC Checks', 'Payments']);
    expect(el.querySelector('.link-btn')).toBeNull();
    choose('Traffic', 'with');
    expect(names()).toEqual(['Payments']);
  });

  it('sorts by calls and reverses on a second click, announcing it to assistive technology', () => {
    const { fixture, el, settle, names } = setup();
    settle();
    const calls = () => Array.from(el.querySelectorAll<HTMLElement>('th button.sort')).find((b) => b.textContent?.startsWith('Calls'))!;

    calls().click();
    fixture.detectChanges();
    expect(names()).toEqual(['KYC Checks', 'Payments']);
    expect(el.querySelector('th[aria-sort="ascending"]')?.textContent).toContain('Calls');

    calls().click();
    fixture.detectChanges();
    expect(names()).toEqual(['Payments', 'KYC Checks']);
    expect(el.querySelector('th[aria-sort="descending"]')?.textContent).toContain('Calls');
  });

  it('paginates long lists', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ ...APIS[0], apiId: `id-${i}`, name: `Api ${String(i).padStart(2, '0')}` }));
    const { fixture, el, settle, names } = setup(many);
    settle();

    expect(names().length).toBe(25);
    expect(el.querySelector('.pager-range')?.textContent).toContain('1–25 of 30 APIs');

    Array.from(el.querySelectorAll<HTMLButtonElement>('.pager-buttons button')).find((b) => b.textContent === 'Next')!.click();
    fixture.detectChanges();

    expect(names().length).toBe(5);
    expect(el.querySelector('.pager-range')?.textContent).toContain('26–30 of 30 APIs');
  });

  it('expands a row to show deployment, gateway URLs, presence in every environment and subscribers, loaded once', () => {
    const { fixture, el, apiDetail, subscriptionsOfApi, settle } = setup();
    settle();

    el.querySelectorAll<HTMLElement>('tr.row')[1].click();
    fixture.detectChanges();

    expect(apiDetail).toHaveBeenCalledOnceWith('dev', 'p-14');
    expect(subscriptionsOfApi).toHaveBeenCalledOnceWith('dev', 'p-14');
    const detail = el.querySelector('tr.detail')!;
    expect(detail.textContent).toContain('Revision 7');
    expect(detail.textContent).toContain('gw-int-dev.bank.internal');
    expect(Array.from(detail.querySelectorAll('.url-list .url')).map((u) => u.textContent)).toEqual([
      'https://gw-dev.bank.internal:8243/payments/1.4',
      'https://gw-int-dev.bank.internal:8243/payments/1.4',
    ]);
    expect(detail.querySelectorAll('.url-list app-copy-button').length).toBe(2);
    const presence = Array.from(detail.querySelectorAll('.presence-list li')).map((li) =>
      Array.from(li.children).map((c) => c.textContent?.trim()).join(' '),
    );
    expect(presence).toEqual(['DEV 1.4', 'SIM 1.3, 1.10', 'UAT 1.3 outdated', 'EXP —not present']);
    expect(detail.textContent).toContain('Subscribers (2)');
    expect(detail.textContent).toContain('Mobile Banking');
    expect(detail.querySelector('a')?.getAttribute('href')).toBe('/apis/dev/p-14');
    expect(el.querySelectorAll('button.chevron')[1].getAttribute('aria-expanded')).toBe('true');
  });

  it('gives the open row and its drawer the same marker, so the drawer is easy to spot', () => {
    const { fixture, el, settle } = setup();
    settle();

    el.querySelectorAll<HTMLElement>('tr.row')[1].click();
    fixture.detectChanges();

    const open = el.querySelector('tbody.open')!;
    expect(open.querySelector('tr.row')).not.toBeNull();
    expect(open.querySelector('tr.detail')).not.toBeNull();
    expect(el.querySelectorAll('tbody.open').length).toBe(1);
  });

  it('collapses on a second click, and reports a failed detail load', () => {
    const { fixture, el, apiDetail, settle } = setup();
    settle();
    const row = el.querySelectorAll<HTMLElement>('tr.row')[1];

    row.click();
    row.click();
    fixture.detectChanges();
    expect(el.querySelector('tr.detail')).toBeNull();

    apiDetail.and.returnValue(throwError(() => new Error('boom')));
    row.click();
    fixture.detectChanges();
    expect(el.querySelector('tr.detail')?.textContent).toContain('Unable to load the details of this API');
  });

  it('switching environment reloads the list and the metrics, resets the filters and collapses every row', () => {
    const { el, apis, apiMetricsList, store, settle, type } = setup();
    settle();
    type('input[type="search"]', 'pay');
    el.querySelector<HTMLElement>('tr.row')!.click();
    apis.calls.reset();
    apiMetricsList.calls.reset();

    store.select('sim');
    settle();

    expect(apis).toHaveBeenCalledOnceWith('sim');
    expect(apiMetricsList).toHaveBeenCalledOnceWith('sim', '24h');
    expect(el.querySelector<HTMLInputElement>('input[type="search"]')!.value).toBe('');
    expect(el.querySelector('tr.detail')).toBeNull();
    expect(el.querySelector('.page-env')?.textContent).toContain('SIM');
  });

  it('changing the period reads the metrics again, not the catalog', () => {
    const { apis, apiMetricsList, store, settle } = setup();
    settle();
    apis.calls.reset();

    store.setPeriod('7d');
    settle();

    expect(apiMetricsList).toHaveBeenCalledWith('dev', '7d');
    expect(apis).not.toHaveBeenCalled();
  });

  it('refreshing keeps the expanded rows open', () => {
    const { fixture, el, store, subscriptionsOfApi, settle } = setup();
    settle();
    el.querySelectorAll<HTMLElement>('tr.row')[1].click();
    fixture.detectChanges();
    subscriptionsOfApi.calls.reset();

    (store.refreshTick as unknown as { update: (fn: (n: number) => number) => void }).update((n) => n + 1);
    settle();

    expect(el.querySelector('tr.detail')?.textContent).toContain('Mobile Banking');
    expect(subscriptionsOfApi).toHaveBeenCalledTimes(1);
  });

  it('shows an empty message and an error message', () => {
    const empty = setup([]);
    empty.settle();
    expect(empty.el.textContent).toContain('No API in this environment.');

    TestBed.resetTestingModule();
    const failing = setup();
    failing.apis.and.returnValue(throwError(() => new Error('down')));
    failing.settle();
    expect(failing.el.querySelector('[role="alert"]')?.textContent).toContain('Unable to load the APIs');
  });
});
