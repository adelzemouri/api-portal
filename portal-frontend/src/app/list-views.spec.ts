import { TestBed } from '@angular/core/testing';
import { ApiRow, ApplicationRow } from './api.models';
import { ApisView, ApplicationsView } from './list-views';

const api = (name: string, status: string, type: string, subs: number, calls = 0, context = `/${name.toLowerCase()}/1`): ApiRow => ({
  apiId: name,
  name,
  version: '1.0',
  context,
  type,
  lifeCycleStatus: status,
  subscriptionCount: subs,
  calls,
  errorRate: calls ? calls / 1000 : 0,
  p95: calls ? 1000 - calls : 0,
});

describe('ApisView', () => {
  const rows = [
    api('Payments', 'PUBLISHED', 'HTTP', 3, 500),
    api('Legacy', 'DEPRECATED', 'SOAP', 0, 0),
    api('Cards', 'PUBLISHED', 'HTTP', 0, 20),
  ];
  let view: ApisView;

  beforeEach(() => (view = TestBed.inject(ApisView)));

  it('filters on name or context, case-insensitively', () => {
    view.setQuery('PAY');
    expect(view.filter(rows).map((r) => r.name)).toEqual(['Payments']);
    view.setQuery('/cards');
    expect(view.filter(rows).map((r) => r.name)).toEqual(['Cards']);
  });

  it('combines status, type and subscriber filters', () => {
    view.setStatus('PUBLISHED');
    view.setSubscribers('without');
    expect(view.filter(rows).map((r) => r.name)).toEqual(['Cards']);
    view.reset();
    view.setType('SOAP');
    expect(view.filter(rows).map((r) => r.name)).toEqual(['Legacy']);
    expect(view.active()).toBeTrue();
  });

  it('filters on traffic: called or not called on the period', () => {
    view.setTraffic('with');
    expect(view.filter(rows).map((r) => r.name)).toEqual(['Payments', 'Cards']);
    view.setTraffic('without');
    expect(view.filter(rows).map((r) => r.name)).toEqual(['Legacy']);
    view.setTraffic('nonsense');
    expect(view.traffic()).toBe('all');
    expect(view.active()).toBeFalse();
  });

  it('sorts by calls, error rate and latency', () => {
    view.table.toggleSort('calls');
    expect(view.table.sort(rows).map((r) => r.name)).toEqual(['Legacy', 'Cards', 'Payments']);
    view.table.toggleSort('calls');
    expect(view.table.sort(rows).map((r) => r.name)).toEqual(['Payments', 'Cards', 'Legacy']);
    view.table.toggleSort('errorRate');
    expect(view.table.sort(rows)[0].name).toBe('Legacy');
    view.table.toggleSort('p95');
    expect(view.table.sort(rows)[0].name).toBe('Legacy');
    expect(view.table.sort(rows)[2].name).toBe('Cards');
  });

  it('resets everything, and only when the environment changes on entry', () => {
    view.enter('dev');
    view.setQuery('pay');
    view.setTraffic('with');
    view.enter('dev');
    expect(view.query()).toBe('pay');

    view.enter('sim');

    expect(view.query()).toBe('');
    expect(view.traffic()).toBe('all');
    expect(view.active()).toBeFalse();
  });

  it('goes back to the first page when a filter changes', () => {
    view.table.page.set(3);
    view.setStatus('PUBLISHED');
    expect(view.table.page()).toBe(0);
    view.table.page.set(3);
    view.setTraffic('with');
    expect(view.table.page()).toBe(0);
  });
});

describe('ApplicationsView', () => {
  const apps: ApplicationRow[] = [
    { environment: 'dev', applicationId: '1', name: 'Mobile', owner: 'a.martin', status: 'APPROVED', subscriptionCount: 2, calls: 900, errorRate: 0.02 },
    { environment: 'dev', applicationId: '2', name: 'Sandbox', owner: null, status: 'CREATED', subscriptionCount: 0, calls: 0, errorRate: 0 },
  ];

  it('filters on name or owner, status, subscriptions and traffic', () => {
    const view = TestBed.inject(ApplicationsView);

    view.setQuery('martin');
    expect(view.filter(apps).map((a) => a.name)).toEqual(['Mobile']);
    view.reset();
    view.setStatus('CREATED');
    expect(view.filter(apps).map((a) => a.name)).toEqual(['Sandbox']);
    view.reset();
    view.setSubscribers('with');
    expect(view.filter(apps).map((a) => a.name)).toEqual(['Mobile']);
    view.reset();
    view.setTraffic('without');
    expect(view.filter(apps).map((a) => a.name)).toEqual(['Sandbox']);
  });

  it('sorts by calls', () => {
    const view = TestBed.inject(ApplicationsView);

    view.table.toggleSort('calls');

    expect(view.table.sort(apps).map((a) => a.name)).toEqual(['Sandbox', 'Mobile']);
  });
});
