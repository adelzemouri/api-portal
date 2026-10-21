import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CatalogService } from './catalog.service';

describe('CatalogService', () => {
  let service: CatalogService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(CatalogService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('calls the BFF (never WSO2) for the environments, lists and overview', () => {
    service.environments().subscribe();
    service.apis('dev').subscribe();
    service.applications('exp').subscribe();
    service.overview('sim').subscribe();

    const requests = [
      http.expectOne('/api/v1/environments'),
      http.expectOne('/api/v1/environments/dev/apis'),
      http.expectOne('/api/v1/environments/exp/applications'),
      http.expectOne('/api/v1/environments/sim/overview'),
    ];
    expect(requests.map((r) => r.request.method)).toEqual(['GET', 'GET', 'GET', 'GET']);
    requests.forEach((r) => r.flush([]));
  });

  it('reads the traffic metrics from the BFF, per period, for the whole environment and per API or application', () => {
    service.metrics('dev', '24h').subscribe();
    service.apiMetricsList('dev', '7d').subscribe();
    service.applicationMetricsList('exp', '24h').subscribe();
    service.apiMetrics('dev', 'a/b', '7d').subscribe();
    service.applicationMetrics('sim', 'app 1', '24h').subscribe();

    const requests = [
      http.expectOne((r) => r.url === '/api/v1/environments/dev/metrics' && r.params.get('window') === '24h'),
      http.expectOne((r) => r.url === '/api/v1/environments/dev/metrics/apis' && r.params.get('window') === '7d'),
      http.expectOne((r) => r.url === '/api/v1/environments/exp/metrics/applications' && r.params.get('window') === '24h'),
      http.expectOne((r) => r.url === '/api/v1/environments/dev/apis/a%2Fb/metrics' && r.params.get('window') === '7d'),
      http.expectOne((r) => r.url === '/api/v1/environments/sim/applications/app%201/metrics' && r.params.get('window') === '24h'),
    ];
    expect(requests.map((r) => r.request.method)).toEqual(['GET', 'GET', 'GET', 'GET', 'GET']);
    requests.forEach((r) => r.flush({}));
  });

  it('loads the portal-wide information from the BFF', () => {
    service.portal().subscribe();

    const req = http.expectOne('/api/v1/portal');
    expect(req.request.method).toBe('GET');
    req.flush({ deployComponentUrl: null });
  });

  it('sends the trimmed text of the global search', () => {
    service.search('dev', '  pay ').subscribe();

    const req = http.expectOne((r) => r.url === '/api/v1/environments/dev/search');
    expect(req.request.params.get('q')).toBe('pay');
    req.flush({ apis: [], applications: [] });
  });

  it('loads the detail and the subscriptions, ids encoded', () => {
    service.apiDetail('dev', 'a/b').subscribe();
    service.subscriptionsOfApi('dev', 'a/b').subscribe();
    service.subscriptionsOfApplication('sim', 'app 1').subscribe();

    const requests = [
      http.expectOne('/api/v1/environments/dev/apis/a%2Fb'),
      http.expectOne('/api/v1/environments/dev/apis/a%2Fb/subscriptions'),
      http.expectOne('/api/v1/environments/sim/applications/app%201/subscriptions'),
    ];
    expect(requests.map((r) => r.request.method)).toEqual(['GET', 'GET', 'GET']);
    requests.forEach((r) => r.flush([]));
  });

  it('adds no authentication header (the browser carries no WSO2 token)', () => {
    service.apis('dev').subscribe();

    const req = http.expectOne('/api/v1/environments/dev/apis');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush([]);
  });
});
