import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { CatalogService } from './catalog.service';
import { ENV_STORAGE_KEY, EnvironmentStore } from './environment.store';
import { ENVIRONMENTS, PORTAL } from './testing';

describe('EnvironmentStore', () => {
  function create() {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CatalogService,
          useValue: { environments: () => of(ENVIRONMENTS), portal: () => of(PORTAL), info: () => of({}) },
        },
      ],
    });
    return TestBed.inject(EnvironmentStore);
  }

  afterEach(() => localStorage.removeItem(ENV_STORAGE_KEY));

  it('starts on the first environment the first time', () => {
    localStorage.removeItem(ENV_STORAGE_KEY);

    expect(create().selectedKey()).toBe('dev');
  });

  it('remembers the chosen environment from one visit to the next', () => {
    create().select('uat');
    expect(localStorage.getItem(ENV_STORAGE_KEY)).toBe('uat');

    TestBed.resetTestingModule();
    expect(create().selectedKey()).toBe('uat');
  });

  it('falls back to the first environment when the remembered one no longer exists', () => {
    localStorage.setItem(ENV_STORAGE_KEY, 'old');

    expect(create().selectedKey()).toBe('dev');
  });

  it('still switches when the browser blocks storage', () => {
    const store = create();
    spyOn(Storage.prototype, 'setItem').and.throwError('blocked');

    store.select('sim');

    expect(store.selectedKey()).toBe('sim');
  });
});
