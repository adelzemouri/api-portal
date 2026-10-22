import { TestBed } from '@angular/core/testing';
import { DetailPanel, PanelItem } from './detail-panel.service';
import { EnvironmentStore } from './environment.store';
import { fakeStore } from './testing';

describe('DetailPanel', () => {
  const payments: PanelItem = { kind: 'api', env: 'dev', id: 'p-14', name: 'Payments', version: '1.4', from: 'api-p-14' };
  const kyc: PanelItem = { kind: 'api', env: 'dev', id: 'k-10', name: 'KYC Checks', version: '1.0', from: 'api-k-10' };
  const mobile: PanelItem = { kind: 'app', env: 'dev', id: 'a1', name: 'Mobile Banking', from: 'app-a1' };

  function setup() {
    const store = fakeStore();
    TestBed.configureTestingModule({ providers: [{ provide: EnvironmentStore, useValue: store }] });
    const panel = TestBed.inject(DetailPanel);
    TestBed.flushEffects();
    return { panel, store };
  }

  it('opens on an item, marks its row, swaps on another row and closes on the same row', () => {
    const { panel } = setup();

    panel.open(payments);
    expect(panel.isOpen()).toBeTrue();
    expect(panel.isSelected('api-p-14')).toBeTrue();

    panel.open(kyc);
    expect(panel.current()).toEqual(kyc);
    expect(panel.isSelected('api-p-14')).toBeFalse();

    panel.open(kyc);
    expect(panel.isOpen()).toBeFalse();
  });

  it('stacks related items, keeps the original row marked, and goes back', () => {
    const { panel } = setup();
    panel.open(payments);

    panel.push(mobile);
    expect(panel.current()?.name).toBe('Mobile Banking');
    expect(panel.current()?.from).toBeUndefined();
    expect(panel.origin()).toBe('api-p-14');

    panel.back();
    expect(panel.current()).toEqual(payments);
    panel.close();
    expect(panel.stack()).toEqual([]);
  });

  it('follows the environment chosen in the header: every item is to be found again by its name', () => {
    const { panel, store } = setup();
    panel.open(payments);
    panel.push(mobile);

    store.select('sim');
    TestBed.flushEffects();

    expect(panel.stack().map((i) => [i.env, i.id, i.name])).toEqual([
      ['sim', null, 'Payments'],
      ['sim', null, 'Mobile Banking'],
    ]);

    panel.resolve({ ...mobile, env: 'sim', id: 's-a1' });
    expect(panel.current()?.id).toBe('s-a1');
  });
});
