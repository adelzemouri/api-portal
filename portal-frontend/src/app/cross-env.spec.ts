import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { Api } from './api.models';
import { CatalogService } from './catalog.service';
import { CrossEnvIndex, internalUrl, productionKey } from './cross-env';
import { EnvironmentStore } from './environment.store';
import { APIS, ENVIRONMENTS, fakeStore } from './testing';

describe('CrossEnvIndex', () => {
  function setup(byEnv: Record<string, Api[] | 'error'>) {
    const apis = jasmine.createSpy('apis').and.callFake((env: string) => {
      const value = byEnv[env] ?? [];
      return value === 'error' ? throwError(() => new Error('down')) : of(value);
    });
    const store = fakeStore();
    TestBed.configureTestingModule({
      providers: [
        { provide: CatalogService, useValue: { apis } },
        { provide: EnvironmentStore, useValue: store },
      ],
    });
    const index = TestBed.inject(CrossEnvIndex);
    TestBed.flushEffects();
    return { index, apis, store };
  }

  it('reads the APIs of every environment from the BFF and tells where each API is, in DEV → EXP order', () => {
    const { index, apis } = setup({ dev: APIS, sim: [APIS[0]], uat: [], exp: [APIS[1]] });

    expect(apis.calls.allArgs()).toEqual([['dev'], ['sim'], ['uat'], ['exp']]);
    expect(index.ready()).toBeTrue();
    expect(index.presence('Payments')).toEqual(['dev', 'sim']);
    expect(index.presence('KYC Checks')).toEqual(['dev', 'exp']);
    expect(index.presence('Unknown')).toEqual([]);
  });

  it('keeps going when one environment cannot be read', () => {
    const { index } = setup({ dev: APIS, sim: 'error', uat: [], exp: [] });

    expect(index.ready()).toBeTrue();
    expect(index.apis()['sim']).toBeNull();
    expect(index.presence('Payments')).toEqual(['dev']);
  });

  it('reads again when the environments are refreshed', () => {
    const { apis, store } = setup({ dev: APIS });
    apis.calls.reset();

    store.environments.set([...ENVIRONMENTS]);
    TestBed.flushEffects();

    expect(apis).toHaveBeenCalledTimes(4);
  });
});

describe('internalUrl / productionKey', () => {
  it('prefers the internal gateway, then the first one, and appends the context', () => {
    const dev = ENVIRONMENTS[0];
    expect(internalUrl(dev, '/payments/1.4')).toBe('https://gw-int-dev.bank.internal:8243/payments/1.4');
    expect(internalUrl({ ...dev, gateways: [dev.gateways[0]] }, '/kyc')).toBe('https://gw-dev.bank.internal:8243/kyc');
    expect(internalUrl({ ...dev, gateways: [{ name: 'Default', vhost: 'x', url: 'https://gw.example/' }] }, '/kyc')).toBe('https://gw.example/kyc');
    expect(internalUrl(ENVIRONMENTS[1], '/kyc')).toBeNull();
    expect(internalUrl(undefined, '/kyc')).toBeNull();
  });

  it('takes the last environment of the DEV → EXP order as production', () => {
    expect(productionKey([ENVIRONMENTS[3], ENVIRONMENTS[0]])).toBe('exp');
    expect(productionKey([])).toBeUndefined();
  });
});
