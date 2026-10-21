import { TestBed } from '@angular/core/testing';
import { I18nService, translate } from './i18n';
import { FR } from './i18n.fr';
import { formatDateTime, formatInt, formatMs, formatPercent, formatRelative } from './format';

describe('I18nService', () => {
  let i18n: I18nService;

  beforeEach(() => {
    i18n = TestBed.inject(I18nService);
    i18n.set('en');
  });

  afterEach(() => i18n.set('en'));

  it('keeps the English source text in English', () => {
    expect(translate('Overview')).toBe('Overview');
  });

  it('translates to French, remembers the choice and sets the page language', () => {
    i18n.set('fr');

    expect(translate('Overview')).toBe('Accueil');
    expect(i18n.lang()).toBe('fr');
    expect(document.documentElement.lang).toBe('fr');
    expect(localStorage.getItem('portal.lang')).toBe('fr');
  });

  it('falls back to English when a French text is missing, instead of showing a key', () => {
    i18n.set('fr');

    expect(translate('A text nobody translated')).toBe('A text nobody translated');
  });

  it('fills {placeholders} in both languages and leaves unknown ones visible', () => {
    expect(translate('Hello {name}, {other}', { name: 'Ana' })).toBe('Hello Ana, {other}');
  });

  it('toggles between the two languages', () => {
    i18n.toggle();
    expect(i18n.lang()).toBe('fr');
    i18n.toggle();
    expect(i18n.lang()).toBe('en');
  });

  it('formats numbers, durations, percentages and dates the French way', () => {
    i18n.set('fr');

    expect(formatInt(12345)).toBe('12 345');
    expect(formatMs(1500)).toBe('1,5 s');
    expect(formatPercent(0.052)).toBe('5,2\u202f%');
    expect(formatDateTime('2026-10-21T08:05:00Z')).toContain('2026');
    expect(formatRelative('2026-10-21T08:00:00Z', Date.parse('2026-10-21T08:00:10Z'))).toBe("à l'instant");
  });

  it('has no French entry identical to its key by mistake (except words that are the same)', () => {
    const same = Object.entries(FR).filter(([en, fr]) => en === fr).map(([en]) => en);
    expect(same.every((text) => !text.includes(' '))).withContext(same.join(', ')).toBeTrue();
  });
});
