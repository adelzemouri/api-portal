import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { AppMetricsList, ApplicationMetrics } from './api.models';
import { ApplicationsPageComponent } from './applications-page.component';
import { CatalogService } from './catalog.service';
import { DetailPanel } from './detail-panel.service';
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
    const cells = (row: Element) => Array.from(row.children).map((c) => c.textContent?.trim());
    const headers = () => Array.from(el.querySelectorAll('thead th')).map((th) => th.textContent?.replace(/[↑↓]/, '').trim());
    const panel = TestBed.inject(DetailPanel);
    return { fixture, panel, el, applications, subscriptionsOfApplication, applicationMetricsList, applicationMetrics, queryParamMap, store, settle, cells, headers };
  }

  it('lists the applications with owner, status, traffic and number of subscribed APIs', () => {
    const { el, applications, applicationMetricsList, headers, cells, settle } = setup();

    settle();

    expect(applications).toHaveBeenCalledOnceWith('dev');
    expect(applicationMetricsList).toHaveBeenCalledOnceWith('dev', '24h');
    expect(headers()).toEqual(['Name', 'Owner', 'Status', 'Calls', 'Errors', 'Subscribed APIs']);
    const rows = Array.from(el.querySelectorAll('tr.row'));
    expect(rows.length).toBe(2);
    expect(cells(rows[0])).toEqual(['Mobile Banking', 'a.martin', 'Approved', compactNumber(7000), '3.0%', '2']);
    expect(cells(rows[1])).toEqual(['Sandbox', '—', 'Pending', '—', '—', '0']);
  });

  it('hides the traffic columns and filter when no metrics source exists', () => {
    const { el, headers, settle } = setup({ list: of({ ...APP_METRICS_LIST, status: DISABLED, items: [] }) });

    settle();

    expect(headers()).toEqual(['Name', 'Owner', 'Status', 'Subscribed APIs']);
    expect(Array.from(el.querySelectorAll('.chip')).map((c) => c.textContent?.trim())).not.toContain('No call');
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
    Array.from(el.querySelectorAll<HTMLButtonElement>('.chip')).find((c) => c.textContent?.trim() === 'No call')!.click();
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

  it('opens the side panel on a row, without arrows that suggest the row unfolds', () => {
    const { fixture, el, settle, panel, subscriptionsOfApplication } = setup();
    settle();

    expect(el.querySelector('button.chevron')).toBeNull();
    el.querySelector<HTMLElement>('tr.row')!.click();
    fixture.detectChanges();

    expect(panel.current()).toEqual(
      jasmine.objectContaining({ kind: 'app', env: 'dev', id: 'a1', name: 'Mobile Banking', owner: 'a.martin', status: 'APPROVED' }),
    );
    expect(el.querySelector('tr.row')!.classList).toContain('is-sel');
    expect(el.querySelector('tr.detail')).toBeNull();
    // Le volet charge lui-même ses données : la page ne fait aucun appel de plus.
    expect(subscriptionsOfApplication).not.toHaveBeenCalled();
  });

  it('quick filters select the applications with or without subscriptions, or without calls', () => {
    const { fixture, el, settle } = setup();
    settle();
    const chip = (label: string) => Array.from(el.querySelectorAll<HTMLButtonElement>('.chip')).find((c) => c.textContent?.includes(label))!;
    const names = () => Array.from(el.querySelectorAll('tr.row .linkbtn')).map((b) => b.textContent?.trim());

    chip('No subscriptions').click();
    fixture.detectChanges();
    expect(names()).toEqual(['Sandbox']);
    expect(chip('No subscriptions').getAttribute('aria-pressed')).toBe('true');

    chip('With subscriptions').click();
    fixture.detectChanges();
    expect(names()).toEqual(['Mobile Banking']);

    chip('All').click();
    fixture.detectChanges();
    expect(names()).toEqual(['Mobile Banking', 'Sandbox']);
  });
});
