/** Money is always integer minor units (paise, cents). Nothing here rounds floats into currency. */

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitMinor: number;
  amountMinor: number;
}

export interface InvoiceDraft {
  lines: InvoiceLine[];
  subtotalMinor: number;
  taxRateBps: number;
  taxMinor: number;
  totalMinor: number;
}

/** GST for India; other countries are billed without tax until a tax engine is added. */
export const taxRateBpsFor = (country: string): number => (country.toUpperCase() === 'IN' ? 1800 : 0);

export function buildInvoice(input: { planName: string; seats: number; unitMinor: number; periodStart: string; periodEnd: string; taxRateBps: number }): InvoiceDraft {
  if (!Number.isInteger(input.seats) || input.seats < 1) throw new Error('seats must be a positive integer');
  if (!Number.isInteger(input.unitMinor) || input.unitMinor < 0) throw new Error('unit price must be a non-negative integer');
  const amount = input.seats * input.unitMinor;
  const lines: InvoiceLine[] = [{ description: `${input.planName} plan, ${input.periodStart} to ${input.periodEnd}`, quantity: input.seats, unitMinor: input.unitMinor, amountMinor: amount }];
  const taxMinor = Math.round((amount * input.taxRateBps) / 10_000);
  return { lines, subtotalMinor: amount, taxRateBps: input.taxRateBps, taxMinor, totalMinor: amount + taxMinor };
}

/** First and last day of the calendar month containing `date` (YYYY-MM-DD). */
export function monthPeriod(date: string): { start: string; end: string } {
  const [y, m] = date.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}

export type DunningAction = 'none' | 'past_due' | 'suspend';
export const DUNNING_GRACE_DAYS = 7;
export const DUNNING_SUSPEND_DAYS = 30;

/** What to do with a company whose oldest unpaid invoice has been overdue for `daysOverdue` days. */
export function dunningAction(daysOverdue: number): DunningAction {
  if (daysOverdue >= DUNNING_SUSPEND_DAYS) return 'suspend';
  if (daysOverdue >= DUNNING_GRACE_DAYS) return 'past_due';
  return 'none';
}

export const formatMoney = (minor: number, currency: string, locale = 'en-IN'): string =>
  new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2 }).format(minor / 100);
