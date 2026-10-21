import { Component } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CatalogService } from './catalog.service';
import { EnvironmentStore } from './environment.store';
import { SearchPaletteComponent } from './search-palette.component';
import { APIS, APPLICATIONS, fakeStore } from './testing';

@Component({
  standalone: true,
  imports: [SearchPaletteComponent],
  template: `<app-search-palette [open]="open" (closed)="closed = closed + 1" />`,
})
class HostComponent {
  open = true;
  closed = 0;
}

describe('SearchPaletteComponent', () => {
  function setup() {
    const search = jasmine.createSpy('search').and.returnValue(of({ apis: APIS, applications: APPLICATIONS }));
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [
        provideRouter([]),
        { provide: CatalogService, useValue: { search } },
        { provide: EnvironmentStore, useValue: fakeStore() },
      ],
    });
    const fixture = TestBed.createComponent(HostComponent);
    const el = fixture.nativeElement as HTMLElement;
    const router = TestBed.inject(Router);
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);
    const input = () => el.querySelector<HTMLInputElement>('input')!;
    const typeQuery = (text: string) => {
      fixture.detectChanges();
      input().value = text;
      input().dispatchEvent(new Event('input'));
      fixture.detectChanges();
      TestBed.flushEffects();
      tick(250);
      fixture.detectChanges();
    };
    const press = (key: string) => {
      el.querySelector<HTMLElement>('.palette')!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      fixture.detectChanges();
    };
    return { fixture, el, search, navigate, input, typeQuery, press };
  }

  it('is a modal dialog with the input focused, and waits for a query before searching', fakeAsync(() => {
    const { fixture, el, search, input } = setup();

    fixture.detectChanges();
    TestBed.flushEffects();
    tick(250);
    fixture.detectChanges();

    expect(el.querySelector('.palette')?.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(input());
    expect(el.querySelector('.palette-status')?.textContent).toContain('Type to search');
    expect(search).not.toHaveBeenCalled();
  }));

  it('searches the selected environment after a short pause and lists APIs then applications', fakeAsync(() => {
    const { el, search, typeQuery } = setup();

    typeQuery('pay');

    expect(search).toHaveBeenCalledOnceWith('dev', 'pay');
    const options = Array.from(el.querySelectorAll('[role="option"]')).map((o) =>
      Array.from(o.children).map((c) => c.textContent?.trim()).join(' | '),
    );
    expect(options).toEqual([
      'API | Payments 1.4 | Published · /payments/1.4',
      'API | KYC Checks 1.0 | Deprecated · /kyc/1.0',
      'Application | Mobile Banking | a.martin',
      'Application | Sandbox | ',
    ]);
    expect(el.querySelector('.palette-status')?.textContent).toContain('4 results');
  }));

  it('moves with the arrow keys (wrapping) and exposes the active option to assistive technology', fakeAsync(() => {
    const { el, input, typeQuery, press } = setup();
    typeQuery('pay');

    expect(input().getAttribute('aria-activedescendant')).toBe('palette-option-0');
    press('ArrowDown');
    expect(el.querySelectorAll('[role="option"]')[1].getAttribute('aria-selected')).toBe('true');
    press('ArrowUp');
    press('ArrowUp');
    expect(input().getAttribute('aria-activedescendant')).toBe('palette-option-3');
  }));

  it('opens the API page on Enter, and the filtered applications list for an application', fakeAsync(() => {
    const { fixture, navigate, typeQuery, press } = setup();
    typeQuery('pay');

    press('Enter');
    expect(navigate).toHaveBeenCalledWith(['/apis', 'dev', 'p-14'], undefined);
    expect(fixture.componentInstance.closed).toBe(1);

    // Depuis la première option, « flèche haut » revient à la dernière (Sandbox).
    press('ArrowUp');
    press('Enter');
    expect(navigate).toHaveBeenCalledWith(['/applications'], { queryParams: { q: 'Sandbox' } });
  }));

  it('closes on Escape', fakeAsync(() => {
    const { fixture, typeQuery, press } = setup();
    typeQuery('pay');

    press('Escape');

    expect(fixture.componentInstance.closed).toBe(1);
  }));

  it('says when nothing matches', fakeAsync(() => {
    const { el, search, typeQuery } = setup();
    search.and.returnValue(of({ apis: [], applications: [] }));

    typeQuery('zzz');

    expect(el.querySelector('.palette-status')?.textContent).toContain('No result');
  }));
});
