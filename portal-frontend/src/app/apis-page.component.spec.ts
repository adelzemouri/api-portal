import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { Api, ApiMetricsList } from './api.models';
import { ApisPageComponent } from './apis-page.component';
import { CatalogService } from './catalog.service';
import { EnvironmentStore } from './environment.store';
import { compactNumber } from './format';
import { CrossEnvIndex } from './cross-env';
import { DetailPanel } from './detail-panel.service';
import { API_DETAIL, API_METRICS_LIST, APIS, DISABLED, SUBSCRIPTIONS, fakeIndex, fakeStore } from './testing';

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
        { provide: CrossEnvIndex, useValue: fakeIndex() },
      ],
    });
    const fixture = TestBed.createComponent(ApisPageComponent);
    const panel = TestBed.inject(DetailPanel);
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
    const names = () => Array.from(el.querySelectorAll('tr.row th .linkbtn')).map((b) => b.textContent?.trim());
    const cells = (row: Element) =>
      Array.from(row.children).slice(0, -1).map((c) => c.textContent?.replace(/\s+/g, ' ').trim());
    const headers = () =>
      Array.from(el.querySelectorAll('thead th')).slice(0, -1).map((th) => th.textContent?.replace(/[↑↓]/, '').trim());
    return { fixture, el, panel, apis, apiDetail, subscriptionsOfApi, apiMetricsList, store, settle, type, filter, choose, names, cells, headers };
  }

  it('lists the APIs of the selected environment with their traffic on the period', () => {
    const { el, apis, apiMetricsList, headers, cells, settle } = setup();

    settle();

    expect(apis).toHaveBeenCalledOnceWith('dev');
    expect(apiMetricsList).toHaveBeenCalledOnceWith('dev', '24h');
    expect(el.querySelector('.eyebrow')?.textContent).toContain('2 APIs in DEV');
    expect(headers()).toEqual(['API', 'Path', 'Context', 'Calls', 'Errors', 'Latency p95', 'Subscribers']);
    const rows = Array.from(el.querySelectorAll('tr.row'));
    expect(cells(rows[0])).toEqual(['KYC Checks1.0', '', '/kyc/1.0', '—', '—', '—', '0']);
    expect(cells(rows[1])).toEqual(['Payments1.4', '', '/payments/1.4', compactNumber(8000), '3.0%', '300 ms', '2']);
  });

  it('no longer shows the API lifecycle: it is not governed yet', () => {
    const { el, settle, filter } = setup();
    settle();

    expect(el.textContent).not.toContain('Published');
    expect(el.textContent).not.toContain('Deprecated');
    expect(filter('Status')).toBeUndefined();
    expect(el.querySelector('tr.row .row-sub')?.textContent?.trim()).toBe('1.0');
  });

  it('hides the traffic columns and filter when no metrics source exists, and says why', () => {
    const { el, headers, filter, settle, names } = setup(APIS, of({ ...API_METRICS_LIST, status: DISABLED, items: [] }));

    settle();

    expect(headers()).toEqual(['API', 'Path', 'Context', 'Subscribers']);
    expect(Array.from(el.querySelectorAll('.chip')).map((c) => c.textContent)).not.toContain(jasmine.stringContaining('Not called'));
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
    expect(headers()).toEqual(['API', 'Path', 'Context', 'Subscribers']);
  });

  it('filters instantly on the text, without any new request', () => {
    const { apis, settle, type, names } = setup();
    settle();
    apis.calls.reset();

    type('input[type="search"]', 'pay');

    expect(names()).toEqual(['Payments']);
    expect(apis).not.toHaveBeenCalled();
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

  it('opens the side panel on a row, keeps the row highlighted, and closes it on a second click', () => {
    const { fixture, el, settle, panel } = setup();
    settle();

    el.querySelectorAll<HTMLElement>('tr.row')[1].click();
    fixture.detectChanges();

    expect(panel.current()).toEqual(jasmine.objectContaining({ kind: 'api', env: 'dev', id: 'p-14', name: 'Payments', version: '1.4' }));
    const row = el.querySelectorAll('tr.row')[1];
    expect(row.classList).toContain('is-sel');
    expect(row.querySelector('.linkbtn')?.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelectorAll('tr.is-sel').length).toBe(1);
    expect(el.querySelector('tr.detail')).toBeNull();

    el.querySelectorAll<HTMLElement>('tr.row')[1].click();
    fixture.detectChanges();
    expect(panel.isOpen()).toBeFalse();
    expect(el.querySelector('tr.is-sel')).toBeNull();
  });

  it('swaps the panel content when another row is clicked, without closing it', () => {
    const { fixture, el, settle, panel } = setup();
    settle();

    el.querySelectorAll<HTMLElement>('tr.row')[1].click();
    el.querySelectorAll<HTMLElement>('tr.row')[0].click();
    fixture.detectChanges();

    expect(panel.current()?.name).toBe('KYC Checks');
    expect(el.querySelectorAll('tr.row')[0].classList).toContain('is-sel');
    expect(el.querySelectorAll('tr.row')[1].classList).not.toContain('is-sel');
  });

  it('shows the path of each API across the environments', () => {
    const { el, settle } = setup();
    settle();

    const labels = Array.from(el.querySelectorAll('tr.row .dots')).map((d) => d.getAttribute('aria-label'));
    expect(labels).toEqual(['Deployed in DEV, SIM, UAT, EXP', 'Deployed in DEV, SIM, UAT']);
  });

  it('copies the internal gateway URL straight from the row, without opening the panel', async () => {
    const { fixture, el, settle, panel } = setup();
    settle();
    const write = jasmine.createSpy('writeText').and.resolveTo();
    spyOnProperty(navigator, 'clipboard', 'get').and.returnValue({ writeText: write } as unknown as Clipboard);

    const button = el.querySelectorAll<HTMLButtonElement>('tr.row .copy')[1];
    expect(button.textContent?.trim()).toBe('Copy internal URL');
    expect(button.title).toBe('Internal gateway DEV : https://gw-int-dev.bank.internal:8243/payments/1.4');
    button.click();
    await fixture.whenStable();

    expect(write).toHaveBeenCalledOnceWith('https://gw-int-dev.bank.internal:8243/payments/1.4');
    expect(panel.isOpen()).toBeFalse();
  });

  it('offers quick filters with their counts, including the APIs not yet in production', () => {
    const { fixture, el, settle, names } = setup();
    settle();
    const chips = () => Array.from(el.querySelectorAll<HTMLButtonElement>('.chip'));

    expect(chips().map((c) => c.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'All 2',
      'With subscribers 1',
      'No subscribers 1',
      'Not called 1',
      'Not yet in EXP 1',
    ]);

    chips()[4].click();
    fixture.detectChanges();
    expect(names()).toEqual(['Payments']);
    expect(chips()[4].getAttribute('aria-pressed')).toBe('true');

    chips()[2].click();
    fixture.detectChanges();
    expect(names()).toEqual(['KYC Checks']);
  });

  it('switching environment reloads the list and the metrics and resets the filters', () => {
    const { el, apis, apiMetricsList, store, settle, type } = setup();
    settle();
    type('input[type="search"]', 'pay');
    apis.calls.reset();
    apiMetricsList.calls.reset();

    store.select('sim');
    settle();

    expect(apis).toHaveBeenCalledOnceWith('sim');
    expect(apiMetricsList).toHaveBeenCalledOnceWith('sim', '24h');
    expect(el.querySelector<HTMLInputElement>('input[type="search"]')!.value).toBe('');
    expect(el.querySelector('.eyebrow')?.textContent).toContain('SIM');
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
