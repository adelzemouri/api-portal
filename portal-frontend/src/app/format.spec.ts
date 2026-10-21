import {
  applicationStatusLabel,
  compactNumber,
  formatDateTime,
  formatInt,
  formatMs,
  formatPercent,
  formatRelative,
  lifeCycleLabel,
  statusTone,
  subscriptionStatusLabel,
} from './format';

describe('format', () => {
  const now = Date.parse('2026-01-01T10:00:00Z');
  const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

  it('shows a dash when the date is missing', () => {
    expect(formatRelative(null, now)).toBe('—');
    expect(formatDateTime(undefined)).toBe('—');
  });

  it('says "just now" under 45 seconds', () => {
    expect(formatRelative(ago(30), now)).toBe('just now');
  });

  it('expresses age in minutes, hours then days', () => {
    expect(formatRelative(ago(5 * 60), now)).toBe('5 minutes ago');
    expect(formatRelative(ago(2 * 3600), now)).toBe('2 hours ago');
    expect(formatRelative(ago(86400), now)).toBe('yesterday');
  });

  it('returns the raw value when the date is unreadable', () => {
    expect(formatDateTime('not a date')).toBe('not a date');
  });

  it('translates known statuses and leaves unknown ones as they are', () => {
    expect(lifeCycleLabel('PUBLISHED')).toBe('Published');
    expect(lifeCycleLabel('WHATEVER')).toBe('WHATEVER');
    expect(lifeCycleLabel(null)).toBe('—');
    expect(applicationStatusLabel('CREATED')).toBe('Pending');
    expect(subscriptionStatusLabel('UNBLOCKED')).toBe('Active');
  });

  it('gives a tone to each status, and a neutral one to the unknown', () => {
    expect(statusTone('PUBLISHED')).toBe('ok');
    expect(statusTone('ON_HOLD')).toBe('warn');
    expect(statusTone('BLOCKED')).toBe('err');
    expect(statusTone('WHATEVER')).toBe('neutral');
    expect(statusTone(null)).toBe('neutral');
  });

  it('writes big numbers compactly and in full', () => {
    expect(compactNumber(950)).toBe('950');
    expect(compactNumber(1200)).toBe('1.2K');
    expect(compactNumber(3_400_000)).toBe('3.4M');
    expect(formatInt(1234567.4)).toBe('1,234,567');
  });

  it('writes rates as percentages: one decimal below 10%, none above, and never a misleading zero', () => {
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(0.0004)).toBe('<0.1%');
    expect(formatPercent(0.052)).toBe('5.2%');
    expect(formatPercent(0.25)).toBe('25%');
    expect(formatPercent(1)).toBe('100%');
  });

  it('writes latencies in milliseconds, then seconds', () => {
    expect(formatMs(83.4)).toBe('83 ms');
    expect(formatMs(999)).toBe('999 ms');
    expect(formatMs(1500)).toBe('1.5 s');
  });
});
