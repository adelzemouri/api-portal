import { Injectable, Pipe, PipeTransform, inject, signal } from '@angular/core';
import { FR } from './i18n.fr';

export type Lang = 'fr' | 'en';
export type Params = Record<string, string | number | null | undefined>;

const STORAGE_KEY = 'portal.lang';

/** Langue de départ : choix mémorisé, sinon celle du navigateur (français ou anglais, l'anglais par défaut). */
function initialLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'fr' || stored === 'en') {
      return stored;
    }
  } catch {
    // Stockage indisponible (navigation privée, politique du poste) : on s'en passe.
  }
  return (navigator.language || 'en').toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

let current: Lang = initialLang();

/** Langue courante, pour les fonctions de mise en forme (dates, nombres) appelées hors composant. */
export const currentLang = (): Lang => current;

/** Locale Intl correspondant à la langue courante. */
export const currentLocale = (): string => (current === 'fr' ? 'fr-FR' : 'en-GB');

/**
 * Le texte source (anglais) sert de clé : une traduction manquante retombe sur l'anglais au lieu d'afficher une clé.
 * Les paramètres s'écrivent {nom}.
 */
export function translate(text: string, params?: Params): string {
  const template = current === 'fr' ? (FR[text] ?? text) : text;
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === null || value === undefined ? match : String(value);
  });
}

@Injectable({ providedIn: 'root' })
export class I18nService {
  /** Lu par les gabarits et les `computed` : changer de langue les recalcule. */
  readonly lang = signal<Lang>(current);

  constructor() {
    document.documentElement.lang = current;
  }

  set(lang: Lang): void {
    current = lang;
    this.lang.set(lang);
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Sans stockage, le choix vaut pour la session en cours.
    }
  }

  toggle(): void {
    this.set(this.lang() === 'fr' ? 'en' : 'fr');
  }

  /** Traduit en lisant le signal de langue : à utiliser dans les `computed`. */
  t(text: string, params?: Params): string {
    this.lang();
    return translate(text, params);
  }
}

/** `{{ 'Overview' | t }}`, `{{ 'of {n} APIs' | t: { n: count } }}`. Impur : suit le changement de langue. */
@Pipe({ name: 't', standalone: true, pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(text: string, params?: Params): string {
    return this.i18n.t(text, params);
  }
}
