import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { AppMetricsList, ApplicationMetrics } from './api.models';
import { ApplicationsPageComponent } from './applications-page.component';
import { CatalogService } from './catalog.service';
import { EnvironmentStore } from './environment.store';
import { compactNumber } from './format';
import { APP_METRICS_LIST, APPLICATION_METRICS, APPLICATIONS, DISABLED, SUBSCRIPTIONS, fakeStore } from './testing';

describe('ApplicationsPageComponent', () => {
  function setup(
    options: { query?: string | null; list?: Observable<AppMetricsList>; usage?: Observable<ApplicationMetrics> } = {},
  ) {
    const applications = jasmine.createSpy('applications').and.returnValue(of(APPLICATIONS));
    const subscriptionsOfApplication = jasmine.createSpy('subscriptionsOfApplication').and.returnValue(of(SUBSCRIPTIONS));
    const applicationMetricsList = jasmine.createSpy('applicationMetricsList').and.returnValue(options.list ?? of(APP_METRICS_LIST));
    const applicationMetrics = jasmine.createSpy('applicationMetrics').and.returnValue(options.usage ?? of(APPLICATION_METRICS));
    const query = options.query ?? null;
    const queryParamMap = new BehaviorSubject(convertToParamMap(query === null ? {} : { q: query }));
    const store = fakeStore();
    TestBed.configureTestingModule({
      imports: [ApplicationsPageComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParamMap } },
        { provide: CatalogService, useValue: { applications, subscriptionsOfApplication, applicationMetricsList, applicationMetrics } },
        { provide: EnvironmentStore, useValue: store },
      ],
    });
    const fixture = TestBed.createComponent(ApplicationsPageComponent);
    const el = fixture.nativeElement as HTMLElement;
    const settle = () => {
      fixture.detectChanges();
      TestBed.flushEffects();
      fixture.detectChanges();
    };
    const cells = (row: Element) => Array.from(row.children).slice(0, -1).map((c) => c.textContent?.trim());
    const headers = () => Array.from(el.querySelectorAll('thead th')).slice(0, -1).map((th) => th.textContent?.replace(/[↑↓]/, '').trim());
    return { fixture, el, applications, subscriptionsOfApplication, applicationMetricsList, applicationMetrics, queryParamMap, store, settle, cells, headers };
  }

  it('lists the applications with owner, status, traffic and number of subscribed APIs', () => {
    const { el, applications, applicationMetricsList, headers, cells, settle } = setup();

    settle();

    expect(applications).toHaveBeenCalledOnceWith('dev');
    expect(applicationMetricsList).toHaveBeenCalledOnceWith('dev', '24h');
    expect(headers()).toEqual(['Name', 'Owner', 'Status', 'Calls', 'Error rate', 'Subscribed APIs']);
    const rows = Array.from(el.querySelectorAll('tr.row'));
    expect(rows.length).toBe(2);
    expect(cells(rows[0])).toEqual(['Mobile Banking', 'a.martin', 'Approved', compactNumber(7000), '3.0%', '2']);
    expect(cells(rows[1])).toEqual(['Sandbox', '—', 'Pending', '—', '—', '0']);
  });

  it('hides the traffic columns and filter when no metrics source exists', () => {
    const { el, headers, settle } = setup({ list: of({ ...APP_METRICS_LIST, status: DISABLED, items: [] }) });

    settle();

    expect(headers()).toEqual(['Name', 'Owner', 'Status', 'Subscribed APIs']);
    expect(Array.from(el.querySelectorAll('.filter span')).map((s) => s.textContent)).not.toContain('Traffic');
    expect(el.textContent).toContain('Traffic metrics are not configured for this environment.');
  });

  it('filters on application or owner, instantly, and on traffic', () => {
    const { fixture, el, settle } = setup();
    settle();

    const search = el.querySelector<HTMLInputElement>('input[type="search"]')!;
    search.value = 'martin';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(el.querySelectorAll('tr.row').length).toBe(1);
    expect(el.querySelector('tr.row')?.textContent).toContain('Mobile Banking');

    search.value = '';
    search.dispatchEvent(new Event('input'));
    const traffic = Array.from(el.querySelectorAll<HTMLElement>('.filter')).find((f) => f.querySelector('span')?.textContent === 'Traffic')!.querySelector('select')!;
    traffic.value = 'without';
    traffic.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(el.querySelector('tr.row')?.textContent).toContain('Sandbox');
    expect(el.querySelectorAll('tr.row').length).toBe(1);
  });

  it('is pre-filtered by a link (?q=name), and a later link replaces the filter', () => {
    const { fixture, el, queryParamMap, settle } = setup({ query: 'Sandbox' });
    settle();

    expect(el.querySelector<HTMLInputElement>('input[type="search"]')!.value).toBe('Sandbox');
    expect(el.querySelectorAll('tr.row').length).toBe(1);

    queryParamMap.next(convertToParamMap({ q: 'Mobile' }));
    fixture.detectChanges();

    expect(el.querySelector<HTMLInputElement>('input[type="search"]')!.value).toBe('Mobile');
    expect(el.querySelector('tr.row')?.textContent).toContain('Mobile Banking');
  });

  it('expands a row to show its APIs with the calls each one receives from it', () => {
    const { fixture, el, subscriptionsOfApplication, applicationMetrics, settle } = setup();
    settle();

    const row = el.querySelector<HTMLElement>('tr.row')!;
    row.click();
    fixture.detectChanges();

    expect(subscriptionsOfApplication).toHaveBeenCalledOnceWith('dev', 'a1');
    expect(applicationMetrics).toHaveBeenCalledOnceWith('dev', 'a1', '24h');
    const detail = el.querySelector('tr.detail')!;
    expect(detail.textContent).toContain('Subscribed APIs (2)');
    expect(Array.from(detail.querySelectorAll('thead th')).map((th) => th.textContent?.trim())).toEqual(['API', 'Version', 'Policy', 'Status', 'Calls', 'Error rate']);
    const first = Array.from(detail.querySelectorAll('.sub-list tbody tr')[0].children).map((c) => c.textContent?.trim());
    expect(first).toEqual(['Payments', '1.4', 'Gold', 'Active', compactNumber(6000), '3.0%']);
    expect(detail.querySelector('a')?.getAttribute('href')).toBe('/apis/dev/p-14');
    expect(el.querySelector('button.chevron')?.getAttribute('aria-expanded')).toBe('true');

    row.click();
    fixture.detectChanges();
    expect(el.querySelector('tr.detail')).toBeNull();
  });

  it('shows the subscriptions alone when the application metrics are unavailable or fail', () => {
    const disabled = setup({ usage: of({ ...APPLICATION_METRICS, status: DISABLED, apis: [] }) });
    disabled.settle();
    disabled.el.querySelector<HTMLElement>('tr.row')!.click();
    disabled.fixture.detectChanges();
    expect(Array.from(disabled.el.querySelectorAll('tr.detail thead th')).map((th) => th.textContent?.trim())).toEqual(['API', 'Version', 'Policy', 'Status']);
    TestBed.resetTestingModule();

    const failing = setup({ usage: throwError(() => new Error('down')) });
    failing.settle();
    failing.el.querySelector<HTMLElement>('tr.row')!.click();
    failing.fixture.detectChanges();
    expect(failing.el.querySelector('tr.detail')?.textContent).toContain('Subscribed APIs (2)');
    expect(failing.el.querySelectorAll('tr.detail thead th').length).toBe(4);
  });

  it('reads the open drawers again when the period changes', () => {
    const { el, fixture, applicationMetrics, store, settle } = setup();
    settle();
    el.querySelector<HTMLElement>('tr.row')!.click();
    fixture.detectChanges();
    applicationMetrics.calls.reset();

    store.setPeriod('7d');
    settle();

    expect(applicationMetrics).toHaveBeenCalledWith('dev', 'a1', '7d');
  });
});
