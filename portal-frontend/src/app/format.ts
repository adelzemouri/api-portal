/** Ancienneté lisible : « 5 minutes ago », « yesterday ». */
export function formatRelative(iso: string | null | undefined, nowMs: number): string {
  if (!iso) {
    return '—';
  }
  const diffSeconds = Math.round((Date.parse(iso) - nowMs) / 1000);
  const abs = Math.abs(diffSeconds);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (abs < 45) {
    return 'just now';
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
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
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

export const lifeCycleLabel = (status: string | null): string => (status && LIFECYCLE[status]) || status || '—';
export const applicationStatusLabel = (status: string | null): string =>
  (status && APPLICATION_STATUS[status]) || status || '—';
export const subscriptionStatusLabel = (status: string | null): string =>
  (status && SUBSCRIPTION_STATUS[status]) || status || '—';

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

const COMPACT = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const FULL = new Intl.NumberFormat('en-GB');

/** 1 234 567 → « 1.2M » : pour les tuiles et les axes. */
export const compactNumber = (value: number): string => COMPACT.format(value);

/** Nombre entier avec séparateurs : pour les tableaux et les infobulles. */
export const formatInt = (value: number): string => FULL.format(Math.round(value));

/** 0.052 → « 5.2% », 0.25 → « 25% », 0.0004 → « <0.1% ». */
export function formatPercent(rate: number): string {
  if (!rate) {
    return '0%';
  }
  if (rate < 0.001) {
    return '<0.1%';
  }
  return `${(rate * 100).toFixed(rate < 0.1 ? 1 : 0)}%`;
}

export const formatMs = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);
