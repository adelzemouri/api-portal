import { currentLang, currentLocale, translate } from './i18n';

/** Ancienneté lisible : « 5 minutes ago », « yesterday » (ou en français selon la langue choisie). */
export function formatRelative(iso: string | null | undefined, nowMs: number): string {
  if (!iso) {
    return '—';
  }
  const diffSeconds = Math.round((Date.parse(iso) - nowMs) / 1000);
  const abs = Math.abs(diffSeconds);
  const rtf = new Intl.RelativeTimeFormat(currentLang(), { numeric: 'auto' });
  if (abs < 45) {
    return translate('just now');
  }
  if (abs < 3600) {
    return rtf.format(Math.round(diffSeconds / 60), 'minute');
  }
  if (abs < 86400) {
    return rtf.format(Math.round(diffSeconds / 3600), 'hour');
  }
  return rtf.format(Math.round(diffSeconds / 86400), 'day');
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat(currentLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

const LIFECYCLE: Record<string, string> = {
  PUBLISHED: 'Published',
  CREATED: 'Created',
  PROTOTYPED: 'Prototyped',
  DEPRECATED: 'Deprecated',
  BLOCKED: 'Blocked',
  RETIRED: 'Retired',
};

const APPLICATION_STATUS: Record<string, string> = {
  APPROVED: 'Approved',
  CREATED: 'Pending',
  REJECTED: 'Rejected',
};

const SUBSCRIPTION_STATUS: Record<string, string> = {
  UNBLOCKED: 'Active',
  BLOCKED: 'Blocked',
  PROD_ONLY_BLOCKED: 'Blocked in production',
  ON_HOLD: 'On hold',
  REJECTED: 'Rejected',
  TIER_UPDATE_PENDING: 'Policy change pending',
};

const label = (table: Record<string, string>, status: string | null): string =>
  (status && table[status] && translate(table[status])) || status || '—';

export const lifeCycleLabel = (status: string | null): string => label(LIFECYCLE, status);
export const applicationStatusLabel = (status: string | null): string => label(APPLICATION_STATUS, status);
export const subscriptionStatusLabel = (status: string | null): string => label(SUBSCRIPTION_STATUS, status);

export type Tone = 'ok' | 'warn' | 'err' | 'neutral';

/** Teinte d'un statut (cycle de vie, souscription ou application) : jamais seule, toujours avec son libellé. */
export function statusTone(status: string | null): Tone {
  switch (status) {
    case 'PUBLISHED':
    case 'APPROVED':
    case 'UNBLOCKED':
      return 'ok';
    case 'DEPRECATED':
    case 'ON_HOLD':
    case 'TIER_UPDATE_PENDING':
    case 'CREATED':
      return 'warn';
    case 'BLOCKED':
    case 'PROD_ONLY_BLOCKED':
    case 'REJECTED':
    case 'RETIRED':
      return 'err';
    default:
      return 'neutral';
  }
}

/** 1 234 567 → « 1.2M » (« 1,2 M » en français) : pour les tuiles et les axes. */
export const compactNumber = (value: number): string =>
  new Intl.NumberFormat(currentLang(), { notation: 'compact', maximumFractionDigits: 1 }).format(value);

/** Nombre entier avec séparateurs : pour les tableaux et les infobulles. */
export const formatInt = (value: number): string => new Intl.NumberFormat(currentLocale()).format(Math.round(value));

/** Décimale selon la langue : 1.6 en anglais, 1,6 en français. */
const decimal = (text: string): string => (currentLang() === 'fr' ? text.replace('.', ',') : text);

/** 0.052 → « 5.2% », 0.25 → « 25% », 0.0004 → « <0.1% ». */
export function formatPercent(rate: number): string {
  const unit = currentLang() === 'fr' ? '\u202f%' : '%';
  if (!rate) {
    return `0${unit}`;
  }
  if (rate < 0.001) {
    return `<${decimal('0.1')}${unit}`;
  }
  return `${decimal((rate * 100).toFixed(rate < 0.1 ? 1 : 0))}${unit}`;
}

export const formatMs = (ms: number): string => (ms >= 1000 ? `${decimal((ms / 1000).toFixed(1))} s` : `${Math.round(ms)} ms`);
