import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { CatalogService } from './catalog.service';
import { DetailPanelComponent } from './detail-panel.component';
import { DetailPanel } from './detail-panel.service';
import { EnvironmentStore } from './environment.store';
import { compactNumber } from './format';
import { API_DETAIL, API_METRICS, APIS, APPLICATION_METRICS, APPLICATIONS, DISABLED, SUBSCRIPTIONS, fakeStore } from './testing';

describe('DetailPanelComponent', () => {
  function setup() {
    const catalog = {
      apiDetail: jasmine.createSpy('apiDetail').and.returnValue(of(API_DETAIL)),
      subscriptionsOfApi: jasmine.createSpy('subscriptionsOfApi').and.returnValue(of(SUBSCRIPTIONS)),
      apiMetrics: jasmine.createSpy('apiMetrics').and.returnValue(of(API_METRICS)),
      subscriptionsOfApplication: jasmine.createSpy('subscriptionsOfApplication').and.returnValue(of(SUBSCRIPTIONS)),
      applicationMetrics: jasmine.createSpy('applicationMetrics').and.returnValue(of(APPLICATION_METRICS)),
      apis: jasmine.createSpy('apis').and.returnValue(of(APIS)),
      applications: jasmine.createSpy('applications').and.returnValue(of(APPLICATIONS)),
    };
    const store = fakeStore();
    TestBed.configureTestingModule({
      imports: [DetailPanelComponent],
      providers: [provideRouter([]), { provide: CatalogService, useValue: catalog }, { provide: EnvironmentStore, useValue: store }],
    });
    const fixture = TestBed.createComponent(DetailPanelComponent);
    const el = fixture.nativeElement as HTMLElement;
    const panel = TestBed.inject(DetailPanel);
    const settle = () => {
      fixture.detectChanges();
      TestBed.flushEffects();
      fixture.detectChanges();
    };
    settle();
    const section = (title: string) =>
      Array.from(el.querySelectorAll('.drawer-section')).find((s) => s.querySelector('h3')?.textContent?.startsWith(title))!;
    return { fixture, el, panel, store, catalog, settle, section };
  }

  const payments = { kind: 'api' as const, env: 'dev', id: 'p-14', name: 'Payments', version: '1.4', from: 'api-p-14' };

  it('shows nothing while closed', () => {
    const { el } = setup();

    expect(el.querySelector('.drawer')).toBeNull();
  });

  it('shows everything about an API at once: path, traffic, endpoints, consumers and deployment', () => {
    const { el, panel, catalog, settle, section } = setup();

    panel.open(payments);
    settle();

    expect(catalog.apiDetail).toHaveBeenCalledOnceWith('dev', 'p-14');
    expect(catalog.apiMetrics).toHaveBeenCalledOnceWith('dev', 'p-14', '24h');
    expect(el.querySelector('.drawer .eyebrow')?.textContent).toContain('API · DEV');
    expect(el.querySelector('#drawer-title')?.textContent).toBe('Payments');
    expect(el.querySelector('[role="tab"]')).toBeNull();
    expect(Array.from(el.querySelectorAll('.drawer-section h3')).map((h) => h.textContent?.split(' ·')[0])).toEqual([
      'Path to production',
      'Traffic',
      'Endpoints',
      'Consumers (2)',
      'Deployment',
    ]);
    expect(section('Path').querySelectorAll('.station').length).toBe(4);
    expect(Array.from(section('Traffic').querySelectorAll('.mini-kpis strong')).map((s) => s.textContent)).toEqual([
      compactNumber(8000),
      '3.0%',
      '300 ms',
    ]);
    expect(section('Endpoints').querySelectorAll('.url-list li').length).toBe(2);
    expect(section('Consumers').querySelector('li')?.textContent).toContain(compactNumber(6000));
    expect(section('Deployment').textContent).toContain('Revision 7');
    expect(el.querySelector('.drawer-actions a')?.getAttribute('href')).toBe('/apis/dev/p-14');
    expect(el.querySelector<HTMLButtonElement>('.drawer-actions .copy')?.title).toBe('https://gw-int-dev.bank.internal:8243/payments/1.4');
  });

  it('opens a consumer application from the API, then comes back', () => {
    const { el, panel, catalog, settle, section } = setup();
    panel.open(payments);
    settle();

    section('Consumers').querySelector<HTMLButtonElement>('.linkbtn')!.click();
    settle();

    expect(catalog.subscriptionsOfApplication).toHaveBeenCalledOnceWith('dev', 'a1');
    expect(el.querySelector('.drawer .eyebrow')?.textContent).toContain('Application · DEV');
    expect(el.querySelector('#drawer-title')?.textContent).toBe('Mobile Banking');
    expect(section('Subscribed APIs').querySelectorAll('li').length).toBe(2);
    expect(panel.origin()).toBe('api-p-14');

    el.querySelector<HTMLButtonElement>('.drawer-head .icon-btn')!.click();
    settle();
    expect(el.querySelector('#drawer-title')?.textContent).toBe('Payments');
    expect(el.querySelectorAll('.drawer-head .icon-btn').length).toBe(1);
  });

  it('shows the subscriptions of an application alone when its metrics are unavailable', () => {
    const { el, panel, catalog, settle, section } = setup();
    catalog.applicationMetrics.and.returnValue(of({ ...APPLICATION_METRICS, status: DISABLED, apis: [] }));

    panel.open({ kind: 'app', env: 'dev', id: 'a1', name: 'Mobile Banking', owner: 'a.martin', status: 'APPROVED', from: 'app-a1' });
    settle();

    expect(el.querySelector('.drawer-sub')?.textContent).toContain('Owner: a.martin');
    expect(el.querySelector('.drawer-actions .pill')?.textContent).toBe('Approved');
    expect(section('Traffic').textContent).toContain('No traffic figures for this environment.');
    expect(section('Subscribed APIs').querySelector('.num')).toBeNull();
  });

  it('follows the header: the same API is found by its name in the new environment', () => {
    const { el, panel, store, catalog, settle } = setup();
    catalog.apis.and.returnValue(of([{ ...APIS[0], apiId: 's-14' }]));
    panel.open(payments);
    settle();
    catalog.apiDetail.calls.reset();

    store.select('sim');
    settle();
    settle();

    expect(catalog.apis).toHaveBeenCalledWith('sim');
    expect(catalog.apiDetail).toHaveBeenCalledOnceWith('sim', 's-14');
    expect(el.querySelector('.drawer .eyebrow')?.textContent).toContain('API · SIM');
  });

  it('says so when the item does not exist in the new environment', () => {
    const { el, panel, store, catalog, settle } = setup();
    catalog.apis.and.returnValue(of([]));
    panel.open(payments);
    settle();

    store.select('exp');
    settle();

    expect(el.querySelector('.drawer-absent')?.textContent).toContain('Payments is not deployed in EXP.');
  });

  it('distinguishes a removed item from a server error', () => {
    const { el, panel, catalog, settle } = setup();
    catalog.apiDetail.and.returnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    panel.open(payments);
    settle();
    expect(el.querySelector('.drawer-absent')).not.toBeNull();

    catalog.apiDetail.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    panel.open({ ...payments, id: 'k-10', from: 'api-k-10' });
    settle();
    expect(el.querySelector('.drawer [role="alert"]')?.textContent).toContain('Unable to load the details.');
  });

  it('reads the traffic again when the period changes', () => {
    const { panel, store, catalog, settle } = setup();
    panel.open(payments);
    settle();

    store.setPeriod('7d');
    settle();

    expect(catalog.apiMetrics).toHaveBeenCalledWith('dev', 'p-14', '7d');
  });

  it('closes with the close button and with Escape', () => {
    const { el, panel, settle } = setup();
    panel.open(payments);
    settle();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    settle();
    expect(panel.isOpen()).toBeFalse();

    panel.open(payments);
    settle();
    Array.from(el.querySelectorAll<HTMLButtonElement>('.drawer-head .icon-btn')).at(-1)!.click();
    expect(panel.isOpen()).toBeFalse();
  });
});
