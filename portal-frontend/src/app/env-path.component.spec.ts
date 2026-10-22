import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Environment, Presence } from './api.models';
import { EnvDotsComponent, EnvPathComponent } from './env-path.component';
import { EnvironmentStore } from './environment.store';
import { ENVIRONMENTS, fakeStore } from './testing';

@Component({
  standalone: true,
  imports: [EnvPathComponent, EnvDotsComponent],
  template: `
    <app-env-path [presence]="presence" current="sim" (pick)="picked = $event" />
    <app-env-dots [envs]="envs" [present]="present" />
  `,
})
class HostComponent {
  presence: Presence[] = [
    { environment: 'dev', label: 'DEV', stale: false, versions: [{ apiId: 'd', version: '1.0.0', revision: 'Revision 4', deployedTime: '2026-01-01T08:10:00Z' }] },
    { environment: 'sim', label: 'SIM', stale: false, versions: [{ apiId: 's', version: '1.0.0', revision: 'Revision 2', deployedTime: '2025-12-30T10:10:00Z' }] },
    { environment: 'uat', label: 'UAT', stale: true, versions: [] },
    { environment: 'exp', label: 'EXP', stale: false, versions: [] },
  ];
  envs: Environment[] = ENVIRONMENTS;
  present = ['dev', 'sim'];
  picked = '';
}

describe('EnvPathComponent / EnvDotsComponent', () => {
  function render() {
    TestBed.configureTestingModule({ imports: [HostComponent], providers: [{ provide: EnvironmentStore, useValue: fakeStore() }] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('draws one station per environment with version, revision and age, the current one marked', () => {
    const { el } = render();

    const stations = Array.from(el.querySelectorAll('.station'));
    expect(stations.map((s) => s.classList.contains('on'))).toEqual([true, true, false, false]);
    expect(stations.map((s) => s.querySelector('button')?.getAttribute('aria-label'))).toEqual([
      'DEV: version 1.0.0, Revision 4, deployed 2 hours ago',
      'SIM: version 1.0.0, Revision 2, deployed 2 days ago',
      'UAT: not deployed',
      'EXP: not deployed',
    ]);
    expect(el.querySelector('.station.current button')?.getAttribute('aria-current')).toBe('true');
    expect(stations[2].querySelector('.stale')?.textContent).toBe('unavailable');
  });

  it('lets the user pick an environment from a station', () => {
    const { fixture, el } = render();

    el.querySelectorAll<HTMLButtonElement>('.station button')[3].click();

    expect(fixture.componentInstance.picked).toBe('exp');
  });

  it('sums up the path of a list row in one sentence for assistive technology', () => {
    const { el } = render();

    const dots = el.querySelector('.dots')!;
    expect(dots.getAttribute('aria-label')).toBe('Deployed in DEV, SIM');
    expect(Array.from(dots.querySelectorAll('i')).map((i) => i.classList.contains('on'))).toEqual([true, true, false, false]);
    expect(dots.querySelectorAll('b').length).toBe(3);
  });
});
