import { TestBed } from '@angular/core/testing';
import { I18nService } from './i18n';
import { WorldClocksComponent } from './world-clocks.component';

describe('WorldClocksComponent', () => {
  function render(iso: string) {
    const fixture = TestBed.createComponent(WorldClocksComponent);
    fixture.componentRef.setInput('now', Date.parse(iso));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const rows = Array.from(el.querySelectorAll('li')).map((li) => ({
      city: li.querySelector('.clock-city')?.textContent?.trim(),
      time: li.querySelector('time')?.textContent?.trim(),
      day: li.querySelector('.clock-day')?.textContent?.trim() ?? '',
    }));
    return { fixture, rows };
  }

  afterEach(() => TestBed.inject(I18nService).set('en'));

  it('shows Lisbon, Lausanne and Singapore in their own time zone, summer time included', () => {
    // 21 octobre : heure d'été à Lisbonne (UTC+1) et Lausanne (UTC+2) ; Singapour toujours UTC+8.
    expect(render('2026-10-21T10:30:00Z').rows).toEqual([
      { city: 'Lisbon', time: '11:30', day: '' },
      { city: 'Lausanne', time: '12:30', day: '' },
      { city: 'Singapore', time: '18:30', day: '' },
    ]);
  });

  it('follows winter time', () => {
    expect(render('2026-12-01T10:30:00Z').rows.map((r) => r.time)).toEqual(['10:30', '11:30', '18:30']);
  });

  it('marks a city that is already the next day compared with Lausanne', () => {
    const { rows } = render('2026-10-21T17:00:00Z');

    expect(rows[2]).toEqual({ city: 'Singapore', time: '01:00', day: '+1' });
    expect(rows[0].day).toBe('');
  });

  it('translates city names into French', () => {
    TestBed.inject(I18nService).set('fr');

    expect(render('2026-10-21T10:30:00Z').rows.map((r) => r.city)).toEqual(['Lisbonne', 'Lausanne', 'Singapour']);
  });
});
