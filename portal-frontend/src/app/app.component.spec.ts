import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
import { CatalogService } from './catalog.service';
import { DetailPanel } from './detail-panel.service';
import { EnvironmentStore } from './environment.store';
import { fakeStore } from './testing';
import { I18nService } from './i18n';

describe('AppComponent', () => {
  function render(store = fakeStore()) {
    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        { provide: CatalogService, useValue: {} },
        { provide: EnvironmentStore, useValue: store },
      ],
    });
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, store, router: TestBed.inject(Router) };
  }

  const envButtons = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLButtonElement>('.env-switch button'));

  it('shows the API Portal logo (braces and dot) and name in a rail with the main navigation', () => {
    const { el } = render();

    expect(el.querySelector('.rail .brand .brand-name')?.textContent).toBe('API Portal');
    expect(el.querySelector('.brand')?.getAttribute('aria-label')).toBe('API Portal, home');
    expect(el.querySelector('.brand-mark')?.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('.brand-mark circle')).not.toBeNull();
    expect(el.textContent).not.toContain('API Hub');
    expect(Array.from(el.querySelectorAll('.rail nav a')).map((a) => a.textContent?.trim())).toEqual(['Overview', 'APIs', 'Applications', 'Help']);
    expect(el.querySelector('nav a svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(Array.from(el.querySelectorAll('nav a')).map((a) => a.getAttribute('href'))).toEqual(['/', '/apis', '/applications', '/help']);
  });

  it('offers one button per environment, the selected one pressed, states given in text', () => {
    const { el } = render();

    expect(envButtons(el).map((b) => b.textContent?.replace(/[●▲○]/, '').replace('PROD', '').trim())).toEqual(['DEV', 'SIM', 'UAT', 'EXP']);
    expect(envButtons(el).map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false']);
    expect(envButtons(el).map((b) => b.getAttribute('aria-label'))).toEqual([
      'DEV, synchronized',
      'SIM, synchronized',
      'UAT, last synchronization failed',
      'EXP (production), never synchronized',
    ]);
  });

  it('marks production so that nobody mistakes it for another environment', () => {
    const { el } = render();

    expect(envButtons(el).map((b) => b.querySelector('.prod-tag')?.textContent ?? null)).toEqual([null, null, null, 'PROD']);
  });

  it('selects the clicked environment in the store', () => {
    const { fixture, el, store } = render();

    envButtons(el)[1].click();
    fixture.detectChanges();

    expect(store.select).toHaveBeenCalledWith('sim');
    expect(envButtons(el)[1].getAttribute('aria-pressed')).toBe('true');
  });

  it('never leaves the current page when the environment changes: the page follows the selector', () => {
    const { fixture, el, router } = render();
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);
    spyOnProperty(router, 'url').and.returnValue('/apis/dev/p-14');

    envButtons(el)[1].click();
    fixture.detectChanges();

    expect(navigate).not.toHaveBeenCalled();
  });

  it('shifts the page to the left while the side panel is open, and closes the panel on navigation', async () => {
    const { fixture, el, router } = render();
    const panel = TestBed.inject(DetailPanel);

    panel.open({ kind: 'app', env: 'dev', id: null, name: 'Sandbox' });
    fixture.detectChanges();
    expect(el.querySelector('.content')?.classList).toContain('shifted');
    expect(el.querySelector('aside.drawer')).not.toBeNull();

    await router.navigateByUrl('/');
    fixture.detectChanges();
    expect(panel.isOpen()).toBeFalse();
    expect(el.querySelector('.content')?.classList).not.toContain('shifted');
  });

  it('stays on the current page when the environment changes on a list page', () => {
    const { fixture, el, router } = render();
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);
    spyOnProperty(router, 'url').and.returnValue('/apis');

    envButtons(el)[1].click();
    fixture.detectChanges();

    expect(navigate).not.toHaveBeenCalled();
  });

  it('opens the global search from the button and from Ctrl+K / ⌘+K, and closes it with Escape', () => {
    const { fixture, el } = render();
    const open = () => el.ownerDocument.querySelector('app-search-palette .palette') !== null;
    expect(open()).toBeFalse();

    el.querySelector<HTMLButtonElement>('.search-trigger')!.click();
    fixture.detectChanges();
    expect(open()).toBeTrue();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    el.querySelector<HTMLElement>('.palette')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(open()).toBeFalse();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    fixture.detectChanges();
    expect(open()).toBeTrue();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'K', metaKey: true, bubbles: true }));
    fixture.detectChanges();
    expect(open()).toBeFalse();
  });

  it('has no synchronize button: users cannot trigger a synchronization', () => {
    const { el } = render();

    expect(el.textContent?.toLowerCase()).not.toContain('synchronize now');
    // Seuls la recherche, les quatre environnements et les deux langues.
    expect(el.querySelectorAll('button').length).toBe(7);
  });

  it('switches the whole interface between English and French from the header', () => {
    const { fixture, el } = render();
    const langButton = (label: string) =>
      Array.from(el.querySelectorAll<HTMLButtonElement>('.lang-switch button')).find((b) => b.textContent?.trim() === label)!;
    const navTexts = () => Array.from(el.querySelectorAll('nav a')).map((a) => a.textContent?.trim());

    try {
      langButton('FR').click();
      fixture.detectChanges();
      expect(navTexts()).toEqual(['Accueil', 'API', 'Applications', 'Aide']);
      expect(langButton('FR').getAttribute('aria-pressed')).toBe('true');
      expect(document.documentElement.lang).toBe('fr');

      langButton('EN').click();
      fixture.detectChanges();
      expect(navTexts()).toEqual(['Overview', 'APIs', 'Applications', 'Help']);
      expect(langButton('EN').getAttribute('aria-pressed')).toBe('true');
    } finally {
      TestBed.inject(I18nService).set('en');
    }
  });

  it('shows the clocks of the teams and the last synchronization of each environment in the rail', () => {
    const { el } = render();

    expect(Array.from(el.querySelectorAll('.clocks .clock-city')).map((c) => c.textContent?.trim())).toEqual(['Lisbon', 'Lausanne', 'Singapore']);
    expect(el.querySelectorAll('.rail-sync li').length).toBe(4);
    expect(el.querySelector('.rail-sync li[data-state="ERROR"]')?.getAttribute('title')).toContain('UAT');
  });

  it('announces demo mode (mock data) and only then', () => {
    expect(render(fakeStore({ demoMode: true })).el.querySelector('.demo-banner')?.textContent).toContain('mock data');
    TestBed.resetTestingModule();
    expect(render(fakeStore({ demoMode: false })).el.querySelector('.demo-banner')).toBeNull();
  });

  it('says nothing when the selected environment is healthy', () => {
    expect(render().el.querySelector('main .banner')).toBeNull();
  });

  it('reports a failing environment while keeping the last synchronization date', () => {
    const { el } = render(fakeStore({ selected: 'uat' }));

    const banner = el.querySelector('main .banner-error')!;
    expect(banner.textContent).toContain('UAT could not be synchronized');
    expect(banner.textContent).toContain('[uat] control plane unreachable');
    expect(banner.textContent).toContain('20 minutes ago');
  });

  it('reports an environment that has never been synchronized', () => {
    expect(render(fakeStore({ selected: 'exp' })).el.querySelector('main .banner')?.textContent).toContain(
      'EXP has not been synchronized yet',
    );
  });

  it('warns when the portal server is unreachable', () => {
    expect(render(fakeStore({ state: 'error' })).el.querySelector('main .banner-error')?.textContent).toContain(
      'cannot reach its server',
    );
  });
});
