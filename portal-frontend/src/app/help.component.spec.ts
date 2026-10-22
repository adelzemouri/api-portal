import { TestBed } from '@angular/core/testing';
import { EnvironmentStore } from './environment.store';
import { HelpComponent } from './help.component';
import { fakeStore } from './testing';

describe('HelpComponent', () => {
  function render() {
    TestBed.configureTestingModule({ imports: [HelpComponent], providers: [{ provide: EnvironmentStore, useValue: fakeStore() }] });
    const fixture = TestBed.createComponent(HelpComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('explains how to deploy an API with the swagger-deploy GitLab component, first thing on the page', () => {
    const el = render();

    const first = el.querySelector('section')!;
    expect(first.querySelector('h3')?.textContent).toBe('Deploy your API to WSO2');
    expect(first.textContent).toContain('swagger-deploy');
    expect(first.textContent).toContain('.gitlab-ci.yml');
    expect(first.querySelectorAll('ol li').length).toBe(5);
    const link = first.querySelector<HTMLAnchorElement>('a.btn')!;
    expect(link.getAttribute('href')).toBe('https://gitlab.bank.internal/platform/ci-components/swagger-deploy');
    expect(link.rel).toBe('noopener noreferrer');
  });

  it('lists every environment with its WSO2 links, Identity Server and gateway URLs', () => {
    const rows = Array.from(render().querySelectorAll('table tbody tr'));

    expect(rows.length).toBe(4);
    expect(rows[0].textContent).toContain('DEV');
    expect(rows[0].querySelectorAll('a').length).toBe(2);
    expect(rows[0].textContent).toContain('https://is-dev.bank.internal');
    expect(rows[0].textContent).toContain('https://gw-dev.bank.internal:8243');
    expect(rows[0].querySelectorAll('app-copy-button').length).toBe(3);
    expect(rows[1].querySelectorAll('a').length).toBe(0);
    expect(rows[1].textContent).toContain('No gateway seen yet');
    expect(Array.from(rows[0].querySelectorAll('a')).every((a) => a.getAttribute('rel') === 'noopener noreferrer')).toBeTrue();
  });

  it('states what the portal is and is not, and that EXP is production', () => {
    const text = render().textContent!;

    expect(text).toContain('EXP is the production environment');
    expect(text).toContain('read-only');
    expect(text).toContain('not from real-time calls');
  });

  it('explains where the traffic figures come from and how to read them', () => {
    const el = render();

    const section = Array.from(el.querySelectorAll('section')).find((s) => s.querySelector('h3')?.textContent === 'Reading the traffic figures')!;
    expect(section.textContent).toContain('Splunk');
    expect(section.textContent).toContain('status of 400 or above');
    expect(section.textContent).toContain('Latency p95');
    expect(section.textContent).toContain('fewer than 20 calls');
  });

  it('translates every status in the glossary, with a meaning for each', () => {
    const el = render();

    const terms = Array.from(el.querySelectorAll('dt')).map((dt) => dt.textContent?.trim());
    expect(terms).toEqual([
      'Created', 'Prototyped', 'Published', 'Deprecated', 'Blocked', 'Retired',
      'Active', 'On hold', 'Policy change pending', 'Blocked', 'Blocked in production', 'Rejected',
      'Approved', 'Pending', 'Rejected',
    ]);
    expect(el.querySelectorAll('dd').length).toBe(terms.length);
  });
});
